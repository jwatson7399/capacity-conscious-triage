/**
 * Acuity-by-Capacity Benchmark
 *
 * Runs the benchmark simulator and records how Red (tier_one), Yellow (tier_two),
 * and Purple (tier_three) patients are distributed across teams, then correlates
 * that with each team's starting capacity.
 *
 * Question: Do higher-capacity teams receive more Red patients under formula-driven triage?
 *
 * Usage: npx tsx scripts/acuity-by-capacity.ts
 */

import type { Provider, ProviderType, ProviderStatus, TeamId, SimOverrides, SimStatusChangeEntry, ShadowEntry } from '../src/types';
import { generateTimeline, runShadowSim, getDefaultOverrides } from '../src/engine/simulation';
import { getEffectiveCapacity } from '../src/engine/recommendation';

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

function getTeamCapacities(providers: Provider[], baseTime: number, overrides: SimOverrides): Record<number, number> {
  const caps: Record<number, number> = {};
  for (const teamId of [1, 2, 3, 4] as TeamId[]) {
    const teamProviders = providers.filter(p => p.teamId === teamId);
    caps[teamId] = getEffectiveCapacity(teamProviders, baseTime, {
      capacityWeights: overrides.capacityWeights,
      statusMultipliers: overrides.statusMultipliers,
    });
  }
  return caps;
}

// ── Formatting helpers ───────────────────────────────────────────────

function pad(s: string, n: number): string {
  return s.length >= n ? s : s + ' '.repeat(n - s.length);
}
function rpad(s: string, n: number): string {
  return s.length >= n ? s : ' '.repeat(n - s.length) + s;
}

// ── Accumulator types ────────────────────────────────────────────────

interface TeamAcuityAccum {
  capacity: number;
  red: number;
  yellow: number;
  purple: number;
  total: number;
  runs: number;
}

// ── Main ─────────────────────────────────────────────────────────────

console.log('Acuity-by-Capacity Benchmark: Do higher-capacity teams get more Red patients?');
console.log(`Seeds: 1–${NUM_SEEDS} | Shift: 8h | ${PRESETS.length} presets\n`);

for (const preset of PRESETS) {
  process.stdout.write(`Running ${preset.name}...`);

  const overrides = getDefaultOverrides();
  if (preset.arrivalRatePerHour != null) overrides.arrivalRatePerHour = preset.arrivalRatePerHour;
  if (preset.acuityDistribution) overrides.acuityDistribution = preset.acuityDistribution;

  const permanentlyClosed = preset.closedTeams ?? [];
  const closedTeams = buildClosedTeams(preset, BASE_TIME);

  // Accumulate per-team stats across all seeds
  const formulaAccum: Record<number, TeamAcuityAccum> = {};
  const rrAccum: Record<number, TeamAcuityAccum> = {};

  // Get initial capacities (same for all seeds)
  const baseProviders = buildProviders(preset.providers, BASE_TIME);
  const teamCaps = getTeamCapacities(baseProviders, BASE_TIME, overrides);

  const activeTeams = [1, 2, 3, 4].filter(t => !permanentlyClosed.includes(t));
  for (const t of activeTeams) {
    formulaAccum[t] = { capacity: teamCaps[t], red: 0, yellow: 0, purple: 0, total: 0, runs: 0 };
    rrAccum[t] = { capacity: teamCaps[t], red: 0, yellow: 0, purple: 0, total: 0, runs: 0 };
  }

  for (let seed = 1; seed <= NUM_SEEDS; seed++) {
    const timeline = generateTimeline(seed, SHIFT_DURATION_MS, overrides, BASE_TIME);
    const statusChanges = buildStatusChanges(preset, BASE_TIME);

    for (const mode of ['formula', 'round_robin'] as const) {
      const modeProviders = buildProviders(preset.providers, BASE_TIME);
      const result = runShadowSim(
        modeProviders, timeline, closedTeams, permanentlyClosed,
        overrides, BASE_TIME, mode, statusChanges,
      );

      const accum = mode === 'formula' ? formulaAccum : rrAccum;
      for (const entry of result.entries) {
        const t = entry.teamId;
        if (!accum[t]) continue;
        accum[t].runs = NUM_SEEDS; // will set at end
        accum[t].total++;
        if (entry.acuity === 'tier_one') accum[t].red++;
        else if (entry.acuity === 'tier_two') accum[t].yellow++;
        else accum[t].purple++;
      }
    }
  }

  process.stdout.write(' done\n');

  // Sort teams by capacity descending
  const sortedTeams = activeTeams.slice().sort((a, b) => teamCaps[b] - teamCaps[a]);

  console.log(`\n${'═'.repeat(90)}`);
  console.log(`  PRESET: ${preset.name} — "${preset.label}" (${NUM_SEEDS} runs)`);
  console.log('═'.repeat(90));

  // Print team capacities
  console.log('\nTeam capacities (initial):');
  for (const t of sortedTeams) {
    console.log(`  Team ${t}: ${teamCaps[t].toFixed(1)}`);
  }

  // Print FORMULA results
  console.log('\n── FORMULA-DRIVEN ─────────────────────────────────────────');
  console.log(
    pad('Team', 8) +
    rpad('Capacity', 10) +
    rpad('Red', 8) +
    rpad('Yellow', 8) +
    rpad('Purple', 8) +
    rpad('Total', 8) +
    rpad('Red %', 8) +
    rpad('Red/Cap', 10)
  );
  console.log('-'.repeat(68));
  for (const t of sortedTeams) {
    const a = formulaAccum[t];
    const avgRed = a.red / NUM_SEEDS;
    const avgYellow = a.yellow / NUM_SEEDS;
    const avgPurple = a.purple / NUM_SEEDS;
    const avgTotal = a.total / NUM_SEEDS;
    const redPct = a.total > 0 ? (a.red / a.total * 100).toFixed(1) : '0.0';
    const redPerCap = a.capacity > 0 ? (avgRed / a.capacity).toFixed(2) : 'N/A';
    console.log(
      pad(`Team ${t}`, 8) +
      rpad(a.capacity.toFixed(1), 10) +
      rpad(avgRed.toFixed(1), 8) +
      rpad(avgYellow.toFixed(1), 8) +
      rpad(avgPurple.toFixed(1), 8) +
      rpad(avgTotal.toFixed(1), 8) +
      rpad(redPct + '%', 8) +
      rpad(redPerCap, 10)
    );
  }

  // Print ROUND-ROBIN results
  console.log('\n── ROUND-ROBIN ────────────────────────────────────────────');
  console.log(
    pad('Team', 8) +
    rpad('Capacity', 10) +
    rpad('Red', 8) +
    rpad('Yellow', 8) +
    rpad('Purple', 8) +
    rpad('Total', 8) +
    rpad('Red %', 8) +
    rpad('Red/Cap', 10)
  );
  console.log('-'.repeat(68));
  for (const t of sortedTeams) {
    const a = rrAccum[t];
    const avgRed = a.red / NUM_SEEDS;
    const avgYellow = a.yellow / NUM_SEEDS;
    const avgPurple = a.purple / NUM_SEEDS;
    const avgTotal = a.total / NUM_SEEDS;
    const redPct = a.total > 0 ? (a.red / a.total * 100).toFixed(1) : '0.0';
    const redPerCap = a.capacity > 0 ? (avgRed / a.capacity).toFixed(2) : 'N/A';
    console.log(
      pad(`Team ${t}`, 8) +
      rpad(a.capacity.toFixed(1), 10) +
      rpad(avgRed.toFixed(1), 8) +
      rpad(avgYellow.toFixed(1), 8) +
      rpad(avgPurple.toFixed(1), 8) +
      rpad(avgTotal.toFixed(1), 8) +
      rpad(redPct + '%', 8) +
      rpad(redPerCap, 10)
    );
  }

  // Compute discrepancy: formula Red share vs round-robin Red share
  console.log('\n── DISCREPANCY (Formula vs Round-Robin Red distribution) ──');
  console.log(
    pad('Team', 8) +
    rpad('Capacity', 10) +
    rpad('F Red/run', 10) +
    rpad('RR Red/run', 12) +
    rpad('Δ Red', 8) +
    rpad('F Red%', 8) +
    rpad('RR Red%', 9)
  );
  console.log('-'.repeat(65));
  for (const t of sortedTeams) {
    const fRed = formulaAccum[t].red / NUM_SEEDS;
    const rrRed = rrAccum[t].red / NUM_SEEDS;
    const fRedPct = formulaAccum[t].total > 0 ? (formulaAccum[t].red / formulaAccum[t].total * 100).toFixed(1) : '0.0';
    const rrRedPct = rrAccum[t].total > 0 ? (rrAccum[t].red / rrAccum[t].total * 100).toFixed(1) : '0.0';
    console.log(
      pad(`Team ${t}`, 8) +
      rpad(teamCaps[t].toFixed(1), 10) +
      rpad(fRed.toFixed(1), 10) +
      rpad(rrRed.toFixed(1), 12) +
      rpad((fRed - rrRed >= 0 ? '+' : '') + (fRed - rrRed).toFixed(1), 8) +
      rpad(fRedPct + '%', 8) +
      rpad(rrRedPct + '%', 9)
    );
  }
}

// ── Cross-preset correlation summary ─────────────────────────────────

console.log(`\n${'═'.repeat(90)}`);
console.log('  CROSS-PRESET SUMMARY: Capacity vs Red Patient Share (Formula mode)');
console.log('═'.repeat(90));
console.log('\nFor each preset, teams are ranked by capacity. Does higher capacity → more Red patients?\n');

console.log(
  pad('Preset', 22) +
  pad('Highest-Cap Team', 20) +
  rpad('Its Red%', 10) +
  pad('Lowest-Cap Team', 20) +
  rpad('Its Red%', 10) +
  rpad('Gap', 8)
);
console.log('-'.repeat(90));

for (const preset of PRESETS) {
  const overrides = getDefaultOverrides();
  if (preset.arrivalRatePerHour != null) overrides.arrivalRatePerHour = preset.arrivalRatePerHour;
  if (preset.acuityDistribution) overrides.acuityDistribution = preset.acuityDistribution;

  const permanentlyClosed = preset.closedTeams ?? [];
  const closedTeams = buildClosedTeams(preset, BASE_TIME);
  const baseProviders = buildProviders(preset.providers, BASE_TIME);
  const teamCaps = getTeamCapacities(baseProviders, BASE_TIME, overrides);
  const activeTeams = [1, 2, 3, 4].filter(t => !permanentlyClosed.includes(t));

  const teamTotals: Record<number, { red: number; total: number }> = {};
  for (const t of activeTeams) teamTotals[t] = { red: 0, total: 0 };

  for (let seed = 1; seed <= NUM_SEEDS; seed++) {
    const timeline = generateTimeline(seed, SHIFT_DURATION_MS, overrides, BASE_TIME);
    const statusChanges = buildStatusChanges(preset, BASE_TIME);
    const modeProviders = buildProviders(preset.providers, BASE_TIME);
    const result = runShadowSim(
      modeProviders, timeline, closedTeams, permanentlyClosed,
      overrides, BASE_TIME, 'formula', statusChanges,
    );
    for (const entry of result.entries) {
      if (!teamTotals[entry.teamId]) continue;
      teamTotals[entry.teamId].total++;
      if (entry.acuity === 'tier_one') teamTotals[entry.teamId].red++;
    }
  }

  const sorted = activeTeams.slice().sort((a, b) => teamCaps[b] - teamCaps[a]);
  const highest = sorted[0];
  const lowest = sorted[sorted.length - 1];
  const hPct = teamTotals[highest].total > 0 ? (teamTotals[highest].red / teamTotals[highest].total * 100) : 0;
  const lPct = teamTotals[lowest].total > 0 ? (teamTotals[lowest].red / teamTotals[lowest].total * 100) : 0;

  console.log(
    pad(preset.label, 22) +
    pad(`Team ${highest} (cap ${teamCaps[highest].toFixed(0)})`, 20) +
    rpad(hPct.toFixed(1) + '%', 10) +
    pad(`Team ${lowest} (cap ${teamCaps[lowest].toFixed(0)})`, 20) +
    rpad(lPct.toFixed(1) + '%', 10) +
    rpad((hPct - lPct >= 0 ? '+' : '') + (hPct - lPct).toFixed(1) + 'pp', 8)
  );
}

console.log('\nDone.');
