import type { TeamId, AcuityTier, ShadowEntry } from '../types';
import { TRAUMA_TEAM_ID, RED_ZONE_THRESHOLD, ACUITY_WEIGHTS } from '../constants';

export interface ModeStats {
  teamCounts: Record<number, number>;
  avgRatio: number;
  minRatio: number;
  redZoneEvents: number;
  teamAcuityLoad: Record<number, { tier_one: number; tier_two: number; tier_three: number }>;
  avgRatioPerTeam: Record<number, number>;
}

/** Build ModeStats from a slice of ShadowEntry[] (up to arrivedCount) */
export function statsFromEntries(entries: ShadowEntry[]): ModeStats {
  const teamCounts: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };
  const teamAcuityLoad: Record<number, { tier_one: number; tier_two: number; tier_three: number }> = {
    1: { tier_one: 0, tier_two: 0, tier_three: 0 },
    2: { tier_one: 0, tier_two: 0, tier_three: 0 },
    3: { tier_one: 0, tier_two: 0, tier_three: 0 },
    4: { tier_one: 0, tier_two: 0, tier_three: 0 },
  };
  let totalRatio = 0;
  let minRatio = Infinity;
  let redZoneEvents = 0;
  const ratioSums: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };
  const ratioCounts: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };

  for (const e of entries) {
    teamCounts[e.teamId]++;
    teamAcuityLoad[e.teamId][e.acuity]++;
    totalRatio += e.ratioAtAssignment;
    if (e.ratioAtAssignment < minRatio) minRatio = e.ratioAtAssignment;
    if (e.ratioAtAssignment < RED_ZONE_THRESHOLD) redZoneEvents++;
    ratioSums[e.teamId] += e.ratioAtAssignment;
    ratioCounts[e.teamId]++;
  }

  const avgRatioPerTeam: Record<number, number> = {};
  for (const t of [1, 2, 3, 4]) {
    avgRatioPerTeam[t] = ratioCounts[t] > 0 ? ratioSums[t] / ratioCounts[t] : Infinity;
  }

  return {
    teamCounts,
    avgRatio: entries.length > 0 ? totalRatio / entries.length : 0,
    minRatio: entries.length > 0 ? minRatio : Infinity,
    redZoneEvents,
    teamAcuityLoad,
    avgRatioPerTeam,
  };
}

// --- Individual comparison metrics ---
// The simulation panels compare these one metric at a time; they show no composite
// score (a weighted composite hides the safety versus equity trade-off).
// countBackToBackHA and countSlams use the same definitions as the local copies in
// scripts/historical-replay.ts, scripts/real-schedule-benchmark.ts and
// scripts/decay-schedule-benchmark.ts.
//
// Assumptions shared by these helpers (June audit, 2026-09-28):
// - `entries` are in arrival order. The window checks compare each arrival with
//   earlier ones only; unsorted input gives wrong counts.
// - Windows are inclusive: arrivals exactly 30 min (B2B) or 60 min (slam) apart count.
// - B2B and slams count every entry, including any on Trauma; spreads use only the
//   `eligibleTeams` the caller passes (normally open A-side teams).
// - acuitySpread measures load with the model's ACUITY_WEIGHTS (4:2:1) at full arrival
//   weight, with no decay, whatever routing weights produced the entries.

const B2B_WINDOW_MS = 30 * 60 * 1000;
const SLAM_WINDOW_MS = 60 * 60 * 1000;

/** Back-to-back high acuity: a Red or Yellow arrival on a team that received another Red or Yellow within the prior 30 min (inclusive). */
export function countBackToBackHA(entries: ShadowEntry[]): number {
  let count = 0;
  const lastHA: Record<number, number> = {}; // teamId → arrivalTime
  for (const e of entries) {
    if (e.acuity === 'tier_one' || e.acuity === 'tier_two') {
      const prev = lastHA[e.teamId];
      if (prev !== undefined && e.arrivalTime - prev <= B2B_WINDOW_MS) count++;
      lastHA[e.teamId] = e.arrivalTime;
    }
  }
  return count;
}

/** Slams: an arrival on a team that already received a patient within the prior 60 min (inclusive). Counted once per arrival. */
export function countSlams(entries: ShadowEntry[]): number {
  let count = 0;
  const teamTimes: Record<number, number[]> = {};
  for (const e of entries) {
    const times = teamTimes[e.teamId] ?? [];
    if (times.some(prev => e.arrivalTime - prev <= SLAM_WINDOW_MS)) count++;
    times.push(e.arrivalTime);
    teamTimes[e.teamId] = times;
  }
  return count;
}

/** Count spread: max minus min patient count across the eligible teams. */
export function countSpread(stats: ModeStats, eligibleTeams: TeamId[]): number {
  if (eligibleTeams.length === 0) return 0;
  const counts = eligibleTeams.map(t => stats.teamCounts[t] ?? 0);
  return Math.max(...counts) - Math.min(...counts);
}

/** Acuity spread: max minus min of acuity-weighted arrivals (ACUITY_WEIGHTS, 4:2:1, no decay) across the eligible teams. */
export function acuitySpread(stats: ModeStats, eligibleTeams: TeamId[]): number {
  if (eligibleTeams.length === 0) return 0;
  const loads = eligibleTeams.map(t => {
    const al = stats.teamAcuityLoad[t];
    if (!al) return 0;
    return al.tier_one * ACUITY_WEIGHTS.tier_one + al.tier_two * ACUITY_WEIGHTS.tier_two + al.tier_three * ACUITY_WEIGHTS.tier_three;
  });
  return Math.max(...loads) - Math.min(...loads);
}

// --- Composite fairness score (benchmark scripts only; the app does not show it) ---
//
// Two versions (June audit and reconciliation, 2026-09-28; METHODS.md section 9):
//
// - v1, `computeFairnessDetailedV1` / `computeFairnessV1`: the original composite. Its
//   acuity-balance part weights arrivals 5:3:1 whatever the model uses. Every composite
//   figure recorded before 2026-09-28 was computed this way; use v1 to reproduce them.
// - v2, `computeFairnessDetailed` / `computeFairness`: acuity balance measured on the
//   model's weights. By default that is ACUITY_WEIGHTS (4:2:1), one fixed measurement
//   scale for every condition, so runs with experimental routing weights are still
//   compared on the same yardstick. A caller that wants each condition measured on its
//   own routing weights passes `acuityWeights` explicitly; that answers a different
//   question and must be labeled as such.
//
// Only the acuity-balance part (15% of the composite) differs between versions.

export type FairnessVersion = 'v1' | 'v2';
export const FAIRNESS_VERSION: FairnessVersion = 'v2';
export const FAIRNESS_V1_ACUITY_WEIGHTS: Readonly<Record<AcuityTier, number>> = { tier_one: 5, tier_two: 3, tier_three: 1 };

export interface FairnessBreakdown {
  composite: number;           // 0-100 weighted score
  capacityBalance: number;     // 0-1
  acuityBalance: number;       // 0-1
  overwhelmAvoidance: number;  // 0-1
  minRatioScore: number;       // 0-1
  stressEquity: number;        // 0-1
}

/** Composite v2 with its sub-scores. Acuity balance on `acuityWeights` (default ACUITY_WEIGHTS). */
export function computeFairnessDetailed(
  stats: ModeStats,
  permanentlyClosedTeams: number[],
  teamCapacities?: Record<number, number>,
  acuityWeights: Readonly<Record<AcuityTier, number>> = ACUITY_WEIGHTS,
): FairnessBreakdown {
  return compositeWithAcuityScale(stats, permanentlyClosedTeams, teamCapacities, acuityWeights);
}

/** Composite v1 (legacy, 5:3:1 acuity balance) with its sub-scores. Reproduces pre-2026-09-28 figures. */
export function computeFairnessDetailedV1(
  stats: ModeStats,
  permanentlyClosedTeams: number[],
  teamCapacities?: Record<number, number>,
): FairnessBreakdown {
  return compositeWithAcuityScale(stats, permanentlyClosedTeams, teamCapacities, FAIRNESS_V1_ACUITY_WEIGHTS);
}

function compositeWithAcuityScale(
  stats: ModeStats,
  permanentlyClosedTeams: number[],
  teamCapacities: Record<number, number> | undefined,
  acuityWeightMap: Readonly<Record<AcuityTier, number>>,
): FairnessBreakdown {
  const eligible = ([1, 2, 3, 4] as TeamId[]).filter(
    t => t !== TRAUMA_TEAM_ID && !permanentlyClosedTeams.includes(t)
  );

  const counts = eligible.map(t => stats.teamCounts[t] ?? 0);
  const totalAssignments = counts.reduce((a, b) => a + b, 0);
  if (totalAssignments === 0) {
    return { composite: 50, capacityBalance: 1, acuityBalance: 1, overwhelmAvoidance: 1, minRatioScore: 1, stressEquity: 1 };
  }

  // Capacity-Proportional Balance (25%): stress = patients / capacity per team
  let capacityBalance = 1;
  if (teamCapacities) {
    const stressPerTeam = eligible.map(t => {
      const cap = teamCapacities[t] ?? 1;
      return cap > 0 ? (stats.teamCounts[t] ?? 0) / cap : 100;
    });
    const stressMean = stressPerTeam.reduce((a, b) => a + b, 0) / stressPerTeam.length;
    if (stressMean > 0) {
      const stressVar = stressPerTeam.reduce((sum, s) => sum + (s - stressMean) ** 2, 0) / stressPerTeam.length;
      capacityBalance = Math.max(0, Math.min(1, 1 - Math.sqrt(stressVar) / stressMean));
    }
  } else {
    // Fallback: raw count balance (for backward compat)
    const mean = totalAssignments / eligible.length;
    if (mean > 0) {
      const variance = counts.reduce((sum, c) => sum + (c - mean) ** 2, 0) / counts.length;
      capacityBalance = Math.max(0, Math.min(1, 1 - Math.sqrt(variance) / mean));
    }
  }

  // Acuity Balance (15%): 1 - (stdDev of acuity-weighted load / mean), on the version's scale
  const teamLoads = eligible.map(t => {
    const al = stats.teamAcuityLoad[t];
    if (!al) return 0;
    return al.tier_one * acuityWeightMap.tier_one + al.tier_two * acuityWeightMap.tier_two + al.tier_three * acuityWeightMap.tier_three;
  });
  const loadMean = teamLoads.reduce((a, b) => a + b, 0) / teamLoads.length;
  let acuityBalance = 1;
  if (loadMean > 0) {
    const loadVar = teamLoads.reduce((sum, l) => sum + (l - loadMean) ** 2, 0) / teamLoads.length;
    acuityBalance = Math.max(0, Math.min(1, 1 - Math.sqrt(loadVar) / loadMean));
  }

  // Overwhelm Avoidance (30%): 1 - (overwhelmEvents / totalAssignments)
  const overwhelmAvoidance = Math.max(0, Math.min(1, 1 - stats.redZoneEvents / totalAssignments));

  // Min Ratio (15%): min(minRatio / RED_ZONE_THRESHOLD, 1)
  const minRatioScore = stats.minRatio === Infinity ? 1 : Math.min(stats.minRatio / RED_ZONE_THRESHOLD, 1);

  // Stress Equity (15%): 1 - stdDev(avgRatioPerTeam) / mean(avgRatioPerTeam)
  let stressEquity = 1;
  if (stats.avgRatioPerTeam) {
    const ratios = eligible
      .map(t => stats.avgRatioPerTeam[t])
      .filter(r => r !== undefined && isFinite(r));
    if (ratios.length > 0) {
      const ratioMean = ratios.reduce((a, b) => a + b, 0) / ratios.length;
      if (ratioMean > 0) {
        const ratioVar = ratios.reduce((sum, r) => sum + (r - ratioMean) ** 2, 0) / ratios.length;
        stressEquity = Math.max(0, Math.min(1, 1 - Math.sqrt(ratioVar) / ratioMean));
      }
    }
  }

  const composite = (
    capacityBalance * 0.25 +
    acuityBalance * 0.15 +
    overwhelmAvoidance * 0.30 +
    minRatioScore * 0.15 +
    stressEquity * 0.15
  ) * 100;

  return { composite, capacityBalance, acuityBalance, overwhelmAvoidance, minRatioScore, stressEquity };
}

/** Composite v2 score (0-100). */
export function computeFairness(
  stats: ModeStats,
  permanentlyClosedTeams: number[],
  teamCapacities?: Record<number, number>,
  acuityWeights?: Readonly<Record<AcuityTier, number>>,
): number {
  return computeFairnessDetailed(stats, permanentlyClosedTeams, teamCapacities, acuityWeights).composite;
}

/** Composite v1 score (0-100), legacy 5:3:1 acuity balance. */
export function computeFairnessV1(
  stats: ModeStats,
  permanentlyClosedTeams: number[],
  teamCapacities?: Record<number, number>,
): number {
  return computeFairnessDetailedV1(stats, permanentlyClosedTeams, teamCapacities).composite;
}
