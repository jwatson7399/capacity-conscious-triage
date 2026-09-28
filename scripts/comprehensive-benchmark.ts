/**
 * Comprehensive Benchmark — Weight × Infrastructure Grid
 *
 * Crosses 4 weight configs × 4 infrastructure variants = 16 formula conditions,
 * plus 4 round-robin variants and 1 actual baseline = 21 total conditions.
 *
 * Usage:
 *   cd er-triage-app && npx tsx scripts/comprehensive-benchmark.ts
 *   cd er-triage-app && npx tsx scripts/comprehensive-benchmark.ts --json
 */

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join, basename } from 'path';
import * as XLSX from 'xlsx';

import type { Provider, ProviderType, ProviderStatus, TeamId, AcuityTier, Patient, Buffer } from '../src/types';
import type { ScheduleProvider, DaySchedule } from '../src/utils/scheduleParser';
import { parseWeeklySchedule, getProvidersForShift } from '../src/utils/scheduleParser';
import { getDefaultOverrides } from '../src/engine/simulation';
import { getRecommendation, scoreTeam, createBuffer, getEffectiveCapacity } from '../src/engine/recommendation';
import type { ScoringOverrides } from '../src/engine/recommendation';
import { TRAUMA_TEAM_ID, ACUITY_WEIGHTS, ACUITY_DECAY, BUFFER_DURATIONS_MS } from '../src/constants';
import { uid } from '../src/uid';
import { excelSerialToWallMs, localDateToWallMs, parseWallClockString, wallDateStr, wallHour } from './lib/census-time';

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

interface BenchmarkCondition {
  id: string;
  mode: 'formula' | 'round_robin' | 'actual';
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
}

// ── Fixed measurement weights ────────────────────────────────────

const MEASUREMENT_WEIGHTS: Record<AcuityTier, number> = {
  tier_one: 5,
  tier_two: 4,
  tier_three: 3,
};

// ── Helper functions (copied from historical-replay.ts) ──────────

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

// ── Team spread ──────────────────────────────────────────────────

function teamSpread(counts: Record<number, number>, eligibleTeams: TeamId[]): number {
  const vals = eligibleTeams.map(t => counts[t] ?? 0);
  if (vals.length === 0) return 0;
  return Math.max(...vals) - Math.min(...vals);
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

// ── Build conditions ─────────────────────────────────────────────

type WeightConfig = { label: string; t1: number; t2: number; t3: number };

const WEIGHT_CONFIGS: WeightConfig[] = [
  { label: '1:1:1', t1: 1, t2: 1, t3: 1 },
  { label: '1:2:3', t1: 3, t2: 2, t3: 1 },
  { label: '1:2:4', t1: 4, t2: 2, t3: 1 },
  { label: '1:3:5', t1: 5, t2: 3, t3: 1 },
];

type InfraVariant = 'BD' | 'BN' | 'DB' | 'NN';
const INFRA_VARIANTS: InfraVariant[] = ['BD', 'BN', 'DB', 'NN'];

function makeDecayOn(t1: number, t2: number, t3: number): Record<AcuityTier, Array<{ afterMs: number; weight: number }>> {
  return {
    tier_one: [
      { afterMs: 90 * 60 * 1000, weight: t2 },
      { afterMs: 180 * 60 * 1000, weight: t3 },
      { afterMs: 240 * 60 * 1000, weight: 0 },
    ],
    tier_two: [
      { afterMs: 90 * 60 * 1000, weight: t3 },
      { afterMs: 240 * 60 * 1000, weight: 0 },
    ],
    tier_three: [
      { afterMs: 120 * 60 * 1000, weight: 0 },
    ],
  };
}

const DECAY_OFF: Record<AcuityTier, Array<{ afterMs: number; weight: number }>> = {
  tier_one: [], tier_two: [], tier_three: [],
};

const BUFFERS_ON: Record<AcuityTier, number> = {
  tier_one: 35 * 60 * 1000,
  tier_two: 25 * 60 * 1000,
  tier_three: 15 * 60 * 1000,
};

const BUFFERS_OFF: Record<AcuityTier, number> = {
  tier_one: 0, tier_two: 0, tier_three: 0,
};

function hasBuffers(infra: InfraVariant): boolean {
  return infra === 'BD' || infra === 'BN';
}

function hasDecay(infra: InfraVariant): boolean {
  return infra === 'BD' || infra === 'DB';
}

function buildAllConditions(): BenchmarkCondition[] {
  const conditions: BenchmarkCondition[] = [];

  // 16 formula conditions
  for (const wc of WEIGHT_CONFIGS) {
    for (const infra of INFRA_VARIANTS) {
      conditions.push({
        id: `${wc.label} ${infra}`,
        mode: 'formula',
        acuityWeights: { tier_one: wc.t1, tier_two: wc.t2, tier_three: wc.t3 },
        decaySteps: hasDecay(infra) ? makeDecayOn(wc.t1, wc.t2, wc.t3) : DECAY_OFF,
        bufferDurations: hasBuffers(infra) ? BUFFERS_ON : BUFFERS_OFF,
      });
    }
  }

  // 4 RR conditions
  for (const infra of INFRA_VARIANTS) {
    conditions.push({
      id: `RR ${infra}`,
      mode: 'round_robin',
      acuityWeights: { ...ACUITY_WEIGHTS },
      decaySteps: hasDecay(infra) ? { ...ACUITY_DECAY } : DECAY_OFF,
      bufferDurations: hasBuffers(infra) ? BUFFERS_ON : BUFFERS_OFF,
    });
  }

  // 1 Actual condition
  conditions.push({
    id: 'Actual',
    mode: 'actual',
    acuityWeights: { ...ACUITY_WEIGHTS },
    decaySteps: { ...ACUITY_DECAY },
    bufferDurations: BUFFERS_OFF,
  });

  return conditions;
}

// ── Build ScoringOverrides from a condition ──────────────────────

function conditionToOverrides(cond: BenchmarkCondition): ScoringOverrides {
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
  condition: BenchmarkCondition,
): DayResult {
  const scoringOv = conditionToOverrides(condition);
  const closedTeams: Record<number, number> = {};

  let patients: Patient[] = [];
  let buffers: Buffer[] = [];
  const entries: ReplayEntry[] = [];
  let rrNext = 0;

  for (let i = 0; i < arrivals.length; i++) {
    const arr = arrivals[i];
    const now = arr.arrivalTime;
    const hourOfDay = arr.hour;

    const { providers: scheduledProviders } = getProvidersForShift(day, hourOfDay);
    const simProviders = toProviders(scheduledProviders);

    let teamId: TeamId;

    if (condition.mode === 'actual') {
      teamId = arr.actualTeam;
    } else if (condition.mode === 'round_robin') {
      buffers = buffers.filter(b => b.expiresAt > now);
      teamId = eligibleTeams[rrNext % eligibleTeams.length];
      rrNext++;
    } else {
      // formula
      buffers = buffers.filter(b => b.expiresAt > now);
      const rec = getRecommendation(simProviders, patients, buffers, now, closedTeams, scoringOv, undefined);
      teamId = rec.first ?? eligibleTeams[0];
    }

    // Score at assignment time using the condition's overrides
    const score = scoreTeam(teamId, simProviders, patients, buffers, now, scoringOv);
    const ratio = score.capacityRatio === Infinity ? 100 : score.capacityRatio;

    const patient: Patient = {
      id: `${condition.id}-${String(i + 1).padStart(3, '0')}`,
      acuity: arr.acuity,
      assignedTeamId: teamId,
      assignedAt: now,
    };

    // Buffer merge logic (only when condition has buffers on)
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
  };
}

// ── Main ─────────────────────────────────────────────────────────

async function main() {
  console.log('═'.repeat(80));
  console.log('  COMPREHENSIVE BENCHMARK — Weight x Infrastructure Grid');
  console.log('═'.repeat(80));
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

    // Filter to hours 9-23
    const filtered = dayArrivals.filter(a => a.hour >= 9 && a.hour <= 23);
    if (filtered.length === 0) continue;

    // Determine eligible teams (teams with providers, excluding team 4)
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

    // Determine eligible teams for this day
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

  // ── Compute means per condition ────────────────────────────────

  type MetricKey = keyof Omit<DayResult, 'date'>;
  const METRICS: { key: MetricKey; label: string; dec: number; lowerBetter: boolean }[] = [
    { key: 'avgRatio',     label: 'Avg Ratio',           dec: 1, lowerBetter: false },
    { key: 'minRatio',     label: 'Min Ratio',           dec: 1, lowerBetter: false },
    { key: 'b2bHA',        label: 'B2B HA/day',          dec: 1, lowerBetter: true },
    { key: 'slams',        label: 'Slams/day',           dec: 1, lowerBetter: true },
    { key: 'giniCount',    label: 'Gini (count)',        dec: 3, lowerBetter: true },
    { key: 'giniAcuity',   label: 'Gini (acuity 5:4:3)', dec: 3, lowerBetter: true },
    { key: 'countSpread',  label: 'Count Spread',        dec: 1, lowerBetter: true },
    { key: 'acuitySpread', label: 'Acuity Spread',       dec: 1, lowerBetter: true },
  ];

  const condMeans: Map<string, Record<MetricKey, number>> = new Map();
  for (const cond of conditions) {
    const results = allResults.get(cond.id)!;
    const means: Record<string, number> = {};
    for (const m of METRICS) {
      means[m.key] = mean(results.map(r => r[m.key]));
    }
    condMeans.set(cond.id, means as Record<MetricKey, number>);
  }

  // ── Print console table ────────────────────────────────────────

  console.log(`\n${'═'.repeat(120)}`);
  console.log('  RESULTS (mean across days, * = best)');
  console.log('═'.repeat(120));

  // Column order: 4 weight configs × 4 infras, then RR × 4, then Actual
  const colOrder: string[] = [];
  for (const wc of WEIGHT_CONFIGS) {
    for (const infra of INFRA_VARIANTS) {
      colOrder.push(`${wc.label} ${infra}`);
    }
  }
  for (const infra of INFRA_VARIANTS) {
    colOrder.push(`RR ${infra}`);
  }
  colOrder.push('Actual');

  const COL_W = 7;
  const LABEL_W = 20;

  // Header row 1: group labels
  let header1 = pad('', LABEL_W);
  for (const wc of WEIGHT_CONFIGS) {
    const groupW = COL_W * 4;
    const label = `-- ${wc.label} --`;
    const leftPad = Math.floor((groupW - label.length) / 2);
    header1 += ' '.repeat(Math.max(0, leftPad)) + label + ' '.repeat(Math.max(0, groupW - leftPad - label.length));
  }
  header1 += pad('-- RR --', COL_W * 4);
  header1 += pad('', COL_W);
  console.log(header1);

  // Header row 2: infra labels
  let header2 = pad('Metric', LABEL_W);
  for (const wc of WEIGHT_CONFIGS) {
    for (const infra of INFRA_VARIANTS) {
      header2 += rpad(infra, COL_W);
    }
  }
  for (const infra of INFRA_VARIANTS) {
    header2 += rpad(infra, COL_W);
  }
  header2 += rpad('Act', COL_W);
  console.log(header2);
  console.log('─'.repeat(LABEL_W + COL_W * colOrder.length));

  // Data rows
  for (const m of METRICS) {
    // Find best value
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

  console.log(`\n${'═'.repeat(80)}`);
  console.log('  BEST IN CLASS (top 3 per metric)');
  console.log('═'.repeat(80));

  for (const m of METRICS) {
    const ranked = colOrder
      .map(id => ({ id, val: condMeans.get(id)![m.key] }))
      .sort((a, b) => m.lowerBetter ? a.val - b.val : b.val - a.val);
    const top3 = ranked.slice(0, 3);
    console.log(`  ${m.label}:`);
    for (let i = 0; i < top3.length; i++) {
      console.log(`    ${i + 1}. ${pad(top3[i].id, 14)} ${fmt(top3[i].val, m.dec)}`);
    }
  }

  // ── Statistical tests ──────────────────────────────────────────

  console.log(`\n${'═'.repeat(80)}`);
  console.log('  STATISTICAL TESTS (paired t-test, p < 0.05 only)');
  console.log('═'.repeat(80));

  interface Comparison {
    a: string;
    b: string;
    label: string;
  }

  const comparisons: Comparison[] = [];

  // 1. Within each weight config (4 tests per weight × 4 weights = 16)
  for (const wc of WEIGHT_CONFIGS) {
    const bd = `${wc.label} BD`, bn = `${wc.label} BN`, db = `${wc.label} DB`, nn = `${wc.label} NN`;
    comparisons.push({ a: bd, b: bn, label: 'decay effect (buf held)' });
    comparisons.push({ a: bd, b: db, label: 'buffer effect (decay held)' });
    comparisons.push({ a: bd, b: nn, label: 'combined removal' });
    comparisons.push({ a: bn, b: nn, label: 'buffer effect (no decay)' });
  }

  // 2. Across weight configs within same infra (6 pairwise × 4 infras = 24)
  for (const infra of INFRA_VARIANTS) {
    for (let i = 0; i < WEIGHT_CONFIGS.length; i++) {
      for (let j = i + 1; j < WEIGHT_CONFIGS.length; j++) {
        const a = `${WEIGHT_CONFIGS[i].label} ${infra}`;
        const b = `${WEIGHT_CONFIGS[j].label} ${infra}`;
        comparisons.push({ a, b, label: `weight comparison (${infra})` });
      }
    }
  }

  // 3. Formula vs baselines (16 + 16 = 32)
  for (const wc of WEIGHT_CONFIGS) {
    for (const infra of INFRA_VARIANTS) {
      const fId = `${wc.label} ${infra}`;
      comparisons.push({ a: fId, b: 'Actual', label: 'vs Actual' });
      comparisons.push({ a: fId, b: `RR ${infra}`, label: `vs RR (${infra})` });
    }
  }

  for (const m of METRICS) {
    const sigResults: string[] = [];

    for (const comp of comparisons) {
      const aResults = allResults.get(comp.a)!;
      const bResults = allResults.get(comp.b)!;
      const aVals = aResults.map(r => r[m.key]);
      const bVals = bResults.map(r => r[m.key]);
      const p = pairedTTest(aVals, bVals);

      if (p < 0.05) {
        const aMean = mean(aVals);
        const bMean = mean(bVals);
        const delta = aMean - bMean;
        const dir = delta > 0 ? '>' : '<';
        sigResults.push(`    ${comp.a} ${dir} ${comp.b}: D=${fmt(Math.abs(delta), m.dec)}, p=${p < 0.001 ? '<0.001' : p.toFixed(3)} [${comp.label}]`);
      }
    }

    if (sigResults.length > 0) {
      console.log(`\n  ${m.label}:`);
      for (const r of sigResults) console.log(r);
    }
  }

  // ── JSON output ────────────────────────────────────────────────

  if (FLAG_JSON) {
    const jsonOutput: Record<string, any> = {};
    for (const cond of conditions) {
      const results = allResults.get(cond.id)!;
      const means: Record<string, number> = {};
      const stddevs: Record<string, number> = {};
      for (const m of METRICS) {
        const vals = results.map(r => r[m.key]);
        means[m.key] = mean(vals);
        stddevs[m.key] = stddev(vals);
      }
      jsonOutput[cond.id] = {
        condition: cond,
        means,
        stddevs,
        dailyResults: results,
      };
    }

    const outPath = join(__dirname, 'comprehensive-benchmark-results.json');
    writeFileSync(outPath, JSON.stringify(jsonOutput, null, 2));
    console.log(`\n  JSON written to ${outPath}`);
  }

  console.log('\nDone.');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
