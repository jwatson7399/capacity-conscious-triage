// © 2026 New York University. All rights reserved.
// Lab simulator reducer: status changes and assignment mode (June audit, reducer only).
import { describe, expect, it } from 'vitest';
import type { Provider, ShiftState, SimStatusChangeEntry, SimTimelineEntry, SimulationState } from '../types';
import { applyStatusChangesUntil, initialState, shiftReducer } from './ShiftContext';
import { getDefaultOverrides } from '../engine/simulation';

const MIN = 60_000;
const T0 = 1_000_000_000;

function prov(id: string, teamId: 1 | 2 | 3 | 4): Provider {
  return { id, name: id, type: 'attending', status: 'active', statusExpiresAt: null, teamId };
}

function simState(opts: {
  timeline: SimTimelineEntry[];
  statusChanges?: SimStatusChangeEntry[];
  roundRobin?: boolean;
  roundRobinNext?: number;
}): ShiftState {
  const providers = [prov('p1', 1), prov('p2', 2), prov('p3', 3), prov('p4', 4)];
  const simulation: SimulationState = {
    active: true,
    baseTime: T0,
    speed: 1,
    paused: false,
    seed: 1,
    shiftDurationMs: 8 * 60 * MIN,
    timeline: opts.timeline,
    statusChanges: opts.statusChanges ?? [],
    nextArrivalIndex: 0,
    nextStatusChangeIndex: 0,
    snapshots: [],
    overrides: getDefaultOverrides(),
    permanentlyClosedTeams: [],
    roundRobin: opts.roundRobin,
    roundRobinNext: opts.roundRobinNext,
    initialProviders: providers,
  };
  return { ...initialState, now: T0, providers, shiftStarted: true, simulation };
}

const arrival = (atMs: number): SimTimelineEntry => ({ arrivalTime: T0 + atMs, acuity: 'tier_one', isFloor: false });

describe('TICK', () => {
  it('scores an arrival with the provider statuses changed on the same tick', () => {
    // Team 1's only provider goes off the floor on the tick the patient arrives.
    const s0 = simState({
      timeline: [arrival(1000)],
      statusChanges: [{ time: T0 + 500, providerId: 'p1', status: 'off_floor', durationMs: 15 * MIN }],
    });
    const s1 = shiftReducer(s0, { type: 'TICK' });
    expect(s1.patients).toHaveLength(1);
    expect(s1.patients[0].assignedTeamId).toBe(2);
  });
});

describe('skip to next arrival', () => {
  it('applies back-to-back status changes in time order', () => {
    // Off the floor for 5 minutes, then into a procedure at minute 10; skip to minute 12.
    const s0 = simState({
      timeline: [arrival(12 * MIN)],
      statusChanges: [
        { time: T0, providerId: 'p1', status: 'off_floor', durationMs: 5 * MIN },
        { time: T0 + 10 * MIN, providerId: 'p1', status: 'in_procedure', durationMs: 30 * MIN },
      ],
    });
    const s1 = shiftReducer(s0, { type: 'SIM_SKIP_TO_NEXT' });
    const p1 = s1.providers.find(p => p.id === 'p1')!;
    expect(p1.status).toBe('in_procedure');
    expect(p1.statusExpiresAt).toBe(T0 + 40 * MIN);
    expect(s1.simulation!.nextStatusChangeIndex).toBe(2);
    expect(s1.now).toBe(T0 + 12 * MIN);
  });

  it('keeps round-robin mode', () => {
    // All teams are empty and equal, so formula routing would pick Team 1.
    const s0 = simState({ timeline: [arrival(5 * MIN)], roundRobin: true, roundRobinNext: 1 });
    const s1 = shiftReducer(s0, { type: 'SIM_SKIP_TO_NEXT' });
    expect(s1.patients[0].assignedTeamId).toBe(2);
    expect(s1.simulation!.roundRobinNext).toBe(2);
  });

  it('still uses formula routing in formula mode', () => {
    const s0 = simState({ timeline: [arrival(5 * MIN)] });
    const s1 = shiftReducer(s0, { type: 'SIM_SKIP_TO_NEXT' });
    expect(s1.patients[0].assignedTeamId).toBe(1);
  });
});

describe('applyStatusChangesUntil', () => {
  it('rejects a change while the provider is still in an earlier status', () => {
    const changes: SimStatusChangeEntry[] = [
      { time: T0, providerId: 'p1', status: 'off_floor', durationMs: 15 * MIN },
      { time: T0 + 10 * MIN, providerId: 'p1', status: 'in_procedure', durationMs: 30 * MIN },
    ];
    const at12 = applyStatusChangesUntil([prov('p1', 1)], changes, 0, T0 + 12 * MIN);
    expect(at12.providers[0].status).toBe('off_floor');
    const at20 = applyStatusChangesUntil([prov('p1', 1)], changes, 0, T0 + 20 * MIN);
    expect(at20.providers[0].status).toBe('active');
    expect(at20.nextIndex).toBe(2);
  });
});
