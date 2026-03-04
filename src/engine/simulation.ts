import type { AcuityTier, SimTimelineEntry, SimStatusChangeEntry, SimOverrides, SimSnapshot, ShiftState, TeamId, Provider, Patient, Buffer, ShadowEntry, ShadowResult } from '../types';
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
    procedureChancePerHour: 0.15,
    procedureDurationMs: 20 * 60000,
    signoutWindows: { startMinutes: 30, endMinutes: 45 },
  };
}

// --- Timeline generation ---

/**
 * Realistic hourly arrival-rate multipliers (fraction of peak).
 * Index = hour of day (0 = midnight). Peak (~1.0) is late morning/afternoon.
 * Overnight is ~0.25× peak; ramps up through early morning.
 */
const HOUR_RATE_MULTIPLIER: number[] = [
  // 12A   1A    2A    3A    4A    5A    6A    7A
  0.25, 0.20, 0.15, 0.15, 0.15, 0.20, 0.30, 0.45,
  // 8A    9A   10A   11A   12P    1P    2P    3P
  0.65, 0.85, 1.00, 1.00, 0.95, 0.90, 0.90, 0.85,
  // 4P    5P    6P    7P    8P    9P   10P   11P
  0.80, 0.80, 0.75, 0.65, 0.55, 0.45, 0.35, 0.30,
];

export function generateTimeline(
  seed: number,
  shiftDurationMs: number,
  overrides: SimOverrides,
  startTime: number,
): SimTimelineEntry[] {
  const rng = mulberry32(seed);
  const timeline: SimTimelineEntry[] = [];
  const baseRatePerMs = overrides.arrivalRatePerHour / (60 * 60 * 1000);

  // Generate arrivals using exponential inter-arrival times with time-varying rate
  let t = startTime;
  const endTime = startTime + shiftDurationMs;

  while (t < endTime) {
    // Determine current hour-of-day for rate scaling
    const elapsedHours = (t - startTime) / 3600000;
    const hourOfDay = Math.floor(elapsedHours) % 24;
    const ratePerMs = baseRatePerMs * HOUR_RATE_MULTIPLIER[hourOfDay];

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

// --- Status change timeline generation ---

export function generateStatusChanges(
  seed: number,
  shiftDurationMs: number,
  overrides: SimOverrides,
  startTime: number,
  providers: Provider[],
): SimStatusChangeEntry[] {
  // Use a different seed offset so status changes don't correlate with arrivals
  const rng = mulberry32(seed + 9999);
  const changes: SimStatusChangeEntry[] = [];
  const endTime = startTime + shiftDurationMs;
  const hourMs = 60 * 60 * 1000;
  const hours = Math.ceil(shiftDurationMs / hourMs);

  // Procedures: iterate each hour, roll for each provider
  for (let h = 0; h < hours; h++) {
    const hourStart = startTime + h * hourMs;
    const hourEnd = Math.min(hourStart + hourMs, endTime);

    for (const p of providers) {
      // Attendings go into procedures at half the rate
      const chance = p.type === 'attending'
        ? overrides.procedureChancePerHour * 0.5
        : overrides.procedureChancePerHour;

      if (rng() < chance) {
        const time = hourStart + rng() * (hourEnd - hourStart);
        if (time < endTime) {
          changes.push({
            time,
            providerId: p.id,
            status: 'in_procedure',
            durationMs: overrides.procedureDurationMs,
          });
        }
      }
    }
  }

  // Signout: only attendings, near shift start and end
  const attendings = providers.filter(p => p.type === 'attending');
  const { startMinutes, endMinutes } = overrides.signoutWindows;
  const startWindowEnd = startTime + startMinutes * 60000;
  const endWindowStart = endTime - endMinutes * 60000;

  // Pick 1-2 attendings for start-of-shift signout
  const shuffledStart = [...attendings];
  // Fisher-Yates shuffle with seeded rng
  for (let i = shuffledStart.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [shuffledStart[i], shuffledStart[j]] = [shuffledStart[j], shuffledStart[i]];
  }
  const startCount = Math.min(1 + (rng() < 0.5 ? 1 : 0), shuffledStart.length);
  for (let i = 0; i < startCount; i++) {
    const time = startTime + rng() * (startWindowEnd - startTime);
    const duration = (15 + rng() * 5) * 60000; // 15-20 min
    changes.push({
      time,
      providerId: shuffledStart[i].id,
      status: 'taking_signout',
      durationMs: duration,
    });
  }

  // Pick 1-2 attendings for end-of-shift signout
  const shuffledEnd = [...attendings];
  for (let i = shuffledEnd.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [shuffledEnd[i], shuffledEnd[j]] = [shuffledEnd[j], shuffledEnd[i]];
  }
  const endCount = Math.min(1 + (rng() < 0.5 ? 1 : 0), shuffledEnd.length);
  for (let i = 0; i < endCount; i++) {
    if (endWindowStart >= endTime) continue;
    const time = endWindowStart + rng() * (endTime - endWindowStart);
    const duration = (15 + rng() * 5) * 60000;
    changes.push({
      time,
      providerId: shuffledEnd[i].id,
      status: 'taking_signout',
      durationMs: duration,
    });
  }

  // Sort by time
  changes.sort((a, b) => a.time - b.time);
  return changes;
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

// --- Replay to time (fast-forward for schedule changes) ---

export interface ReplayResult {
  patients: Patient[];
  buffers: Buffer[];
  providers: Provider[];
  patientCounter: { C: number; F: number };
  nextArrivalIndex: number;
  nextStatusChangeIndex: number;
  roundRobinNext: number;
}

export function replayToTime(
  providers: Provider[],
  timeline: SimTimelineEntry[],
  statusChanges: SimStatusChangeEntry[],
  closedTeams: Record<number, number>,
  permanentlyClosedTeams: number[],
  overrides: SimOverrides,
  _baseTime: number,
  targetTime: number,
  useRoundRobin: boolean,
): ReplayResult {
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
  let nextStatusChangeIndex = 0;
  let nextArrivalIndex = 0;
  const patientCounter = { C: 0, F: 0 };

  for (let i = 0; i < timeline.length; i++) {
    const entry = timeline[i];
    if (entry.arrivalTime > targetTime) break;
    nextArrivalIndex = i + 1;
    const now = entry.arrivalTime;

    // Drain pending status changes up to this time
    while (nextStatusChangeIndex < statusChanges.length && statusChanges[nextStatusChangeIndex].time <= now) {
      const change = statusChanges[nextStatusChangeIndex];
      nextStatusChangeIndex++;
      simProviders = simProviders.map(p => {
        if (p.id !== change.providerId) return p;
        if (p.status !== 'active') return p;
        return { ...p, status: change.status, statusExpiresAt: change.time + change.durationMs };
      });
    }

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
    const prefix = entry.isFloor ? 'F' : 'C';
    let teamId: TeamId;
    if (useRoundRobin) {
      const eligible = ([1, 2, 3, 4] as TeamId[]).filter(
        t => t !== TRAUMA_TEAM_ID && !(t in closedTeams) && !permanentlyClosedTeams.includes(t)
      );
      teamId = eligible[rrNext % eligible.length];
      rrNext++;
    } else {
      const rec = getRecommendation(simProviders, simPatients, simBuffers, now, closedTeams, scoringOv);
      teamId = rec.first ?? (1 as TeamId);
    }

    // Create patient
    const count = patientCounter[prefix] + 1;
    patientCounter[prefix] = count;
    const patient: Patient = {
      id: `${prefix}-${String(count).padStart(3, '0')}`,
      acuity: entry.acuity,
      assignedTeamId: teamId,
      assignedAt: now,
    };

    // Create and merge buffer
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
  }

  // Drain any remaining status changes up to targetTime
  while (nextStatusChangeIndex < statusChanges.length && statusChanges[nextStatusChangeIndex].time <= targetTime) {
    const change = statusChanges[nextStatusChangeIndex];
    nextStatusChangeIndex++;
    simProviders = simProviders.map(p => {
      if (p.id !== change.providerId) return p;
      if (p.status !== 'active') return p;
      return { ...p, status: change.status, statusExpiresAt: change.time + change.durationMs };
    });
  }

  // Final expiry check at targetTime
  simProviders = simProviders.map(p => {
    if (p.statusExpiresAt !== null && p.statusExpiresAt <= targetTime) {
      return { ...p, status: 'active' as const, statusExpiresAt: null };
    }
    return p;
  });
  simBuffers = simBuffers.filter(b => b.expiresAt > targetTime);

  return {
    patients: simPatients,
    buffers: simBuffers,
    providers: simProviders,
    patientCounter,
    nextArrivalIndex,
    nextStatusChangeIndex,
    roundRobinNext: rrNext,
  };
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
  statusChanges?: SimStatusChangeEntry[],
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
  let nextStatusChangeIndex = 0;

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

    // Drain pending status changes up to this time
    if (statusChanges) {
      while (nextStatusChangeIndex < statusChanges.length && statusChanges[nextStatusChangeIndex].time <= now) {
        const change = statusChanges[nextStatusChangeIndex];
        nextStatusChangeIndex++;
        simProviders = simProviders.map(p => {
          if (p.id !== change.providerId) return p;
          if (p.status !== 'active') return p;
          return { ...p, status: change.status, statusExpiresAt: change.time + change.durationMs };
        });
      }
    }

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
    if (ratio < 3.5) overwhelmEvents[teamId]++;
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
