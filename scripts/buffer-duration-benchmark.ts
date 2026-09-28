/**
 * Buffer Duration Benchmark — Base Unit × Tier Ratio Sensitivity Analysis
 *
 * Tests 12 buffer configurations (3 base units × 4 tier ratios) + no-buffer + Actual = 14 conditions.
 * All formula conditions use fixed 1:2:4 weights with D6 decay (0.75x linear).
 * Purpose: determine whether buffer duration and tier differentiation affect performance.
 *
 * Usage:
 *   cd er-triage-app && npx tsx scripts/buffer-duration-benchmark.ts
 *   cd er-triage-app && npx tsx scripts/buffer-duration-benchmark.ts --json
 */

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join, basename } from 'path';
import * as XLSX from 'xlsx';

import type { Provider, ProviderType, ProviderStatus, TeamId, AcuityTier, Patient, Buffer } from '../src/types';
import type { ScheduleProvider, DaySchedule } from '../src/utils/scheduleParser';
import { parseWeeklySchedule, getProvidersForShift } from '../src/utils/scheduleParser';
import { getDefaultOverrides } from '../src/engine/simulation';
import { getRecommendation, scoreTeam, createBuffer, getEffectiveCapacity, getDecayedAcuityWeight } from '../src/engine/recommendation';
import type { ScoringOverrides } from '../src/engine/recommendation';
import { TRAUMA_TEAM_ID, ACUITY_WEIGHTS, ACUITY_DECAY, BUFFER_DURATIONS_MS } from '../src/constants';
import { uid } from '../src/uid';
import { atWallHour, excelSerialToWallMs, localDateToWallMs, parseWallClockString, wallDateStr, wallHour } from './lib/census-time';

// ── CLI flags ──────────────────────────────────────────────────────

const FLAG_JSON = process.argv.includes('--json');

// ── Paths ──────────────────────────────────────────────────────────

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '..');

const CENSUS_PATH = join(PROJECT_ROOT, 'data', 'provider-schedules', 'Aside data Dec 2025–Mar 2026.xlsx');
const SCHEDULE_DIR_1 = join(PROJECT_ROOT, 'data', 'provider-schedules', 'schedules');
const SCHEDULE_DIR_2 = join(PROJECT_ROOT, 'data', 'provider-schedules', 'initially missing schedules');

// ── Types ──────────────────────────────────────────────────────────

interface HistoricalArrival {
  arrivalTime: number;
  date: string;
  hour: number;
  esi: number | null;
  acuity: AcuityTier;
  actualTeam: TeamId;
  isAdmitted: boolean;
  disposition: string;
  doorToDispoMin: number | null;
  edLosMin: number | null;
}

interface ReplayEntry {
  arrivalIndex: number;
  arrivalTime: number;
  acuity: AcuityTier;
  teamId: TeamId;
  ratioAtAssignment: number;
}

interface BufferCondition {
  id: string;
  label: string;
  mode: 'formula' | 'actual';
  baseMinutes: number;
  ratioLabel: string;
  acuityWeights: Record<AcuityTier, number>;
  decaySteps: Record<AcuityTier, Array<{ afterMs: number; weight: number }>>;
  bufferDurations: Record<AcuityTier, number>;
}

interface DayResult {
  date: string;
  avgRatio: number;
  minRatio: number;
  b2bHA: number;
  slams: number;
  giniCount: number;
  giniAcuity: number;
  countSpread: number;
  acuitySpread: number;
  loadMinutesSD: number;
  normalizedLoadMinutesSD: number;
}

// ── Fixed measurement weights ────────────────────────────────────

const MEASUREMENT_WEIGHTS: Record<AcuityTier, number> = {
  tier_one: 5,
  tier_two: 4,
  tier_three: 3,
};

// ── Fixed routing config ─────────────────────────────────────────

const ROUTING_WEIGHTS: Record<AcuityTier, number> = {
  tier_one: 4,
  tier_two: 2,
  tier_three: 1,
};

// ── D6 decay schedule (0.75x linear) ─────────────────────────────

function buildD6Decay(): Record<AcuityTier, Array<{ afterMs: number; weight: number }>> {
  const ms = (min: number) => min * 60 * 1000;
  const STEP_MIN = 15;

  const buildLinear = (initialWeight: number, zeroMin: number) => {
    const steps: Array<{ afterMs: number; weight: number }> = [];
    const numSteps = Math.floor(zeroMin / STEP_MIN);
    for (let i = 1; i <= numSteps; i++) {
      const t = i * STEP_MIN;
      const w = initialWeight * (1 - i / numSteps);
      steps.push({ afterMs: ms(t), weight: Math.max(0, w) });
    }
    return steps;
  };

  return {
    tier_one:   buildLinear(4, 180),  // 4 → 0 over 180 min
    tier_two:   buildLinear(2, 180),  // 2 → 0 over 180 min
    tier_three: buildLinear(1, 90),   // 1 → 0 over 90 min
  };
}

const D6_DECAY = buildD6Decay();

// ── Helper functions ─────────────────────────────────────────────

function esiToTier(esi: number | null): AcuityTier {
  if (esi === 1) return 'tier_one';
  if (esi === 2) return 'tier_two';
  return 'tier_three';
}

function parseTeamId(teamStr: string | null | undefined): TeamId | null {
  if (!teamStr) return null;
  const match = teamStr.match(/(\d)/);
  if (!match) return null;
  const n = parseInt(match[1]);
  if (n >= 1 && n <= 4) return n as TeamId;
  return null;
}

function excelDateToMs(serial: number): number {
  // Wall-clock time, independent of the machine time zone (scripts/lib/census-time.ts).
  return excelSerialToWallMs(serial);
}

// ── Census loading ───────────────────────────────────────────────

function loadCensusData(): { all: HistoricalArrival[]; excludedCount: number; totalCount: number } {
  console.log(`  Loading census: ${basename(CENSUS_PATH)}`);
  const buf = readFileSync(CENSUS_PATH);
  const wb = XLSX.read(buf, { type: 'buffer' });

  const sheetName = wb.SheetNames.find(s => s.includes('A-side') || s.includes('trauma'));
  if (!sheetName) throw new Error(`Cannot find census sheet. Available: ${wb.SheetNames.join(', ')}`);
  console.log(`  Sheet: "${sheetName}"`);

  const sheet = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<Record<string, any>>(sheet);
  console.log(`  Raw rows: ${rows.length}`);

  const firstRow = rows[0];
  const keys = Object.keys(firstRow);

  const findCol = (patterns: string[]): string | null => {
    for (const p of patterns) {
      const found = keys.find(k => k.toLowerCase().includes(p.toLowerCase()));
      if (found) return found;
    }
    return null;
  };

  const colArrival = findCol(['arrival_time', 'arrival', 'arrivaltime']);
  const colTeam = findCol(['team_assignment', 'team', 'teamassignment']);
  const colEsi = findCol(['esi_level', 'esi', 'esilevel']);
  const colSource = findCol(['acuity_source', 'source', 'acuitysource']);
  const colAdmit = findCol(['is_admitted', 'admitted', 'isadmitted']);
  const colDispo = findCol(['ed_disposition', 'disposition', 'dispo']);
  const colDoorDispo = findCol(['door_to_dispo', 'doortodispo']);
  const colEdLos = findCol(['ed_los', 'edlos', 'los_min']);

  if (!colArrival || !colTeam) {
    throw new Error(`Missing required columns. Found: ${keys.join(', ')}`);
  }

  console.log(`  Columns: arrival=${colArrival}, team=${colTeam}, esi=${colEsi}, source=${colSource}`);

  let excludedCount = 0;
  const arrivals: HistoricalArrival[] = [];

  for (const row of rows) {
    const rawArrival = row[colArrival];
    let arrivalMs: number;
    if (typeof rawArrival === 'number') {
      arrivalMs = excelDateToMs(rawArrival);
    } else if (rawArrival instanceof Date) {
      arrivalMs = localDateToWallMs(rawArrival);
    } else if (typeof rawArrival === 'string') {
      arrivalMs = parseWallClockString(rawArrival);
    } else {
      continue;
    }
    if (isNaN(arrivalMs)) continue;

    const teamId = parseTeamId(String(row[colTeam] ?? ''));
    if (!teamId) continue;

    const source = String(row[colSource] ?? '').toLowerCase();
    if (source === 'trauma' || source === 'both') {
      excludedCount++;
      continue;
    }
    if (teamId === 4) {
      excludedCount++;
      continue;
    }

    const rawEsi = row[colEsi ?? ''];
    const esi = typeof rawEsi === 'number' ? rawEsi : (rawEsi ? parseInt(String(rawEsi)) : null);
    const validEsi = esi && esi >= 1 && esi <= 5 ? esi : null;

    const isAdmitted = row[colAdmit ?? ''] === 1 || row[colAdmit ?? ''] === true || row[colAdmit ?? ''] === '1';
    const disposition = String(row[colDispo ?? ''] ?? '');
    const doorToDispoMin = colDoorDispo && typeof row[colDoorDispo] === 'number' ? row[colDoorDispo] : null;
    const edLosMin = colEdLos && typeof row[colEdLos] === 'number' ? row[colEdLos] : null;

    const dateStr = wallDateStr(arrivalMs);

    arrivals.push({
      arrivalTime: arrivalMs,
      date: dateStr,
      hour: wallHour(arrivalMs),
      esi: validEsi,
      acuity: esiToTier(validEsi),
      actualTeam: teamId as TeamId,
      isAdmitted,
      disposition,
      doorToDispoMin,
      edLosMin,
    });
  }

  arrivals.sort((a, b) => a.arrivalTime - b.arrivalTime);
  return { all: arrivals, excludedCount, totalCount: rows.length };
}

// ── Schedule loading ─────────────────────────────────────────────

interface ScheduleFile {
  filename: string;
  days: DaySchedule[];
}

function loadScheduleFile(filePath: string): ScheduleFile {
  const buf = readFileSync(filePath);
  const parsed = parseWeeklySchedule(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  return { filename: basename(filePath), days: parsed.days };
}

function loadAllSchedules(): { scheduleMap: Map<string, DaySchedule>; fileCount: number; dayCount: number } {
  const scheduleFiles: ScheduleFile[] = [];

  for (const dir of [SCHEDULE_DIR_1, SCHEDULE_DIR_2]) {
    if (!existsSync(dir)) {
      console.warn(`  Warning: schedule directory not found: ${dir}`);
      continue;
    }
    for (const file of readdirSync(dir).sort()) {
      if (file.endsWith('.xlsx') && !file.startsWith('~$') && !file.includes('demo-schedule')) {
        scheduleFiles.push(loadScheduleFile(join(dir, file)));
      }
    }
  }

  console.log(`  Loaded ${scheduleFiles.length} schedule files`);

  const scheduleMap = new Map<string, DaySchedule>();

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];

  for (const sf of scheduleFiles) {
    for (const day of sf.days) {
      if (day.providers.length === 0) continue;

      const parts = day.date.match(/^(\w+)\s+(\d+)$/);
      if (!parts) continue;
      const monthName = parts[1];
      const dayNum = parseInt(parts[2]);
      const monthIdx = monthNames.indexOf(monthName);
      if (monthIdx === -1) continue;

      const year = monthIdx === 11 ? 2025 : 2026;
      const isoDate = `${year}-${String(monthIdx + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;

      scheduleMap.set(isoDate, day);
    }
  }

  console.log(`  Schedule coverage: ${scheduleMap.size} days mapped`);
  return { scheduleMap, fileCount: scheduleFiles.length, dayCount: scheduleMap.size };
}

// ── Provider helpers ─────────────────────────────────────────────

function stableProviderId(sp: ScheduleProvider): string {
  return `${sp.name.toLowerCase()}-t${sp.teamId}`;
}

function toProviders(sps: ScheduleProvider[]): Provider[] {
  return sps.map(sp => ({
    id: stableProviderId(sp),
    name: sp.name,
    type: sp.type,
    status: 'active' as ProviderStatus,
    statusExpiresAt: null,
    teamId: sp.teamId,
  }));
}

// ── Gini coefficient ─────────────────────────────────────────────

function gini(values: number[]): number {
  const n = values.length;
  if (n === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const m = sorted.reduce((a, b) => a + b, 0) / n;
  if (m === 0) return 0;
  let sumAbsDiff = 0;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      sumAbsDiff += Math.abs(sorted[i] - sorted[j]);
    }
  }
  return sumAbsDiff / (2 * n * n * m);
}

// ── Back-to-back high-acuity detection ───────────────────────────

const B2B_WINDOW_MS = 30 * 60 * 1000;

function countBackToBackHA(entries: ReplayEntry[]): number {
  let count = 0;
  const lastHA: Record<number, number> = {};

  for (const e of entries) {
    if (e.acuity === 'tier_one' || e.acuity === 'tier_two') {
      const prev = lastHA[e.teamId];
      if (prev !== undefined && (e.arrivalTime - prev) <= B2B_WINDOW_MS) {
        count++;
      }
      lastHA[e.teamId] = e.arrivalTime;
    }
  }
  return count;
}

// ── Slams: 2+ patients to same team within 1 hour ───────────────

const SLAM_WINDOW_MS = 60 * 60 * 1000;

function countSlams(entries: ReplayEntry[]): number {
  let count = 0;
  const teamTimes: Record<number, number[]> = {};

  for (const e of entries) {
    const times = teamTimes[e.teamId] ?? [];
    for (const prev of times) {
      if (e.arrivalTime - prev <= SLAM_WINDOW_MS) {
        count++;
        break;
      }
    }
    times.push(e.arrivalTime);
    teamTimes[e.teamId] = times;
  }
  return count;
}

// ── Statistics ───────────────────────────────────────────────────

function mean(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function stddev(arr: number[]): number {
  if (arr.length === 0) return 0;
  const m = mean(arr);
  return Math.sqrt(arr.reduce((s, v) => s + (v - m) ** 2, 0) / arr.length);
}

function variance(arr: number[]): number {
  if (arr.length === 0) return 0;
  const m = mean(arr);
  return arr.reduce((s, v) => s + (v - m) ** 2, 0) / arr.length;
}

function cohenD(a: number[], b: number[]): number {
  const pooledSD = Math.sqrt((variance(a) + variance(b)) / 2);
  return pooledSD === 0 ? 0 : (mean(a) - mean(b)) / pooledSD;
}

function pairedTTest(a: number[], b: number[]): number {
  const n = a.length;
  if (n < 2) return 1;
  const diffs = a.map((v, i) => v - b[i]);
  const dMean = mean(diffs);
  const dVar = diffs.reduce((s, d) => s + (d - dMean) ** 2, 0) / (n - 1);
  const se = Math.sqrt(dVar / n);
  if (se === 0) return dMean === 0 ? 1 : 0;
  const t = dMean / se;
  const df = n - 1;
  const p = 2 * tCDF(-Math.abs(t), df);
  return Math.max(0, Math.min(1, p));
}

function tCDF(t: number, df: number): number {
  const x = df / (df + t * t);
  if (t >= 0) return 1 - 0.5 * incompleteBeta(x, df / 2, 0.5);
  return 0.5 * incompleteBeta(x, df / 2, 0.5);
}

function incompleteBeta(x: number, a: number, b: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const lnBeta = lgamma(a) + lgamma(b) - lgamma(a + b);
  const front = Math.exp(Math.log(x) * a + Math.log(1 - x) * b - lnBeta);
  let f = 1, c = 1, d = 1 - (a + b) * x / (a + 1);
  if (Math.abs(d) < 1e-30) d = 1e-30;
  d = 1 / d; f = d;
  for (let m = 1; m <= 200; m++) {
    let num = m * (b - m) * x / ((a + 2 * m - 1) * (a + 2 * m));
    d = 1 + num * d; if (Math.abs(d) < 1e-30) d = 1e-30; d = 1 / d;
    c = 1 + num / c; if (Math.abs(c) < 1e-30) c = 1e-30;
    f *= d * c;
    num = -(a + m) * (a + b + m) * x / ((a + 2 * m) * (a + 2 * m + 1));
    d = 1 + num * d; if (Math.abs(d) < 1e-30) d = 1e-30; d = 1 / d;
    c = 1 + num / c; if (Math.abs(c) < 1e-30) c = 1e-30;
    f *= d * c;
    if (Math.abs(d * c - 1) < 1e-10) break;
  }
  return front * f / a;
}

function lgamma(z: number): number {
  const g = 7;
  const coef = [0.99999999999980993, 676.5203681218851, -1259.1392167224028,
    771.32342877765313, -176.61502916214059, 12.507343278686905,
    -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  if (z < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * z)) - lgamma(1 - z);
  z -= 1;
  let x = coef[0];
  for (let i = 1; i < g + 2; i++) x += coef[i] / (z + i);
  const t = z + g + 0.5;
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
}

// ── Formatting helpers ───────────────────────────────────────────

function pad(s: string, n: number): string {
  return s.length >= n ? s : s + ' '.repeat(n - s.length);
}

function rpad(s: string, n: number): string {
  return s.length >= n ? s : ' '.repeat(n - s.length) + s;
}

function fmt(v: number, dec = 1): string {
  return v.toFixed(dec);
}

// ── Build buffer durations ───────────────────────────────────────

function buildBufferDurations(
  baseMinutes: number,
  ratio: [number, number, number], // [purple, yellow, red] multipliers
): Record<AcuityTier, number> {
  const ms = (min: number) => Math.round(min * 60 * 1000);
  return {
    tier_three: ms(baseMinutes * ratio[0]),  // Purple
    tier_two:   ms(baseMinutes * ratio[1]),  // Yellow
    tier_one:   ms(baseMinutes * ratio[2]),  // Red
  };
}

// ── Build all 14 conditions ──────────────────────────────────────

type BaseLevel = { base: number; label: string };
type RatioLevel = { ratio: [number, number, number]; label: string; shortLabel: string };

const BASE_LEVELS: BaseLevel[] = [
  { base: 10, label: 'b=10' },
  { base: 15, label: 'b=15' },
  { base: 20, label: 'b=20' },
];

const RATIO_LEVELS: RatioLevel[] = [
  { ratio: [1, 1, 1],       label: '1:1:1',     shortLabel: '1:1:1' },
  { ratio: [1, 1.7, 2.3],   label: '1:1.7:2.3', shortLabel: 'Cur' },
  { ratio: [1, 2, 3],       label: '1:2:3',     shortLabel: '1:2:3' },
  { ratio: [1, 2, 4],       label: '1:2:4',     shortLabel: '1:2:4' },
];

const NO_BUFFERS: Record<AcuityTier, number> = {
  tier_one: 0, tier_two: 0, tier_three: 0,
};

function buildAllConditions(): BufferCondition[] {
  const conditions: BufferCondition[] = [];
  let idx = 1;

  for (const bl of BASE_LEVELS) {
    for (const rl of RATIO_LEVELS) {
      const bufDurations = buildBufferDurations(bl.base, rl.ratio);
      const purpleMin = Math.round(bl.base * rl.ratio[0]);
      const yellowMin = Math.round(bl.base * rl.ratio[1]);
      const redMin = Math.round(bl.base * rl.ratio[2]);
      const isCurrent = bl.base === 15 && rl.label === '1:1.7:2.3';
      conditions.push({
        id: `B${idx}`,
        label: `${bl.label} ${rl.label}${isCurrent ? ' (current)' : ''}`,
        mode: 'formula',
        baseMinutes: bl.base,
        ratioLabel: rl.label,
        acuityWeights: ROUTING_WEIGHTS,
        decaySteps: D6_DECAY,
        bufferDurations: bufDurations,
      });
      idx++;
    }
  }

  // No buffer
  conditions.push({
    id: 'NB',
    label: 'No Buffer',
    mode: 'formula',
    baseMinutes: 0,
    ratioLabel: 'none',
    acuityWeights: ROUTING_WEIGHTS,
    decaySteps: D6_DECAY,
    bufferDurations: NO_BUFFERS,
  });

  // Actual baseline
  conditions.push({
    id: 'A1',
    label: 'Actual',
    mode: 'actual',
    baseMinutes: 0,
    ratioLabel: 'none',
    acuityWeights: { ...ACUITY_WEIGHTS },
    decaySteps: { ...ACUITY_DECAY },
    bufferDurations: NO_BUFFERS,
  });

  return conditions;
}

// ── Build ScoringOverrides from a condition ──────────────────────

function conditionToOverrides(cond: BufferCondition): ScoringOverrides {
  const base = getDefaultOverrides();
  return {
    capacityWeights: base.capacityWeights,
    statusMultipliers: base.statusMultipliers,
    acuityWeights: cond.acuityWeights,
    decaySteps: cond.decaySteps,
    bufferDurations: cond.bufferDurations,
  };
}

// ── Replay one day for one condition ─────────────────────────────

function replayDay(
  arrivals: HistoricalArrival[],
  day: DaySchedule,
  eligibleTeams: TeamId[],
  condition: BufferCondition,
): DayResult {
  const scoringOv = conditionToOverrides(condition);
  const closedTeams: Record<number, number> = {};

  let patients: Patient[] = [];
  let buffers: Buffer[] = [];
  const entries: ReplayEntry[] = [];

  for (let i = 0; i < arrivals.length; i++) {
    const arr = arrivals[i];
    const now = arr.arrivalTime;
    const hourOfDay = arr.hour;

    const { providers: scheduledProviders } = getProvidersForShift(day, hourOfDay);
    const simProviders = toProviders(scheduledProviders);

    let teamId: TeamId;

    if (condition.mode === 'actual') {
      teamId = arr.actualTeam;
    } else {
      // formula
      buffers = buffers.filter(b => b.expiresAt > now);
      const rec = getRecommendation(simProviders, patients, buffers, now, closedTeams, scoringOv, undefined);
      teamId = rec.first ?? eligibleTeams[0];
    }

    // Score at assignment time
    const score = scoreTeam(teamId, simProviders, patients, buffers, now, scoringOv);
    const ratio = score.capacityRatio === Infinity ? 100 : score.capacityRatio;

    const patient: Patient = {
      id: `${condition.id}-${String(i + 1).padStart(3, '0')}`,
      acuity: arr.acuity,
      assignedTeamId: teamId,
      assignedAt: now,
    };

    // Buffer merge logic (formula only, when buffers are enabled)
    const hasBuf = condition.bufferDurations.tier_one > 0;
    if (hasBuf && condition.mode !== 'actual') {
      const newBuffer = createBuffer(teamId, arr.acuity, now, scoringOv);
      const existingTeamBuffers = buffers.filter(b => b.teamId === teamId && b.expiresAt > now && !b.deceasedPatientId);
      const otherBuffers = buffers.filter(b => !(b.teamId === teamId && b.expiresAt > now && !b.deceasedPatientId));
      if (existingTeamBuffers.length > 0) {
        const allBufs = [...existingTeamBuffers, newBuffer];
        const currentExpiry = Math.max(...existingTeamBuffers.map(b => b.expiresAt));
        const newDuration = newBuffer.expiresAt - newBuffer.createdAt;
        const latestExpiry = Math.max(currentExpiry, now) + newDuration;
        const tierRank = { tier_one: 0, tier_two: 1, tier_three: 2 } as const;
        const bestTier = allBufs.reduce((best, b) => tierRank[b.tier] < tierRank[best.tier] ? b : best).tier;
        const totalCount = allBufs.reduce((sum, b) => sum + (b.mergedCount ?? 1), 0);
        buffers = [...otherBuffers, {
          id: newBuffer.id, teamId, tier: bestTier,
          createdAt: Math.min(...allBufs.map(b => b.createdAt)),
          expiresAt: latestExpiry, mergedCount: totalCount,
        }];
      } else {
        buffers = [...buffers, newBuffer];
      }
    }

    patients = [...patients, patient];
    entries.push({ arrivalIndex: i, arrivalTime: now, acuity: arr.acuity, teamId, ratioAtAssignment: ratio });
  }

  // Compute the 8 metrics
  const ratios = entries.map(e => e.ratioAtAssignment);
  const avgRatio = ratios.length > 0 ? mean(ratios) : 0;
  const minRatio = ratios.length > 0 ? Math.min(...ratios) : 0;
  const b2bHA = countBackToBackHA(entries);
  const slams = countSlams(entries);

  // Gini on raw counts
  const counts: Record<number, number> = {};
  for (const t of eligibleTeams) counts[t] = 0;
  for (const e of entries) counts[e.teamId] = (counts[e.teamId] ?? 0) + 1;
  const countVals = eligibleTeams.map(t => counts[t] ?? 0);
  const giniCount = gini(countVals);
  const countSpread = countVals.length > 0 ? Math.max(...countVals) - Math.min(...countVals) : 0;

  // Gini on MEASUREMENT_WEIGHTS-weighted loads
  const acuityLoads: Record<number, number> = {};
  for (const t of eligibleTeams) acuityLoads[t] = 0;
  for (const e of entries) {
    acuityLoads[e.teamId] = (acuityLoads[e.teamId] ?? 0) + MEASUREMENT_WEIGHTS[e.acuity];
  }
  const acuityLoadValues = eligibleTeams.map(t => acuityLoads[t] ?? 0);
  const giniAcuity = gini(acuityLoadValues);
  const acuitySpread = acuityLoadValues.length > 0 ? Math.max(...acuityLoadValues) - Math.min(...acuityLoadValues) : 0;

  // ── Load-minutes: integrate acuity-weighted load and capacity across the shift ──
  const { loadMinutesSD, normalizedLoadMinutesSD } = computeLoadMinutesSDs(
    patients, arrivals, day, eligibleTeams, scoringOv,
  );

  return {
    date: arrivals[0]?.date ?? '',
    avgRatio,
    minRatio,
    b2bHA,
    slams,
    giniCount,
    giniAcuity,
    countSpread,
    acuitySpread,
    loadMinutesSD,
    normalizedLoadMinutesSD,
  };
}

function computeLoadMinutesSDs(
  patients: Patient[],
  arrivals: HistoricalArrival[],
  day: DaySchedule,
  eligibleTeams: TeamId[],
  scoringOv: ScoringOverrides,
): { loadMinutesSD: number; normalizedLoadMinutesSD: number } {
  if (arrivals.length === 0 || patients.length === 0) return { loadMinutesSD: 0, normalizedLoadMinutesSD: 0 };
  const firstArrivalMs = arrivals[0].arrivalTime;
  const isThreeTeam = eligibleTeams.length >= 3;
  const shiftStartMs = atWallHour(firstArrivalMs, isThreeTeam ? 9 : 0);
  const shiftEndMs = shiftStartMs + (isThreeTeam ? 15 : 9) * 3_600_000;
  const windowStartMs = Math.min(firstArrivalMs, shiftStartMs);
  const STEP_MS = 60_000;

  const loadMins: Record<number, number> = {};
  const capMins: Record<number, number> = {};
  for (const t of eligibleTeams) { loadMins[t] = 0; capMins[t] = 0; }

  for (let now = windowStartMs; now < shiftEndMs; now += STEP_MS) {
    const hourOfDay = wallHour(now);
    const { providers: scheduledProviders } = getProvidersForShift(day, hourOfDay);
    const simProviders = toProviders(scheduledProviders);
    for (const team of eligibleTeams) {
      let load = 0;
      for (const p of patients) {
        if (p.assignedTeamId !== team) continue;
        if (p.assignedAt > now) continue;
        load += getDecayedAcuityWeight(p, now, scoringOv);
      }
      loadMins[team] += load;
      const teamProviders = simProviders.filter(p => p.teamId === team);
      capMins[team] += getEffectiveCapacity(teamProviders, now, scoringOv);
    }
  }

  const loadVals = eligibleTeams.map(t => loadMins[t]);
  const normVals = eligibleTeams.map(t => capMins[t] > 0 ? loadMins[t] / capMins[t] : 0);
  return { loadMinutesSD: sd(loadVals), normalizedLoadMinutesSD: sd(normVals) };
}

function sd(a: number[]): number {
  if (a.length === 0) return 0;
  const m = a.reduce((s, v) => s + v, 0) / a.length;
  return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / a.length);
}

// ── Main ─────────────────────────────────────────────────────────

async function main() {
  console.log('='.repeat(80));
  console.log('  BUFFER DURATION BENCHMARK — Base Unit x Tier Ratio Sensitivity Analysis');
  console.log('='.repeat(80));
  console.log();

  // Load data
  console.log('Loading data...');
  const { all: allArrivals, excludedCount, totalCount } = loadCensusData();
  console.log(`  ${allArrivals.length} A-side arrivals (${excludedCount} trauma/team4 excluded from ${totalCount} total)`);

  const { scheduleMap, fileCount, dayCount } = loadAllSchedules();

  // Group arrivals by date
  const byDate = new Map<string, HistoricalArrival[]>();
  for (const a of allArrivals) {
    const arr = byDate.get(a.date) ?? [];
    arr.push(a);
    byDate.set(a.date, arr);
  }

  // Find three-team days (hour 9-23 filter)
  const threeTeamDates: string[] = [];
  for (const [date, dayArrivals] of byDate) {
    const schedule = scheduleMap.get(date);
    if (!schedule) continue;

    const filtered = dayArrivals.filter(a => a.hour >= 9 && a.hour <= 23);
    if (filtered.length === 0) continue;

    const teamsWithProviders = new Set<number>();
    for (let h = 9; h <= 23; h++) {
      const { providers } = getProvidersForShift(schedule, h);
      for (const p of providers) {
        if (p.teamId !== 4) teamsWithProviders.add(p.teamId);
      }
    }

    if (teamsWithProviders.size === 3) {
      threeTeamDates.push(date);
    }
  }

  threeTeamDates.sort();
  console.log(`\n  Three-team days: ${threeTeamDates.length}`);

  // Build conditions
  const conditions = buildAllConditions();
  console.log(`  Conditions: ${conditions.length}`);
  console.log(`  Total replay passes: ${conditions.length * threeTeamDates.length}`);

  // Print condition summary
  console.log('\n  Condition matrix:');
  for (const c of conditions) {
    if (c.mode === 'actual') {
      console.log(`    ${c.id}: ${c.label}`);
    } else if (c.id === 'NB') {
      console.log(`    ${c.id}: ${c.label} (0/0/0)`);
    } else {
      const purpleMs = c.bufferDurations.tier_three;
      const yellowMs = c.bufferDurations.tier_two;
      const redMs = c.bufferDurations.tier_one;
      const p = Math.round(purpleMs / 60000);
      const y = Math.round(yellowMs / 60000);
      const r = Math.round(redMs / 60000);
      console.log(`    ${c.id}: ${pad(c.label, 28)} P:${p}m  Y:${y}m  R:${r}m`);
    }
  }

  // Run replay for each condition on each date
  const allResults: Map<string, DayResult[]> = new Map();
  for (const cond of conditions) {
    allResults.set(cond.id, []);
  }

  const startTime = Date.now();
  let passCount = 0;

  for (const date of threeTeamDates) {
    const dayArrivals = (byDate.get(date) ?? []).filter(a => a.hour >= 9 && a.hour <= 23);
    const schedule = scheduleMap.get(date)!;

    const teamsWithProviders = new Set<number>();
    for (let h = 9; h <= 23; h++) {
      const { providers } = getProvidersForShift(schedule, h);
      for (const p of providers) {
        if (p.teamId !== 4) teamsWithProviders.add(p.teamId);
      }
    }
    const eligibleTeams = [...teamsWithProviders].sort() as TeamId[];

    for (const cond of conditions) {
      const result = replayDay(dayArrivals, schedule, eligibleTeams, cond);
      allResults.get(cond.id)!.push(result);
      passCount++;
    }

    if (passCount % (conditions.length * 10) === 0) {
      process.stdout.write(`\r  Progress: ${Math.round(passCount / (conditions.length * threeTeamDates.length) * 100)}%`);
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\r  Completed ${passCount} replay passes in ${elapsed}s`);

  // ── Compute means and stddevs per condition ────────────────────

  type MetricKey = keyof Omit<DayResult, 'date'>;
  const METRICS: { key: MetricKey; label: string; dec: number; lowerBetter: boolean }[] = [
    { key: 'avgRatio',     label: 'Avg Ratio',            dec: 1, lowerBetter: false },
    { key: 'minRatio',     label: 'Min Ratio',            dec: 1, lowerBetter: false },
    { key: 'b2bHA',        label: 'B2B HA/day',           dec: 2, lowerBetter: true },
    { key: 'slams',        label: 'Slams/day',            dec: 1, lowerBetter: true },
    { key: 'giniCount',    label: 'Gini (count)',         dec: 3, lowerBetter: true },
    { key: 'giniAcuity',   label: 'Gini (acuity 5:4:3)', dec: 3, lowerBetter: true },
    { key: 'countSpread',  label: 'Count Spread',         dec: 1, lowerBetter: true },
    { key: 'acuitySpread', label: 'Acuity Spread',        dec: 1, lowerBetter: true },
    { key: 'loadMinutesSD', label: 'Load-Minutes SD',     dec: 1, lowerBetter: true },
    { key: 'normalizedLoadMinutesSD', label: 'Norm LM SD', dec: 4, lowerBetter: true },
  ];

  const condMeans: Map<string, Record<MetricKey, number>> = new Map();
  const condStddevs: Map<string, Record<MetricKey, number>> = new Map();
  for (const cond of conditions) {
    const results = allResults.get(cond.id)!;
    const means: Record<string, number> = {};
    const sds: Record<string, number> = {};
    for (const m of METRICS) {
      const vals = results.map(r => r[m.key]);
      means[m.key] = mean(vals);
      sds[m.key] = stddev(vals);
    }
    condMeans.set(cond.id, means as Record<MetricKey, number>);
    condStddevs.set(cond.id, sds as Record<MetricKey, number>);
  }

  // ── Print console table ────────────────────────────────────────

  console.log(`\n${'='.repeat(130)}`);
  console.log('  RESULTS (mean across days, * = best)');
  console.log('='.repeat(130));

  // Column order: B1-B12 grouped by base, then NB, then A1
  const formulaIds = conditions.filter(c => c.mode === 'formula' && c.id !== 'NB').map(c => c.id);
  const colOrder = [...formulaIds, 'NB', 'A1'];

  const COL_W = 7;
  const LABEL_W = 22;

  // Header row 1: base group labels
  let header1 = pad('', LABEL_W);
  for (const bl of BASE_LEVELS) {
    const groupW = COL_W * 4;
    const label = `-- ${bl.label} --`;
    const leftPad = Math.floor((groupW - label.length) / 2);
    header1 += ' '.repeat(Math.max(0, leftPad)) + label + ' '.repeat(Math.max(0, groupW - leftPad - label.length));
  }
  header1 += pad('', COL_W * 2);
  console.log(header1);

  // Header row 2: ratio labels
  let header2 = pad('Metric', LABEL_W);
  for (const _bl of BASE_LEVELS) {
    for (const rl of RATIO_LEVELS) {
      header2 += rpad(rl.shortLabel, COL_W);
    }
  }
  header2 += rpad('NoBuf', COL_W);
  header2 += rpad('Act', COL_W);
  console.log(header2);
  console.log('-'.repeat(LABEL_W + COL_W * colOrder.length));

  // Data rows
  for (const m of METRICS) {
    const allVals = colOrder.map(id => condMeans.get(id)![m.key]);
    const bestVal = m.lowerBetter ? Math.min(...allVals) : Math.max(...allVals);

    let row = pad(m.label, LABEL_W);
    for (const id of colOrder) {
      const v = condMeans.get(id)![m.key];
      let cell = fmt(v, m.dec);
      if (v === bestVal) cell += '*';
      row += rpad(cell, COL_W);
    }
    console.log(row);
  }

  // ── Best in class summary ──────────────────────────────────────

  console.log(`\n${'='.repeat(80)}`);
  console.log('  BEST IN CLASS (top 3 per metric)');
  console.log('='.repeat(80));

  for (const m of METRICS) {
    const ranked = colOrder
      .map(id => {
        const cond = conditions.find(c => c.id === id)!;
        return { id, label: cond.label, val: condMeans.get(id)![m.key] };
      })
      .sort((a, b) => m.lowerBetter ? a.val - b.val : b.val - a.val);
    const top3 = ranked.slice(0, 3);
    console.log(`  ${m.label}:`);
    for (let i = 0; i < top3.length; i++) {
      console.log(`    ${i + 1}. ${pad(`${top3[i].id} (${top3[i].label})`, 34)} ${fmt(top3[i].val, m.dec)}`);
    }
  }

  // ── Statistical tests ──────────────────────────────────────────

  console.log(`\n${'='.repeat(80)}`);
  console.log('  STATISTICAL TESTS (paired t-test, p < 0.05, with Cohen\'s d)');
  console.log('='.repeat(80));

  interface Comparison {
    a: string;
    b: string;
    label: string;
  }

  const comparisons: Comparison[] = [];

  // 1. Ratio effect: within each base, all ratio pairs (6 pairs × 3 bases = 18)
  for (const bl of BASE_LEVELS) {
    const baseConds = conditions.filter(c => c.baseMinutes === bl.base && c.mode === 'formula' && c.id !== 'NB');
    for (let i = 0; i < baseConds.length; i++) {
      for (let j = i + 1; j < baseConds.length; j++) {
        comparisons.push({
          a: baseConds[i].id,
          b: baseConds[j].id,
          label: `ratio: ${baseConds[i].ratioLabel} vs ${baseConds[j].ratioLabel} (${bl.label})`,
        });
      }
    }
  }

  // 2. Base unit effect: within each ratio, all base pairs (3 pairs × 4 ratios = 12)
  for (const rl of RATIO_LEVELS) {
    const ratioConds = conditions.filter(c => c.ratioLabel === rl.label && c.mode === 'formula');
    for (let i = 0; i < ratioConds.length; i++) {
      for (let j = i + 1; j < ratioConds.length; j++) {
        comparisons.push({
          a: ratioConds[i].id,
          b: ratioConds[j].id,
          label: `base: b=${ratioConds[i].baseMinutes} vs b=${ratioConds[j].baseMinutes} (${rl.label})`,
        });
      }
    }
  }

  // 3. NB vs each B1-B12 (12)
  for (const cond of conditions) {
    if (cond.mode === 'formula' && cond.id !== 'NB') {
      comparisons.push({ a: cond.id, b: 'NB', label: `${cond.label} vs No Buffer` });
    }
  }

  // 4. All formula + NB vs Actual (13)
  for (const cond of conditions) {
    if (cond.mode !== 'actual') {
      comparisons.push({ a: cond.id, b: 'A1', label: `${cond.label} vs Actual` });
    }
  }

  // Collect pairwise results for JSON output
  interface PairwiseResult {
    condA: string;
    condB: string;
    metric: string;
    delta: number;
    pValue: number;
    cohenD: number;
    significant: boolean;
  }
  const pairwiseResults: PairwiseResult[] = [];

  for (const m of METRICS) {
    const sigResults: string[] = [];

    for (const comp of comparisons) {
      const aResults = allResults.get(comp.a)!;
      const bResults = allResults.get(comp.b)!;
      const aVals = aResults.map(r => r[m.key]);
      const bVals = bResults.map(r => r[m.key]);
      const p = pairedTTest(aVals, bVals);
      const d = cohenD(aVals, bVals);
      const aMean = mean(aVals);
      const bMean = mean(bVals);
      const delta = aMean - bMean;

      pairwiseResults.push({
        condA: comp.a,
        condB: comp.b,
        metric: m.key,
        delta,
        pValue: p,
        cohenD: d,
        significant: p < 0.05,
      });

      if (p < 0.05) {
        const dir = delta > 0 ? '>' : '<';
        const pStr = p < 0.001 ? '<0.001' : p.toFixed(3);
        sigResults.push(`    ${comp.a} ${dir} ${comp.b}: D=${fmt(Math.abs(delta), m.dec)}, p=${pStr}, d=${fmt(Math.abs(d), 2)} [${comp.label}]`);
      }
    }

    if (sigResults.length > 0) {
      console.log(`\n  ${m.label}:`);
      for (const r of sigResults) console.log(r);
    }
  }

  // ── No-buffer comparison ───────────────────────────────────────

  console.log(`\n${'='.repeat(80)}`);
  console.log('  NO-BUFFER COMPARISON (NB vs buffered conditions)');
  console.log('='.repeat(80));

  for (const m of METRICS) {
    const nbVal = condMeans.get('NB')![m.key];
    const bufferedVals = formulaIds.map(id => condMeans.get(id)![m.key]);
    const bufferedMean = mean(bufferedVals);
    const diff = nbVal - bufferedMean;
    const dir = m.lowerBetter ? (diff > 0 ? 'WORSE' : 'better') : (diff < 0 ? 'WORSE' : 'better');
    console.log(`  ${pad(m.label, 22)} NB: ${fmt(nbVal, m.dec)}  Buffered avg: ${fmt(bufferedMean, m.dec)}  (${dir} by ${fmt(Math.abs(diff), m.dec)})`);
  }

  // ── Robustness assessment ──────────────────────────────────────

  console.log(`\n${'='.repeat(80)}`);
  console.log('  ROBUSTNESS ASSESSMENT (formula conditions B1-B12 only)');
  console.log('='.repeat(80));

  console.log('\n  Range of buffered conditions (min..max, % variation):');
  for (const m of METRICS) {
    const vals = formulaIds.map(id => condMeans.get(id)![m.key]);
    const minVal = Math.min(...vals);
    const maxVal = Math.max(...vals);
    const midpoint = (minVal + maxVal) / 2;
    const pctVariation = midpoint === 0 ? 0 : ((maxVal - minVal) / midpoint) * 100;
    console.log(`    ${pad(m.label, 22)} ${fmt(minVal, m.dec)} .. ${fmt(maxVal, m.dec)}  (${fmt(pctVariation, 1)}% variation)`);
  }

  // ── Base effect summary ────────────────────────────────────────

  console.log('\n  Base effect (within each ratio, best base per metric):');
  for (const m of METRICS) {
    const baseBests: string[] = [];
    for (const rl of RATIO_LEVELS) {
      const ratioConds = conditions.filter(c => c.ratioLabel === rl.label && c.mode === 'formula');
      const ranked = ratioConds
        .map(c => ({ base: c.baseMinutes, val: condMeans.get(c.id)![m.key] }))
        .sort((a, b) => m.lowerBetter ? a.val - b.val : b.val - a.val);
      baseBests.push(`${rl.shortLabel}:b${ranked[0].base}`);
    }
    console.log(`    ${pad(m.label, 22)} ${baseBests.join('  ')}`);
  }

  // ── Ratio effect summary ───────────────────────────────────────

  console.log('\n  Ratio effect (within each base, best ratio per metric):');
  for (const m of METRICS) {
    const ratioBests: string[] = [];
    for (const bl of BASE_LEVELS) {
      const baseConds = conditions.filter(c => c.baseMinutes === bl.base && c.mode === 'formula' && c.id !== 'NB');
      const ranked = baseConds
        .map(c => ({ ratio: c.ratioLabel, val: condMeans.get(c.id)![m.key] }))
        .sort((a, b) => m.lowerBetter ? a.val - b.val : b.val - a.val);
      ratioBests.push(`${bl.label}:${ranked[0].ratio}`);
    }
    console.log(`    ${pad(m.label, 22)} ${ratioBests.join('  ')}`);
  }

  // ── Generate markdown results file ─────────────────────────────

  const md: string[] = [];
  md.push('# Buffer Duration Benchmark Results');
  md.push('');
  md.push('## Configuration');
  md.push('');
  const totalEncounters = threeTeamDates.reduce((sum, d) => sum + (byDate.get(d) ?? []).filter(a => a.hour >= 9 && a.hour <= 23).length, 0);
  md.push(`- **Encounters:** ${totalEncounters} (primary, three-team, 9A-midnight)`);
  md.push(`- **Days:** ${threeTeamDates.length}`);
  md.push(`- **Date range:** ${threeTeamDates[0]} to ${threeTeamDates[threeTeamDates.length - 1]}`);
  md.push(`- **Routing weights:** 1:2:4 (tier_three:tier_two:tier_one)`);
  md.push(`- **Decay schedule:** D6 — 0.75x linear`);
  md.push(`- **Measurement weights:** 5:4:3 (tier_one:tier_two:tier_three)`);
  md.push(`- **Conditions:** 12 buffer configs (3 bases x 4 ratios) + No Buffer + Actual = 14 total`);
  md.push('');

  // Condition matrix
  md.push('## Condition Matrix');
  md.push('');
  md.push('| ID | Base | Ratio | Purple | Yellow | Red |');
  md.push('|----|------|-------|--------|--------|-----|');
  for (const c of conditions) {
    if (c.mode === 'actual') {
      md.push(`| ${c.id} | — | — | Actual (historical) | | |`);
    } else if (c.id === 'NB') {
      md.push(`| ${c.id} | — | — | 0m | 0m | 0m |`);
    } else {
      const p = Math.round(c.bufferDurations.tier_three / 60000);
      const y = Math.round(c.bufferDurations.tier_two / 60000);
      const r = Math.round(c.bufferDurations.tier_one / 60000);
      md.push(`| ${c.id} | ${c.baseMinutes}m | ${c.ratioLabel} | ${p}m | ${y}m | ${r}m |`);
    }
  }
  md.push('');

  // Full results table
  md.push('## Results (Mean ± SD across days)');
  md.push('');
  const mdColHeaders = conditions.map(c => c.id);
  md.push(`| Metric | ${mdColHeaders.join(' | ')} |`);
  md.push(`|--------|${mdColHeaders.map(() => '------').join('|')}|`);

  for (const m of METRICS) {
    const allVals = conditions.map(c => condMeans.get(c.id)![m.key]);
    const bestVal = m.lowerBetter ? Math.min(...allVals) : Math.max(...allVals);

    const cells = conditions.map(c => {
      const v = condMeans.get(c.id)![m.key];
      const sd = condStddevs.get(c.id)![m.key];
      const star = v === bestVal ? '*' : '';
      return `${fmt(v, m.dec)}±${fmt(sd, m.dec)}${star}`;
    });
    md.push(`| ${m.label} | ${cells.join(' | ')} |`);
  }
  md.push('');

  // Robustness assessment
  md.push('## Robustness Assessment (B1-B12)');
  md.push('');
  md.push('| Metric | Min | Max | % Variation |');
  md.push('|--------|-----|-----|-------------|');
  for (const m of METRICS) {
    const vals = formulaIds.map(id => condMeans.get(id)![m.key]);
    const minVal = Math.min(...vals);
    const maxVal = Math.max(...vals);
    const midpoint = (minVal + maxVal) / 2;
    const pctVariation = midpoint === 0 ? 0 : ((maxVal - minVal) / midpoint) * 100;
    md.push(`| ${m.label} | ${fmt(minVal, m.dec)} | ${fmt(maxVal, m.dec)} | ${fmt(pctVariation, 1)}% |`);
  }
  md.push('');

  // Base effect summary
  md.push('## Base Effect Summary');
  md.push('');
  md.push('Best base within each ratio:');
  md.push('');
  md.push(`| Metric | ${RATIO_LEVELS.map(r => r.label).join(' | ')} |`);
  md.push(`|--------|${RATIO_LEVELS.map(() => '------').join('|')}|`);
  for (const m of METRICS) {
    const cells = RATIO_LEVELS.map(rl => {
      const ratioConds = conditions.filter(c => c.ratioLabel === rl.label && c.mode === 'formula');
      const ranked = ratioConds
        .map(c => ({ base: c.baseMinutes, val: condMeans.get(c.id)![m.key] }))
        .sort((a, b) => m.lowerBetter ? a.val - b.val : b.val - a.val);
      return `b=${ranked[0].base}`;
    });
    md.push(`| ${m.label} | ${cells.join(' | ')} |`);
  }
  md.push('');

  // Ratio effect summary
  md.push('## Ratio Effect Summary');
  md.push('');
  md.push('Best ratio within each base:');
  md.push('');
  md.push(`| Metric | ${BASE_LEVELS.map(b => b.label).join(' | ')} |`);
  md.push(`|--------|${BASE_LEVELS.map(() => '------').join('|')}|`);
  for (const m of METRICS) {
    const cells = BASE_LEVELS.map(bl => {
      const baseConds = conditions.filter(c => c.baseMinutes === bl.base && c.mode === 'formula' && c.id !== 'NB');
      const ranked = baseConds
        .map(c => ({ ratio: c.ratioLabel, val: condMeans.get(c.id)![m.key] }))
        .sort((a, b) => m.lowerBetter ? a.val - b.val : b.val - a.val);
      return ranked[0].ratio;
    });
    md.push(`| ${m.label} | ${cells.join(' | ')} |`);
  }
  md.push('');

  // Significant pairwise comparisons
  const sigPairs = pairwiseResults.filter(p => p.significant);
  md.push('## Significant Pairwise Comparisons (p < 0.05)');
  md.push('');
  if (sigPairs.length === 0) {
    md.push('No significant differences found across any comparisons.');
  } else {
    md.push(`| Metric | Cond A | Cond B | Delta | p-value | Cohen's d |`);
    md.push('|--------|--------|--------|-------|---------|-----------|');
    for (const p of sigPairs) {
      const m = METRICS.find(m => m.key === p.metric)!;
      const pStr = p.pValue < 0.001 ? '<0.001' : p.pValue.toFixed(3);
      md.push(`| ${m.label} | ${p.condA} | ${p.condB} | ${fmt(p.delta, m.dec)} | ${pStr} | ${fmt(Math.abs(p.cohenD), 2)} |`);
    }
  }
  md.push('');

  const mdPath = join(PROJECT_ROOT, 'BUFFER_DURATION_BENCHMARK_RESULTS.md');
  writeFileSync(mdPath, md.join('\n'));
  console.log(`\n  Markdown results written to ${mdPath}`);

  // ── JSON output ────────────────────────────────────────────────

  if (FLAG_JSON) {
    const jsonOutput = {
      meta: {
        encounters: totalEncounters,
        days: threeTeamDates.length,
        dateRange: { start: threeTeamDates[0], end: threeTeamDates[threeTeamDates.length - 1] },
        baseConfig: { weights: '1:2:4', decay: 'D6 0.75x linear' },
        measurementWeights: { tier_one: 5, tier_two: 4, tier_three: 3 },
        conditions: conditions.map(c => ({
          id: c.id,
          label: c.label,
          mode: c.mode,
          baseMinutes: c.baseMinutes,
          ratioLabel: c.ratioLabel,
          bufferDurations: {
            purple: Math.round(c.bufferDurations.tier_three / 60000),
            yellow: Math.round(c.bufferDurations.tier_two / 60000),
            red: Math.round(c.bufferDurations.tier_one / 60000),
          },
        })),
      },
      results: Object.fromEntries(
        conditions.map(c => [
          c.id,
          {
            daily: allResults.get(c.id)!,
            mean: condMeans.get(c.id)!,
            stddev: condStddevs.get(c.id)!,
          },
        ]),
      ),
      pairwise: pairwiseResults,
    };

    const outPath = join(__dirname, 'buffer-duration-benchmark-results.json');
    writeFileSync(outPath, JSON.stringify(jsonOutput, null, 2));
    console.log(`  JSON written to ${outPath}`);
  }

  console.log('\nDone.');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
