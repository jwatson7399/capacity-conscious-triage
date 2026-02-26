import type { AcuityTier, SimTimelineEntry, SimOverrides, SimSnapshot, ShiftState, TeamId, Provider, Patient, Buffer, ShadowEntry, ShadowResult } from '../types';
import {
  CAPACITY_WEIGHTS,
  STATUS_MULTIPLIERS,
  ACUITY_WEIGHTS,
  BUFFER_DURATIONS_MS,
  ACUITY_DECAY,
  TRAUMA_TEAM_ID,
} from '../constants';
import { getRecommendation, scoreTeam, createBuffer, type ScoringOverrides } from './recommendation';

// --- Seeded PRNG (mulberry32) ---

export function mulberry32(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function randomSeed(): number {
  return (Math.random() * 2147483647) | 0;
}

// --- Default overrides (matches current constants) ---

export function getDefaultOverrides(): SimOverrides {
  return {
    capacityWeights: { ...CAPACITY_WEIGHTS },
    statusMultipliers: { ...STATUS_MULTIPLIERS },
    acuityWeights: { ...ACUITY_WEIGHTS },
    bufferDurations: {
      tier_one: BUFFER_DURATIONS_MS.tier_one,
      tier_two: BUFFER_DURATIONS_MS.tier_two,
      tier_three: BUFFER_DURATIONS_MS.tier_three,
    },
    decaySteps: {
      tier_one: ACUITY_DECAY.tier_one.map(s => ({ ...s })),
      tier_two: ACUITY_DECAY.tier_two.map(s => ({ ...s })),
      tier_three: ACUITY_DECAY.tier_three.map(s => ({ ...s })),
    },
    arrivalRatePerHour: 4,
    acuityDistribution: { tier_one: 25, tier_two: 50, tier_three: 25 },
    floorUpgradeChance: 15,
  };
}

// --- Timeline generation ---

export function generateTimeline(
  seed: number,
  shiftDurationMs: number,
  overrides: SimOverrides,
  startTime: number,
): SimTimelineEntry[] {
  const rng = mulberry32(seed);
  const timeline: SimTimelineEntry[] = [];
  const ratePerMs = overrides.arrivalRatePerHour / (60 * 60 * 1000);

  // Generate arrivals using exponential inter-arrival times
  let t = startTime;
  const endTime = startTime + shiftDurationMs;

  while (t < endTime) {
    // Exponential inter-arrival: -ln(U) / rate
    const u = rng();
    const interval = -Math.log(u === 0 ? 1e-10 : u) / ratePerMs;
    t += interval;
    if (t >= endTime) break;

    // Determine acuity from distribution
    const roll = rng() * 100;
    const { tier_one, tier_two } = overrides.acuityDistribution;
    let acuity: AcuityTier;
    if (roll < tier_one) acuity = 'tier_one';
    else if (roll < tier_one + tier_two) acuity = 'tier_two';
    else acuity = 'tier_three';

    const isFloor = rng() * 100 < overrides.floorUpgradeChance;

    timeline.push({ arrivalTime: t, acuity, isFloor });
  }

  return timeline;
}

// --- Snapshot management ---

const MAX_SNAPSHOTS = 500;

export function takeSnapshot(state: ShiftState, simTime: number): SimSnapshot {
  // Deep-enough clone: arrays of plain objects
  return {
    state: {
      ...state,
      providers: state.providers.map(p => ({ ...p })),
      patients: state.patients.map(p => ({ ...p })),
      buffers: state.buffers.map(b => ({ ...b })),
      overrides: state.overrides.map(o => ({ ...o })),
      closedTeams: { ...state.closedTeams },
      patientCounter: { ...state.patientCounter },
      // Don't snapshot the simulation sub-state (it's managed separately)
      simulation: undefined,
    },
    simTime,
  };
}

export function addSnapshot(snapshots: SimSnapshot[], snapshot: SimSnapshot): SimSnapshot[] {
  const next = [...snapshots, snapshot];
  if (next.length > MAX_SNAPSHOTS) {
    // Keep first, last, and evenly spaced in between
    return next.filter((_, i) => i === 0 || i === next.length - 1 || i % 2 === 0).slice(0, MAX_SNAPSHOTS);
  }
  return next;
}

// --- Shadow simulation ---

export function runShadowSim(
  providers: Provider[],
  timeline: SimTimelineEntry[],
  closedTeams: Record<number, number>,
  permanentlyClosedTeams: number[],
  overrides: SimOverrides,
  _baseTime: number,
  shadowMode: 'round_robin' | 'formula',
): ShadowResult {
  const scoringOv: ScoringOverrides = {
    capacityWeights: overrides.capacityWeights,
    statusMultipliers: overrides.statusMultipliers,
    acuityWeights: overrides.acuityWeights,
    decaySteps: overrides.decaySteps,
    bufferDurations: overrides.bufferDurations,
  };

  let simProviders = providers.map(p => ({ ...p }));
  let simPatients: Patient[] = [];
  let simBuffers: Buffer[] = [];
  let rrNext = 0;

  const entries: ShadowEntry[] = [];
  const teamPatientCounts: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };
  const teamAcuityLoad: Record<number, { tier_one: number; tier_two: number; tier_three: number }> = {
    1: { tier_one: 0, tier_two: 0, tier_three: 0 },
    2: { tier_one: 0, tier_two: 0, tier_three: 0 },
    3: { tier_one: 0, tier_two: 0, tier_three: 0 },
    4: { tier_one: 0, tier_two: 0, tier_three: 0 },
  };
  const ratioSums: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };
  const ratioCounts: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };
  const minRatioPerTeam: Record<number, number> = { 1: Infinity, 2: Infinity, 3: Infinity, 4: Infinity };
  const overwhelmEvents: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };

  for (let i = 0; i < timeline.length; i++) {
    const entry = timeline[i];
    const now = entry.arrivalTime;

    // Auto-expire provider statuses
    simProviders = simProviders.map(p => {
      if (p.statusExpiresAt !== null && p.statusExpiresAt <= now) {
        return { ...p, status: 'active' as const, statusExpiresAt: null };
      }
      return p;
    });

    // Filter expired buffers
    simBuffers = simBuffers.filter(b => b.expiresAt > now);

    // Assign team
    let teamId: TeamId;
    if (shadowMode === 'round_robin') {
      const eligible = ([1, 2, 3, 4] as TeamId[]).filter(
        t => t !== TRAUMA_TEAM_ID && !(t in closedTeams) && !permanentlyClosedTeams.includes(t)
      );
      teamId = eligible[rrNext % eligible.length];
      rrNext++;
    } else {
      const rec = getRecommendation(simProviders, simPatients, simBuffers, now, closedTeams, scoringOv);
      teamId = rec.first ?? (1 as TeamId);
    }

    // Score the receiving team at assignment time
    const score = scoreTeam(teamId, simProviders, simPatients, simBuffers, now, scoringOv);
    const ratio = score.capacityRatio === Infinity ? 100 : score.capacityRatio;

    // Create patient
    const patient: Patient = {
      id: `S-${String(i + 1).padStart(3, '0')}`,
      acuity: entry.acuity,
      assignedTeamId: teamId,
      assignedAt: now,
    };

    // Create and merge buffer (same logic as TICK)
    const newBuffer = createBuffer(teamId, entry.acuity, now, scoringOv);
    const existingTeamBuffers = simBuffers.filter(b => b.teamId === teamId && b.expiresAt > now && !b.deceasedPatientId);
    const otherBuffers = simBuffers.filter(b => !(b.teamId === teamId && b.expiresAt > now && !b.deceasedPatientId));
    if (existingTeamBuffers.length > 0) {
      const allBufs = [...existingTeamBuffers, newBuffer];
      const currentExpiry = Math.max(...existingTeamBuffers.map(b => b.expiresAt));
      const newDuration = newBuffer.expiresAt - newBuffer.createdAt;
      const latestExpiry = Math.max(currentExpiry, now) + newDuration;
      const tierRank = { tier_one: 0, tier_two: 1, tier_three: 2 } as const;
      const bestTier = allBufs.reduce((best, b) => tierRank[b.tier] < tierRank[best.tier] ? b : best).tier;
      const totalCount = allBufs.reduce((sum, b) => sum + (b.mergedCount ?? 1), 0);
      simBuffers = [...otherBuffers, {
        id: newBuffer.id, teamId, tier: bestTier,
        createdAt: Math.min(...allBufs.map(b => b.createdAt)),
        expiresAt: latestExpiry, mergedCount: totalCount,
      }];
    } else {
      simBuffers = [...simBuffers, newBuffer];
    }

    simPatients = [...simPatients, patient];

    // Record stats
    entries.push({ arrivalIndex: i, arrivalTime: now, acuity: entry.acuity, teamId, ratioAtAssignment: ratio });
    teamPatientCounts[teamId]++;
    teamAcuityLoad[teamId][entry.acuity]++;
    ratioSums[teamId] += ratio;
    ratioCounts[teamId]++;
    if (ratio < minRatioPerTeam[teamId]) minRatioPerTeam[teamId] = ratio;
    if (ratio < 2.0) overwhelmEvents[teamId]++;
  }

  const avgRatioPerTeam: Record<number, number> = {};
  for (const t of [1, 2, 3, 4]) {
    avgRatioPerTeam[t] = ratioCounts[t] > 0 ? ratioSums[t] / ratioCounts[t] : Infinity;
    if (minRatioPerTeam[t] === Infinity && ratioCounts[t] === 0) minRatioPerTeam[t] = Infinity;
  }

  return {
    mode: shadowMode,
    entries,
    teamPatientCounts,
    teamAcuityLoad,
    avgRatioPerTeam,
    minRatioPerTeam,
    overwhelmEvents,
  };
}
