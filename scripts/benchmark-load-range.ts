/**
 * Load Range (RP) Benchmark — Temporary Investigation
 *
 * Measures max-min of acuity-weighted patient load across eligible teams
 * for formula vs round-robin across 200 seeded shifts × 5 presets.
 *
 * Usage: npx tsx scripts/benchmark-load-range.ts
 */

import type { Provider, ProviderType, ProviderStatus, TeamId, SimOverrides, SimStatusChangeEntry } from '../src/types';
import { generateTimeline, runShadowSim, getDefaultOverrides } from '../src/engine/simulation';
import { ACUITY_WEIGHTS } from '../src/constants';

// ── Preset definitions (same as benchmark.ts) ───────────────────────

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

const SHIFT_DURATION_MS = 8 * 60 * 60 * 1000;
const NUM_SEEDS = 200;
const BASE_TIME = 1_700_000_000_000;

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

/** Compute acuity-weighted load for a team from teamAcuityLoad entry */
function weightedLoad(acuity: { tier_one: number; tier_two: number; tier_three: number }): number {
  return (
    acuity.tier_one * ACUITY_WEIGHTS.tier_one +
    acuity.tier_two * ACUITY_WEIGHTS.tier_two +
    acuity.tier_three * ACUITY_WEIGHTS.tier_three
  );
}

/** Compute load range (max - min weighted load) across eligible teams */
function loadRange(
  teamAcuityLoad: Record<number, { tier_one: number; tier_two: number; tier_three: number }>,
  closedTeams: number[],
): number {
  const eligible = ([1, 2, 3, 4] as number[]).filter(t => !closedTeams.includes(t));
  if (eligible.length < 2) return 0;
  const loads = eligible.map(t => weightedLoad(teamAcuityLoad[t] ?? { tier_one: 0, tier_two: 0, tier_three: 0 }));
  return Math.max(...loads) - Math.min(...loads);
}

// ── Stats ────────────────────────────────────────────────────────────

function mean(arr: number[]): number {
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function stddev(arr: number[]): number {
  const m = mean(arr);
  return Math.sqrt(arr.reduce((s, v) => s + (v - m) ** 2, 0) / arr.length);
}

// ── Formatting ───────────────────────────────────────────────────────

function pad(s: string, n: number): string {
  return s.length >= n ? s : s + ' '.repeat(n - s.length);
}
function rpad(s: string, n: number): string {
  return s.length >= n ? s : ' '.repeat(n - s.length) + s;
}
function fmt(v: number, dec = 1): string {
  return v.toFixed(dec);
}

// ── Main ─────────────────────────────────────────────────────────────

console.log('Load Range (RP) Benchmark — Formula vs Round-Robin');
console.log(`Seeds: 1–${NUM_SEEDS} | Shift: 8h | ${PRESETS.length} presets\n`);

const allFormula: number[] = [];
const allRR: number[] = [];

for (const preset of PRESETS) {
  process.stdout.write(`Running ${preset.name}...`);
  const overrides = getDefaultOverrides();
  if (preset.arrivalRatePerHour != null) overrides.arrivalRatePerHour = preset.arrivalRatePerHour;
  if (preset.acuityDistribution) overrides.acuityDistribution = preset.acuityDistribution;

  const permanentlyClosed = preset.closedTeams ?? [];
  const closedTeams = buildClosedTeams(preset, BASE_TIME);

  const fRanges: number[] = [];
  const rrRanges: number[] = [];
  let fWins = 0, rrWins = 0, ties = 0;

  for (let seed = 1; seed <= NUM_SEEDS; seed++) {
    const timeline = generateTimeline(seed, SHIFT_DURATION_MS, overrides, BASE_TIME);
    const statusChanges = buildStatusChanges(preset, BASE_TIME);

    const fProviders = buildProviders(preset.providers, BASE_TIME);
    const fResult = runShadowSim(fProviders, timeline, closedTeams, permanentlyClosed, overrides, BASE_TIME, 'formula', statusChanges);
    const fRange = loadRange(fResult.teamAcuityLoad, permanentlyClosed);

    const rrProviders = buildProviders(preset.providers, BASE_TIME);
    const rrResult = runShadowSim(rrProviders, timeline, closedTeams, permanentlyClosed, overrides, BASE_TIME, 'round_robin', statusChanges);
    const rrRange = loadRange(rrResult.teamAcuityLoad, permanentlyClosed);

    fRanges.push(fRange);
    rrRanges.push(rrRange);

    const diff = fRange - rrRange;
    if (Math.abs(diff) < 0.01) ties++;
    else if (diff < 0) fWins++;  // lower range = better
    else rrWins++;
  }

  allFormula.push(...fRanges);
  allRR.push(...rrRanges);

  const delta = mean(fRanges) - mean(rrRanges);
  const pct = (n: number) => ((n / NUM_SEEDS) * 100).toFixed(0);

  process.stdout.write(' done\n');
  console.log(
    `  ${pad(preset.label, 20)} ` +
    `Formula: ${rpad(fmt(mean(fRanges), 2), 6)} ± ${rpad(fmt(stddev(fRanges), 2), 5)}  ` +
    `RR: ${rpad(fmt(mean(rrRanges), 2), 6)} ± ${rpad(fmt(stddev(rrRanges), 2), 5)}  ` +
    `Δ: ${(delta >= 0 ? '+' : '') + fmt(delta, 2)}  ` +
    `Formula lower: ${fWins}/${NUM_SEEDS} (${pct(fWins)}%)`
  );
}

// Overall
console.log(`\n${'─'.repeat(70)}`);
const total = allFormula.length;
const delta = mean(allFormula) - mean(allRR);
let fWinsTotal = 0, rrWinsTotal = 0, tiesTotal = 0;
for (let i = 0; i < total; i++) {
  const diff = allFormula[i] - allRR[i];
  if (Math.abs(diff) < 0.01) tiesTotal++;
  else if (diff < 0) fWinsTotal++;
  else rrWinsTotal++;
}
const pct = (n: number) => ((n / total) * 100).toFixed(0);
console.log(
  `OVERALL (${total} runs)  ` +
  `Formula: ${fmt(mean(allFormula), 2)} ± ${fmt(stddev(allFormula), 2)}  ` +
  `RR: ${fmt(mean(allRR), 2)} ± ${fmt(stddev(allRR), 2)}  ` +
  `Δ: ${(delta >= 0 ? '+' : '') + fmt(delta, 2)}`
);
console.log(
  `Formula lower (better): ${fWinsTotal}/${total} (${pct(fWinsTotal)}%)  |  ` +
  `RR lower: ${rrWinsTotal}/${total} (${pct(rrWinsTotal)}%)  |  ` +
  `Ties: ${tiesTotal}/${total} (${pct(tiesTotal)}%)`
);
