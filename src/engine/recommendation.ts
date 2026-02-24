import type { Provider, Patient, Buffer, TeamId, AcuityTier, TeamScore, Recommendation } from '../types';
import { uid } from '../uid';
import {
  CAPACITY_WEIGHTS,
  STATUS_MULTIPLIERS,
  ACUITY_WEIGHTS,
  ACUITY_DECAY,
  BUFFER_DURATIONS_MS,
  TRAUMA_TEAM_ID,
} from '../constants';

export function getEffectiveCapacity(providers: Provider[], now: number): number {
  return providers.reduce((sum, p) => {
    // Auto-expire check: if expired, treat as active
    const status = (p.statusExpiresAt !== null && p.statusExpiresAt <= now) ? 'active' : p.status;
    return sum + CAPACITY_WEIGHTS[p.type] * STATUS_MULTIPLIERS[status];
  }, 0);
}

export function getDecayedAcuityWeight(patient: Patient, now: number): number {
  const elapsed = now - (patient.upgradedAt ?? patient.assignedAt);
  const base = ACUITY_WEIGHTS[patient.acuity];
  const steps = ACUITY_DECAY[patient.acuity];
  let weight = base;
  for (const step of steps) {
    if (elapsed >= step.afterMs) {
      weight = step.weight;
    }
  }
  return weight;
}

export function getCurrentLoad(patients: Patient[], teamId: TeamId, now: number): number {
  return patients
    .filter(p => p.assignedTeamId === teamId)
    .reduce((sum, p) => sum + getDecayedAcuityWeight(p, now), 0);
}

export function getActiveBuffers(buffers: Buffer[], teamId: TeamId, now: number): Buffer[] {
  return buffers.filter(b => b.teamId === teamId && b.expiresAt > now);
}

export function getBufferLoad(buffers: Buffer[], teamId: TeamId, now: number): number {
  return getActiveBuffers(buffers, teamId, now)
    .reduce((sum, b) => sum + ACUITY_WEIGHTS[b.tier], 0);
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
): TeamScore {
  const teamProviders = providers.filter(p => p.teamId === teamId);
  const capacity = getEffectiveCapacity(teamProviders, now);
  const load = getCurrentLoad(patients, teamId, now);
  const bufferLoad = getBufferLoad(buffers, teamId, now);
  const capacityRatio = (load + bufferLoad) === 0 ? Infinity : capacity / (load + bufferLoad);
  const teamPatients = patients.filter(p => p.assignedTeamId === teamId);
  const lastAssigned = teamPatients.length === 0 ? 0 : Math.max(...teamPatients.map(p => p.assignedAt));

  return {
    teamId,
    capacity,
    load,
    bufferLoad,
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
): Recommendation {
  const teamIds: TeamId[] = [1, 2, 3, 4];
  const scores = teamIds.map(id => scoreTeam(id, providers, patients, buffers, now));
  const candidates = scores.filter(s => s.teamId !== TRAUMA_TEAM_ID);

  // Sort: not-buffered first, then highest capacityRatio, then least recent assignment, then lowest team id
  const ranked = [...candidates].sort((a, b) => {
    if (a.isBuffered !== b.isBuffered) return a.isBuffered ? 1 : -1;
    if (a.capacityRatio !== b.capacityRatio) return b.capacityRatio - a.capacityRatio;
    if (a.lastAssigned !== b.lastAssigned) return a.lastAssigned - b.lastAssigned;
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

export function createBuffer(teamId: TeamId, tier: AcuityTier, now: number): Buffer {
  return {
    id: uid(),
    teamId,
    tier,
    createdAt: now,
    expiresAt: now + BUFFER_DURATIONS_MS[tier],
  };
}

export function getBufferProgress(buffer: Buffer, now: number): number {
  const total = buffer.expiresAt - buffer.createdAt;
  const remaining = buffer.expiresAt - now;
  return Math.max(0, Math.min(1, remaining / total));
}
