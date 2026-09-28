// © 2026 New York University. All rights reserved.
import { describe, expect, it } from 'vitest';
import type { Provider, ShiftState, TeamScore } from '../types';
import { initialState, scoringFor, shiftReducer } from './ShiftContext';
import { emptySession, makeSessionReducer, type SessionState } from './session';
import { formatRatio, highCount, gaugeLevel, contribution, isCounted, minutesLeft, timerRunning } from '../ui/model';
import { getRecommendation } from '../engine/recommendation';
import { CAPACITY_WEIGHTS, DECEASED_BUFFER_MS } from '../constants';

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
