/**
 * Sanity checks for log back-loaded decay (V3 benchmark prerequisite).
 *
 * Usage:
 *   cd "Capacity Conscious Triage" && npx tsx scripts/test-log-back-loaded.ts
 *
 * Exits 0 if all assertions pass, 1 otherwise.
 */

import type { Patient } from '../src/types';
import { getDecayedAcuityWeight } from '../src/engine/recommendation';
import type { ScoringOverrides } from '../src/engine/recommendation';
import { logBackLoadedWeight, buildLogBackSteps, buildDecaySchedule } from './decay-schedule-benchmark';

let passed = 0;
let failed = 0;

function assert(cond: boolean, label: string, detail?: string): void {
  if (cond) {
    passed++;
    console.log(`  PASS  ${label}`);
  } else {
    failed++;
    console.log(`  FAIL  ${label}${detail ? `  [${detail}]` : ''}`);
  }
}

function near(actual: number, expected: number, tol: number): boolean {
  return Math.abs(actual - expected) <= tol;
}

const MIN = 60 * 1000;

console.log('\n── Test 1: endpoints at t=0, t=T, t>T ─────────────────');
for (const k of [1, 3, 9]) {
  const T = 90 * MIN;
  assert(logBackLoadedWeight(4, 0, T, k) === 4, `k=${k}  w(0) === 4`);
  assert(logBackLoadedWeight(4, T, T, k) === 0, `k=${k}  w(T) === 0`);
  assert(logBackLoadedWeight(4, T + MIN, T, k) === 0, `k=${k}  w(T+1min) === 0`);
}

console.log('\n── Test 2: D6 Red reference table (W0=4, T=90min) ──────');
// Canonical values from stated formula `w(t) = W0 * ln(1 + k(1 - t/T)) / ln(1 + k)`,
// verified in Python. These SUPERSEDE the transcription-error values in the original
// CLAUDE_CODE_HANDOFF_decay_v3.md lines 46-55; the handoff is being updated to match.
type Ref = { tMin: number; k1: number; k3: number; k9: number };
const REF: Ref[] = [
  { tMin: 0,  k1: 4.0000, k3: 4.0000, k9: 4.0000 },
  { tMin: 1,  k1: 3.9679, k3: 3.9759, k9: 3.9825 },
  { tMin: 3,  k1: 3.9030, k3: 3.9269, k9: 3.9471 },
  { tMin: 15, k1: 3.4979, k3: 3.6147, k9: 3.7177 },
  { tMin: 45, k1: 2.3399, k3: 2.6439, k9: 2.9615 },
  { tMin: 75, k1: 0.8896, k3: 1.1699, k9: 1.5918 },
  { tMin: 89, k1: 0.0638, k3: 0.0946, k9: 0.1656 },
  { tMin: 90, k1: 0.0000, k3: 0.0000, k9: 0.0000 },
];
const T90 = 90 * MIN;
for (const r of REF) {
  const t = r.tMin * MIN;
  const w1 = logBackLoadedWeight(4, t, T90, 1);
  const w3 = logBackLoadedWeight(4, t, T90, 3);
  const w9 = logBackLoadedWeight(4, t, T90, 9);
  assert(near(w1, r.k1, 0.001), `t=${r.tMin}m k=1 w≈${r.k1}`, `got ${w1.toFixed(4)}`);
  assert(near(w3, r.k3, 0.001), `t=${r.tMin}m k=3 w≈${r.k3}`, `got ${w3.toFixed(4)}`);
  assert(near(w9, r.k9, 0.001), `t=${r.tMin}m k=9 w≈${r.k9}`, `got ${w9.toFixed(4)}`);
}

console.log('\n── Test 3: engine round-trip (grid + off-grid) ──────────');
// Build the decaySteps for a logBack-k9 Red patient on a 90-min window
const ds = buildLogBackSteps(4, 90, 9);
const mockOv: ScoringOverrides = {
  acuityWeights: { tier_one: 4, tier_two: 2, tier_three: 1 },
  decaySteps: {
    tier_one: ds,
    tier_two: ds,
    tier_three: ds,
  },
};
const mockPatient = (assignedAt: number): Patient => ({
  id: 'p1',
  acuity: 'tier_one',
  assignedTeamId: 1,
  assignedAt,
});

// Grid points: should match continuous formula within 1e-9 (pinned samples)
for (const tMin of [15, 30, 45, 60, 75, 90]) {
  const t = tMin * MIN;
  const continuous = logBackLoadedWeight(4, t, T90, 9);
  const engine = getDecayedAcuityWeight(mockPatient(0), t, mockOv);
  assert(near(engine, continuous, 1e-9), `grid t=${tMin}m engine==continuous`, `engine=${engine.toFixed(6)} cont=${continuous.toFixed(6)}`);
}

// Off-grid points: loose bound verifies qualitative fidelity
for (const tMin of [22, 52, 68]) {
  const t = tMin * MIN;
  const continuous = logBackLoadedWeight(4, t, T90, 9);
  const engine = getDecayedAcuityWeight(mockPatient(0), t, mockOv);
  assert(near(engine, continuous, 0.1), `off-grid t=${tMin}m engine≈continuous (tol 0.1)`, `engine=${engine.toFixed(4)} cont=${continuous.toFixed(4)}`);
}

console.log('\n── Test 4: decaySteps endpoint pinned to exactly 0 ───────');
const lastK9 = buildLogBackSteps(4, 90, 9).at(-1)!;
assert(lastK9.afterMs === 90 * MIN, 'last.afterMs === 90min', `got ${lastK9.afterMs}`);
assert(lastK9.weight === 0, 'last.weight === 0 (exact)', `got ${lastK9.weight}`);

// Also check when zeroMin isn't a multiple of STEP_MIN (e.g. 0.75x tier_three = 90min — still divisible; try 1.5x tier_three = 180min — also divisible; try a contrived 20min T that's not a STEP_MIN multiple)
const lastContrived = buildLogBackSteps(4, 20, 3).at(-1)!;
assert(lastContrived.afterMs === 20 * MIN, 'contrived last.afterMs === 20min (not STEP_MIN multiple)', `got ${lastContrived.afterMs}`);
assert(lastContrived.weight === 0, 'contrived last.weight === 0', `got ${lastContrived.weight}`);

console.log('\n── Test 5: curvature preserved (logBack ≠ linear) ────────');
// At t=T/2, linear = W0/2 = 2.0. logBack-k1 should be W0 * ln(1.5)/ln(2) ≈ 2.340.
// This catches the V2 bug where single-endpoint schedules collapsed to linear.
const mid = logBackLoadedWeight(4, 45 * MIN, T90, 1);
const expectedMid = 4 * Math.log(1.5) / Math.log(2);  // ≈ 2.3398
assert(near(mid, expectedMid, 1e-6), `logBack-k=1 at t=T/2 ≈ ${expectedMid.toFixed(4)} (not 2.0)`, `got ${mid.toFixed(4)}`);
assert(!near(mid, 2.0, 0.01), 'logBack-k=1 distinguishable from Linear at t=T/2');

console.log('\n── Test 6: buildDecaySchedule dispatches logBack correctly');
const sched = buildDecaySchedule({ t1: 4, t2: 2, t3: 1 }, 0.75, 'logBack', 3);
assert(sched.tier_one.length > 1, 'tier_one has multiple samples');
assert(sched.tier_one.at(-1)!.weight === 0, 'tier_one endpoint is 0');
assert(sched.tier_one.at(-1)!.afterMs === 180 * MIN, 'tier_one zero time = 240*0.75 = 180min');

// Missing logBackK should throw
let threw = false;
try {
  buildDecaySchedule({ t1: 4, t2: 2, t3: 1 }, 0.75, 'logBack');
} catch {
  threw = true;
}
assert(threw, 'buildDecaySchedule throws when logBackK is missing');

console.log('\n───────────────────────────────────────────────────────');
console.log(`  ${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
