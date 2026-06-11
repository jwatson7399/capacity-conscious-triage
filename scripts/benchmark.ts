/**
 * Formula vs Round-Robin Statistical Benchmark
 *
 * Runs 200 seeded simulations per preset through both assignment modes
 * and reports statistical comparisons (paired t-test, Cohen's d, win/loss).
 *
 * Usage: npx tsx scripts/benchmark.ts
 */

import type { Provider, ProviderType, ProviderStatus, TeamId, SimOverrides, SimStatusChangeEntry } from '../src/types';
import { generateTimeline, runShadowSim, getDefaultOverrides } from '../src/engine/simulation';
import { statsFromEntries, computeFairness } from '../src/engine/fairness';
import { getEffectiveCapacity } from '../src/engine/recommendation';

// ── Preset definitions (mirror SimulationSetup.tsx) ──────────────────

interface ProviderDef {
  type: ProviderType;
  teamId: TeamId;
  status?: ProviderStatus;
  statusMinutes?: number;
}

interface ScheduledChange {
  providerIndex: number;
  atMinutes: number;
  status: ProviderStatus;
  durationMinutes: number;
}

interface PresetDef {
  name: string;
  label: string;
  providers: ProviderDef[];
  arrivalRatePerHour?: number;
  acuityDistribution?: { tier_one: number; tier_two: number; tier_three: number };
  closedTeams?: number[];
  scheduledChanges?: ScheduledChange[];
}

const PRESETS: PresetDef[] = [
  {
    name: 'typical_day',
    label: 'Typical Day',
    providers: [
      { type: 'attending', teamId: 1 },
      { type: 'senior_resident', teamId: 1 },
      { type: 'junior_resident', teamId: 1 },
      { type: 'pa', teamId: 1 },
      { type: 'attending', teamId: 2 },
      { type: 'senior_resident', teamId: 2 },
      { type: 'pa', teamId: 2 },
      { type: 'attending', teamId: 3 },
      { type: 'junior_resident', teamId: 3 },
      { type: 'rotator', teamId: 3 },
      { type: 'attending', teamId: 4 },
      { type: 'junior_resident', teamId: 4 },
    ],
  },
  {
    name: 'uneven_staffing',
    label: 'Sporadic Staffing',
    providers: [
      { type: 'attending', teamId: 1 },
      { type: 'senior_resident', teamId: 1 },
      { type: 'pa', teamId: 1 },
      { type: 'junior_resident', teamId: 1 },
      { type: 'attending', teamId: 2 },
      { type: 'senior_resident', teamId: 2 },
      { type: 'junior_resident', teamId: 2, status: 'off_floor', statusMinutes: 420 },
      { type: 'attending', teamId: 3 },
      { type: 'rotator', teamId: 3 },
      { type: 'attending', teamId: 4 },
      { type: 'junior_resident', teamId: 4 },
    ],
    scheduledChanges: [
      { providerIndex: 5, atMinutes: 360, status: 'off_floor', durationMinutes: 60 },
    ],
  },
  {
    name: 'mid_shift_chaos',
    label: 'Mid-Shift Chaos',
    arrivalRatePerHour: 5,
    providers: [
      { type: 'attending', teamId: 1, status: 'taking_signout', statusMinutes: 15 },
      { type: 'senior_resident', teamId: 1 },
      { type: 'junior_resident', teamId: 1 },
      { type: 'pa', teamId: 1 },
      { type: 'attending', teamId: 2 },
      { type: 'senior_resident', teamId: 2 },
      { type: 'pa', teamId: 2 },
      { type: 'attending', teamId: 3, status: 'off_floor', statusMinutes: 10 },
      { type: 'junior_resident', teamId: 3 },
      { type: 'rotator', teamId: 3 },
      { type: 'attending', teamId: 4 },
      { type: 'junior_resident', teamId: 4 },
    ],
  },
  {
    name: 'understaffed_night',
    label: 'Night Shift',
    arrivalRatePerHour: 2,
    closedTeams: [3, 4],
    providers: [
      { type: 'attending', teamId: 1 },
      { type: 'junior_resident', teamId: 1 },
      { type: 'pa', teamId: 1 },
      { type: 'attending', teamId: 2 },
      { type: 'senior_resident', teamId: 2 },
    ],
  },
  {
    name: 'high_acuity',
    label: 'High Acuity Day',
    arrivalRatePerHour: 6,
    acuityDistribution: { tier_one: 40, tier_two: 40, tier_three: 20 },
    providers: [
      { type: 'attending', teamId: 1 },
      { type: 'senior_resident', teamId: 1 },
      { type: 'junior_resident', teamId: 1 },
      { type: 'pa', teamId: 1 },
      { type: 'rotator', teamId: 1 },
      { type: 'attending', teamId: 2 },
      { type: 'senior_resident', teamId: 2 },
      { type: 'pa', teamId: 2 },
      { type: 'attending', teamId: 3 },
      { type: 'junior_resident', teamId: 3 },
      { type: 'attending', teamId: 4 },
      { type: 'senior_resident', teamId: 4 },
    ],
  },
];

// ── Helpers ──────────────────────────────────────────────────────────

const SHIFT_DURATION_MS = 8 * 60 * 60 * 1000; // 8 hours
const NUM_SEEDS = 200;
const BASE_TIME = 1_700_000_000_000; // arbitrary epoch anchor

function buildProviders(defs: ProviderDef[], baseTime: number): Provider[] {
  return defs.map((d, i) => ({
    id: `sp${i}`,
    name: `Provider ${i}`,
    type: d.type,
    status: d.status ?? 'active',
    statusExpiresAt: d.statusMinutes != null ? baseTime + d.statusMinutes * 60_000 : null,
    teamId: d.teamId,
  }));
}

function buildStatusChanges(preset: PresetDef, baseTime: number): SimStatusChangeEntry[] {
  if (!preset.scheduledChanges) return [];
  return preset.scheduledChanges.map(sc => ({
    time: baseTime + sc.atMinutes * 60_000,
    providerId: `sp${sc.providerIndex}`,
    status: sc.status,
    durationMs: sc.durationMinutes * 60_000,
  }));
}

function buildClosedTeams(preset: PresetDef, baseTime: number): Record<number, number> {
  const ct: Record<number, number> = {};
  for (const t of preset.closedTeams ?? []) ct[t] = baseTime;
  return ct;
}

function getTeamCapacities(providers: Provider[], baseTime: number, overrides: SimOverrides): Record<number, number> {
  const caps: Record<number, number> = {};
  for (const teamId of [1, 2, 3, 4] as TeamId[]) {
    const teamProviders = providers.filter(p => p.teamId === teamId);
    const scoringOv = {
      capacityWeights: overrides.capacityWeights,
      statusMultipliers: overrides.statusMultipliers,
    };
    caps[teamId] = getEffectiveCapacity(teamProviders, baseTime, scoringOv);
  }
  return caps;
}

// ── Statistics ───────────────────────────────────────────────────────

function mean(arr: number[]): number {
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function stddev(arr: number[]): number {
  const m = mean(arr);
  return Math.sqrt(arr.reduce((s, v) => s + (v - m) ** 2, 0) / arr.length);
}

/** Paired two-tailed t-test. Returns p-value. */
function pairedTTest(a: number[], b: number[]): number {
  const n = a.length;
  const diffs = a.map((v, i) => v - b[i]);
  const dMean = mean(diffs);
  const dVar = diffs.reduce((s, d) => s + (d - dMean) ** 2, 0) / (n - 1);
  const se = Math.sqrt(dVar / n);
  if (se === 0) return dMean === 0 ? 1 : 0;
  const t = dMean / se;
  const df = n - 1;
  // Approximate p-value from t-distribution using normal approx for large df
  const absT = Math.abs(t);
  // Use regularized incomplete beta function approximation
  const p = 2 * tCDF(-absT, df);
  return Math.max(0, Math.min(1, p));
}

/** Approximate CDF of t-distribution (left tail) using Abramowitz & Stegun */
function tCDF(t: number, df: number): number {
  // Convert to normal for large df, else use approximation
  const x = df / (df + t * t);
  if (t >= 0) {
    return 1 - 0.5 * incompleteBeta(x, df / 2, 0.5);
  } else {
    return 0.5 * incompleteBeta(x, df / 2, 0.5);
  }
}

/** Regularized incomplete beta via continued fraction (sufficient for our needs) */
function incompleteBeta(x: number, a: number, b: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const lnBeta = lgamma(a) + lgamma(b) - lgamma(a + b);
  const front = Math.exp(Math.log(x) * a + Math.log(1 - x) * b - lnBeta);
  // Lentz's continued fraction
  let f = 1, c = 1, d = 1 - (a + b) * x / (a + 1);
  if (Math.abs(d) < 1e-30) d = 1e-30;
  d = 1 / d; f = d;
  for (let m = 1; m <= 200; m++) {
    // Even step
    let num = m * (b - m) * x / ((a + 2 * m - 1) * (a + 2 * m));
    d = 1 + num * d; if (Math.abs(d) < 1e-30) d = 1e-30; d = 1 / d;
    c = 1 + num / c; if (Math.abs(c) < 1e-30) c = 1e-30;
    f *= d * c;
    // Odd step
    num = -(a + m) * (a + b + m) * x / ((a + 2 * m) * (a + 2 * m + 1));
    d = 1 + num * d; if (Math.abs(d) < 1e-30) d = 1e-30; d = 1 / d;
    c = 1 + num / c; if (Math.abs(c) < 1e-30) c = 1e-30;
    f *= d * c;
    if (Math.abs(d * c - 1) < 1e-10) break;
  }
  return front * f / a;
}

/** Log-gamma via Lanczos approximation */
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

// ── Main benchmark ──────────────────────────────────────────────────

interface RunMetrics {
  fairness: number;
  avgRatio: number;
  minRatio: number;
  overwhelms: number;
}

function runPreset(preset: PresetDef): {
  formula: RunMetrics[];
  roundRobin: RunMetrics[];
} {
  const overrides = getDefaultOverrides();
  if (preset.arrivalRatePerHour != null) overrides.arrivalRatePerHour = preset.arrivalRatePerHour;
  if (preset.acuityDistribution) overrides.acuityDistribution = preset.acuityDistribution;

  const permanentlyClosed = preset.closedTeams ?? [];
  const closedTeams = buildClosedTeams(preset, BASE_TIME);

  const formula: RunMetrics[] = [];
  const roundRobin: RunMetrics[] = [];

  for (let seed = 1; seed <= NUM_SEEDS; seed++) {
    const providers = buildProviders(preset.providers, BASE_TIME);
    const statusChanges = buildStatusChanges(preset, BASE_TIME);
    const timeline = generateTimeline(seed, SHIFT_DURATION_MS, overrides, BASE_TIME);
    const teamCaps = getTeamCapacities(providers, BASE_TIME, overrides);

    for (const mode of ['formula', 'round_robin'] as const) {
      // Fresh provider copies per mode
      const modeProviders = buildProviders(preset.providers, BASE_TIME);
      const result = runShadowSim(
        modeProviders, timeline, closedTeams, permanentlyClosed,
        overrides, BASE_TIME, mode, statusChanges,
      );
      const stats = statsFromEntries(result.entries);
      const fairness = computeFairness(stats, permanentlyClosed, teamCaps);
      const metrics: RunMetrics = {
        fairness,
        avgRatio: stats.avgRatio,
        minRatio: stats.minRatio === Infinity ? 0 : stats.minRatio,
        overwhelms: stats.redZoneEvents,
      };
      if (mode === 'formula') formula.push(metrics);
      else roundRobin.push(metrics);
    }
  }

  return { formula, roundRobin };
}

function printPresetReport(preset: PresetDef, f: RunMetrics[], rr: RunMetrics[]) {
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  PRESET: ${preset.name} — "${preset.label}" (${NUM_SEEDS} runs)`);
  console.log('═'.repeat(60));

  const metrics: { label: string; key: keyof RunMetrics; higherBetter: boolean }[] = [
    { label: 'Fairness Score', key: 'fairness', higherBetter: true },
    { label: 'Avg Ratio', key: 'avgRatio', higherBetter: true },
    { label: 'Min Ratio', key: 'minRatio', higherBetter: true },
    { label: 'Overwhelms', key: 'overwhelms', higherBetter: false },
  ];

  console.log(
    pad('', 18) +
    rpad('Formula', 18) +
    rpad('Round Robin', 18) +
    rpad('Δ (F-RR)', 12) +
    rpad('p-value', 10) +
    rpad("Cohen's d", 10)
  );
  console.log('-'.repeat(86));

  let fWins = 0, rrWins = 0, ties = 0;

  for (const m of metrics) {
    const fVals = f.map(r => r[m.key]);
    const rrVals = rr.map(r => r[m.key]);
    const delta = mean(fVals) - mean(rrVals);
    const p = pairedTTest(fVals, rrVals);
    const d = cohenD(fVals, rrVals);

    console.log(
      pad(m.label, 18) +
      rpad(fmtMeanStd(fVals), 18) +
      rpad(fmtMeanStd(rrVals), 18) +
      rpad((delta >= 0 ? '+' : '') + fmt(delta, 2), 12) +
      rpad(fmtPValue(p), 10) +
      rpad(fmt(Math.abs(d), 2), 10)
    );
  }

  // Win/loss on fairness
  for (let i = 0; i < NUM_SEEDS; i++) {
    const diff = f[i].fairness - rr[i].fairness;
    if (Math.abs(diff) < 0.01) ties++;
    else if (diff > 0) fWins++;
    else rrWins++;
  }
  const pct = (n: number) => ((n / NUM_SEEDS) * 100).toFixed(0);
  console.log(
    `\nFormula wins: ${fWins}/${NUM_SEEDS} (${pct(fWins)}%)  |  ` +
    `RR wins: ${rrWins}/${NUM_SEEDS} (${pct(rrWins)}%)  |  ` +
    `Ties: ${ties}/${NUM_SEEDS} (${pct(ties)}%)`
  );
}

// ── Run ─────────────────────────────────────────────────────────────

console.log('Formula vs Round-Robin Benchmark');
console.log(`Seeds: 1–${NUM_SEEDS} | Shift: 8h | ${PRESETS.length} presets\n`);

const allFormula: RunMetrics[] = [];
const allRR: RunMetrics[] = [];

for (const preset of PRESETS) {
  process.stdout.write(`Running ${preset.name}...`);
  const { formula, roundRobin } = runPreset(preset);
  allFormula.push(...formula);
  allRR.push(...roundRobin);
  process.stdout.write(' done\n');
  printPresetReport(preset, formula, roundRobin);
}

// Overall summary
console.log(`\n${'═'.repeat(60)}`);
console.log(`  OVERALL SUMMARY (${PRESETS.length * NUM_SEEDS} total runs)`);
console.log('═'.repeat(60));

const metrics: { label: string; key: keyof RunMetrics }[] = [
  { label: 'Fairness Score', key: 'fairness' },
  { label: 'Avg Ratio', key: 'avgRatio' },
  { label: 'Min Ratio', key: 'minRatio' },
  { label: 'Overwhelms', key: 'overwhelms' },
];

console.log(
  pad('', 18) +
  rpad('Formula', 18) +
  rpad('Round Robin', 18) +
  rpad('Δ (F-RR)', 12) +
  rpad('p-value', 10) +
  rpad("Cohen's d", 10)
);
console.log('-'.repeat(86));

for (const m of metrics) {
  const fVals = allFormula.map(r => r[m.key]);
  const rrVals = allRR.map(r => r[m.key]);
  const delta = mean(fVals) - mean(rrVals);
  const p = pairedTTest(fVals, rrVals);
  const d = cohenD(fVals, rrVals);
  console.log(
    pad(m.label, 18) +
    rpad(fmtMeanStd(fVals), 18) +
    rpad(fmtMeanStd(rrVals), 18) +
    rpad((delta >= 0 ? '+' : '') + fmt(delta, 2), 12) +
    rpad(fmtPValue(p), 10) +
    rpad(fmt(Math.abs(d), 2), 10)
  );
}

let totalFWins = 0, totalRRWins = 0, totalTies = 0;
for (let i = 0; i < allFormula.length; i++) {
  const diff = allFormula[i].fairness - allRR[i].fairness;
  if (Math.abs(diff) < 0.01) totalTies++;
  else if (diff > 0) totalFWins++;
  else totalRRWins++;
}
const total = allFormula.length;
const pct = (n: number) => ((n / total) * 100).toFixed(0);
console.log(
  `\nFormula wins: ${totalFWins}/${total} (${pct(totalFWins)}%)  |  ` +
  `RR wins: ${totalRRWins}/${total} (${pct(totalRRWins)}%)  |  ` +
  `Ties: ${totalTies}/${total} (${pct(totalTies)}%)`
);
