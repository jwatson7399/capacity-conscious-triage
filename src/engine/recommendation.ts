import type { Provider, Patient, Buffer, TeamId, AcuityTier, TeamScore, Recommendation } from '../types';
import { uid } from '../uid';
import {
  CAPACITY_WEIGHTS,
  STATUS_MULTIPLIERS,
  ACUITY_WEIGHTS,
  ACUITY_DECAY,
  BUFFER_DURATIONS_MS,
  TRAUMA_TEAM_ID,
  FLOAT_MODIFIER_MULTIPLIERS,
} from '../constants';

export interface ScoringOverrides {
  capacityWeights?: Record<string, number>;
  statusMultipliers?: Record<string, number>;
  acuityWeights?: Record<string, number>;
  decaySteps?: Record<string, Array<{ afterMs: number; weight: number }>>;
  bufferDurations?: Record<string, number>;
}

export function getEffectiveCapacity(providers: Provider[], now: number, overrides?: ScoringOverrides): number {
  const cw = overrides?.capacityWeights ?? CAPACITY_WEIGHTS;
  const sm = overrides?.statusMultipliers ?? STATUS_MULTIPLIERS;
  return providers.reduce((sum, p) => {
    const status = (p.statusExpiresAt !== null && p.statusExpiresAt <= now) ? 'active' : p.status;
    // share: part of a provider covering two teams, or 0 for one listed but not counted (Decision 42).
    // Missing for every provider outside the schedule-driven board, so all earlier scoring is unchanged.
    return sum + (cw[p.type] ?? 0) * (sm[status] ?? 0) * (p.share ?? 1);
  }, 0);
}

export function getDecayedAcuityWeight(patient: Patient, now: number, overrides?: ScoringOverrides): number {
  const elapsed = now - (patient.upgradedAt ?? patient.assignedAt);
  const aw = overrides?.acuityWeights ?? ACUITY_WEIGHTS;
  const ds = overrides?.decaySteps ?? ACUITY_DECAY;
  const base = aw[patient.acuity] ?? 0;
  const steps = ds[patient.acuity] ?? [];
  if (steps.length === 0 || elapsed <= 0) return base;
  // D6 linear decay: linearly interpolate from base at t=0 to the final endpoint's weight at t=afterMs.
  // For multi-step inputs (e.g. benchmark scripts), linearly interpolate piecewise between consecutive points.
  let prevT = 0;
  let prevW = base;
  for (const step of steps) {
    if (elapsed <= step.afterMs) {
      const span = step.afterMs - prevT;
      if (span <= 0) return step.weight;
      const t = (elapsed - prevT) / span;
      return prevW + t * (step.weight - prevW);
    }
    prevT = step.afterMs;
    prevW = step.weight;
  }
  return prevW;
}

export function getCurrentLoad(patients: Patient[], teamId: TeamId, now: number, overrides?: ScoringOverrides): number {
  return patients
    // A deceased patient adds no load; the 30-minute deceased buffer carries the effect
    // (Roundtable 2026-09-28, Decision 17).
    .filter(p => p.assignedTeamId === teamId && !p.deceased)
    .reduce((sum, p) => {
      const decayed = getDecayedAcuityWeight(p, now, overrides);
      const floatMult = FLOAT_MODIFIER_MULTIPLIERS[p.floatModifier ?? 'none'];
      return sum + decayed * floatMult;
    }, 0);
}

export function getActiveBuffers(buffers: Buffer[], teamId: TeamId, now: number): Buffer[] {
  return buffers.filter(b => b.teamId === teamId && b.expiresAt > now);
}

export function isTeamBuffered(buffers: Buffer[], teamId: TeamId, now: number): boolean {
  return getActiveBuffers(buffers, teamId, now).length > 0;
}

export function scoreTeam(
  teamId: TeamId,
  providers: Provider[],
  patients: Patient[],
  buffers: Buffer[],
  now: number,
  overrides?: ScoringOverrides,
): TeamScore {
  const teamProviders = providers.filter(p => p.teamId === teamId);
  const capacity = getEffectiveCapacity(teamProviders, now, overrides);
  const load = getCurrentLoad(patients, teamId, now, overrides);
  const capacityRatio = capacity === 0 ? 0 : load === 0 ? Infinity : capacity / load;
  const teamPatients = patients.filter(p => p.assignedTeamId === teamId);
  const lastAssigned = teamPatients.length === 0 ? 0 : Math.max(...teamPatients.map(p => p.assignedAt));

  return {
    teamId,
    capacity,
    load,
    capacityRatio,
    lastAssigned,
    isBuffered: isTeamBuffered(buffers, teamId, now),
  };
}

export function getRecommendation(
  providers: Provider[],
  patients: Patient[],
  buffers: Buffer[],
  now: number,
  closedTeams: Record<number, number> = {},
  overrides?: ScoringOverrides,
  incomingTier?: AcuityTier,
): Recommendation {
  const teamIds: TeamId[] = [1, 2, 3, 4];
  const scores = teamIds.map(id => scoreTeam(id, providers, patients, buffers, now, overrides));

  // If incomingTier is provided, compute post-assignment ratio for ranking
  if (incomingTier) {
    const aw = overrides?.acuityWeights ?? ACUITY_WEIGHTS;
    const incomingWeight = aw[incomingTier] ?? 0;
    for (const s of scores) {
      s.capacityRatio = s.capacity === 0 ? 0 : s.capacity / (s.load + incomingWeight);
    }
  }

  const candidates = scores.filter(s => s.teamId !== TRAUMA_TEAM_ID && !(s.teamId in closedTeams));

  // Sort: not-buffered first, then highest capacityRatio, then least recent assignment, then lowest team id
  // When ALL candidates are buffered, prioritize recency over ratio to force alternation
  const allBuffered = candidates.length > 0 && candidates.every(s => s.isBuffered);
  const ranked = [...candidates].sort((a, b) => {
    if (!allBuffered) {
      if (a.isBuffered !== b.isBuffered) return a.isBuffered ? 1 : -1;
    }
    if (allBuffered) {
      if (a.lastAssigned !== b.lastAssigned) return a.lastAssigned - b.lastAssigned;
    }
    if (a.capacityRatio !== b.capacityRatio) return b.capacityRatio - a.capacityRatio;
    if (!allBuffered) {
      if (a.lastAssigned !== b.lastAssigned) return a.lastAssigned - b.lastAssigned;
    }
    return a.teamId - b.teamId;
  });

  const allAtCapacity = candidates.every(s => s.capacityRatio === 0);

  return {
    first: ranked[0]?.teamId ?? null,
    second: ranked[1]?.teamId ?? null,
    allAtCapacity,
    scores,
  };
}

export function createBuffer(teamId: TeamId, tier: AcuityTier, now: number, overrides?: ScoringOverrides): Buffer {
  const durations = overrides?.bufferDurations ?? BUFFER_DURATIONS_MS;
  return {
    id: uid(),
    teamId,
    tier,
    createdAt: now,
    expiresAt: now + (durations[tier] ?? BUFFER_DURATIONS_MS[tier]),
  };
}

export function getBufferProgress(buffer: Buffer, now: number): number {
  const total = buffer.expiresAt - buffer.createdAt;
  const remaining = buffer.expiresAt - now;
  return Math.max(0, Math.min(1, remaining / total));
}
