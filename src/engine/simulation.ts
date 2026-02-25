import type { AcuityTier, SimTimelineEntry, SimOverrides, SimSnapshot, ShiftState } from '../types';
import {
  CAPACITY_WEIGHTS,
  STATUS_MULTIPLIERS,
  ACUITY_WEIGHTS,
  BUFFER_DURATIONS_MS,
  ACUITY_DECAY,
} from '../constants';

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
