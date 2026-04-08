import type { TeamId, AcuityTier, ShadowEntry } from '../types';
import { TRAUMA_TEAM_ID, OVERWHELM_THRESHOLD } from '../constants';

export interface ModeStats {
  teamCounts: Record<number, number>;
  avgRatio: number;
  minRatio: number;
  overwhelms: number;
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
  let overwhelms = 0;
  const ratioSums: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };
  const ratioCounts: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };

  for (const e of entries) {
    teamCounts[e.teamId]++;
    teamAcuityLoad[e.teamId][e.acuity]++;
    totalRatio += e.ratioAtAssignment;
    if (e.ratioAtAssignment < minRatio) minRatio = e.ratioAtAssignment;
    if (e.ratioAtAssignment < OVERWHELM_THRESHOLD) overwhelms++;
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
    overwhelms,
    teamAcuityLoad,
    avgRatioPerTeam,
  };
}

export interface FairnessBreakdown {
  composite: number;           // 0-100 weighted score
  capacityBalance: number;     // 0-1
  acuityBalance: number;       // 0-1
  overwhelmAvoidance: number;  // 0-1
  minRatioScore: number;       // 0-1
  stressEquity: number;        // 0-1
}

/** Compute fairness score with full sub-score breakdown */
export function computeFairnessDetailed(
  stats: ModeStats,
  permanentlyClosedTeams: number[],
  teamCapacities?: Record<number, number>,
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

  // Acuity Balance (15%): 1 - (stdDev of acuity-weighted load / mean)
  const acuityWeightMap: Record<AcuityTier, number> = { tier_one: 5, tier_two: 3, tier_three: 1 };
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
  const overwhelmAvoidance = Math.max(0, Math.min(1, 1 - stats.overwhelms / totalAssignments));

  // Min Ratio (15%): min(minRatio / OVERWHELM_THRESHOLD, 1)
  const minRatioScore = stats.minRatio === Infinity ? 1 : Math.min(stats.minRatio / OVERWHELM_THRESHOLD, 1);

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

/** Compute a fairness score (0-100) from mode stats */
export function computeFairness(
  stats: ModeStats,
  permanentlyClosedTeams: number[],
  teamCapacities?: Record<number, number>,
): number {
  return computeFairnessDetailed(stats, permanentlyClosedTeams, teamCapacities).composite;
}
