/**
 * Real Schedule Benchmark — 1,000 Runs
 *
 * Validates the formula using the actual schedule from demo-schedule.xlsx.
 * Real providers, real team compositions, real shift times.
 * Each run randomly picks a day, shift window, and patient seed.
 * Providers change dynamically during the 8h window as real shifts start/end.
 * Arrival rates reflect actual time-of-day (not elapsed time from start).
 *
 * Usage: cd er-triage-app && npx tsx scripts/real-schedule-benchmark.ts
 *        cd er-triage-app && npx tsx scripts/real-schedule-benchmark.ts --analyze
 */

import { readFileSync, readdirSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join, basename } from 'path';

import type {
  Provider, ProviderType, ProviderStatus, TeamId, AcuityTier,
  SimOverrides, SimTimelineEntry, SimStatusChangeEntry,
  Patient, Buffer, ShadowEntry, ShadowResult,
} from '../src/types';
import type { ScheduleProvider, DaySchedule } from '../src/utils/scheduleParser';
import { parseWeeklySchedule, getProvidersForShift } from '../src/utils/scheduleParser';
import { mulberry32, getDefaultOverrides, generateStatusChanges } from '../src/engine/simulation';
import { statsFromEntries, computeFairness } from '../src/engine/fairness';
import { getRecommendation, scoreTeam, createBuffer, getEffectiveCapacity } from '../src/engine/recommendation';
import type { ScoringOverrides } from '../src/engine/recommendation';
import { TRAUMA_TEAM_ID, OVERWHELM_THRESHOLD } from '../src/constants';
import { uid } from '../src/uid';

// ── Constants ───────────────────────────────────────────────────────

const NUM_RUNS = 1000;
const SHIFT_DURATION_MS = 8 * 60 * 60 * 1000;
const BASE_TIME = 1_700_000_000_000;

const SHIFT_WINDOWS = [
  { label: '7A–3P',  startHour: 7  },
  { label: '9A–5P',  startHour: 9  },
  { label: '3P–11P', startHour: 15 },
  { label: '5P–1A',  startHour: 17 },
];

/**
 * Realistic hourly arrival-rate multipliers (fraction of peak).
 * Index = hour of day (0 = midnight). Copied from simulation.ts.
 */
const HOUR_RATE_MULTIPLIER: number[] = [
  // 12A   1A    2A    3A    4A    5A    6A    7A
  0.25, 0.20, 0.15, 0.15, 0.15, 0.20, 0.30, 0.45,
  // 8A    9A   10A   11A   12P    1P    2P    3P
  0.65, 0.85, 1.00, 1.00, 0.95, 0.90, 0.90, 0.85,
  // 4P    5P    6P    7P    8P    9P   10P   11P
  0.80, 0.80, 0.75, 0.65, 0.55, 0.45, 0.35, 0.30,
];

// ── Parse schedules (multi-file) ────────────────────────────────────

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface ScheduleFile {
  filename: string;
  days: DaySchedule[];
}

function loadScheduleFile(filePath: string): ScheduleFile {
  const buf = readFileSync(filePath);
  const parsed = parseWeeklySchedule(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  return { filename: basename(filePath), days: parsed.days };
}

const scheduleFiles: ScheduleFile[] = [];

// Always include demo-schedule.xlsx
const demoPath = join(__dirname, '..', 'public', 'demo-schedule.xlsx');
if (existsSync(demoPath)) {
  scheduleFiles.push(loadScheduleFile(demoPath));
}

// Read additional schedules from public/schedules/
const schedulesDir = join(__dirname, '..', 'public', 'schedules');
if (existsSync(schedulesDir)) {
  for (const file of readdirSync(schedulesDir).sort()) {
    if (file.endsWith('.xlsx') && !file.startsWith('~$')) {
      scheduleFiles.push(loadScheduleFile(join(schedulesDir, file)));
    }
  }
}

// Pool all days, tracking source file index
interface PooledDay {
  day: DaySchedule;
  fileIdx: number;
}
const dayPool: PooledDay[] = [];
for (let fi = 0; fi < scheduleFiles.length; fi++) {
  for (const day of scheduleFiles[fi].days) {
    if (day.providers.length > 0) {
      dayPool.push({ day, fileIdx: fi });
    }
  }
}

// Back-compat: flat days array for existing code
const days = dayPool.map(d => d.day);

// ── Provider ID management ──────────────────────────────────────────

/** Build a stable ID for a schedule provider so they keep the same ID across hour transitions */
function stableProviderId(sp: ScheduleProvider): string {
  return `${sp.name.toLowerCase()}-t${sp.teamId}`;
}

/** Convert ScheduleProviders to engine Provider[] with stable IDs */
function toProviders(sps: ScheduleProvider[], now: number): Provider[] {
  return sps.map(sp => ({
    id: stableProviderId(sp),
    name: sp.name,
    type: sp.type,
    status: 'active' as ProviderStatus,
    statusExpiresAt: null,
    teamId: sp.teamId,
  }));
}

// ── Time-of-day timeline generation ─────────────────────────────────

function generateTimelineWithTOD(
  seed: number,
  shiftDurationMs: number,
  overrides: SimOverrides,
  startTime: number,
  startHourOfDay: number,
): SimTimelineEntry[] {
  const rng = mulberry32(seed);
  const timeline: SimTimelineEntry[] = [];
  const baseRatePerMs = overrides.arrivalRatePerHour / (60 * 60 * 1000);

  let t = startTime;
  const endTime = startTime + shiftDurationMs;

  while (t < endTime) {
    const elapsedHours = (t - startTime) / 3600000;
    const hourOfDay = Math.floor(startHourOfDay + elapsedHours) % 24;
    const ratePerMs = baseRatePerMs * HOUR_RATE_MULTIPLIER[hourOfDay];

    const u = rng();
    const interval = -Math.log(u === 0 ? 1e-10 : u) / ratePerMs;
    t += interval;
    if (t >= endTime) break;

    const roll = rng() * 100;
    const { tier_one, tier_two } = overrides.acuityDistribution;
    let acuity: AcuityTier;
    if (roll < tier_one) acuity = 'tier_one';
    else if (roll < tier_one + tier_two) acuity = 'tier_two';
    else acuity = 'tier_three';

    const isFloor = rng() * 100 < overrides.floorUpgradeChance;
    timeline.push({ arrivalTime: t, acuity, isFloor });
  }

  return timeline;
}

// ── Get all providers active at any point during an 8h window ───────

function getAllProvidersInWindow(day: DaySchedule, startHour: number): ScheduleProvider[] {
  const seen = new Set<string>();
  const all: ScheduleProvider[] = [];

  for (let h = 0; h < 8; h++) {
    const hour = (startHour + h) % 24;
    const { providers } = getProvidersForShift(day, hour);
    for (const sp of providers) {
      const key = stableProviderId(sp);
      if (!seen.has(key)) {
        seen.add(key);
        all.push(sp);
      }
    }
  }

  return all;
}

// ── Custom sim loop with dynamic provider roster ────────────────────

function runScheduleSim(
  day: DaySchedule,
  timeline: SimTimelineEntry[],
  statusChanges: SimStatusChangeEntry[],
  overrides: SimOverrides,
  baseTime: number,
  startHourOfDay: number,
  mode: 'formula' | 'round_robin',
): { result: ShadowResult; rollingFairness: number } {
  const scoringOv: ScoringOverrides = {
    capacityWeights: overrides.capacityWeights,
    statusMultipliers: overrides.statusMultipliers,
    acuityWeights: overrides.acuityWeights,
    decaySteps: overrides.decaySteps,
    bufferDurations: overrides.bufferDurations,
  };

  // Track provider statuses that persist across roster changes
  const providerStatuses = new Map<string, { status: ProviderStatus; expiresAt: number | null }>();
  let simPatients: Patient[] = [];
  let simBuffers: Buffer[] = [];
  let rrNext = 0;
  let nextStatusChangeIndex = 0;

  const entries: ShadowEntry[] = [];
  let fairnessSum = 0;
  let fairnessCount = 0;

  // Determine which teams are active (have any providers during the window)
  const allWindowProviders = getAllProvidersInWindow(day, startHourOfDay);
  const activeTeams = new Set(allWindowProviders.map(p => p.teamId));
  const permanentlyClosedTeams = ([1, 2, 3, 4] as TeamId[]).filter(t => !activeTeams.has(t));
  const closedTeams: Record<number, number> = {};
  for (const t of permanentlyClosedTeams) closedTeams[t] = baseTime;

  for (let i = 0; i < timeline.length; i++) {
    const entry = timeline[i];
    const now = entry.arrivalTime;
    const elapsedHours = (now - baseTime) / 3600000;
    const hourOfDay = (startHourOfDay + elapsedHours) % 24;

    // Get current active providers for this hour
    const { providers: currentScheduleProviders } = getProvidersForShift(day, hourOfDay);
    let simProviders: Provider[] = currentScheduleProviders.map(sp => {
      const pid = stableProviderId(sp);
      const savedStatus = providerStatuses.get(pid);
      if (savedStatus && savedStatus.expiresAt !== null && savedStatus.expiresAt <= now) {
        // Status expired
        providerStatuses.delete(pid);
        return { id: pid, name: sp.name, type: sp.type, status: 'active' as ProviderStatus, statusExpiresAt: null, teamId: sp.teamId };
      }
      if (savedStatus) {
        return { id: pid, name: sp.name, type: sp.type, status: savedStatus.status, statusExpiresAt: savedStatus.expiresAt, teamId: sp.teamId };
      }
      return { id: pid, name: sp.name, type: sp.type, status: 'active' as ProviderStatus, statusExpiresAt: null, teamId: sp.teamId };
    });

    // Drain pending status changes up to this time
    while (nextStatusChangeIndex < statusChanges.length && statusChanges[nextStatusChangeIndex].time <= now) {
      const change = statusChanges[nextStatusChangeIndex];
      nextStatusChangeIndex++;
      // Only apply if provider is currently active
      const existing = providerStatuses.get(change.providerId);
      const currentStatus = existing?.status ?? 'active';
      if (currentStatus === 'active') {
        providerStatuses.set(change.providerId, {
          status: change.status,
          expiresAt: change.time + change.durationMs,
        });
        // Update simProviders in place
        simProviders = simProviders.map(p => {
          if (p.id !== change.providerId) return p;
          return { ...p, status: change.status, statusExpiresAt: change.time + change.durationMs };
        });
      }
    }

    // Filter expired buffers
    simBuffers = simBuffers.filter(b => b.expiresAt > now);

    // Assign team
    let teamId: TeamId;
    if (mode === 'round_robin') {
      const eligible = ([1, 2, 3, 4] as TeamId[]).filter(
        t => t !== TRAUMA_TEAM_ID && !(t in closedTeams) && !permanentlyClosedTeams.includes(t)
      );
      if (eligible.length === 0) {
        // Fallback: assign to team 1
        teamId = 1 as TeamId;
      } else {
        teamId = eligible[rrNext % eligible.length];
        rrNext++;
      }
    } else {
      const rec = getRecommendation(simProviders, simPatients, simBuffers, now, closedTeams, scoringOv);
      teamId = rec.first ?? (1 as TeamId);
    }

    // Score the receiving team
    const score = scoreTeam(teamId, simProviders, simPatients, simBuffers, now, scoringOv);
    const ratio = score.capacityRatio === Infinity ? 100 : score.capacityRatio;

    // Create patient
    const patient: Patient = {
      id: `S-${String(i + 1).padStart(3, '0')}`,
      acuity: entry.acuity,
      assignedTeamId: teamId,
      assignedAt: now,
    };

    // Create and merge buffer
    const newBuffer = createBuffer(teamId, entry.acuity, now, scoringOv);
    const existingTeamBuffers = simBuffers.filter(b => b.teamId === teamId && b.expiresAt > now && !b.deceasedPatientId);
    const otherBuffers = simBuffers.filter(b => !(b.teamId === teamId && b.expiresAt > now && !b.deceasedPatientId));
    if (existingTeamBuffers.length > 0) {
      const allBufs = [...existingTeamBuffers, newBuffer];
      const currentExpiry = Math.max(...existingTeamBuffers.map(b => b.expiresAt));
      const newDuration = newBuffer.expiresAt - newBuffer.createdAt;
      const latestExpiry = Math.max(currentExpiry, now) + newDuration;
      const tierRank = { tier_one: 0, tier_two: 1, tier_three: 2 } as const;
      const bestTier = allBufs.reduce((best, b) => tierRank[b.tier] < tierRank[best.tier] ? b : best).tier;
      const totalCount = allBufs.reduce((sum, b) => sum + (b.mergedCount ?? 1), 0);
      simBuffers = [...otherBuffers, {
        id: newBuffer.id, teamId, tier: bestTier,
        createdAt: Math.min(...allBufs.map(b => b.createdAt)),
        expiresAt: latestExpiry, mergedCount: totalCount,
      }];
    } else {
      simBuffers = [...simBuffers, newBuffer];
    }

    simPatients = [...simPatients, patient];

    // Record entry
    entries.push({ arrivalIndex: i, arrivalTime: now, acuity: entry.acuity, teamId, ratioAtAssignment: ratio });

    // Rolling fairness: compute after every patient
    const teamCaps = getTeamCapacitiesFromProviders(simProviders, now, scoringOv, permanentlyClosedTeams);
    const stats = statsFromEntries(entries);
    const fairness = computeFairness(stats, permanentlyClosedTeams, teamCaps);
    fairnessSum += fairness;
    fairnessCount++;
  }

  // Build final stats
  const teamPatientCounts: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };
  const teamAcuityLoad: Record<number, { tier_one: number; tier_two: number; tier_three: number }> = {
    1: { tier_one: 0, tier_two: 0, tier_three: 0 },
    2: { tier_one: 0, tier_two: 0, tier_three: 0 },
    3: { tier_one: 0, tier_two: 0, tier_three: 0 },
    4: { tier_one: 0, tier_two: 0, tier_three: 0 },
  };
  const ratioSums: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };
  const ratioCounts: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };
  const minRatioPerTeam: Record<number, number> = { 1: Infinity, 2: Infinity, 3: Infinity, 4: Infinity };
  const overwhelmEvents: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };

  for (const e of entries) {
    teamPatientCounts[e.teamId]++;
    teamAcuityLoad[e.teamId][e.acuity]++;
    ratioSums[e.teamId] += e.ratioAtAssignment;
    ratioCounts[e.teamId]++;
    if (e.ratioAtAssignment < minRatioPerTeam[e.teamId]) minRatioPerTeam[e.teamId] = e.ratioAtAssignment;
    if (e.ratioAtAssignment < OVERWHELM_THRESHOLD) overwhelmEvents[e.teamId]++;
  }

  const avgRatioPerTeam: Record<number, number> = {};
  for (const t of [1, 2, 3, 4]) {
    avgRatioPerTeam[t] = ratioCounts[t] > 0 ? ratioSums[t] / ratioCounts[t] : Infinity;
  }

  return {
    result: {
      mode: mode === 'formula' ? 'formula' : 'round_robin',
      entries,
      teamPatientCounts,
      teamAcuityLoad,
      avgRatioPerTeam,
      minRatioPerTeam,
      overwhelmEvents,
    },
    rollingFairness: fairnessCount > 0 ? fairnessSum / fairnessCount : 50,
  };
}

function getTeamCapacitiesFromProviders(
  providers: Provider[],
  now: number,
  scoringOv: ScoringOverrides,
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

// ── Statistics (copied from benchmark.ts) ───────────────────────────

function mean(arr: number[]): number {
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function stddev(arr: number[]): number {
  const m = mean(arr);
  return Math.sqrt(arr.reduce((s, v) => s + (v - m) ** 2, 0) / arr.length);
}

function pairedTTest(a: number[], b: number[]): number {
  const n = a.length;
  const diffs = a.map((v, i) => v - b[i]);
  const dMean = mean(diffs);
  const dVar = diffs.reduce((s, d) => s + (d - dMean) ** 2, 0) / (n - 1);
  const se = Math.sqrt(dVar / n);
  if (se === 0) return dMean === 0 ? 1 : 0;
  const t = dMean / se;
  const df = n - 1;
  const absT = Math.abs(t);
  const p = 2 * tCDF(-absT, df);
  return Math.max(0, Math.min(1, p));
}

function tCDF(t: number, df: number): number {
  const x = df / (df + t * t);
  if (t >= 0) {
    return 1 - 0.5 * incompleteBeta(x, df / 2, 0.5);
  } else {
    return 0.5 * incompleteBeta(x, df / 2, 0.5);
  }
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
  if (z < 0.5) {
    return Math.log(Math.PI / Math.sin(Math.PI * z)) - lgamma(1 - z);
  }
  z -= 1;
  let x = coef[0];
  for (let i = 1; i < g + 2; i++) x += coef[i] / (z + i);
  const t = z + g + 0.5;
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
}

function cohenD(a: number[], b: number[]): number {
  const diffs = a.map((v, i) => v - b[i]);
  const d = mean(diffs);
  const s = stddev(diffs) || 1e-10;
  return d / s;
}

// ── Formatting ──────────────────────────────────────────────────────

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

// ── Slam & Back-to-Back HA Counters ─────────────────────────────────

const SLAM_WINDOW_MS = 60 * 60 * 1000;  // 1 hour
const B2B_WINDOW_MS = 30 * 60 * 1000;   // 30 minutes

function countSlams(entries: ShadowEntry[]): number {
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

function countBackToBackHA(entries: ShadowEntry[]): number {
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

// ── Main ────────────────────────────────────────────────────────────

interface RunMetrics {
  fairness: number;       // rolling fairness
  avgRatio: number;
  minRatio: number;
  overwhelms: number;
  demandSpread: number;   // stddev of team patient counts / mean
  slams: number;
  backToBackHA: number;
}

interface RunInfo {
  dayIdx: number;
  windowIdx: number;
  formula: RunMetrics;
  formulaNoBuffer: RunMetrics;
  roundRobin: RunMetrics;
}

function computeDemandSpread(result: ShadowResult, permanentlyClosedTeams: number[]): number {
  const eligible = ([1, 2, 3, 4] as TeamId[]).filter(
    t => t !== TRAUMA_TEAM_ID && !permanentlyClosedTeams.includes(t)
  );
  const counts = eligible.map(t => result.teamPatientCounts[t] ?? 0);
  const m = mean(counts);
  if (m === 0) return 0;
  return stddev(counts) / m;
}

// ── Analyze mode ─────────────────────────────────────────────────────

interface HourlySnapshot {
  hour: number;
  teams: Map<number, { capacity: number; providerCount: number; providerTypes: string[] }>;
}

interface WindowAnalysis {
  fileIdx: number;
  dayLabel: string;
  windowLabel: string;
  imbalance: number;       // avg CV across hours
  turnover: number;        // providers present only part of window
  teamSummaries: string[]; // per-team description for top combos
  teamCount: number;       // number of active teams
}

function analyzeSchedules(): void {
  const scoringOv: ScoringOverrides = {
    capacityWeights: overrides.capacityWeights,
    statusMultipliers: overrides.statusMultipliers,
    acuityWeights: overrides.acuityWeights,
    decaySteps: overrides.decaySteps,
    bufferDurations: overrides.bufferDurations,
  };

  const allAnalyses: WindowAnalysis[] = [];

  for (let fi = 0; fi < scheduleFiles.length; fi++) {
    const sf = scheduleFiles[fi];
    for (const day of sf.days) {
      if (day.providers.length === 0) continue;

      for (const window of SHIFT_WINDOWS) {
        // Collect hourly snapshots
        const snapshots: HourlySnapshot[] = [];
        const providerFirstSeen = new Map<string, number>();
        const providerLastSeen = new Map<string, number>();

        for (let h = 0; h < 8; h++) {
          const hour = (window.startHour + h) % 24;
          const { providers: sps } = getProvidersForShift(day, hour);
          const teamMap = new Map<number, { capacity: number; providerCount: number; providerTypes: string[] }>();

          for (const sp of sps) {
            const key = stableProviderId(sp);
            if (!providerFirstSeen.has(key)) providerFirstSeen.set(key, h);
            providerLastSeen.set(key, h);

            const existing = teamMap.get(sp.teamId);
            // Compute capacity as weight for an active provider
            const weight = (scoringOv.capacityWeights as Record<string, number>)[sp.type] ?? 1;
            if (existing) {
              existing.capacity += weight;
              existing.providerCount++;
              existing.providerTypes.push(sp.type);
            } else {
              teamMap.set(sp.teamId, { capacity: weight, providerCount: 1, providerTypes: [sp.type] });
            }
          }

          snapshots.push({ hour, teams: teamMap });
        }

        // Compute average CV of team capacities across the 8 hours
        let cvSum = 0;
        let cvCount = 0;
        for (const snap of snapshots) {
          const caps = Array.from(snap.teams.values()).map(t => t.capacity);
          if (caps.length < 2) continue;
          const m = mean(caps);
          if (m === 0) continue;
          const sd = stddev(caps);
          cvSum += sd / m;
          cvCount++;
        }
        const imbalance = cvCount > 0 ? cvSum / cvCount : 0;

        // Turnover: providers not present at start or not present at end
        let turnover = 0;
        for (const [, first] of providerFirstSeen) {
          if (first > 0) turnover++;
        }
        for (const [key, last] of providerLastSeen) {
          if (last < 7 && providerFirstSeen.get(key) === 0) turnover++;
          // Already counted if first > 0
        }

        // Build team summaries from the midpoint snapshot (hour 4)
        const midSnap = snapshots[Math.min(4, snapshots.length - 1)];
        const teamSummaries: string[] = [];
        const activeTeamCount = midSnap.teams.size;
        for (const [tid, info] of Array.from(midSnap.teams.entries()).sort((a, b) => a[0] - b[0])) {
          const typeAbbrevs = info.providerTypes.map(t => {
            const abbr: Record<string, string> = {
              attending: 'Att', senior_resident: 'SrRes', pa: 'PA',
              junior_resident: 'JrRes', intern: 'Int', rotator: 'Rot',
            };
            return abbr[t] || t;
          });
          teamSummaries.push(`Team ${tid}: ${fmt(info.capacity, 1)} (${typeAbbrevs.join('+')})`);
        }

        allAnalyses.push({
          fileIdx: fi,
          dayLabel: day.dayOfWeek,
          windowLabel: window.label,
          imbalance,
          turnover,
          teamSummaries,
          teamCount: activeTeamCount,
        });
      }
    }
  }

  // ── Report ──
  const totalDays = scheduleFiles.reduce((s, sf) => s + sf.days.filter(d => d.providers.length > 0).length, 0);

  console.log('Schedule Balance Analysis');
  console.log('═'.repeat(50));
  console.log(`Files: ${scheduleFiles.length} | Total days: ${totalDays}\n`);

  // Per-file summary
  console.log('Per-file summary:');
  for (let fi = 0; fi < scheduleFiles.length; fi++) {
    const fileAnalyses = allAnalyses.filter(a => a.fileIdx === fi);
    const fileDays = new Set(fileAnalyses.map(a => a.dayLabel)).size;
    const avgImbalance = fileAnalyses.length > 0 ? mean(fileAnalyses.map(a => a.imbalance)) : 0;
    const avgTurnover = fileAnalyses.length > 0 ? mean(fileAnalyses.map(a => a.turnover)) : 0;
    console.log(
      `  ${pad(scheduleFiles[fi].filename, 30)} ${rpad(String(fileDays), 2)} days   ` +
      `avg imbalance: ${fmt(avgImbalance, 2)}   turnover: ${fmt(avgTurnover, 1)}/window`
    );
  }

  // Top 10 most uneven
  const sorted = [...allAnalyses].sort((a, b) => b.imbalance - a.imbalance);
  const top = sorted.slice(0, 10);

  console.log(`\nMost uneven day+window combos:`);
  for (let i = 0; i < top.length; i++) {
    const a = top[i];
    console.log(
      `  ${rpad(String(i + 1), 2)}. ${pad(scheduleFiles[a.fileIdx].filename, 25)} / ` +
      `${pad(a.dayLabel, 10)} ${pad(a.windowLabel, 8)}  imbalance: ${fmt(a.imbalance, 2)}   ` +
      `teams: ${a.teamCount}   turnover: ${a.turnover}`
    );
    console.log(`      ${a.teamSummaries.join('  ')}`);
  }

  // Most balanced
  const bottom = sorted.slice(-5).reverse();
  console.log(`\nMost balanced day+window combos:`);
  for (let i = 0; i < bottom.length; i++) {
    const a = bottom[i];
    console.log(
      `  ${rpad(String(i + 1), 2)}. ${pad(scheduleFiles[a.fileIdx].filename, 25)} / ` +
      `${pad(a.dayLabel, 10)} ${pad(a.windowLabel, 8)}  imbalance: ${fmt(a.imbalance, 2)}   ` +
      `teams: ${a.teamCount}   turnover: ${a.turnover}`
    );
  }

  console.log();
}

// ── Ratios distribution mode ─────────────────────────────────────────

function analyzeRatioDistribution(): void {
  console.log('Ratio Distribution Analysis — 1,000 Runs');
  console.log('═'.repeat(60));
  console.log(`Schedule files: ${scheduleFiles.length} | Total days: ${dayPool.length}\n`);

  const allRatios: number[] = [];
  const validDays = dayPool.map((_, i) => i);

  for (let run = 0; run < NUM_RUNS; run++) {
    if (run % 200 === 0) process.stdout.write(`  Running ${run}...`);

    const rng = mulberry32(run + 1);
    const dayIdx = validDays[Math.floor(rng() * validDays.length)];
    const windowIdx = Math.floor(rng() * SHIFT_WINDOWS.length);
    const patientSeed = Math.floor(rng() * 2147483647);

    const day = days[dayIdx];
    const startHour = SHIFT_WINDOWS[windowIdx].startHour;

    const timeline = generateTimelineWithTOD(patientSeed, SHIFT_DURATION_MS, ratioOverrides, BASE_TIME, startHour);
    const allProviders = getAllProvidersInWindow(day, startHour);
    const allProviderObjects = toProviders(allProviders, BASE_TIME);
    const statusChanges = generateStatusChanges(patientSeed + 5555, SHIFT_DURATION_MS, ratioOverrides, BASE_TIME, allProviderObjects);

    const { result } = runScheduleSim(day, timeline, statusChanges, ratioOverrides, BASE_TIME, startHour, 'formula');

    for (const e of result.entries) {
      allRatios.push(e.ratioAtAssignment);
    }

    if ((run + 1) % 200 === 0) process.stdout.write(' done\n');
  }

  // Sort for percentile computation
  allRatios.sort((a, b) => a - b);
  const n = allRatios.length;
  const pctl = (p: number) => allRatios[Math.floor(p / 100 * (n - 1))];

  console.log(`\nTotal ratio observations: ${n}`);
  console.log(`\nPercentile Distribution:`);
  console.log(`  Min:  ${fmt(allRatios[0], 2)}`);
  console.log(`  p5:   ${fmt(pctl(5), 2)}`);
  console.log(`  p10:  ${fmt(pctl(10), 2)}`);
  console.log(`  p25:  ${fmt(pctl(25), 2)}`);
  console.log(`  p50:  ${fmt(pctl(50), 2)}`);
  console.log(`  p75:  ${fmt(pctl(75), 2)}`);
  console.log(`  p90:  ${fmt(pctl(90), 2)}`);
  console.log(`  p95:  ${fmt(pctl(95), 2)}`);
  console.log(`  Max:  ${fmt(allRatios[n - 1], 2)}`);
  console.log(`  Mean: ${fmt(mean(allRatios), 2)}`);

  // Histogram
  const buckets = [0, 1, 2, 3, 4, 5, 7, 10, 15, 20, 30, 50, 100];
  console.log(`\nHistogram:`);
  for (let i = 0; i < buckets.length - 1; i++) {
    const lo = buckets[i];
    const hi = buckets[i + 1];
    const count = allRatios.filter(r => r >= lo && r < hi).length;
    const pct = (count / n * 100).toFixed(1);
    const bar = '█'.repeat(Math.round(count / n * 80));
    console.log(`  ${rpad(String(lo), 3)}–${rpad(String(hi), 3)}: ${rpad(pct + '%', 6)} ${bar} (${count})`);
  }
  const lastBucket = buckets[buckets.length - 1];
  const lastCount = allRatios.filter(r => r >= lastBucket).length;
  console.log(`  ${rpad(String(lastBucket), 3)}+  : ${rpad((lastCount / n * 100).toFixed(1) + '%', 6)} ${'█'.repeat(Math.round(lastCount / n * 80))} (${lastCount})`);

  console.log();
}

// ── Check for --analyze / --ratios flag ──────────────────────────────

const ratioOverrides = getDefaultOverrides();
// Alias for existing code that uses `overrides`
const overrides = ratioOverrides;

if (process.argv.includes('--ratios')) {
  analyzeRatioDistribution();
  process.exit(0);
}

if (process.argv.includes('--analyze')) {
  analyzeSchedules();
  process.exit(0);
}

// Optional --file filter: only use days from matching schedule file
const fileFilterIdx = process.argv.indexOf('--file');
if (fileFilterIdx !== -1 && process.argv[fileFilterIdx + 1]) {
  const pattern = process.argv[fileFilterIdx + 1].toLowerCase();
  const matchingFileIndices = scheduleFiles
    .map((sf, i) => ({ i, name: sf.filename.toLowerCase() }))
    .filter(x => x.name.includes(pattern))
    .map(x => x.i);
  if (matchingFileIndices.length === 0) {
    console.error(`No schedule files match "${pattern}"`);
    process.exit(1);
  }
  // Remove non-matching days from the pool
  for (let i = dayPool.length - 1; i >= 0; i--) {
    if (!matchingFileIndices.includes(dayPool[i].fileIdx)) {
      dayPool.splice(i, 1);
    }
  }
  // Rebuild flat days array
  days.length = 0;
  days.push(...dayPool.map(d => d.day));
  console.log(`Filtered to: ${scheduleFiles.filter((_, i) => matchingFileIndices.includes(i)).map(s => s.filename).join(', ')}`);
}

// ── Main (benchmark mode) ────────────────────────────────────────────

console.log('Real Schedule Benchmark — 1,000 Runs (8h attending shifts)');
console.log(`Schedule files: ${scheduleFiles.length} | Total days: ${dayPool.length}`);
for (const sf of scheduleFiles) {
  const validDays = sf.days.filter(d => d.providers.length > 0).length;
  console.log(`  ${sf.filename}: ${validDays} days with providers`);
}
console.log();

// validDayIndices indexes into the pooled days array (all have providers)
const validDayIndices = dayPool.map((_, i) => i);

const runs: RunInfo[] = [];

for (let run = 0; run < NUM_RUNS; run++) {
  if (run % 100 === 0) process.stdout.write(`  Running ${run}–${Math.min(run + 99, NUM_RUNS - 1)}...`);

  // Seed derivation
  const rng = mulberry32(run + 1);
  const dayIdx = validDayIndices[Math.floor(rng() * validDayIndices.length)];
  const windowIdx = Math.floor(rng() * SHIFT_WINDOWS.length);
  const patientSeed = Math.floor(rng() * 2147483647);

  const day = days[dayIdx];
  const startHour = SHIFT_WINDOWS[windowIdx].startHour;

  // Generate timeline with time-of-day arrival rates
  const timeline = generateTimelineWithTOD(patientSeed, SHIFT_DURATION_MS, overrides, BASE_TIME, startHour);

  // Generate status changes for the union of all providers active during the window
  const allProviders = getAllProvidersInWindow(day, startHour);
  const allProviderObjects = toProviders(allProviders, BASE_TIME);
  const statusChanges = generateStatusChanges(patientSeed + 5555, SHIFT_DURATION_MS, overrides, BASE_TIME, allProviderObjects);

  // Determine permanently closed teams
  const activeTeams = new Set(allProviders.map(p => p.teamId));
  const permanentlyClosedTeams = ([1, 2, 3, 4] as TeamId[]).filter(t => !activeTeams.has(t));

  // Run formula (full: capacity routing + buffers)
  const { result: fResult, rollingFairness: fRollingFairness } = runScheduleSim(
    day, timeline, statusChanges, overrides, BASE_TIME, startHour, 'formula',
  );
  const fStats = statsFromEntries(fResult.entries);
  const fMetrics: RunMetrics = {
    fairness: fRollingFairness,
    avgRatio: fStats.avgRatio,
    minRatio: fStats.minRatio === Infinity ? 0 : fStats.minRatio,
    overwhelms: fStats.overwhelms,
    demandSpread: computeDemandSpread(fResult, permanentlyClosedTeams),
    slams: countSlams(fResult.entries),
    backToBackHA: countBackToBackHA(fResult.entries),
  };

  // Run formula WITHOUT buffers (capacity routing only, buffers expire instantly)
  const noBufferOverrides: SimOverrides = {
    ...overrides,
    bufferDurations: { tier_one: 0, tier_two: 0, tier_three: 0 },
  };
  const { result: fnbResult, rollingFairness: fnbRollingFairness } = runScheduleSim(
    day, timeline, statusChanges, noBufferOverrides, BASE_TIME, startHour, 'formula',
  );
  const fnbStats = statsFromEntries(fnbResult.entries);
  const fnbMetrics: RunMetrics = {
    fairness: fnbRollingFairness,
    avgRatio: fnbStats.avgRatio,
    minRatio: fnbStats.minRatio === Infinity ? 0 : fnbStats.minRatio,
    overwhelms: fnbStats.overwhelms,
    demandSpread: computeDemandSpread(fnbResult, permanentlyClosedTeams),
    slams: countSlams(fnbResult.entries),
    backToBackHA: countBackToBackHA(fnbResult.entries),
  };

  // Run round robin
  const { result: rrResult, rollingFairness: rrRollingFairness } = runScheduleSim(
    day, timeline, statusChanges, overrides, BASE_TIME, startHour, 'round_robin',
  );
  const rrStats = statsFromEntries(rrResult.entries);
  const rrMetrics: RunMetrics = {
    fairness: rrRollingFairness,
    avgRatio: rrStats.avgRatio,
    minRatio: rrStats.minRatio === Infinity ? 0 : rrStats.minRatio,
    overwhelms: rrStats.overwhelms,
    demandSpread: computeDemandSpread(rrResult, permanentlyClosedTeams),
    slams: countSlams(rrResult.entries),
    backToBackHA: countBackToBackHA(rrResult.entries),
  };

  runs.push({ dayIdx, windowIdx, formula: fMetrics, formulaNoBuffer: fnbMetrics, roundRobin: rrMetrics });

  if ((run + 1) % 100 === 0) process.stdout.write(' done\n');
}

// ── Report ──────────────────────────────────────────────────────────

// Distribution stats
const windowCounts = SHIFT_WINDOWS.map((_, wi) => runs.filter(r => r.windowIdx === wi).length);
const dayOfWeekCounts: Record<string, number> = {};
for (const r of runs) {
  const dow = days[r.dayIdx].dayOfWeek;
  dayOfWeekCounts[dow] = (dayOfWeekCounts[dow] ?? 0) + 1;
}

console.log('\nShift window distribution:');
console.log('  ' + SHIFT_WINDOWS.map((w, i) => `${w.label}: ${windowCounts[i]}`).join('   '));

console.log('\nDay distribution:');
const dowOrder = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
console.log('  ' + dowOrder.filter(d => dayOfWeekCounts[d]).map(d => `${d.slice(0, 3)}: ${dayOfWeekCounts[d]}`).join('  '));

// Helper used by multiple report sections
const pct = (n: number) => ((n / NUM_RUNS) * 100).toFixed(0);

// Aggregate results
console.log(`\n${'═'.repeat(70)}`);
console.log(`  AGGREGATE RESULTS (${NUM_RUNS} runs)`);
console.log('═'.repeat(70));

const metricDefs: { label: string; key: keyof RunMetrics; higherBetter: boolean }[] = [
  { label: 'Fairness Score', key: 'fairness', higherBetter: true },
  { label: 'Avg Ratio', key: 'avgRatio', higherBetter: true },
  { label: 'Min Ratio', key: 'minRatio', higherBetter: true },
  { label: 'Overwhelms', key: 'overwhelms', higherBetter: false },
  { label: 'Demand Spread', key: 'demandSpread', higherBetter: false },
  { label: 'Slams', key: 'slams', higherBetter: false },
  { label: 'Back-to-back HA', key: 'backToBackHA', higherBetter: false },
];

console.log(
  pad('', 18) +
  rpad('Formula', 18) +
  rpad('No Buffers', 18) +
  rpad('Round Robin', 18) +
  rpad('Δ F vs RR', 12) +
  rpad('p (F vs RR)', 12)
);
console.log('-'.repeat(96));

for (const m of metricDefs) {
  const fVals = runs.map(r => r.formula[m.key]);
  const fnbVals = runs.map(r => r.formulaNoBuffer[m.key]);
  const rrVals = runs.map(r => r.roundRobin[m.key]);
  const delta = mean(fVals) - mean(rrVals);
  const p = pairedTTest(fVals, rrVals);
  console.log(
    pad(m.label, 18) +
    rpad(fmtMeanStd(fVals), 18) +
    rpad(fmtMeanStd(fnbVals), 18) +
    rpad(fmtMeanStd(rrVals), 18) +
    rpad((delta >= 0 ? '+' : '') + fmt(delta, 2), 12) +
    rpad(fmtPValue(p), 12)
  );
}

// ── Buffer Ablation Decomposition ──
console.log(`\n${'═'.repeat(70)}`);
console.log('  BUFFER ABLATION — Decomposing the Improvement');
console.log('═'.repeat(70));

const fFairness = runs.map(r => r.formula.fairness);
const fnbFairness = runs.map(r => r.formulaNoBuffer.fairness);
const rrFairness = runs.map(r => r.roundRobin.fairness);

const totalGain = mean(fFairness) - mean(rrFairness);
const capacityGain = mean(fnbFairness) - mean(rrFairness);
const bufferGain = mean(fFairness) - mean(fnbFairness);
const capacityPct = totalGain !== 0 ? (capacityGain / totalGain * 100) : 0;
const bufferPct = totalGain !== 0 ? (bufferGain / totalGain * 100) : 0;

console.log(`\n  Total fairness gain (Formula vs Round Robin):    +${fmt(totalGain, 2)} points`);
console.log(`  ├─ Capacity-aware routing (No Buffers vs RR):     +${fmt(capacityGain, 2)} points (${fmt(capacityPct, 1)}%)`);
console.log(`  └─ Buffer cooldowns (Formula vs No Buffers):      +${fmt(bufferGain, 2)} points (${fmt(bufferPct, 1)}%)`);

// Statistical tests for each component
const pCapacity = pairedTTest(fnbFairness, rrFairness);
const pBuffer = pairedTTest(fFairness, fnbFairness);
const dCapacity = cohenD(fnbFairness, rrFairness);
const dBuffer = cohenD(fFairness, fnbFairness);

console.log(`\n  Capacity routing significance:  p=${fmtPValue(pCapacity)}, Cohen's d=${fmt(Math.abs(dCapacity), 2)}`);
console.log(`  Buffer cooldown significance:   p=${fmtPValue(pBuffer)}, Cohen's d=${fmt(Math.abs(dBuffer), 2)}`);

// Per-metric decomposition
console.log(`\n  Per-metric decomposition:`);
console.log(
  pad('', 18) +
  rpad('Total Δ', 12) +
  rpad('Capacity', 12) +
  rpad('Buffers', 12) +
  rpad('% Capacity', 12) +
  rpad('% Buffers', 12)
);
console.log('  ' + '-'.repeat(68));
for (const m of metricDefs) {
  const fVals = runs.map(r => r.formula[m.key]);
  const fnbVals = runs.map(r => r.formulaNoBuffer[m.key]);
  const rrVals = runs.map(r => r.roundRobin[m.key]);
  const total = mean(fVals) - mean(rrVals);
  const cap = mean(fnbVals) - mean(rrVals);
  const buf = mean(fVals) - mean(fnbVals);
  const capPct = total !== 0 ? (cap / total * 100) : 0;
  const bufPctM = total !== 0 ? (buf / total * 100) : 0;
  console.log(
    pad(m.label, 18) +
    rpad((total >= 0 ? '+' : '') + fmt(total, 2), 12) +
    rpad((cap >= 0 ? '+' : '') + fmt(cap, 2), 12) +
    rpad((buf >= 0 ? '+' : '') + fmt(buf, 2), 12) +
    rpad(fmt(capPct, 1) + '%', 12) +
    rpad(fmt(bufPctM, 1) + '%', 12)
  );
}

// Win rates for all three pairings
let fVsNb_fWins = 0, fVsNb_nbWins = 0, fVsNb_ties = 0;
let nbVsRr_nbWins = 0, nbVsRr_rrWins = 0, nbVsRr_ties = 0;
for (const r of runs) {
  const d1 = r.formula.fairness - r.formulaNoBuffer.fairness;
  if (Math.abs(d1) < 0.01) fVsNb_ties++; else if (d1 > 0) fVsNb_fWins++; else fVsNb_nbWins++;
  const d2 = r.formulaNoBuffer.fairness - r.roundRobin.fairness;
  if (Math.abs(d2) < 0.01) nbVsRr_ties++; else if (d2 > 0) nbVsRr_nbWins++; else nbVsRr_rrWins++;
}
console.log(`\n  Win rates:`);
console.log(`    Formula vs No-Buffer:   Formula wins ${pct(fVsNb_fWins)}%, No-Buffer wins ${pct(fVsNb_nbWins)}%, ties ${pct(fVsNb_ties)}%`);
console.log(`    No-Buffer vs Round Robin: No-Buffer wins ${pct(nbVsRr_nbWins)}%, RR wins ${pct(nbVsRr_rrWins)}%, ties ${pct(nbVsRr_ties)}%`);

// Win/loss (Formula vs Round Robin)
let fWins = 0, rrWins = 0, ties = 0;
for (const r of runs) {
  const diff = r.formula.fairness - r.roundRobin.fairness;
  if (Math.abs(diff) < 0.01) ties++;
  else if (diff > 0) fWins++;
  else rrWins++;
}
console.log(
  `\nFormula vs RR: Formula wins ${fWins}/${NUM_RUNS} (${pct(fWins)}%)  |  ` +
  `RR wins: ${rrWins}/${NUM_RUNS} (${pct(rrWins)}%)  |  ` +
  `Ties: ${ties}/${NUM_RUNS} (${pct(ties)}%)`
);

// Per-schedule breakdown (only if multiple files)
if (scheduleFiles.length > 1) {
  console.log('\nPer-schedule breakdown:');
  for (let fi = 0; fi < scheduleFiles.length; fi++) {
    const fileRuns = runs.filter(r => dayPool[r.dayIdx].fileIdx === fi);
    if (fileRuns.length === 0) continue;
    const fVals = fileRuns.map(r => r.formula.fairness);
    const rrVals = fileRuns.map(r => r.roundRobin.fairness);
    let sFWins = 0;
    for (let i = 0; i < fileRuns.length; i++) {
      if (fVals[i] - rrVals[i] > 0.01) sFWins++;
    }
    const p = fileRuns.length >= 2 ? pairedTTest(fVals, rrVals) : 1;
    const d = fileRuns.length >= 2 ? cohenD(fVals, rrVals) : 0;
    const sPct = ((sFWins / fileRuns.length) * 100).toFixed(0);
    console.log(
      `  ${pad(scheduleFiles[fi].filename + ':', 30)} Formula wins ${sPct}% ` +
      `(${fileRuns.length} runs, p=${fmtPValue(p)}, d=${fmt(Math.abs(d), 2)})`
    );
  }
}

// Per-window breakdown
console.log('\nPer-window breakdown:');
for (let wi = 0; wi < SHIFT_WINDOWS.length; wi++) {
  const windowRuns = runs.filter(r => r.windowIdx === wi);
  if (windowRuns.length === 0) continue;
  const fVals = windowRuns.map(r => r.formula.fairness);
  const rrVals = windowRuns.map(r => r.roundRobin.fairness);
  let wFWins = 0;
  for (let i = 0; i < windowRuns.length; i++) {
    if (fVals[i] - rrVals[i] > 0.01) wFWins++;
  }
  const p = windowRuns.length >= 2 ? pairedTTest(fVals, rrVals) : 1;
  const d = windowRuns.length >= 2 ? cohenD(fVals, rrVals) : 0;
  const wPct = ((wFWins / windowRuns.length) * 100).toFixed(0);
  console.log(
    `  ${pad(SHIFT_WINDOWS[wi].label + ':', 10)} Formula wins ${wPct}% ` +
    `(${windowRuns.length} runs, p=${fmtPValue(p)}, d=${fmt(Math.abs(d), 2)})`
  );
}

// Per-day breakdown
console.log('\nPer-day breakdown:');
for (const dow of dowOrder) {
  const dayRuns = runs.filter(r => days[r.dayIdx].dayOfWeek === dow);
  if (dayRuns.length === 0) continue;
  const fVals = dayRuns.map(r => r.formula.fairness);
  const rrVals = dayRuns.map(r => r.roundRobin.fairness);
  let dFWins = 0;
  for (let i = 0; i < dayRuns.length; i++) {
    if (fVals[i] - rrVals[i] > 0.01) dFWins++;
  }
  const p = dayRuns.length >= 2 ? pairedTTest(fVals, rrVals) : 1;
  const d = dayRuns.length >= 2 ? cohenD(fVals, rrVals) : 0;
  console.log(
    `  ${pad(dow + ':', 12)} Formula wins ${((dFWins / dayRuns.length) * 100).toFixed(0)}% ` +
    `(${dayRuns.length} runs, p=${fmtPValue(p)}, d=${fmt(Math.abs(d), 2)})`
  );
}

// Interpretation
console.log(`\n${'═'.repeat(70)}`);
console.log('  INTERPRETATION');
console.log('═'.repeat(70));

const overallP = pairedTTest(runs.map(r => r.formula.fairness), runs.map(r => r.roundRobin.fairness));
const overallD = cohenD(runs.map(r => r.formula.fairness), runs.map(r => r.roundRobin.fairness));
const fMeanFairness = mean(runs.map(r => r.formula.fairness));
const fnbMeanFairness = mean(runs.map(r => r.formulaNoBuffer.fairness));
const rrMeanFairness = mean(runs.map(r => r.roundRobin.fairness));

const sigLabel = overallP < 0.001 ? 'highly significant' : overallP < 0.05 ? 'significant' : 'not significant';
const effectLabel = Math.abs(overallD) >= 0.8 ? 'large' : Math.abs(overallD) >= 0.5 ? 'medium' : Math.abs(overallD) >= 0.2 ? 'small' : 'negligible';
const winner = fMeanFairness > rrMeanFairness ? 'Formula' : 'Round Robin';

console.log(`\n  ${winner} achieves higher rolling fairness (${fmt(fMeanFairness)} vs ${fmt(rrMeanFairness)}).`);
console.log(`  The difference is ${sigLabel} (p=${fmtPValue(overallP)}) with ${effectLabel} effect size (d=${fmt(Math.abs(overallD), 2)}).`);
console.log(`  Formula wins ${pct(fWins)}% of runs across real schedule data with dynamic provider rosters.`);
console.log(`  Rolling fairness captures mid-shift balance, not just end-of-shift state.`);
console.log();
console.log(`  BUFFER ABLATION SUMMARY:`);
console.log(`  Capacity routing alone scores ${fmt(fnbMeanFairness)} (vs full formula ${fmt(fMeanFairness)}, RR ${fmt(rrMeanFairness)}).`);
const totalDelta = fMeanFairness - rrMeanFairness;
const capDelta = fnbMeanFairness - rrMeanFairness;
const bufDelta = fMeanFairness - fnbMeanFairness;
if (totalDelta > 0) {
  console.log(`  Of the +${fmt(totalDelta, 2)} total improvement:`);
  console.log(`    ${fmt(capDelta / totalDelta * 100, 1)}% from capacity-aware routing (+${fmt(capDelta, 2)} pts)`);
  console.log(`    ${fmt(bufDelta / totalDelta * 100, 1)}% from buffer cooldowns (+${fmt(bufDelta, 2)} pts)`);
}
console.log();
