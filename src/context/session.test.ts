// © 2026 New York University. All rights reserved.
import { describe, expect, it } from 'vitest';
import type { Provider, ShiftState, TeamScore } from '../types';
import { initialState, scoringFor, shiftReducer } from './ShiftContext';
import { emptySession, makeSessionReducer, undoBlocked, type SessionState } from './session';
import { formatRatio, highCount, gaugeLevel, contribution, isCounted, minutesLeft, timerRunning } from '../ui/model';
import { getRecommendation } from '../engine/recommendation';
import { CAPACITY_WEIGHTS, DECEASED_BUFFER_MS } from '../constants';
import { buildDemoShift } from '../ui/samples';

const reducer = makeSessionReducer(shiftReducer, scoringFor);
const MIN = 60_000;

function prov(id: string, teamId: 1 | 2 | 3 | 4, type: Provider['type'] = 'attending'): Provider {
  return { id, name: id, type, status: 'active', statusExpiresAt: null, teamId };
}

function started(now = 1_000_000_000): SessionState {
  const shift: ShiftState = { ...initialState, now };
  let s: SessionState = emptySession(shift);
  s = reducer(s, { type: 'START_SHIFT', providers: [prov('a', 1), prov('b', 2), prov('c', 3), prov('d', 3, 'intern'), prov('t', 4)] });
  return { ...s, shift: { ...s.shift, now } };
}

function score(teamId: 1 | 2 | 3 | 4, capacityRatio: number, capacity = 20): TeamScore {
  return { teamId, capacity, load: capacity / capacityRatio, capacityRatio, lastAssigned: 0, isBuffered: false };
}

describe('infinity display rule', () => {
  it('zero load is always infinity', () => {
    expect(formatRatio(Infinity, 20, 3)).toBe('∞');
  });
  it('one team at 100+ shows infinity', () => {
    const sc = [score(1, 150), score(2, 40), score(3, 20), score(4, 500)];
    expect(highCount(sc)).toBe(1);
    expect(formatRatio(150, 20, highCount(sc))).toBe('∞');
  });
  it('two or more A-side teams at 100+ show rounded numbers', () => {
    const sc = [score(1, 129.4), score(2, 162.6), score(3, 20), score(4, 500)];
    expect(highCount(sc)).toBe(2);
    expect(formatRatio(129.4, 20, 2)).toBe('129');
    expect(formatRatio(162.6, 20, 2)).toBe('163');
    expect(formatRatio(500, 20, 2)).toBe('500'); // trauma follows the rule once two A-side teams qualify
  });
  it('trauma does not count toward the two', () => {
    const sc = [score(1, 129), score(2, 40), score(3, 20), score(4, 500)];
    expect(highCount(sc)).toBe(1);
  });
  it('below 100 shows one decimal; no providers shows 0.0', () => {
    expect(formatRatio(51.13, 20, 0)).toBe('51.1');
    expect(formatRatio(0, 0, 0)).toBe('0.0');
  });
  it('gauge scale is ratio / (ratio + 22)', () => {
    expect(gaugeLevel(22, 1)).toBeCloseTo(50);
    expect(gaugeLevel(Infinity, 1)).toBe(100);
    expect(gaugeLevel(5, 0)).toBe(0);
  });
});

describe('frozen weights', () => {
  it('scoring uses the constants.ts weights', () => {
    const s = started();
    expect(scoringFor(s.shift).capacityWeights).toEqual(CAPACITY_WEIGHTS);
  });
});

describe('session layer', () => {
  it('logs an assignment with the snapshot taken before placement', () => {
    let s = started();
    s = reducer(s, { type: 'ASSIGN_PATIENT', tier: 'tier_one', teamId: 1, source: 'critical' });
    const e = s.activity.at(-1)!;
    expect(e.kind).toBe('assign');
    if (e.kind !== 'assign') return;
    expect(e.recommendedTeamId).toBe(1);
    expect(e.followed).toBe(true);
    expect(e.snapshot.find(x => x.teamId === 1)!.ratio).toBe('infinity');
    expect(JSON.parse(JSON.stringify(e))).toEqual(e); // JSON-safe
  });

  it('logs overrides with the reason code and note', () => {
    let s = started();
    s = reducer(s, { type: 'ASSIGN_PATIENT', tier: 'tier_two', teamId: 3, source: 'critical', overrideReason: 'Other: x', recommendedTeamId: 1, meta: { reasonCode: 'other', note: 'x' } });
    const e = s.activity.at(-1)!;
    expect(e.kind === 'assign' && e.followed).toBe(false);
    expect(e.kind === 'assign' && e.override).toEqual({ reasonCode: 'other', reasonLabel: 'Other', note: 'x' });
    expect(s.shift.overrides).toHaveLength(1);
  });

  it('records undo as its own event bound to the assignment event id', () => {
    let s = started();
    s = reducer(s, { type: 'ASSIGN_PATIENT', tier: 'tier_one', teamId: 1, source: 'critical' });
    const assign = s.activity.at(-1)!;
    expect(s.undoable).toEqual({ eventId: assign.id, patientId: 'C-001' });
    s = reducer(s, { type: 'UNDO_ASSIGN', eventId: assign.id });
    expect(s.shift.patients).toHaveLength(0);
    const u = s.activity.at(-1)!;
    expect(u.kind === 'undo' && u.undoesEventId).toBe(assign.id);
    expect(s.activity.some(x => x.id === assign.id)).toBe(true);
    expect(s.undoable).toBeNull();
  });

  it('removes a provider and reopens a team without touching the core reducer', () => {
    let s = started();
    s = reducer(s, { type: 'REMOVE_PROVIDER', providerId: 'd' });
    expect(s.shift.providers.some(p => p.id === 'd')).toBe(false);
    s = reducer(s, { type: 'CLOSE_TEAM', teamId: 2 });
    expect(2 in s.shift.closedTeams).toBe(true);
    s = reducer(s, { type: 'REOPEN_TEAM', teamId: 2 });
    expect(2 in s.shift.closedTeams).toBe(false);
    expect(s.activity.map(e => e.kind)).toEqual(['shift_start', 'provider_remove', 'team_close', 'team_reopen']);
  });

  it('closed teams are not recommended', () => {
    let s = started();
    s = reducer(s, { type: 'CLOSE_TEAM', teamId: 1 });
    const rec = getRecommendation(s.shift.providers, s.shift.patients, s.shift.buffers, s.shift.now, s.shift.closedTeams, scoringFor(s.shift));
    expect(rec.first).not.toBe(1);
  });

  it('deceased buffer ranks the team last for 30 minutes', () => {
    let s = started();
    s = reducer(s, { type: 'ASSIGN_PATIENT', tier: 'tier_three', teamId: 1, source: 'critical' });
    s = reducer(s, { type: 'DECEASE_PATIENT', patientId: 'C-001' });
    const b = s.shift.buffers.find(x => x.teamId === 1 && x.deceasedPatientId)!;
    expect(b.expiresAt - s.shift.now).toBe(DECEASED_BUFFER_MS);
    const rec = getRecommendation(s.shift.providers, s.shift.patients, s.shift.buffers, s.shift.now, s.shift.closedTeams, scoringFor(s.shift));
    expect(rec.first).not.toBe(1);
  });

  it('keeps a closed team closed after sign-out', () => {
    let s = started();
    s = reducer(s, { type: 'ASSIGN_PATIENT', tier: 'tier_two', teamId: 3, source: 'critical' });
    s = reducer(s, { type: 'CLOSE_TEAM', teamId: 3 });
    s = reducer(s, { type: 'SIGNOUT_PATIENTS', fromTeamId: 3, toTeamId: 1 });
    expect(3 in s.shift.closedTeams).toBe(true);
    expect(s.shift.patients[0].assignedTeamId).toBe(1);
    const rec = getRecommendation(s.shift.providers, s.shift.patients, s.shift.buffers, s.shift.now, s.shift.closedTeams, scoringFor(s.shift));
    expect(rec.first).not.toBe(3);
  });

  it('never reopens or moves patients on its own, however long a team is closed', () => {
    for (const team of [1, 2, 3, 4] as const) {
      let s = started();
      s = reducer(s, { type: 'ASSIGN_PATIENT', tier: 'tier_two', teamId: team, source: 'critical' });
      s = reducer(s, { type: 'CLOSE_TEAM', teamId: team });
      const realNow = Date.now;
      Date.now = () => s.shift.now + 6 * 60 * MIN;
      try { s = reducer(s, { type: 'TICK' }); } finally { Date.now = realNow; }
      expect(team in s.shift.closedTeams).toBe(true);
      expect(s.shift.patients[0].assignedTeamId).toBe(team);
      expect(s.activity.map(e => e.kind)).toEqual(['shift_start', 'assign', 'team_close']);
    }
  });

  it('a floor upgrade stays on the chosen team and is not an assignment', () => {
    let s = started();
    s = reducer(s, { type: 'ADD_FLOOR_UPGRADE', tier: 'tier_one', teamId: 3 });
    expect(s.shift.patients).toHaveLength(1);
    expect(s.shift.patients[0]).toMatchObject({ id: 'F-001', acuity: 'tier_one', assignedTeamId: 3 });
    expect(s.shift.overrides).toHaveLength(0);
    const e = s.activity.at(-1)!;
    expect(e).toMatchObject({ kind: 'floor_upgrade', patientId: 'F-001', acuity: 'tier_one', teamId: 3, auto: false });
    expect(s.activity.some(x => x.kind === 'assign')).toBe(false);
    // It adds load to that team, so the ratio drops and the next patient goes elsewhere.
    const rec = getRecommendation(s.shift.providers, s.shift.patients, s.shift.buffers, s.shift.now, s.shift.closedTeams, scoringFor(s.shift));
    expect(rec.scores.find(x => x.teamId === 3)!.load).toBeGreaterThan(0);
    expect(rec.first).not.toBe(3);
    // Undo works as for an assignment.
    expect(s.undoable).toEqual({ eventId: e.id, patientId: 'F-001' });
    s = reducer(s, { type: 'UNDO_ASSIGN', eventId: e.id });
    expect(s.shift.patients).toHaveLength(0);
  });

  it('a float arrival is listed on the recommended team with no load and is not an assignment', () => {
    let s = started();
    s = reducer(s, { type: 'ASSIGN_TO_FLOAT', tier: 'tier_one', teamId: 1, floatName: 'Moreau' });
    expect(s.shift.patients[0]).toMatchObject({ id: 'C-001', assignedTeamId: 1, floatModifier: 'float_primary', floatAttendingName: 'Moreau' });
    const rec = getRecommendation(s.shift.providers, s.shift.patients, s.shift.buffers, s.shift.now, s.shift.closedTeams, scoringFor(s.shift));
    expect(rec.scores.find(x => x.teamId === 1)!.load).toBe(0);
    const e = s.activity.at(-1)!;
    expect(e).toMatchObject({ kind: 'float_arrival', patientId: 'C-001', teamId: 1, floatName: 'Moreau' });
    expect(s.activity.some(x => x.kind === 'assign')).toBe(false);
    s = reducer(s, { type: 'UNDO_ASSIGN', eventId: e.id });
    expect(s.shift.patients).toHaveLength(0);
  });

  it('demo floor upgrades land on their own team, not the recommended one', () => {
    let s = emptySession({ ...initialState });
    s = reducer(s, { type: 'HYDRATE', shift: buildDemoShift() });
    const sim = s.shift.simulation!;
    const now = s.shift.now;
    s = { ...s, shift: { ...s.shift, simulation: { ...sim, speed: 60, paused: false, nextArrivalIndex: 0, timeline: [
      { arrivalTime: now + 1000, acuity: 'tier_one', isFloor: true, floorTeamId: 4 },
      { arrivalTime: now + 2000, acuity: 'tier_two', isFloor: false },
    ] } } };
    s = reducer(s, { type: 'TICK' });
    const f = s.shift.patients.find(p => p.id.startsWith('F') && p.assignedAt > now);
    expect(f?.assignedTeamId).toBe(4); // Trauma is never recommended, so only the stored team explains this
    expect(s.activity.filter(e => e.kind === 'floor_upgrade')).toMatchObject([{ patientId: f?.id, teamId: 4, auto: true }]);
    expect(s.activity.filter(e => e.kind === 'assign' && e.auto)).toHaveLength(1);
  });

  it('demo skip and back step through arrivals, live or paused', () => {
    let s = emptySession({ ...initialState });
    s = reducer(s, { type: 'HYDRATE', shift: buildDemoShift() });
    s = reducer(s, { type: 'DEMO_ARRIVALS', on: true });
    s = { ...s, shift: { ...s.shift, simulation: { ...s.shift.simulation!, paused: true } } };
    const t0 = s.shift.now;
    const n0 = s.shift.patients.length;
    const tl = s.shift.simulation!.timeline;
    const i0 = s.shift.simulation!.nextArrivalIndex;

    s = reducer(s, { type: 'SIM_SKIP_TO_NEXT' });
    expect(s.shift.now).toBe(tl[i0].arrivalTime);
    expect(s.shift.patients.length).toBe(n0 + 1);
    expect(s.activity.at(-1)!.kind === 'assign' || s.activity.at(-1)!.kind === 'floor_upgrade').toBe(true);
    const t1 = s.shift.now;
    s = reducer(s, { type: 'SIM_SKIP_TO_NEXT' });
    expect(s.shift.patients.length).toBe(n0 + 2);
    expect(s.shift.simulation!.paused).toBe(true);

    s = reducer(s, { type: 'DEMO_BACK' });
    expect(s.shift.now).toBe(t1);
    expect(s.shift.patients.length).toBe(n0 + 1);
    s = reducer(s, { type: 'DEMO_BACK' });
    expect(s.shift.now).toBe(t0);
    expect(s.shift.patients.length).toBe(n0);
    expect(reducer(s, { type: 'DEMO_BACK' })).toBe(s); // nothing earlier

    // Forward again replays the same schedule.
    s = reducer(s, { type: 'SIM_SKIP_TO_NEXT' });
    expect(s.shift.now).toBe(t1);
  });

  it('sign-out moves the load, notes it on each patient, and can be undone', () => {
    let s = started();
    s = reducer(s, { type: 'ASSIGN_PATIENT', tier: 'tier_one', teamId: 1, source: 'critical' });
    s = reducer(s, { type: 'ASSIGN_PATIENT', tier: 'tier_two', teamId: 1, source: 'critical' });
    s = { ...s, shift: { ...s.shift, now: s.shift.now + 40 * MIN } };
    const score = (st: SessionState, t: 1 | 2 | 3) => getRecommendation(st.shift.providers, st.shift.patients, st.shift.buffers, st.shift.now, st.shift.closedTeams, scoringFor(st.shift)).scores.find(x => x.teamId === t)!.load;
    const load1 = score(s, 1);
    s = reducer(s, { type: 'SIGNOUT_PATIENTS', fromTeamId: 1, toTeamId: 3 });
    expect(score(s, 1)).toBe(0);
    expect(score(s, 3)).toBeCloseTo(load1, 10); // same timers, same load, now on Team 3
    expect(s.shift.patients.every(p => p.signouts?.[0]?.fromTeamId === 1 && p.signouts[0].at === s.shift.now)).toBe(true);
    const ev = s.activity.at(-1)!;
    expect(s.undoable).toEqual({ eventId: ev.id });
    // A patient moved on again after the sign-out stays where it was put.
    s = reducer(s, { type: 'REASSIGN_PATIENT', patientId: 'C-002', toTeamId: 2, reason: 'x' });
    s = reducer(s, { type: 'UNDO_ASSIGN', eventId: ev.id });
    expect(s.undoable).toBeNull();
    expect(s.shift.patients.find(p => p.id === 'C-001')).toMatchObject({ assignedTeamId: 1, signouts: undefined });
    expect(s.shift.patients.find(p => p.id === 'C-002')!.assignedTeamId).toBe(2);
    expect(score(s, 1)).toBeGreaterThan(0);
    expect(s.activity.at(-1)).toMatchObject({ kind: 'signout_undo', teamId: 1, toTeamId: 3, patientCount: 1 });
  });

  it('undoes any logged patient action later, while the patient is unchanged since', () => {
    let s = started();
    s = reducer(s, { type: 'ASSIGN_PATIENT', tier: 'tier_one', teamId: 1, source: 'critical' });
    const placed = s.activity.at(-1)!;
    s = reducer(s, { type: 'ASSIGN_PATIENT', tier: 'tier_two', teamId: 2, source: 'critical' });
    s = { ...s, shift: { ...s.shift, now: s.shift.now + 5 * MIN } }; // well past the toast
    // C-001 unchanged since placement: its placement can still be undone.
    expect(undoBlocked(s, placed.id)).toBeNull();
    s = reducer(s, { type: 'REASSIGN_PATIENT', patientId: 'C-002', toTeamId: 3, reason: 'x' });
    const moved = s.activity.at(-1)!;
    s = reducer(s, { type: 'SET_FLOAT_MODIFIER', patientId: 'C-001', modifier: 'float_primary', floatName: 'Moreau' });
    const floated = s.activity.at(-1)!;
    // Placement of C-001 is now blocked (changed since); the float change is not.
    expect(undoBlocked(s, placed.id)).toBe('changed');
    s = reducer(s, { type: 'UNDO_EVENT', eventId: floated.id });
    expect(s.shift.patients.find(p => p.id === 'C-001')!.floatModifier).toBeUndefined();
    expect(undoBlocked(s, floated.id)).toBe('undone');
    // With the float change undone, the placement is undoable again.
    expect(undoBlocked(s, placed.id)).toBeNull();
    s = reducer(s, { type: 'UNDO_EVENT', eventId: moved.id });
    expect(s.shift.patients.find(p => p.id === 'C-002')!.assignedTeamId).toBe(2);
    s = reducer(s, { type: 'UNDO_EVENT', eventId: placed.id });
    expect(s.shift.patients.map(p => p.id)).toEqual(['C-002']);
    expect(s.activity.filter(e => e.kind === 'undo').map(e => e.kind === 'undo' && e.undoesEventId)).toEqual([floated.id, moved.id, placed.id]);
    // A blocked undo changes nothing.
    expect(reducer(s, { type: 'UNDO_EVENT', eventId: placed.id })).toBe(s);
  });

  it('correct color keeps the placed time and can be undone', () => {
    let s = started();
    s = reducer(s, { type: 'ASSIGN_PATIENT', tier: 'tier_one', teamId: 1, source: 'critical' });
    s = { ...s, shift: { ...s.shift, now: s.shift.now + 60 * MIN } };
    const t0 = s.shift.patients[0].assignedAt;
    s = reducer(s, { type: 'CORRECT_COLOR', patientId: 'C-001', toTier: 'tier_two' });
    const p = s.shift.patients[0];
    expect(p).toMatchObject({ acuity: 'tier_two', assignedAt: t0 });
    expect(p.upgradedAt).toBeUndefined();
    expect(contribution(p, s.shift.now)).toBeCloseTo(2 * (1 - 60 / 180), 10);
    const e = s.activity.at(-1)!;
    expect(e).toMatchObject({ kind: 'correct', patientId: 'C-001', acuity: 'tier_one', toAcuity: 'tier_two', teamId: 1 });
    s = reducer(s, { type: 'UNDO_EVENT', eventId: e.id });
    expect(s.shift.patients[0].acuity).toBe('tier_one');
  });

  it('reassign keeps the timer and the contribution', () => {
    let s = started();
    s = reducer(s, { type: 'ASSIGN_PATIENT', tier: 'tier_one', teamId: 1, source: 'critical' });
    s = { ...s, shift: { ...s.shift, now: s.shift.now + 45 * MIN } };
    const before = s.shift.patients[0];
    const c0 = contribution(before, s.shift.now);
    s = reducer(s, { type: 'REASSIGN_PATIENT', patientId: 'C-001', toTeamId: 2, reason: 'x' });
    const after = s.shift.patients[0];
    expect(after.assignedTeamId).toBe(2);
    expect(after.assignedAt).toBe(before.assignedAt);
    expect(after.upgradedAt).toBe(before.upgradedAt);
    expect(contribution(after, s.shift.now)).toBeCloseTo(c0);
    expect(minutesLeft(after, s.shift.now)).toBe(minutesLeft(before, s.shift.now));
  });

  it('upgrades to any higher color and restarts at full weight', () => {
    const cases: [string, 'tier_two' | 'tier_three', 'tier_one' | 'tier_two', number][] = [
      ['Purple to Yellow', 'tier_three', 'tier_two', 2],
      ['Purple to Red', 'tier_three', 'tier_one', 4],
      ['Yellow to Red', 'tier_two', 'tier_one', 4],
    ];
    for (const [, from, to, w] of cases) {
      let s = started();
      s = reducer(s, { type: 'ASSIGN_PATIENT', tier: from, teamId: 1, source: 'critical' });
      s = { ...s, shift: { ...s.shift, now: s.shift.now + 60 * MIN } };
      s = reducer(s, { type: 'UPGRADE_PATIENT', patientId: 'C-001', toTier: to });
      const p = s.shift.patients[0];
      expect(p.acuity).toBe(to);
      expect(p.upgradedAt).toBe(s.shift.now);
      expect(contribution(p, s.shift.now)).toBe(w);
      const e = s.activity.at(-1)!;
      expect(e.kind === 'upgrade' && [e.acuity, e.toAcuity]).toEqual([from, to]);
    }
  });

  it('refuses a downgrade dressed as an upgrade and defaults to Red', () => {
    let s = started();
    s = reducer(s, { type: 'ASSIGN_PATIENT', tier: 'tier_two', teamId: 1, source: 'critical' });
    const n = s.activity.length;
    s = reducer(s, { type: 'UPGRADE_PATIENT', patientId: 'C-001', toTier: 'tier_three' });
    expect(s.shift.patients[0].acuity).toBe('tier_two');
    expect(s.activity).toHaveLength(n);
    s = reducer(s, { type: 'UPGRADE_PATIENT', patientId: 'C-001' });
    expect(s.shift.patients[0].acuity).toBe('tier_one');
  });

  it('undo is gone after any later action on the patient', () => {
    const later: Array<(id: string) => Parameters<typeof reducer>[1]> = [
      id => ({ type: 'DECEASE_PATIENT', patientId: id }),
      id => ({ type: 'SET_FLOAT_MODIFIER', patientId: id, modifier: 'float_supervising', floatName: 'X' }),
      id => ({ type: 'REASSIGN_PATIENT', patientId: id, toTeamId: 2, reason: 'x' }),
      id => ({ type: 'UPGRADE_PATIENT', patientId: id }),
      id => ({ type: 'DOWNGRADE_PATIENT', patientId: id }),
    ];
    for (const act of later) {
      let s = started();
      s = reducer(s, { type: 'ASSIGN_PATIENT', tier: 'tier_three', teamId: 1, source: 'critical' });
      const id = s.undoable!.eventId;
      s = reducer(s, act('C-001'));
      expect(s.undoable).toBeNull();
      const n = s.activity.length;
      const buffers = s.shift.buffers.length;
      s = reducer(s, { type: 'UNDO_ASSIGN', eventId: id });
      expect(s.activity).toHaveLength(n);
      expect(s.shift.buffers).toHaveLength(buffers);
    }
  });

  it('undo is gone after a demo reset or a new sample, even if the patient number repeats', () => {
    let s = started();
    s = reducer(s, { type: 'ASSIGN_PATIENT', tier: 'tier_three', teamId: 1, source: 'critical' });
    const id = s.undoable!.eventId;
    s = reducer(s, { type: 'HYDRATE', shift: started().shift });
    expect(s.undoable).toBeNull();
    s = reducer(s, { type: 'ASSIGN_PATIENT', tier: 'tier_one', teamId: 2, source: 'critical' });
    expect(s.shift.patients[0].id).toBe('C-001');
    s = reducer(s, { type: 'UNDO_ASSIGN', eventId: id });
    expect(s.shift.patients).toHaveLength(1);
  });

  it('float primary patients do not count', () => {
    let s = started();
    s = reducer(s, { type: 'ASSIGN_PATIENT', tier: 'tier_one', teamId: 1, source: 'critical' });
    s = reducer(s, { type: 'SET_FLOAT_MODIFIER', patientId: 'C-001', modifier: 'float_primary', floatName: 'X' });
    expect(isCounted(s.shift.patients[0], s.shift.now)).toBe(false);
    s = reducer(s, { type: 'SET_FLOAT_MODIFIER', patientId: 'C-001', modifier: 'float_supervising', floatName: 'X' });
    expect(contribution(s.shift.patients[0], s.shift.now)).toBeCloseTo(2.6);
  });
});

describe('deceased patients (Roundtable 2026-09-28, Decision 17)', () => {
  const at = (s: SessionState, now: number): SessionState => ({ ...s, shift: { ...s.shift, now } });
  const recOf = (s: SessionState) =>
    getRecommendation(s.shift.providers, s.shift.patients, s.shift.buffers, s.shift.now, s.shift.closedTeams, scoringFor(s.shift));
  const loadOf = (s: SessionState, t: 1 | 2 | 3 | 4) => recOf(s).scores.find(x => x.teamId === t)!.load;

  it('takes the load off at once and shows the patient as not counted', () => {
    let s = started();
    s = reducer(s, { type: 'ASSIGN_PATIENT', tier: 'tier_one', teamId: 1, source: 'critical' });
    expect(loadOf(s, 1)).toBe(4);
    s = reducer(s, { type: 'DECEASE_PATIENT', patientId: 'C-001' });
    const p = s.shift.patients[0];
    expect(loadOf(s, 1)).toBe(0);
    expect(contribution(p, s.shift.now)).toBe(0);
    expect(isCounted(p, s.shift.now)).toBe(false);
    expect(timerRunning(p, s.shift.now)).toBe(false);
  });

  it('ranks the team last for 30 minutes, then leaves no residual load', () => {
    const t0 = 1_000_000_000;
    let s = started(t0);
    s = reducer(s, { type: 'ASSIGN_PATIENT', tier: 'tier_one', teamId: 1, source: 'critical' });
    s = reducer(s, { type: 'ASSIGN_PATIENT', tier: 'tier_three', teamId: 2, source: 'critical' });
    s = reducer(s, { type: 'ASSIGN_PATIENT', tier: 'tier_three', teamId: 3, source: 'critical' });
    s = reducer(s, { type: 'DECEASE_PATIENT', patientId: 'C-001' });
    // Team 1 has zero load (infinite ratio) but is buffered, so it is ranked last.
    s = at(s, t0 + DECEASED_BUFFER_MS - MIN);
    const during = recOf(s);
    expect(during.scores.find(x => x.teamId === 1)!.isBuffered).toBe(true);
    expect(during.first).not.toBe(1);
    expect(during.second).not.toBe(1);
    // After the buffer, nothing of the deceased patient remains on team 1.
    s = at(s, t0 + DECEASED_BUFFER_MS + MIN);
    expect(loadOf(s, 1)).toBe(0);
    expect(recOf(s).first).toBe(1);
  });

  it('when every open team is buffered, still recommends a team (least recently assigned)', () => {
    const t0 = 1_000_000_000;
    let s = started(t0);
    s = reducer(s, { type: 'ASSIGN_PATIENT', tier: 'tier_two', teamId: 1, source: 'critical' });
    s = at(s, t0 + MIN);
    s = reducer(s, { type: 'ASSIGN_PATIENT', tier: 'tier_two', teamId: 2, source: 'critical' });
    s = at(s, t0 + 2 * MIN);
    s = reducer(s, { type: 'ASSIGN_PATIENT', tier: 'tier_two', teamId: 3, source: 'critical' });
    for (const id of ['C-001', 'C-002', 'C-003']) s = reducer(s, { type: 'DECEASE_PATIENT', patientId: id });
    const rec = recOf(s);
    expect(rec.scores.filter(x => x.teamId !== 4).every(x => x.isBuffered)).toBe(true);
    expect(rec.first).toBe(1);
  });

  it('a closed team with a deceased patient stays out of recommendations and carries no load', () => {
    let s = started();
    s = reducer(s, { type: 'ASSIGN_PATIENT', tier: 'tier_one', teamId: 1, source: 'critical' });
    s = reducer(s, { type: 'DECEASE_PATIENT', patientId: 'C-001' });
    s = reducer(s, { type: 'CLOSE_TEAM', teamId: 1 });
    expect(loadOf(s, 1)).toBe(0);
    const rec = recOf(s);
    expect(rec.first).not.toBe(1);
    expect(rec.second).not.toBe(1);
  });

  it('reassigning a deceased patient moves no load and leaves the buffer on the original team', () => {
    let s = started();
    s = reducer(s, { type: 'ASSIGN_PATIENT', tier: 'tier_one', teamId: 1, source: 'critical' });
    s = reducer(s, { type: 'ASSIGN_PATIENT', tier: 'tier_three', teamId: 2, source: 'critical' });
    s = reducer(s, { type: 'DECEASE_PATIENT', patientId: 'C-001' });
    const before2 = loadOf(s, 2);
    s = reducer(s, { type: 'REASSIGN_PATIENT', patientId: 'C-001', toTeamId: 2, reason: 'wrong team' });
    const p = s.shift.patients.find(x => x.id === 'C-001')!;
    expect(p.assignedTeamId).toBe(2);
    expect(p.deceased).toBe(true);
    expect(loadOf(s, 2)).toBe(before2);
    const rec = recOf(s);
    expect(rec.scores.find(x => x.teamId === 1)!.isBuffered).toBe(true);
    expect(rec.scores.find(x => x.teamId === 2)!.isBuffered).toBe(false);
  });
});
