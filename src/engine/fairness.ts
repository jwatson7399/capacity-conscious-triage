import type { TeamId, AcuityTier, ShadowEntry } from '../types';
import { TRAUMA_TEAM_ID } from '../constants';

export interface ModeStats {
  teamCounts: Record<number, number>;
  avgRatio: number;
  minRatio: number;
  overwhelms: number;
  teamAcuityLoad: Record<number, { tier_one: number; tier_two: number; tier_three: number }>;
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

  for (const e of entries) {
    teamCounts[e.teamId]++;
    teamAcuityLoad[e.teamId][e.acuity]++;
    totalRatio += e.ratioAtAssignment;
    if (e.ratioAtAssignment < minRatio) minRatio = e.ratioAtAssignment;
    if (e.ratioAtAssignment < 2.0) overwhelms++;
  }

  return {
    teamCounts,
    avgRatio: entries.length > 0 ? totalRatio / entries.length : 0,
    minRatio: entries.length > 0 ? minRatio : Infinity,
    overwhelms,
    teamAcuityLoad,
  };
}

/** Compute a fairness score (0-100) from mode stats */
export function computeFairness(stats: ModeStats, permanentlyClosedTeams: number[]): number {
  const eligible = ([1, 2, 3, 4] as TeamId[]).filter(
    t => t !== TRAUMA_TEAM_ID && !permanentlyClosedTeams.includes(t)
  );

  const counts = eligible.map(t => stats.teamCounts[t] ?? 0);
  const totalAssignments = counts.reduce((a, b) => a + b, 0);
  if (totalAssignments === 0) return 50;

  const mean = totalAssignments / eligible.length;

  // Load Balance (40%): 1 - (stdDev / mean), clamped 0-1
  const variance = counts.reduce((sum, c) => sum + (c - mean) ** 2, 0) / counts.length;
  const stdDev = Math.sqrt(variance);
  const loadBalance = mean > 0 ? Math.max(0, Math.min(1, 1 - stdDev / mean)) : 1;

  // Acuity Balance (25%): 1 - (stdDev of acuity-weighted load / mean)
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

  // Overwhelm (20%): 1 - (overwhelmEvents / totalAssignments)
  const overwhelmScore = Math.max(0, Math.min(1, 1 - stats.overwhelms / totalAssignments));

  // Min Ratio (15%): min(minRatio / 3.35, 1)
  const minRatioScore = stats.minRatio === Infinity ? 1 : Math.min(stats.minRatio / 3.35, 1);

  return (loadBalance * 0.4 + acuityBalance * 0.25 + overwhelmScore * 0.2 + minRatioScore * 0.15) * 100;
}
