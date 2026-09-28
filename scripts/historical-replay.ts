/**
 * Historical Replay Benchmark — Real Arrivals × Real Schedules
 *
 * Uses actual patient census data (Dec 2025 – Mar 2026) paired with real
 * provider schedules to compare three assignment modes:
 *   1. Actual — the historical team assignment as it really happened
 *   2. Formula — what the app's recommendation engine would have assigned
 *   3. Round-Robin — sequential cycling through eligible teams (baseline)
 *
 * Usage:
 *   cd er-triage-app && npx tsx scripts/historical-replay.ts
 *   cd er-triage-app && npx tsx scripts/historical-replay.ts --json --verbose --outcomes
 */

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join, basename } from 'path';
import * as XLSX from 'xlsx';

import type {
  Provider, ProviderType, ProviderStatus, TeamId, AcuityTier,
  Patient, Buffer, ShadowEntry,
} from '../src/types';
import type { ScheduleProvider, DaySchedule } from '../src/utils/scheduleParser';
import { parseWeeklySchedule, getProvidersForShift } from '../src/utils/scheduleParser';
import { getDefaultOverrides } from '../src/engine/simulation';
import { statsFromEntries, computeFairness, computeFairnessDetailed } from '../src/engine/fairness';
import type { FairnessBreakdown } from '../src/engine/fairness';
import {
  getRecommendation, scoreTeam, createBuffer, getEffectiveCapacity,
  getDecayedAcuityWeight,
} from '../src/engine/recommendation';
import type { ScoringOverrides } from '../src/engine/recommendation';
import { TRAUMA_TEAM_ID, RED_ZONE_THRESHOLD, ACUITY_WEIGHTS } from '../src/constants';
import { uid } from '../src/uid';
import { atWallHour, dateStrDayOfWeek, excelSerialToWallMs, localDateToWallMs, parseWallClockString, wallDateStr, wallHour } from './lib/census-time';

// ── CLI flags ──────────────────────────────────────────────────────

const FLAG_JSON = process.argv.includes('--json');
const FLAG_VERBOSE = process.argv.includes('--verbose');
const FLAG_OUTCOMES = process.argv.includes('--outcomes');
const FLAG_POST_ASSIGN = process.argv.includes('--post-assign');

// --weights 4:2:1  →  override acuity weights (tier_one:tier_two:tier_three)
const weightsIdx = process.argv.findIndex(a => a === '--weights');
const FLAG_WEIGHTS = weightsIdx >= 0 ? process.argv[weightsIdx + 1] : null;

function parseWeightFlag(flag: string | null): { acuityWeights: Record<AcuityTier, number>; decaySteps: Record<AcuityTier, Array<{ afterMs: number; weight: number }>> } | null {
  if (!flag) return null;
  const parts = flag.split(':').map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) {
    console.error(`  ERROR: --weights must be tier_one:tier_two:tier_three (e.g., 4:2:1)`);
    process.exit(1);
  }
  const [t1, t2, t3] = parts;
  // Adjust decay schedules to match new initial weights
  return {
    acuityWeights: { tier_one: t1, tier_two: t2, tier_three: t3 },
    decaySteps: {
      // Red: initial → t2 at 90m → t3 at 180m → 0 at 240m
      tier_one: [
        { afterMs: 90 * 60 * 1000, weight: t2 },
        { afterMs: 180 * 60 * 1000, weight: t3 },
        { afterMs: 240 * 60 * 1000, weight: 0 },
      ],
      // Yellow: initial → t3 at 90m → 0 at 240m
      tier_two: [
        { afterMs: 90 * 60 * 1000, weight: t3 },
        { afterMs: 240 * 60 * 1000, weight: 0 },
      ],
      // Purple: initial → 0 at 120m (unchanged structure)
      tier_three: [
        { afterMs: 120 * 60 * 1000, weight: 0 },
      ],
    },
  };
}

const WEIGHT_OVERRIDE = parseWeightFlag(FLAG_WEIGHTS);
const WEIGHT_LABEL = FLAG_WEIGHTS ?? '5:3:1';

// --decay none | --decay timeout:T  →  override decay schedule (applied after --weights)
const decayIdx = process.argv.findIndex(a => a === '--decay');
const FLAG_DECAY = decayIdx >= 0 ? process.argv[decayIdx + 1] : null;
let DECAY_LABEL = '';

function applyDecayOverride(base: typeof WEIGHT_OVERRIDE): typeof WEIGHT_OVERRIDE {
  if (!FLAG_DECAY || !base) return base;

  if (FLAG_DECAY === 'none') {
    DECAY_LABEL = 'no-decay';
    return {
      ...base,
      decaySteps: { tier_one: [], tier_two: [], tier_three: [] },
    };
  }

  const timeoutMatch = FLAG_DECAY.match(/^timeout:(\d+)$/);
  if (timeoutMatch) {
    const T = parseInt(timeoutMatch[1], 10);
    DECAY_LABEL = `timeout-${T}`;
    const step = [{ afterMs: T * 60 * 1000, weight: 0 }];
    return {
      ...base,
      decaySteps: { tier_one: step, tier_two: step, tier_three: step },
    };
  }

  if (FLAG_DECAY === 'current') {
    DECAY_LABEL = '';
    return base;
  }

  console.error(`  ERROR: --decay must be 'none', 'current', or 'timeout:T' (e.g., timeout:240)`);
  process.exit(1);
}

const EFFECTIVE_OVERRIDE = applyDecayOverride(WEIGHT_OVERRIDE);

// ── Paths ──────────────────────────────────────────────────────────

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '..');

const CENSUS_PATH = join(PROJECT_ROOT, 'data', 'provider-schedules', 'Aside data Dec 2025–Mar 2026.xlsx');
const SCHEDULE_DIR_1 = join(PROJECT_ROOT, 'data', 'provider-schedules', 'schedules');
const SCHEDULE_DIR_2 = join(PROJECT_ROOT, 'data', 'provider-schedules', 'initially missing schedules');

// ── Types ──────────────────────────────────────────────────────────

interface HistoricalArrival {
  arrivalTime: number;       // epoch ms
  date: string;              // "2025-12-01"
  hour: number;              // 0-23
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

interface DayMetrics {
  date: string;
  dayOfWeek: string;
  cohort: 'three_team' | 'two_team';
  arrivalCount: number;
  actual: CohortMetrics;
  formula: CohortMetrics;
  formulaNoBuffer: CohortMetrics;
  roundRobin: CohortMetrics;
  formulaAgreement: number;        // % where formula === actual
  actualPickedBest: number;        // % actual sent to highest-capacity team
}

interface CohortMetrics {
  fairness: number;
  fairnessBreakdown: FairnessBreakdown;
  teamCounts: Record<number, number>;
  avgRatio: number;
  minRatio: number;
  overwhelms: number;  // red-zone events (ratio < RED_ZONE_THRESHOLD); field name kept so older JSON stays readable
  backToBackHA: number;
  slams: number;
  teamSpread: number;
  acuitySpread: number;
  giniCount: number;
  giniAcuity: number;
  entries: ReplayEntry[];
  loadMinutesPerTeam: Record<number, number>;
  capacityMinutesPerTeam: Record<number, number>;
  normalizedLoadMinutesPerTeam: Record<number, number>;
  loadMinutesSD: number;
  normalizedLoadMinutesSD: number;
  windowStartMs: number;
  windowEndMs: number;
}

// ── ESI → Acuity mapping ──────────────────────────────────────────

function esiToTier(esi: number | null): AcuityTier {
  if (esi === 1) return 'tier_one';
  if (esi === 2) return 'tier_two';
  return 'tier_three';
}

// ── Census parser ─────────────────────────────────────────────────

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

function loadCensusData(): { all: HistoricalArrival[]; excludedCount: number; totalCount: number } {
  console.log(`  Loading census: ${basename(CENSUS_PATH)}`);
  const buf = readFileSync(CENSUS_PATH);
  const wb = XLSX.read(buf, { type: 'buffer' });

  // Find the right sheet
  const sheetName = wb.SheetNames.find(s => s.includes('A-side') || s.includes('trauma'));
  if (!sheetName) throw new Error(`Cannot find census sheet. Available: ${wb.SheetNames.join(', ')}`);
  console.log(`  Sheet: "${sheetName}"`);

  const sheet = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<Record<string, any>>(sheet);
  console.log(`  Raw rows: ${rows.length}`);

  // Detect column names (might vary)
  const firstRow = rows[0];
  const keys = Object.keys(firstRow);

  // Helper to find column by pattern
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
    // Parse arrival time
    const rawArrival = row[colArrival];
    let arrivalMs: number;
    if (typeof rawArrival === 'number') {
      arrivalMs = excelDateToMs(rawArrival);
    } else if (rawArrival instanceof Date) {
      arrivalMs = localDateToWallMs(rawArrival);
    } else if (typeof rawArrival === 'string') {
      arrivalMs = parseWallClockString(rawArrival);
    } else {
      continue; // skip rows without arrival time
    }
    if (isNaN(arrivalMs)) continue;

    // Parse team
    const teamId = parseTeamId(String(row[colTeam] ?? ''));
    if (!teamId) continue;

    // Trauma/Team 4 exclusion
    const source = String(row[colSource] ?? '').toLowerCase();
    if (source === 'trauma' || source === 'both') {
      excludedCount++;
      continue;
    }
    if (teamId === 4) {
      excludedCount++;
      continue;
    }

    // Parse ESI
    const rawEsi = row[colEsi ?? ''];
    const esi = typeof rawEsi === 'number' ? rawEsi : (rawEsi ? parseInt(String(rawEsi)) : null);
    const validEsi = esi && esi >= 1 && esi <= 5 ? esi : null;

    // Parse other fields
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

// ── Schedule loading ──────────────────────────────────────────────

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

  // Load from both directories
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

  // Build date → DaySchedule map
  // Schedule dates are like "December 1", "February 23", etc.
  // Census dates are ISO like "2025-12-01"
  const scheduleMap = new Map<string, DaySchedule>();

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];

  for (const sf of scheduleFiles) {
    for (const day of sf.days) {
      if (day.providers.length === 0) continue;

      // Parse schedule date "December 1" → ISO date
      const parts = day.date.match(/^(\w+)\s+(\d+)$/);
      if (!parts) continue;
      const monthName = parts[1];
      const dayNum = parseInt(parts[2]);
      const monthIdx = monthNames.indexOf(monthName);
      if (monthIdx === -1) continue;

      // Infer year: Dec = 2025, Jan-Mar = 2026
      const year = monthIdx === 11 ? 2025 : 2026;
      const isoDate = `${year}-${String(monthIdx + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;

      scheduleMap.set(isoDate, day);
    }
  }

  console.log(`  Schedule coverage: ${scheduleMap.size} days mapped`);
  return { scheduleMap, fileCount: scheduleFiles.length, dayCount: scheduleMap.size };
}

// ── Provider helpers ──────────────────────────────────────────────

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

// ── Gini coefficient ──────────────────────────────────────────────

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

// ── Back-to-back high-acuity detection ────────────────────────────

const B2B_WINDOW_MS = 30 * 60 * 1000; // 30 minutes

function countBackToBackHA(entries: ReplayEntry[]): number {
  let count = 0;
  // Track last high-acuity assignment per team
  const lastHA: Record<number, number> = {}; // teamId → arrivalTime

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

const SLAM_WINDOW_MS = 60 * 60 * 1000; // 1 hour

function countSlams(entries: ReplayEntry[]): number {
  let count = 0;
  // Track arrival times per team
  const teamTimes: Record<number, number[]> = {};

  for (const e of entries) {
    const times = teamTimes[e.teamId] ?? [];
    // Check if any prior assignment to this team was within the window
    for (const prev of times) {
      if (e.arrivalTime - prev <= SLAM_WINDOW_MS) {
        count++;
        break; // only count once per arrival
      }
    }
    times.push(e.arrivalTime);
    teamTimes[e.teamId] = times;
  }
  return count;
}

// ── Team spread ───────────────────────────────────────────────────

function teamSpread(counts: Record<number, number>, eligibleTeams: TeamId[]): number {
  const vals = eligibleTeams.map(t => counts[t] ?? 0);
  if (vals.length === 0) return 0;
  return Math.max(...vals) - Math.min(...vals);
}

// ── Replay one cohort ─────────────────────────────────────────────

const overrides = getDefaultOverrides();
const scoringOv: ScoringOverrides = {
  capacityWeights: overrides.capacityWeights,
  statusMultipliers: overrides.statusMultipliers,
  acuityWeights: EFFECTIVE_OVERRIDE?.acuityWeights ?? overrides.acuityWeights,
  decaySteps: EFFECTIVE_OVERRIDE?.decaySteps ?? overrides.decaySteps,
  bufferDurations: overrides.bufferDurations,
};

// No-buffer variant: identical to scoringOv but with zero buffer durations
const scoringOvNoBuffer: ScoringOverrides = {
  ...scoringOv,
  bufferDurations: { tier_one: 0, tier_two: 0, tier_three: 0 },
};

// Effective acuity weights for metrics computations (Gini, outcome correlation, etc.)
const effectiveAcuityWeights: Record<AcuityTier, number> = (scoringOv.acuityWeights as Record<AcuityTier, number>) ?? ACUITY_WEIGHTS;

function replayCohort(
  arrivals: HistoricalArrival[],
  day: DaySchedule,
  eligibleTeams: TeamId[],
  closedTeams: Record<number, number>,
  permanentlyClosedTeams: number[],
  baseTime: number,
): { actual: CohortMetrics; formula: CohortMetrics; formulaNoBuffer: CohortMetrics; roundRobin: CohortMetrics; formulaAgreement: number; actualPickedBest: number } {
  if (arrivals.length === 0) {
    const empty: CohortMetrics = {
      fairness: 50,
      fairnessBreakdown: { composite: 50, capacityBalance: 1, acuityBalance: 1, overwhelmAvoidance: 1, minRatioScore: 1, stressEquity: 1 },
      teamCounts: {}, avgRatio: 0, minRatio: 0,
      overwhelms: 0, backToBackHA: 0, slams: 0, teamSpread: 0, acuitySpread: 0,
      giniCount: 0, giniAcuity: 0, entries: [],
      loadMinutesPerTeam: {}, capacityMinutesPerTeam: {}, normalizedLoadMinutesPerTeam: {},
      loadMinutesSD: 0, normalizedLoadMinutesSD: 0, windowStartMs: 0, windowEndMs: 0,
    };
    return { actual: empty, formula: empty, formulaNoBuffer: empty, roundRobin: empty, formulaAgreement: 0, actualPickedBest: 0 };
  }

  // Four independent simulation states
  // Actual: patients only (no buffers)
  let actualPatients: Patient[] = [];
  const actualEntries: ReplayEntry[] = [];

  // Formula: patients + buffers
  let formulaPatients: Patient[] = [];
  let formulaBuffers: Buffer[] = [];
  const formulaEntries: ReplayEntry[] = [];

  // Formula No-Buffer: capacity routing only, zero-duration buffers
  let fnbPatients: Patient[] = [];
  const fnbEntries: ReplayEntry[] = [];

  // Round-Robin: patients + buffers
  let rrPatients: Patient[] = [];
  let rrBuffers: Buffer[] = [];
  const rrEntries: ReplayEntry[] = [];
  let rrNext = 0;

  // Actual-mode bonus tracking
  let agreementCount = 0;
  let pickedBestCount = 0;

  for (let i = 0; i < arrivals.length; i++) {
    const arr = arrivals[i];
    const now = arr.arrivalTime;
    const hourOfDay = arr.hour;

    // Get current providers for this hour
    const { providers: scheduledProviders } = getProvidersForShift(day, hourOfDay);
    const simProviders = toProviders(scheduledProviders);

    // ── ACTUAL MODE ──
    {
      const teamId = arr.actualTeam;
      const score = scoreTeam(teamId, simProviders, actualPatients, [], now, scoringOv);
      const ratio = score.capacityRatio === Infinity ? 100 : score.capacityRatio;

      actualPatients = [...actualPatients, {
        id: `H-${String(i + 1).padStart(3, '0')}`,
        acuity: arr.acuity,
        assignedTeamId: teamId,
        assignedAt: now,
      }];

      actualEntries.push({ arrivalIndex: i, arrivalTime: now, acuity: arr.acuity, teamId, ratioAtAssignment: ratio });

      // Check if actual picked the highest-capacity team
      const allScores = eligibleTeams.map(t => ({
        teamId: t,
        ratio: scoreTeam(t, simProviders, actualPatients, [], now, scoringOv).capacityRatio,
      }));
      const bestRatio = Math.max(...allScores.map(s => s.ratio));
      if (score.capacityRatio === bestRatio) pickedBestCount++;
    }

    // ── FORMULA MODE ──
    {
      formulaBuffers = formulaBuffers.filter(b => b.expiresAt > now);
      const rec = getRecommendation(simProviders, formulaPatients, formulaBuffers, now, closedTeams, scoringOv, FLAG_POST_ASSIGN ? arr.acuity : undefined);
      const teamId = rec.first ?? eligibleTeams[0];
      const score = scoreTeam(teamId, simProviders, formulaPatients, formulaBuffers, now, scoringOv);
      const ratio = score.capacityRatio === Infinity ? 100 : score.capacityRatio;

      const patient: Patient = {
        id: `F-${String(i + 1).padStart(3, '0')}`,
        acuity: arr.acuity,
        assignedTeamId: teamId,
        assignedAt: now,
      };

      // Buffer merge logic (copied from real-schedule-benchmark.ts)
      const newBuffer = createBuffer(teamId, arr.acuity, now, scoringOv);
      const existingTeamBuffers = formulaBuffers.filter(b => b.teamId === teamId && b.expiresAt > now && !b.deceasedPatientId);
      const otherBuffers = formulaBuffers.filter(b => !(b.teamId === teamId && b.expiresAt > now && !b.deceasedPatientId));
      if (existingTeamBuffers.length > 0) {
        const allBufs = [...existingTeamBuffers, newBuffer];
        const currentExpiry = Math.max(...existingTeamBuffers.map(b => b.expiresAt));
        const newDuration = newBuffer.expiresAt - newBuffer.createdAt;
        const latestExpiry = Math.max(currentExpiry, now) + newDuration;
        const tierRank = { tier_one: 0, tier_two: 1, tier_three: 2 } as const;
        const bestTier = allBufs.reduce((best, b) => tierRank[b.tier] < tierRank[best.tier] ? b : best).tier;
        const totalCount = allBufs.reduce((sum, b) => sum + (b.mergedCount ?? 1), 0);
        formulaBuffers = [...otherBuffers, {
          id: newBuffer.id, teamId, tier: bestTier,
          createdAt: Math.min(...allBufs.map(b => b.createdAt)),
          expiresAt: latestExpiry, mergedCount: totalCount,
        }];
      } else {
        formulaBuffers = [...formulaBuffers, newBuffer];
      }

      formulaPatients = [...formulaPatients, patient];
      formulaEntries.push({ arrivalIndex: i, arrivalTime: now, acuity: arr.acuity, teamId, ratioAtAssignment: ratio });

      // Agreement check
      if (teamId === arr.actualTeam) agreementCount++;
    }

    // ── FORMULA NO-BUFFER MODE ──
    {
      // No buffers: just capacity-aware routing with no cooldown protection
      const rec = getRecommendation(simProviders, fnbPatients, [], now, closedTeams, scoringOvNoBuffer, FLAG_POST_ASSIGN ? arr.acuity : undefined);
      const teamId = rec.first ?? eligibleTeams[0];
      const score = scoreTeam(teamId, simProviders, fnbPatients, [], now, scoringOvNoBuffer);
      const ratio = score.capacityRatio === Infinity ? 100 : score.capacityRatio;

      const patient: Patient = {
        id: `NB-${String(i + 1).padStart(3, '0')}`,
        acuity: arr.acuity,
        assignedTeamId: teamId,
        assignedAt: now,
      };

      fnbPatients = [...fnbPatients, patient];
      fnbEntries.push({ arrivalIndex: i, arrivalTime: now, acuity: arr.acuity, teamId, ratioAtAssignment: ratio });
    }

    // ── ROUND-ROBIN MODE ──
    {
      rrBuffers = rrBuffers.filter(b => b.expiresAt > now);
      const teamId = eligibleTeams[rrNext % eligibleTeams.length];
      rrNext++;
      const score = scoreTeam(teamId, simProviders, rrPatients, rrBuffers, now, scoringOv);
      const ratio = score.capacityRatio === Infinity ? 100 : score.capacityRatio;

      const patient: Patient = {
        id: `R-${String(i + 1).padStart(3, '0')}`,
        acuity: arr.acuity,
        assignedTeamId: teamId,
        assignedAt: now,
      };

      // Buffer merge
      const newBuffer = createBuffer(teamId, arr.acuity, now, scoringOv);
      const existingTeamBuffers = rrBuffers.filter(b => b.teamId === teamId && b.expiresAt > now && !b.deceasedPatientId);
      const otherBuffers = rrBuffers.filter(b => !(b.teamId === teamId && b.expiresAt > now && !b.deceasedPatientId));
      if (existingTeamBuffers.length > 0) {
        const allBufs = [...existingTeamBuffers, newBuffer];
        const currentExpiry = Math.max(...existingTeamBuffers.map(b => b.expiresAt));
        const newDuration = newBuffer.expiresAt - newBuffer.createdAt;
        const latestExpiry = Math.max(currentExpiry, now) + newDuration;
        const tierRank = { tier_one: 0, tier_two: 1, tier_three: 2 } as const;
        const bestTier = allBufs.reduce((best, b) => tierRank[b.tier] < tierRank[best.tier] ? b : best).tier;
        const totalCount = allBufs.reduce((sum, b) => sum + (b.mergedCount ?? 1), 0);
        rrBuffers = [...otherBuffers, {
          id: newBuffer.id, teamId, tier: bestTier,
          createdAt: Math.min(...allBufs.map(b => b.createdAt)),
          expiresAt: latestExpiry, mergedCount: totalCount,
        }];
      } else {
        rrBuffers = [...rrBuffers, newBuffer];
      }

      rrPatients = [...rrPatients, patient];
      rrEntries.push({ arrivalIndex: i, arrivalTime: now, acuity: arr.acuity, teamId, ratioAtAssignment: ratio });
    }
  }

  // Compute metrics for each mode
  function buildMetrics(entries: ReplayEntry[], patients: Patient[], buffers: Buffer[]): CohortMetrics {
    const stats = statsFromEntries(entries);
    const lastNow = arrivals[arrivals.length - 1].arrivalTime;
    const { providers: lastProviders } = getProvidersForShift(day, arrivals[arrivals.length - 1].hour);
    const teamCaps = getTeamCapacitiesFromProviders(toProviders(lastProviders), lastNow, permanentlyClosedTeams);
    const fairnessBreakdown = computeFairnessDetailed(stats, permanentlyClosedTeams, teamCaps);
    const fairness = fairnessBreakdown.composite;

    const counts: Record<number, number> = {};
    for (const t of eligibleTeams) counts[t] = 0;
    for (const e of entries) counts[e.teamId] = (counts[e.teamId] ?? 0) + 1;

    // Gini — raw counts
    const countVals = eligibleTeams.map(t => counts[t] ?? 0);
    const giniCountVal = gini(countVals);

    // Gini — acuity-weighted
    const acuityLoads: Record<number, number> = {};
    for (const t of eligibleTeams) acuityLoads[t] = 0;
    for (const e of entries) {
      acuityLoads[e.teamId] = (acuityLoads[e.teamId] ?? 0) + effectiveAcuityWeights[e.acuity];
    }
    const acuityLoadValues = eligibleTeams.map(t => acuityLoads[t] ?? 0);
    const giniAcuityVal = gini(acuityLoadValues);
    const acuitySpreadVal = acuityLoadValues.length > 0 ? Math.max(...acuityLoadValues) - Math.min(...acuityLoadValues) : 0;

    // ── Load-minutes: integrate acuity-weighted load and capacity across the shift window ──
    // Window = [firstArrival, shiftEnd] where shiftEnd is midnight for three-team cohort (9A shift start
    // + 15h) or 9am for two-team cohort (0A shift start + 9h). Anchored on firstArrival's wall-clock date,
    // the same reading used for `hour` when parsing the census (scripts/lib/census-time.ts). Per-minute step.
    const firstArrivalMs = arrivals[0].arrivalTime;
    const isThreeTeam = eligibleTeams.length === 3;
    const shiftStartMs = atWallHour(firstArrivalMs, isThreeTeam ? 9 : 0);
    const shiftEndMs = shiftStartMs + (isThreeTeam ? 15 : 9) * 3_600_000;
    const windowStartMs = Math.min(firstArrivalMs, shiftStartMs);
    const windowEndMs = shiftEndMs;

    const loadMins: Record<number, number> = {};
    const capMins: Record<number, number> = {};
    for (const t of eligibleTeams) { loadMins[t] = 0; capMins[t] = 0; }

    const STEP_MS = 60_000;
    for (let now = windowStartMs; now < windowEndMs; now += STEP_MS) {
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

    const normalizedLoadMins: Record<number, number> = {};
    for (const t of eligibleTeams) {
      normalizedLoadMins[t] = capMins[t] > 0 ? loadMins[t] / capMins[t] : 0;
    }
    const loadMinVals = eligibleTeams.map(t => loadMins[t]);
    const normVals = eligibleTeams.map(t => normalizedLoadMins[t]);
    const loadMinutesSDVal = stddev(loadMinVals);
    const normalizedLoadMinutesSDVal = stddev(normVals);

    return {
      fairness,
      fairnessBreakdown,
      teamCounts: counts,
      avgRatio: stats.avgRatio,
      minRatio: stats.minRatio === Infinity ? 0 : stats.minRatio,
      overwhelms: stats.redZoneEvents,
      backToBackHA: countBackToBackHA(entries),
      slams: countSlams(entries),
      teamSpread: teamSpread(counts, eligibleTeams),
      acuitySpread: acuitySpreadVal,
      giniCount: giniCountVal,
      giniAcuity: giniAcuityVal,
      entries,
      loadMinutesPerTeam: loadMins,
      capacityMinutesPerTeam: capMins,
      normalizedLoadMinutesPerTeam: normalizedLoadMins,
      loadMinutesSD: loadMinutesSDVal,
      normalizedLoadMinutesSD: normalizedLoadMinutesSDVal,
      windowStartMs,
      windowEndMs,
    };
  }

  return {
    actual: buildMetrics(actualEntries, actualPatients, []),
    formula: buildMetrics(formulaEntries, formulaPatients, formulaBuffers),
    formulaNoBuffer: buildMetrics(fnbEntries, fnbPatients, []),
    roundRobin: buildMetrics(rrEntries, rrPatients, rrBuffers),
    formulaAgreement: arrivals.length > 0 ? (agreementCount / arrivals.length) * 100 : 0,
    actualPickedBest: arrivals.length > 0 ? (pickedBestCount / arrivals.length) * 100 : 0,
  };
}

function getTeamCapacitiesFromProviders(
  providers: Provider[],
  now: number,
  permanentlyClosedTeams: number[],
): Record<number, number> {
  const caps: Record<number, number> = {};
  for (const teamId of [1, 2, 3, 4] as TeamId[]) {
    if (permanentlyClosedTeams.includes(teamId)) {
      caps[teamId] = 0;
      continue;
    }
    const teamProviders = providers.filter(p => p.teamId === teamId);
    caps[teamId] = getEffectiveCapacity(teamProviders, now, scoringOv);
  }
  return caps;
}

// ── Statistics ─────────────────────────────────────────────────────

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

function cohenD(a: number[], b: number[]): number {
  if (a.length < 2) return 0;
  const diffs = a.map((v, i) => v - b[i]);
  const d = mean(diffs);
  const s = stddev(diffs) || 1e-10;
  return d / s;
}

function pearsonR(x: number[], y: number[]): { r: number; p: number; n: number } {
  const n = x.length;
  if (n < 3) return { r: 0, p: 1, n };
  const mx = mean(x), my = mean(y);
  let sumXY = 0, sumX2 = 0, sumY2 = 0;
  for (let i = 0; i < n; i++) {
    const dx = x[i] - mx, dy = y[i] - my;
    sumXY += dx * dy;
    sumX2 += dx * dx;
    sumY2 += dy * dy;
  }
  if (sumX2 === 0 || sumY2 === 0) return { r: 0, p: 1, n };
  const r = sumXY / Math.sqrt(sumX2 * sumY2);
  // t-test for correlation significance
  const t = r * Math.sqrt((n - 2) / (1 - r * r));
  const p = 2 * tCDF(-Math.abs(t), n - 2);
  return { r, p: Math.max(0, Math.min(1, p)), n };
}

// ── Formatting ─────────────────────────────────────────────────────

function pad(s: string, n: number): string {
  return s.length >= n ? s : s + ' '.repeat(n - s.length);
}
function rpad(s: string, n: number): string {
  return s.length >= n ? s : ' '.repeat(n - s.length) + s;
}
function fmt(v: number, dec = 1): string {
  return v.toFixed(dec);
}
function fmtPValue(p: number): string {
  if (p < 0.001) return '<0.001';
  if (p < 0.01) return p.toFixed(3);
  return p.toFixed(2);
}
function fmtMeanStd(vals: number[], dec = 1): string {
  return `${fmt(mean(vals), dec)} ± ${fmt(stddev(vals), dec)}`;
}

// ── Outcome correlation analysis ──────────────────────────────────

function runOutcomeCorrelation(arrivals: HistoricalArrival[]): void {
  console.log(`\n${'═'.repeat(70)}`);
  console.log('  OUTCOME CORRELATION (Actual assignments, all hours)');
  console.log('═'.repeat(70));

  // Group by date
  const byDate = new Map<string, HistoricalArrival[]>();
  for (const a of arrivals) {
    const arr = byDate.get(a.date) ?? [];
    arr.push(a);
    byDate.set(a.date, arr);
  }

  const imbalances: number[] = [];
  const mostLoadedDispo: number[] = [];
  const leastLoadedDispo: number[] = [];
  const admitDeltas: number[] = [];

  for (const [date, dayArrivals] of byDate) {
    // Group by team
    const teams = new Map<number, HistoricalArrival[]>();
    for (const a of dayArrivals) {
      const arr = teams.get(a.actualTeam) ?? [];
      arr.push(a);
      teams.set(a.actualTeam, arr);
    }

    // Need at least 2 teams to compute imbalance
    if (teams.size < 2) continue;

    // Acuity-weighted load per team
    const loads: number[] = [];
    const teamIds: number[] = [];
    for (const [tid, pts] of teams) {
      const load = pts.reduce((sum, p) => sum + effectiveAcuityWeights[p.acuity], 0);
      loads.push(load);
      teamIds.push(tid);
    }

    // CoV of loads
    const loadMean = mean(loads);
    if (loadMean === 0) continue;
    const cov = stddev(loads) / loadMean;
    imbalances.push(cov);

    // Find most-loaded and least-loaded teams
    let maxLoad = -Infinity, minLoad = Infinity;
    let maxTeam = 0, minTeam = 0;
    for (let i = 0; i < loads.length; i++) {
      if (loads[i] > maxLoad) { maxLoad = loads[i]; maxTeam = teamIds[i]; }
      if (loads[i] < minLoad) { minLoad = loads[i]; minTeam = teamIds[i]; }
    }

    // Door-to-dispo for most-loaded team
    const mostPts = teams.get(maxTeam)!.filter(p => p.doorToDispoMin !== null);
    const leastPts = teams.get(minTeam)!.filter(p => p.doorToDispoMin !== null);
    if (mostPts.length > 0 && leastPts.length > 0) {
      mostLoadedDispo.push(mean(mostPts.map(p => p.doorToDispoMin!)));
      leastLoadedDispo.push(mean(leastPts.map(p => p.doorToDispoMin!)));
    }

    // Admission rate delta
    const mostAdmitRate = teams.get(maxTeam)!.filter(p => p.isAdmitted).length / teams.get(maxTeam)!.length;
    const leastAdmitRate = teams.get(minTeam)!.filter(p => p.isAdmitted).length / teams.get(minTeam)!.length;
    admitDeltas.push(mostAdmitRate - leastAdmitRate);
  }

  // Correlations
  if (imbalances.length >= 3 && mostLoadedDispo.length >= 3) {
    // Trim to matching length (some dates may not have dispo data)
    const minLen = Math.min(imbalances.length, mostLoadedDispo.length);
    const imb = imbalances.slice(0, minLen);
    const dispo = mostLoadedDispo.slice(0, minLen);

    const corrDispo = pearsonR(imb, dispo);
    console.log(`\n  Load imbalance (CoV) vs door-to-dispo of most-loaded team:`);
    console.log(`    r = ${fmt(corrDispo.r, 3)}, p = ${fmtPValue(corrDispo.p)}, n = ${corrDispo.n} days`);
    if (corrDispo.p < 0.05) {
      console.log(`    → Significant: higher imbalance correlates with ${corrDispo.r > 0 ? 'longer' : 'shorter'} door-to-dispo times`);
    } else {
      console.log(`    → Not significant at p < 0.05`);
    }
  }

  if (imbalances.length >= 3 && admitDeltas.length >= 3) {
    const minLen = Math.min(imbalances.length, admitDeltas.length);
    const corrAdmit = pearsonR(imbalances.slice(0, minLen), admitDeltas.slice(0, minLen));
    console.log(`\n  Load imbalance (CoV) vs admission rate delta (most-loaded − least-loaded):`);
    console.log(`    r = ${fmt(corrAdmit.r, 3)}, p = ${fmtPValue(corrAdmit.p)}, n = ${corrAdmit.n} days`);
    if (corrAdmit.p < 0.05) {
      console.log(`    → Significant: higher imbalance associated with ${corrAdmit.r > 0 ? 'greater' : 'smaller'} admission rate disparity`);
    } else {
      console.log(`    → Not significant at p < 0.05`);
    }
  }

  // Summary stats
  console.log(`\n  Reference statistics:`);
  console.log(`    Days analyzed: ${imbalances.length}`);
  console.log(`    Mean imbalance (CoV): ${fmt(mean(imbalances), 3)}`);
  if (mostLoadedDispo.length > 0) {
    console.log(`    Mean door-to-dispo (most-loaded team): ${fmt(mean(mostLoadedDispo), 0)} min`);
    console.log(`    Mean door-to-dispo (least-loaded team): ${fmt(mean(leastLoadedDispo), 0)} min`);
  }
  console.log();
}

// ═══════════════════════════════════════════════════════════════════
//  MAIN
// ═══════════════════════════════════════════════════════════════════

console.log('\nHistorical Replay Benchmark');
console.log('═'.repeat(70));
if (WEIGHT_OVERRIDE) {
  console.log(`  *** USING CUSTOM WEIGHTS: ${WEIGHT_LABEL} (tier_one:tier_two:tier_three) ***`);
  if (DECAY_LABEL) {
    console.log(`  Decay override: ${DECAY_LABEL}`);
  } else {
    console.log(`  Decay schedule adjusted to match weight ratios`);
  }
}

// Step 1: Load census data
const { all: arrivals, excludedCount, totalCount } = loadCensusData();
console.log(`  After exclusion: ${arrivals.length} A-side encounters (${excludedCount} trauma/Team 4 excluded from ${totalCount} total)`);

// ESI distribution
const esiDist = { 1: 0, 2: 0, other: 0 };
for (const a of arrivals) {
  if (a.esi === 1) esiDist[1]++;
  else if (a.esi === 2) esiDist[2]++;
  else esiDist.other++;
}
console.log(`  ESI distribution: ESI 1 = ${esiDist[1]} (${((esiDist[1]/arrivals.length)*100).toFixed(1)}%), ESI 2 = ${esiDist[2]} (${((esiDist[2]/arrivals.length)*100).toFixed(1)}%), ESI 3+ = ${esiDist.other} (${((esiDist.other/arrivals.length)*100).toFixed(1)}%)`);

// Step 2: Load schedules
const { scheduleMap, fileCount, dayCount } = loadAllSchedules();

// Step 3: Group arrivals by date and cohort
const arrivalsByDate = new Map<string, HistoricalArrival[]>();
for (const a of arrivals) {
  const arr = arrivalsByDate.get(a.date) ?? [];
  arr.push(a);
  arrivalsByDate.set(a.date, arr);
}

// Unique dates
const allDates = [...arrivalsByDate.keys()].sort();
console.log(`  Date range: ${allDates[0]} to ${allDates[allDates.length - 1]}`);
console.log(`  Unique dates with arrivals: ${allDates.length}`);

// Check schedule coverage
let matchedDates = 0;
let unmatchedDates: string[] = [];
for (const date of allDates) {
  if (scheduleMap.has(date)) matchedDates++;
  else unmatchedDates.push(date);
}
console.log(`  Dates with schedule match: ${matchedDates}/${allDates.length}`);
if (unmatchedDates.length > 0 && unmatchedDates.length <= 10) {
  console.log(`  Unmatched dates: ${unmatchedDates.join(', ')}`);
}

// Step 4: Run replay
console.log(`\n  Running replay...`);

const threeTeamDays: DayMetrics[] = [];
const twoTeamDays: DayMetrics[] = [];

let processedDates = 0;
for (const date of allDates) {
  const day = scheduleMap.get(date);
  if (!day) continue;

  const dayArrivals = arrivalsByDate.get(date)!;
  processedDates++;

  // Split into cohorts by hour
  const threeTeamArrivals = dayArrivals.filter(a => a.hour >= 9 && a.hour <= 23);
  const twoTeamArrivals = dayArrivals.filter(a => a.hour >= 0 && a.hour < 9);

  const dowNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const dayOfWeek = dowNames[dateStrDayOfWeek(date)];

  // Three-team cohort (9A–12A midnight): Teams 1, 2, 3
  if (threeTeamArrivals.length > 0) {
    const eligibleTeams: TeamId[] = [1, 2, 3];
    const closedTeams: Record<number, number> = { 4: 0 };
    const permanentlyClosedTeams = [4];
    const baseTime = threeTeamArrivals[0].arrivalTime;

    const result = replayCohort(threeTeamArrivals, day, eligibleTeams, closedTeams, permanentlyClosedTeams, baseTime);

    threeTeamDays.push({
      date,
      dayOfWeek,
      cohort: 'three_team',
      arrivalCount: threeTeamArrivals.length,
      ...result,
    });
  }

  // Two-team cohort (12A–9A): Teams 1, 2 only
  if (twoTeamArrivals.length > 0) {
    const eligibleTeams: TeamId[] = [1, 2];
    const closedTeams: Record<number, number> = { 3: 0, 4: 0 };
    const permanentlyClosedTeams = [3, 4];
    const baseTime = twoTeamArrivals[0].arrivalTime;

    const result = replayCohort(twoTeamArrivals, day, eligibleTeams, closedTeams, permanentlyClosedTeams, baseTime);

    twoTeamDays.push({
      date,
      dayOfWeek,
      cohort: 'two_team',
      arrivalCount: twoTeamArrivals.length,
      ...result,
    });
  }

  if (processedDates % 20 === 0) process.stdout.write(`  Processed ${processedDates} dates...\n`);
}

console.log(`  Processed ${processedDates} dates total\n`);

// ── Report ─────────────────────────────────────────────────────────

const totalThreeTeam = threeTeamDays.reduce((s, d) => s + d.arrivalCount, 0);
const totalTwoTeam = twoTeamDays.reduce((s, d) => s + d.arrivalCount, 0);

console.log('═'.repeat(70));
console.log('  HISTORICAL REPLAY — REAL ARRIVALS × REAL SCHEDULES');
console.log(`  Dec 2025 – Mar 2026 · ${processedDates} days · ${arrivals.length} A-side encounters`);
console.log(`  (${excludedCount} trauma/Team 4 encounters excluded from ${totalCount} total)`);
if (WEIGHT_OVERRIDE) {
  const decayDesc = DECAY_LABEL || 'adjusted';
  console.log(`  Acuity weights: ${WEIGHT_LABEL} · Decay: ${decayDesc}${FLAG_POST_ASSIGN ? ' · Post-assign scoring' : ''}`);
}
console.log('═'.repeat(70));

// ── Helper to print a cohort report ──

function printCohortReport(
  label: string,
  days: DayMetrics[],
  totalEncounters: number,
  eligibleTeams: TeamId[],
) {
  if (days.length === 0) {
    console.log(`\n  No data for ${label}\n`);
    return;
  }

  console.log(`\n  ═══ ${label} · ${totalEncounters} encounters · ${days.length} days ═══\n`);

  type MetricKey = 'fairness' | 'giniCount' | 'giniAcuity' | 'avgRatio' | 'minRatio' | 'overwhelms' | 'teamSpread' | 'acuitySpread' | 'backToBackHA' | 'slams';
  const metricDefs: { label: string; key: MetricKey; dec: number; higherBetter: boolean }[] = [
    { label: 'Fairness (0–100)', key: 'fairness', dec: 1, higherBetter: true },
    { label: 'Gini (patient count)', key: 'giniCount', dec: 3, higherBetter: false },
    { label: 'Gini (acuity-weighted)', key: 'giniAcuity', dec: 3, higherBetter: false },
    { label: 'Avg Ratio', key: 'avgRatio', dec: 1, higherBetter: true },
    { label: 'Min Ratio', key: 'minRatio', dec: 1, higherBetter: true },
    { label: 'Red-zone events/day', key: 'overwhelms', dec: 1, higherBetter: false },
    { label: 'Daily Team Spread', key: 'teamSpread', dec: 1, higherBetter: false },
    { label: 'Acuity-Weighted Spread', key: 'acuitySpread', dec: 1, higherBetter: false },
    { label: 'Back-to-back HA', key: 'backToBackHA', dec: 1, higherBetter: false },
    { label: 'Slams (2+ pts/team/hr)', key: 'slams', dec: 1, higherBetter: false },
  ];

  // Table header
  console.log(
    '  ' + pad('Metric', 24) +
    rpad('Actual', 14) +
    rpad('Formula', 14) +
    rpad('Round-Robin', 14)
  );
  console.log('  ' + '─'.repeat(66));

  for (const m of metricDefs) {
    const aVals = days.map(d => d.actual[m.key]);
    const fVals = days.map(d => d.formula[m.key]);
    const rrVals = days.map(d => d.roundRobin[m.key]);
    console.log(
      '  ' + pad(m.label, 24) +
      rpad(fmtMeanStd(aVals, m.dec), 14) +
      rpad(fmtMeanStd(fVals, m.dec), 14) +
      rpad(fmtMeanStd(rrVals, m.dec), 14)
    );
  }

  // Fairness sub-scores
  console.log();
  console.log(
    '  ' + pad('Fairness Sub-Score', 28) +
    rpad('Actual', 14) +
    rpad('Formula', 14) +
    rpad('Round-Robin', 14)
  );
  console.log('  ' + '─'.repeat(70));

  type SubKey = 'capacityBalance' | 'acuityBalance' | 'overwhelmAvoidance' | 'minRatioScore' | 'stressEquity';
  const subDefs: { label: string; key: SubKey }[] = [
    { label: 'Capacity Balance (25%)', key: 'capacityBalance' },
    { label: 'Acuity Balance (15%)', key: 'acuityBalance' },
    { label: 'Red-zone avoidance (30%)', key: 'overwhelmAvoidance' },
    { label: 'Min Ratio Score (15%)', key: 'minRatioScore' },
    { label: 'Stress Equity (15%)', key: 'stressEquity' },
  ];

  for (const s of subDefs) {
    const aVals = days.map(d => d.actual.fairnessBreakdown[s.key]);
    const fVals = days.map(d => d.formula.fairnessBreakdown[s.key]);
    const rrVals = days.map(d => d.roundRobin.fairnessBreakdown[s.key]);
    console.log(
      '  ' + pad(s.label, 28) +
      rpad(fmtMeanStd(aVals, 3), 14) +
      rpad(fmtMeanStd(fVals, 3), 14) +
      rpad(fmtMeanStd(rrVals, 3), 14)
    );
  }

  // Head-to-head
  console.log();
  console.log(
    '  ' + pad('Head-to-Head', 24) +
    rpad('Win%', 8) +
    rpad('Δ Fair', 10) +
    rpad("Cohen's d", 10) +
    rpad('p-value', 10)
  );
  console.log('  ' + '─'.repeat(62));

  const comparisons: [string, 'formula' | 'actual' | 'roundRobin', 'formula' | 'actual' | 'roundRobin'][] = [
    ['Formula vs Actual', 'formula', 'actual'],
    ['Formula vs Round-Robin', 'formula', 'roundRobin'],
    ['Actual vs Round-Robin', 'actual', 'roundRobin'],
  ];

  for (const [label, modeA, modeB] of comparisons) {
    const aVals = days.map(d => d[modeA].fairness);
    const bVals = days.map(d => d[modeB].fairness);
    let wins = 0;
    for (let i = 0; i < days.length; i++) {
      if (aVals[i] - bVals[i] > 0.01) wins++;
    }
    const delta = mean(aVals) - mean(bVals);
    const d = cohenD(aVals, bVals);
    const p = pairedTTest(aVals, bVals);
    console.log(
      '  ' + pad(label, 24) +
      rpad(`${((wins / days.length) * 100).toFixed(1)}%`, 8) +
      rpad((delta >= 0 ? '+' : '') + fmt(delta, 1), 10) +
      rpad(fmt(Math.abs(d), 2), 10) +
      rpad(fmtPValue(p), 10)
    );
  }

  // Formula agreement & actual picked best
  const avgAgreement = mean(days.map(d => d.formulaAgreement));
  const avgPickedBest = mean(days.map(d => d.actualPickedBest));
  console.log(`\n  Formula Agreement with Actual: ${fmt(avgAgreement, 1)}%`);
  console.log(`  Actual picked highest-capacity team: ${fmt(avgPickedBest, 1)}%`);
}

// Print primary cohort
printCohortReport(
  'PRIMARY: THREE-TEAM HOURS (9A–12A)',
  threeTeamDays,
  totalThreeTeam,
  [1, 2, 3] as TeamId[],
);

// Print secondary cohort
printCohortReport(
  'SECONDARY: TWO-TEAM HOURS (12A–9A)',
  twoTeamDays,
  totalTwoTeam,
  [1, 2] as TeamId[],
);

// Usability implication
if (twoTeamDays.length > 0) {
  const fFairness2 = mean(twoTeamDays.map(d => d.formula.fairness));
  const rrFairness2 = mean(twoTeamDays.map(d => d.roundRobin.fairness));
  console.log(`\n  Usability implication: Formula ${fFairness2 >= rrFairness2 ? '≥' : '<'} Round-Robin in two-team hours → ${fFairness2 >= rrFairness2 ? '"leave tool on all the time"' : 'consider toggling by time of day'}`);
}

// ── Day-of-week breakdown (three-team cohort) ──

console.log(`\n  ═══ DAY-OF-WEEK BREAKDOWN (three-team cohort) ═══\n`);
const dowOrder = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

console.log(
  '  ' + pad('Day', 12) +
  rpad('Days', 6) +
  rpad('F Win%', 8) +
  rpad('Δ Fair', 10) +
  rpad("d", 8) +
  rpad('p', 8)
);
console.log('  ' + '─'.repeat(52));

for (const dow of dowOrder) {
  const dayRuns = threeTeamDays.filter(d => d.dayOfWeek === dow);
  if (dayRuns.length === 0) continue;
  const fVals = dayRuns.map(d => d.formula.fairness);
  const aVals = dayRuns.map(d => d.actual.fairness);
  let wins = 0;
  for (let i = 0; i < dayRuns.length; i++) {
    if (fVals[i] - aVals[i] > 0.01) wins++;
  }
  const delta = mean(fVals) - mean(aVals);
  const d = dayRuns.length >= 2 ? cohenD(fVals, aVals) : 0;
  const p = dayRuns.length >= 2 ? pairedTTest(fVals, aVals) : 1;
  console.log(
    '  ' + pad(dow, 12) +
    rpad(String(dayRuns.length), 6) +
    rpad(`${((wins / dayRuns.length) * 100).toFixed(0)}%`, 8) +
    rpad((delta >= 0 ? '+' : '') + fmt(delta, 1), 10) +
    rpad(fmt(Math.abs(d), 2), 8) +
    rpad(fmtPValue(p), 8)
  );
}

// ── Verbose per-date output ──

if (FLAG_VERBOSE) {
  console.log(`\n  ═══ PER-DATE DETAIL (three-team cohort) ═══\n`);
  console.log(
    '  ' + pad('Date', 12) + pad('DoW', 5) +
    rpad('N', 4) +
    rpad('A Fair', 8) + rpad('F Fair', 8) + rpad('RR Fair', 8) +
    rpad('Agree%', 8)
  );
  console.log('  ' + '─'.repeat(53));
  for (const d of threeTeamDays) {
    console.log(
      '  ' + pad(d.date, 12) + pad(d.dayOfWeek.slice(0, 3), 5) +
      rpad(String(d.arrivalCount), 4) +
      rpad(fmt(d.actual.fairness), 8) +
      rpad(fmt(d.formula.fairness), 8) +
      rpad(fmt(d.roundRobin.fairness), 8) +
      rpad(fmt(d.formulaAgreement), 8)
    );
  }
}

// ── Outcome correlation ──

if (FLAG_OUTCOMES) {
  runOutcomeCorrelation(arrivals);
}

// ── JSON export ──

if (FLAG_JSON) {
  const jsonOutput = {
    meta: {
      totalEncounters: totalCount,
      excludedTraumaTeam4: excludedCount,
      analyzedEncounters: arrivals.length,
      threeTeamEncounters: totalThreeTeam,
      twoTeamEncounters: totalTwoTeam,
      processedDates,
      scheduleFiles: fileCount,
      dateRange: { start: allDates[0], end: allDates[allDates.length - 1] },
    },
    threeTeamCohort: threeTeamDays.map(d => ({
      date: d.date,
      dayOfWeek: d.dayOfWeek,
      arrivalCount: d.arrivalCount,
      actual: { fairness: d.actual.fairness, fairnessBreakdown: d.actual.fairnessBreakdown, giniCount: d.actual.giniCount, giniAcuity: d.actual.giniAcuity, avgRatio: d.actual.avgRatio, minRatio: d.actual.minRatio, overwhelms: d.actual.overwhelms, backToBackHA: d.actual.backToBackHA, slams: d.actual.slams, teamSpread: d.actual.teamSpread, acuitySpread: d.actual.acuitySpread, teamCounts: d.actual.teamCounts, loadMinutesPerTeam: d.actual.loadMinutesPerTeam, capacityMinutesPerTeam: d.actual.capacityMinutesPerTeam, normalizedLoadMinutesPerTeam: d.actual.normalizedLoadMinutesPerTeam, loadMinutesSD: d.actual.loadMinutesSD, normalizedLoadMinutesSD: d.actual.normalizedLoadMinutesSD, windowStartMs: d.actual.windowStartMs, windowEndMs: d.actual.windowEndMs },
      formula: { fairness: d.formula.fairness, fairnessBreakdown: d.formula.fairnessBreakdown, giniCount: d.formula.giniCount, giniAcuity: d.formula.giniAcuity, avgRatio: d.formula.avgRatio, minRatio: d.formula.minRatio, overwhelms: d.formula.overwhelms, backToBackHA: d.formula.backToBackHA, slams: d.formula.slams, teamSpread: d.formula.teamSpread, acuitySpread: d.formula.acuitySpread, teamCounts: d.formula.teamCounts, loadMinutesPerTeam: d.formula.loadMinutesPerTeam, capacityMinutesPerTeam: d.formula.capacityMinutesPerTeam, normalizedLoadMinutesPerTeam: d.formula.normalizedLoadMinutesPerTeam, loadMinutesSD: d.formula.loadMinutesSD, normalizedLoadMinutesSD: d.formula.normalizedLoadMinutesSD, windowStartMs: d.formula.windowStartMs, windowEndMs: d.formula.windowEndMs },
      roundRobin: { fairness: d.roundRobin.fairness, fairnessBreakdown: d.roundRobin.fairnessBreakdown, giniCount: d.roundRobin.giniCount, giniAcuity: d.roundRobin.giniAcuity, avgRatio: d.roundRobin.avgRatio, minRatio: d.roundRobin.minRatio, overwhelms: d.roundRobin.overwhelms, backToBackHA: d.roundRobin.backToBackHA, slams: d.roundRobin.slams, teamSpread: d.roundRobin.teamSpread, acuitySpread: d.roundRobin.acuitySpread, teamCounts: d.roundRobin.teamCounts, loadMinutesPerTeam: d.roundRobin.loadMinutesPerTeam, capacityMinutesPerTeam: d.roundRobin.capacityMinutesPerTeam, normalizedLoadMinutesPerTeam: d.roundRobin.normalizedLoadMinutesPerTeam, loadMinutesSD: d.roundRobin.loadMinutesSD, normalizedLoadMinutesSD: d.roundRobin.normalizedLoadMinutesSD, windowStartMs: d.roundRobin.windowStartMs, windowEndMs: d.roundRobin.windowEndMs },
      formulaNoBuffer: { fairness: d.formulaNoBuffer.fairness, fairnessBreakdown: d.formulaNoBuffer.fairnessBreakdown, giniCount: d.formulaNoBuffer.giniCount, giniAcuity: d.formulaNoBuffer.giniAcuity, avgRatio: d.formulaNoBuffer.avgRatio, minRatio: d.formulaNoBuffer.minRatio, overwhelms: d.formulaNoBuffer.overwhelms, backToBackHA: d.formulaNoBuffer.backToBackHA, slams: d.formulaNoBuffer.slams, teamSpread: d.formulaNoBuffer.teamSpread, acuitySpread: d.formulaNoBuffer.acuitySpread, teamCounts: d.formulaNoBuffer.teamCounts, loadMinutesPerTeam: d.formulaNoBuffer.loadMinutesPerTeam, capacityMinutesPerTeam: d.formulaNoBuffer.capacityMinutesPerTeam, normalizedLoadMinutesPerTeam: d.formulaNoBuffer.normalizedLoadMinutesPerTeam, loadMinutesSD: d.formulaNoBuffer.loadMinutesSD, normalizedLoadMinutesSD: d.formulaNoBuffer.normalizedLoadMinutesSD, windowStartMs: d.formulaNoBuffer.windowStartMs, windowEndMs: d.formulaNoBuffer.windowEndMs },
      formulaAgreement: d.formulaAgreement,
      actualPickedBest: d.actualPickedBest,
    })),
    twoTeamCohort: twoTeamDays.map(d => ({
      date: d.date,
      dayOfWeek: d.dayOfWeek,
      arrivalCount: d.arrivalCount,
      actual: { fairness: d.actual.fairness, fairnessBreakdown: d.actual.fairnessBreakdown, giniCount: d.actual.giniCount, giniAcuity: d.actual.giniAcuity, avgRatio: d.actual.avgRatio, minRatio: d.actual.minRatio, overwhelms: d.actual.overwhelms, teamCounts: d.actual.teamCounts },
      formula: { fairness: d.formula.fairness, fairnessBreakdown: d.formula.fairnessBreakdown, giniCount: d.formula.giniCount, giniAcuity: d.formula.giniAcuity, avgRatio: d.formula.avgRatio, minRatio: d.formula.minRatio, overwhelms: d.formula.overwhelms, teamCounts: d.formula.teamCounts },
      roundRobin: { fairness: d.roundRobin.fairness, fairnessBreakdown: d.roundRobin.fairnessBreakdown, giniCount: d.roundRobin.giniCount, giniAcuity: d.roundRobin.giniAcuity, avgRatio: d.roundRobin.avgRatio, minRatio: d.roundRobin.minRatio, overwhelms: d.roundRobin.overwhelms, teamCounts: d.roundRobin.teamCounts },
      formulaAgreement: d.formulaAgreement,
      actualPickedBest: d.actualPickedBest,
    })),
  };

  const jsonSuffix = (WEIGHT_OVERRIDE ? `-${WEIGHT_LABEL.replace(/:/g, '-')}` : '') + (DECAY_LABEL ? `-${DECAY_LABEL}` : '') + (FLAG_POST_ASSIGN ? '-post' : '');
  const jsonPath = join(PROJECT_ROOT, 'data', 'historical-replay-runs', `historical-replay-results${jsonSuffix}.json`);
  writeFileSync(jsonPath, JSON.stringify(jsonOutput, null, 2));
  console.log(`\n  JSON results written to: ${jsonPath}`);

  // Per-arrival ratio dump for visual-scale calibration.
  const ratiosOutput = {
    meta: {
      weightLabel: WEIGHT_LABEL,
      threeTeamDays: threeTeamDays.length,
      twoTeamDays: twoTeamDays.length,
    },
    threeTeamFormulaRatios: threeTeamDays.flatMap(d => d.formula.entries.map(e => e.ratioAtAssignment)),
    threeTeamActualRatios: threeTeamDays.flatMap(d => d.actual.entries.map(e => e.ratioAtAssignment)),
    twoTeamFormulaRatios: twoTeamDays.flatMap(d => d.formula.entries.map(e => e.ratioAtAssignment)),
    twoTeamActualRatios: twoTeamDays.flatMap(d => d.actual.entries.map(e => e.ratioAtAssignment)),
  };
  const ratiosPath = join(PROJECT_ROOT, 'data', 'historical-replay-runs', `historical-replay-ratios${jsonSuffix}.json`);
  writeFileSync(ratiosPath, JSON.stringify(ratiosOutput));
  console.log(`  Per-arrival ratio dump written to: ${ratiosPath}`);
}

// ── Interpretation ──

console.log(`\n${'═'.repeat(70)}`);
console.log('  INTERPRETATION');
console.log('═'.repeat(70));

if (threeTeamDays.length > 0) {
  const fFairness = mean(threeTeamDays.map(d => d.formula.fairness));
  const aFairness = mean(threeTeamDays.map(d => d.actual.fairness));
  const rrFairness = mean(threeTeamDays.map(d => d.roundRobin.fairness));
  const pFA = pairedTTest(threeTeamDays.map(d => d.formula.fairness), threeTeamDays.map(d => d.actual.fairness));
  const dFA = cohenD(threeTeamDays.map(d => d.formula.fairness), threeTeamDays.map(d => d.actual.fairness));

  let fWinsVsA = 0;
  for (const d of threeTeamDays) {
    if (d.formula.fairness - d.actual.fairness > 0.01) fWinsVsA++;
  }
  const fWinPctA = ((fWinsVsA / threeTeamDays.length) * 100).toFixed(0);

  const sigLabel = pFA < 0.001 ? 'highly significant' : pFA < 0.05 ? 'significant' : 'not significant';
  const effectLabel = Math.abs(dFA) >= 0.8 ? 'large' : Math.abs(dFA) >= 0.5 ? 'medium' : Math.abs(dFA) >= 0.2 ? 'small' : 'negligible';

  console.log(`\n  Three-team hours (primary):`);
  console.log(`  Formula fairness: ${fmt(fFairness)} | Actual: ${fmt(aFairness)} | Round-Robin: ${fmt(rrFairness)}`);
  console.log(`  Formula vs Actual: ${sigLabel} (p=${fmtPValue(pFA)}, d=${fmt(Math.abs(dFA), 2)}, ${effectLabel} effect)`);
  console.log(`  Formula wins ${fWinPctA}% of days against historical assignments.`);

  const fRedZone = mean(threeTeamDays.map(d => d.formula.overwhelms));
  const aRedZone = mean(threeTeamDays.map(d => d.actual.overwhelms));
  const redZoneDelta = aRedZone - fRedZone;
  if (redZoneDelta > 0) {
    console.log(`  Formula reduces red-zone events by ${fmt(redZoneDelta, 1)}/day on average.`);
  }

  const fB2B = mean(threeTeamDays.map(d => d.formula.backToBackHA));
  const aB2B = mean(threeTeamDays.map(d => d.actual.backToBackHA));
  const b2bDelta = aB2B - fB2B;
  if (b2bDelta > 0) {
    console.log(`  Formula reduces back-to-back high-acuity assignments by ${fmt(b2bDelta, 1)}/day.`);
  }

  const fSlams = mean(threeTeamDays.map(d => d.formula.slams));
  const aSlams = mean(threeTeamDays.map(d => d.actual.slams));
  const slamDelta = aSlams - fSlams;
  if (slamDelta > 0) {
    console.log(`  Formula reduces slams (2+ patients to same team within 1hr) by ${fmt(slamDelta, 1)}/day (${fmt(slamDelta * threeTeamDays.length, 0)} total).`);
  }

  console.log(`\n  "If we had been using this app during daytime shifts over the last 4 months`);
  console.log(`   for A-side patient assignment, fairness would have been ${fmt(fFairness - aFairness, 1)} points`);
  console.log(`   higher on average, with ${fmt(redZoneDelta * threeTeamDays.length, 0)} fewer total red-zone events,`);
  console.log(`   ${fmt(b2bDelta * threeTeamDays.length, 0)} fewer back-to-back high-acuity dumps,`);
  console.log(`   and ${fmt(slamDelta * threeTeamDays.length, 0)} fewer slams across Teams 1–3."`);

  // ── Buffer Ablation Decomposition ──
  console.log(`\n${'═'.repeat(70)}`);
  console.log('  BUFFER ABLATION — Real Census Data Decomposition');
  console.log('═'.repeat(70));

  const fnbFairness = mean(threeTeamDays.map(d => d.formulaNoBuffer.fairness));
  const fnbSlams = mean(threeTeamDays.map(d => d.formulaNoBuffer.slams));
  const fnbB2B = mean(threeTeamDays.map(d => d.formulaNoBuffer.backToBackHA));
  const fnbRedZone = mean(threeTeamDays.map(d => d.formulaNoBuffer.overwhelms));
  const fnbMinRatio = mean(threeTeamDays.map(d => d.formulaNoBuffer.minRatio));

  console.log(`\n  Mean metrics across ${threeTeamDays.length} three-team days:`);
  console.log(`  ${'─'.repeat(66)}`);
  console.log(`  ${''.padEnd(24)} ${'Actual'.padStart(10)} ${'Formula'.padStart(10)} ${'No-Buffer'.padStart(10)} ${'Round-Rob'.padStart(10)}`);
  console.log(`  ${'─'.repeat(66)}`);
  console.log(`  ${'Fairness Score'.padEnd(24)} ${fmt(aFairness, 1).padStart(10)} ${fmt(fFairness, 1).padStart(10)} ${fmt(fnbFairness, 1).padStart(10)} ${fmt(rrFairness, 1).padStart(10)}`);
  console.log(`  ${'Slams/day'.padEnd(24)} ${fmt(aSlams, 2).padStart(10)} ${fmt(fSlams, 2).padStart(10)} ${fmt(fnbSlams, 2).padStart(10)} ${fmt(mean(threeTeamDays.map(d => d.roundRobin.slams)), 2).padStart(10)}`);
  console.log(`  ${'Back-to-back HA/day'.padEnd(24)} ${fmt(aB2B, 2).padStart(10)} ${fmt(fB2B, 2).padStart(10)} ${fmt(fnbB2B, 2).padStart(10)} ${fmt(mean(threeTeamDays.map(d => d.roundRobin.backToBackHA)), 2).padStart(10)}`);
  console.log(`  ${'Red-zone events/day'.padEnd(24)} ${fmt(aRedZone, 2).padStart(10)} ${fmt(fRedZone, 2).padStart(10)} ${fmt(fnbRedZone, 2).padStart(10)} ${fmt(mean(threeTeamDays.map(d => d.roundRobin.overwhelms)), 2).padStart(10)}`);
  console.log(`  ${'Min Ratio'.padEnd(24)} ${fmt(mean(threeTeamDays.map(d => d.actual.minRatio)), 1).padStart(10)} ${fmt(mean(threeTeamDays.map(d => d.formula.minRatio)), 1).padStart(10)} ${fmt(fnbMinRatio, 1).padStart(10)} ${fmt(mean(threeTeamDays.map(d => d.roundRobin.minRatio)), 1).padStart(10)}`);

  // Decomposition: Formula vs Actual improvement, split by capacity vs buffers
  const totalFairnessGain = fFairness - aFairness;
  const capFairnessGain = fnbFairness - aFairness;
  const bufFairnessGain = fFairness - fnbFairness;

  const totalSlamReduction = aSlams - fSlams;
  const capSlamReduction = aSlams - fnbSlams;
  const bufSlamReduction = fnbSlams - fSlams;

  const totalB2BReduction = aB2B - fB2B;
  const capB2BReduction = aB2B - fnbB2B;
  const bufB2BReduction = fnbB2B - fB2B;

  console.log(`\n  Decomposition (Formula vs Actual):`);
  console.log(`  ${'─'.repeat(66)}`);
  console.log(`  ${'Metric'.padEnd(24)} ${'Total Δ'.padStart(10)} ${'Capacity'.padStart(10)} ${'Buffers'.padStart(10)} ${'% Cap'.padStart(8)} ${'% Buf'.padStart(8)}`);
  console.log(`  ${'─'.repeat(66)}`);

  const pctSafe = (part: number, total: number) => total !== 0 ? fmt(part / total * 100, 1) + '%' : 'N/A';

  console.log(`  ${'Fairness'.padEnd(24)} ${('+' + fmt(totalFairnessGain, 2)).padStart(10)} ${('+' + fmt(capFairnessGain, 2)).padStart(10)} ${((bufFairnessGain >= 0 ? '+' : '') + fmt(bufFairnessGain, 2)).padStart(10)} ${pctSafe(capFairnessGain, totalFairnessGain).padStart(8)} ${pctSafe(bufFairnessGain, totalFairnessGain).padStart(8)}`);
  console.log(`  ${'Slam reduction'.padEnd(24)} ${fmt(totalSlamReduction, 2).padStart(10)} ${fmt(capSlamReduction, 2).padStart(10)} ${fmt(bufSlamReduction, 2).padStart(10)} ${pctSafe(capSlamReduction, totalSlamReduction).padStart(8)} ${pctSafe(bufSlamReduction, totalSlamReduction).padStart(8)}`);
  console.log(`  ${'B2B HA reduction'.padEnd(24)} ${fmt(totalB2BReduction, 2).padStart(10)} ${fmt(capB2BReduction, 2).padStart(10)} ${fmt(bufB2BReduction, 2).padStart(10)} ${pctSafe(capB2BReduction, totalB2BReduction).padStart(8)} ${pctSafe(bufB2BReduction, totalB2BReduction).padStart(8)}`);

  // Statistical significance of each component
  const pCapFairness = pairedTTest(threeTeamDays.map(d => d.formulaNoBuffer.fairness), threeTeamDays.map(d => d.actual.fairness));
  const pBufFairness = pairedTTest(threeTeamDays.map(d => d.formula.fairness), threeTeamDays.map(d => d.formulaNoBuffer.fairness));
  const dCapFairness = cohenD(threeTeamDays.map(d => d.formulaNoBuffer.fairness), threeTeamDays.map(d => d.actual.fairness));
  const dBufFairness = cohenD(threeTeamDays.map(d => d.formula.fairness), threeTeamDays.map(d => d.formulaNoBuffer.fairness));

  console.log(`\n  Statistical tests (fairness):`);
  console.log(`    Capacity routing (No-Buffer vs Actual): p=${fmtPValue(pCapFairness)}, d=${fmt(Math.abs(dCapFairness), 2)}`);
  console.log(`    Buffer cooldowns (Formula vs No-Buffer): p=${fmtPValue(pBufFairness)}, d=${fmt(Math.abs(dBufFairness), 2)}`);

  // Slam-specific stats
  const pCapSlams = pairedTTest(threeTeamDays.map(d => d.actual.slams), threeTeamDays.map(d => d.formulaNoBuffer.slams));
  const pBufSlams = pairedTTest(threeTeamDays.map(d => d.formulaNoBuffer.slams), threeTeamDays.map(d => d.formula.slams));

  console.log(`\n  Statistical tests (slams):`);
  console.log(`    Capacity routing (Actual vs No-Buffer): p=${fmtPValue(pCapSlams)}`);
  console.log(`    Buffer cooldowns (No-Buffer vs Formula): p=${fmtPValue(pBufSlams)}`);

  // B2B-specific stats
  const pCapB2B = pairedTTest(threeTeamDays.map(d => d.actual.backToBackHA), threeTeamDays.map(d => d.formulaNoBuffer.backToBackHA));
  const pBufB2B = pairedTTest(threeTeamDays.map(d => d.formulaNoBuffer.backToBackHA), threeTeamDays.map(d => d.formula.backToBackHA));

  console.log(`\n  Statistical tests (back-to-back HA):`);
  console.log(`    Capacity routing (Actual vs No-Buffer): p=${fmtPValue(pCapB2B)}`);
  console.log(`    Buffer cooldowns (No-Buffer vs Formula): p=${fmtPValue(pBufB2B)}`);

  console.log(`\n  Total reductions over ${threeTeamDays.length} days:`);
  console.log(`    Slams: ${fmt(totalSlamReduction * threeTeamDays.length, 0)} total (${fmt(capSlamReduction * threeTeamDays.length, 0)} from capacity + ${fmt(bufSlamReduction * threeTeamDays.length, 0)} from buffers)`);
  console.log(`    B2B HA: ${fmt(totalB2BReduction * threeTeamDays.length, 0)} total (${fmt(capB2BReduction * threeTeamDays.length, 0)} from capacity + ${fmt(bufB2BReduction * threeTeamDays.length, 0)} from buffers)`);
}

console.log();
