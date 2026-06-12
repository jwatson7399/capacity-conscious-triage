/**
 * Formula vs Round-Robin Statistical Benchmark
 *
 * Runs 200 seeded simulations per preset through both assignment modes
 * and reports per-metric statistical comparisons (paired t-test, Cohen's d,
 * per-metric win/loss). No composite score — each metric stands on its own,
 * matching the in-app sim summary and the methods paper.
 *
 * Usage: npx tsx scripts/benchmark.ts
 */

import type { Provider, ProviderType, ProviderStatus, TeamId, SimStatusChangeEntry } from '../src/types';
import { generateTimeline, runShadowSim, getDefaultOverrides } from '../src/engine/simulation';
import { statsFromEntries, countBackToBackHA, countSlams, countSpread, acuitySpread } from '../src/engine/fairness';
import { getEffectiveCapacity } from '../src/engine/recommendation';
import { ACUITY_WEIGHTS } from '../src/constants';

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
  redZone: number;            // arrivals landing on a team below the 8.5 red-zone boundary
  minRatio: number;           // lowest capacity ratio at any assignment
  avgRatio: number;           // mean capacity ratio across assignments
  b2bHA: number;              // back-to-back high-acuity (2 red/yellow to one team within 30 min)
  slams: number;              // 2+ patients to one team within 1 hr
  countSpread: number;        // max − min patients per eligible team (raw bodies — RR optimizes this)
  acuitySpread: number;       // max − min acuity-weighted (4:2:1) load per eligible team (raw)
  stressSpread: number;       // max − min of patients-per-strength across teams (capacity-conscious)
  acuityStressSpread: number; // max − min of acuity-load-per-strength across teams (capacity-conscious)
  avgRatioSpread: number;     // max − min of per-team mean capacity ratio at assignment
}

const METRIC_DEFS: { label: string; key: keyof RunMetrics; higherBetter: boolean; dec: number }[] = [
  { label: 'Red-Zone Arrivals', key: 'redZone', higherBetter: false, dec: 1 },
  { label: 'Min Capacity', key: 'minRatio', higherBetter: true, dec: 1 },
  { label: 'Avg Capacity', key: 'avgRatio', higherBetter: true, dec: 1 },
  { label: 'B2B High-Acuity', key: 'b2bHA', higherBetter: false, dec: 1 },
  { label: 'Slams', key: 'slams', higherBetter: false, dec: 1 },
  { label: 'Count Spread', key: 'countSpread', higherBetter: false, dec: 1 },
  { label: 'Acuity Spread', key: 'acuitySpread', higherBetter: false, dec: 1 },
  { label: 'Stress Spread', key: 'stressSpread', higherBetter: false, dec: 3 },
  { label: 'AcuityStress Sprd', key: 'acuityStressSpread', higherBetter: false, dec: 3 },
  { label: 'AvgRatio Spread', key: 'avgRatioSpread', higherBetter: false, dec: 1 },
];

function runPreset(preset: PresetDef): {
  formula: RunMetrics[];
  roundRobin: RunMetrics[];
} {
  const overrides = getDefaultOverrides();
  if (preset.arrivalRatePerHour != null) overrides.arrivalRatePerHour = preset.arrivalRatePerHour;
  if (preset.acuityDistribution) overrides.acuityDistribution = preset.acuityDistribution;

  const permanentlyClosed = preset.closedTeams ?? [];
  const closedTeams = buildClosedTeams(preset, BASE_TIME);
  const eligible = ([1, 2, 3, 4] as TeamId[]).filter(
    t => t !== 4 && !permanentlyClosed.includes(t)
  );

  // Steady-state team strength: evaluate far in the future so temporary
  // statuses (all presets use statusMinutes) have expired back to active.
  const scoringOv = { capacityWeights: overrides.capacityWeights, statusMultipliers: overrides.statusMultipliers };
  const steadyProviders = buildProviders(preset.providers, BASE_TIME);
  const steadyCaps: Record<number, number> = {};
  for (const t of eligible) {
    steadyCaps[t] = getEffectiveCapacity(steadyProviders.filter(p => p.teamId === t), BASE_TIME + SHIFT_DURATION_MS * 10, scoringOv);
  }

  const formula: RunMetrics[] = [];
  const roundRobin: RunMetrics[] = [];

  for (let seed = 1; seed <= NUM_SEEDS; seed++) {
    const statusChanges = buildStatusChanges(preset, BASE_TIME);
    const timeline = generateTimeline(seed, SHIFT_DURATION_MS, overrides, BASE_TIME);

    for (const mode of ['formula', 'round_robin'] as const) {
      // Fresh provider copies per mode
      const modeProviders = buildProviders(preset.providers, BASE_TIME);
      const result = runShadowSim(
        modeProviders, timeline, closedTeams, permanentlyClosed,
        overrides, BASE_TIME, mode, statusChanges,
      );
      const stats = statsFromEntries(result.entries);

      // Capacity-conscious spreads: workload per unit of team strength.
      const stress = eligible.map(t => (stats.teamCounts[t] ?? 0) / (steadyCaps[t] || 1));
      const acuityStress = eligible.map(t => {
        const al = stats.teamAcuityLoad[t];
        const load = al ? al.tier_one * ACUITY_WEIGHTS.tier_one + al.tier_two * ACUITY_WEIGHTS.tier_two + al.tier_three * ACUITY_WEIGHTS.tier_three : 0;
        return load / (steadyCaps[t] || 1);
      });
      const finiteAvgRatios = eligible.map(t => stats.avgRatioPerTeam[t]).filter(r => isFinite(r));

      const metrics: RunMetrics = {
        redZone: stats.redZoneEvents,
        minRatio: stats.minRatio === Infinity ? 0 : stats.minRatio,
        avgRatio: stats.avgRatio,
        b2bHA: countBackToBackHA(result.entries),
        slams: countSlams(result.entries),
        countSpread: countSpread(stats, eligible),
        acuitySpread: acuitySpread(stats, eligible),
        stressSpread: Math.max(...stress) - Math.min(...stress),
        acuityStressSpread: Math.max(...acuityStress) - Math.min(...acuityStress),
        avgRatioSpread: finiteAvgRatios.length > 0 ? Math.max(...finiteAvgRatios) - Math.min(...finiteAvgRatios) : 0,
      };
      if (mode === 'formula') formula.push(metrics);
      else roundRobin.push(metrics);
    }
  }

  return { formula, roundRobin };
}

/** Per-seed win/tie/loss for one metric (win = formula strictly better). */
function metricWinLoss(f: RunMetrics[], rr: RunMetrics[], key: keyof RunMetrics, higherBetter: boolean, eps = 0.01) {
  let wins = 0, losses = 0, ties = 0;
  for (let i = 0; i < f.length; i++) {
    const diff = f[i][key] - rr[i][key];
    if (Math.abs(diff) < eps) ties++;
    else if (higherBetter ? diff > 0 : diff < 0) wins++;
    else losses++;
  }
  return { wins, losses, ties };
}

function printReport(title: string, f: RunMetrics[], rr: RunMetrics[]) {
  const n = f.length;
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  ${title} (${n} runs)`);
  console.log('═'.repeat(60));

  console.log(
    pad('', 18) +
    rpad('Formula', 16) +
    rpad('Round Robin', 16) +
    rpad('Δ (F-RR)', 10) +
    rpad('p-value', 9) +
    rpad("Cohen's d", 10) +
    rpad('W/T/L', 16)
  );
  console.log('-'.repeat(95));

  for (const m of METRIC_DEFS) {
    const fVals = f.map(r => r[m.key]);
    const rrVals = rr.map(r => r[m.key]);
    const delta = mean(fVals) - mean(rrVals);
    const p = pairedTTest(fVals, rrVals);
    const d = cohenD(fVals, rrVals);
    const eps = m.dec >= 2 ? 0.001 : 0.01;
    const { wins, losses, ties } = metricWinLoss(f, rr, m.key, m.higherBetter, eps);
    const winPct = ((wins / n) * 100).toFixed(0);

    console.log(
      pad(m.label, 18) +
      rpad(fmtMeanStd(fVals, m.dec), 16) +
      rpad(fmtMeanStd(rrVals, m.dec), 16) +
      rpad((delta >= 0 ? '+' : '') + fmt(delta, m.dec + 1), 10) +
      rpad(fmtPValue(p), 9) +
      rpad(fmt(Math.abs(d), 2), 10) +
      rpad(` ${wins}/${ties}/${losses} (${winPct}%)`, 18)
    );
  }

  // Per-seed metric tally: which mode leads on more metrics in each shift?
  // Unweighted count — mirrors the in-app sim summary; not a composite score.
  const tally = (defs: typeof METRIC_DEFS, label: string) => {
    let fLeads = 0, rrLeads = 0, even = 0;
    for (let i = 0; i < n; i++) {
      let fCount = 0, rrCount = 0;
      for (const m of defs) {
        const diff = f[i][m.key] - rr[i][m.key];
        if (Math.abs(diff) < (m.dec >= 2 ? 0.001 : 0.01)) continue;
        if (m.higherBetter ? diff > 0 : diff < 0) fCount++;
        else rrCount++;
      }
      if (fCount > rrCount) fLeads++;
      else if (rrCount > fCount) rrLeads++;
      else even++;
    }
    const pct = (v: number) => ((v / n) * 100).toFixed(0);
    console.log(
      `${label}: formula leads ${fLeads}/${n} (${pct(fLeads)}%)  |  ` +
      `RR leads: ${rrLeads}/${n} (${pct(rrLeads)}%)  |  ` +
      `Even: ${even}/${n} (${pct(even)}%)`
    );
  };
  console.log('');
  tally(METRIC_DEFS, 'All 10 metrics');
  // Primary metrics: safety (red zone, min capacity) + capacity-conscious
  // workload equity (stress spread, acuity-stress spread).
  const PRIMARY: (keyof RunMetrics)[] = ['redZone', 'minRatio', 'stressSpread', 'acuityStressSpread'];
  tally(METRIC_DEFS.filter(m => PRIMARY.includes(m.key)), 'Primary 4 (safety + capacity-conscious equity)');
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
  printReport(`PRESET: ${preset.name} — "${preset.label}"`, formula, roundRobin);
}

printReport(`OVERALL SUMMARY — all presets pooled`, allFormula, allRR);
