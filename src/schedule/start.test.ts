// © 2026 New York University. All rights reserved.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { emptySession, makeSessionReducer } from '../context/session';
import { initialState, shiftReducer, scoringFor } from '../context/ShiftContext';
import { mergeWeek, type StoredWeek } from './week';
import { prepareScheduleStart, scheduleReadiness } from './start';
const at = (h: number) => new Date(2026, 8, 28, h).getTime();
const reducer = makeSessionReducer(shiftReducer, scoringFor);
const week: StoredWeek = mergeWeek(null, [{ isoDate: '2026-09-28', date: 'September 28', dayOfWeek: 'Monday', providers: [
  { name: 'ALPHA', type: 'attending', teamId: 1, shiftStart: '7A', shiftEnd: '3P' },
  { name: 'BRAVO', type: 'attending', teamId: 1, shiftStart: '3P', shiftEnd: '11P' },
  { name: 'CHARLIE', type: 'attending', teamId: 2, shiftStart: '7A', shiftEnd: '11P' },
  { name: 'DELTA', type: 'attending', teamId: 3, shiftStart: '7A', shiftEnd: '12A' },
  { name: 'ASIDE', type: 'senior_resident', teamId: 1, shiftStart: '10A', shiftEnd: '8P', coverTeams: [1, 2, 3] },
], floatAttendings: [{ name: 'FLOAT', shiftStart: '9A', shiftEnd: '5P' }] }], 'test.xlsx', {}, at(6));
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(at(12)); });
afterEach(() => vi.useRealTimers());

describe('starting from the current schedule', () => {
  it('matches schedule synchronization and the first tick adds or removes nobody', () => {
    const start = prepareScheduleStart(week, at(12));
    let s = emptySession({ ...initialState, now: at(12) });
    s = reducer(s, { type: 'START_SHIFT', providers: start.providers });
    s = reducer(s, { type: 'SET_FLOAT_ATTENDINGS', names: start.floats });
    s = reducer(s, { type: 'SCHEDULE_FOLLOW', ...start.follow });
    expect(s.shift.providers).toEqual(start.providers);
    expect(s.shift.floatAttendings).toEqual(['Float']);
    expect(s.shift.closedTeams).toHaveProperty('4');
    expect(s.activity.filter(e => e.kind === 'provider_add' || e.kind === 'provider_remove')).toEqual([]);
    const before = s;
    vi.setSystemTime(at(12) + 1000);
    s = reducer(s, { type: 'TICK' });
    expect(s.shift.providers).toEqual(before.shift.providers);
    expect(s.activity).toEqual(before.activity);
    let sync = emptySession({ ...initialState, now: at(12) });
    sync = reducer(sync, { type: 'START_SHIFT', providers: [] });
    sync = reducer(sync, { type: 'SCHEDULE_FOLLOW', week });
    const shape = (ps: typeof start.providers) => ps.map(p => ({ ...p, id: '' }));
    expect(shape(s.shift.providers)).toEqual(shape(sync.shift.providers));
    expect(s.shift.closedTeams).toEqual(sync.shift.closedTeams);
  });
  it('builds from the click time, so a handoff after preview uses the incoming provider', () => {
    expect(prepareScheduleStart(week, at(14)).providers.some(p => p.name === 'Alpha')).toBe(true);
    const clicked = prepareScheduleStart(week, at(15));
    expect(clicked.providers.some(p => p.name === 'Alpha')).toBe(false);
    expect(clicked.providers.some(p => p.name === 'Bravo')).toBe(true);
  });
  it('stale or old-version weeks cannot start following, including direct reducer calls', () => {
    for (const [w, now] of [[week, at(32)], [{ ...week, parserVersion: undefined }, at(12)]] as const) {
      expect(scheduleReadiness(w, now).canStart).toBe(false);
      expect(() => prepareScheduleStart(w, now)).toThrow();
      const s = emptySession({ ...initialState, now });
      expect(reducer(s, { type: 'SCHEDULE_FOLLOW', week: w })).toBe(s);
    }
  });
  it('a wrong-week live update cannot replace an active followed roster', () => {
    const s = reducer(emptySession({ ...initialState, now: at(12) }), { type: 'SCHEDULE_FOLLOW', week });
    const wrong = { ...week, days: [] };
    expect(reducer(s, { type: 'SCHEDULE_UPDATE', week: wrong })).toBe(s);
  });
  it('includes float handoffs in the next change time', () => {
    expect(scheduleReadiness(week, at(16)).next).toBe(at(17));
  });
  it('unknown roles block readiness and a schedule ending within 24 hours is flagged', () => {
    const bad = { ...week, days: week.days.map(d => ({ ...d, providers: d.providers.map(p => p.name === 'ASIDE' ? { ...p, unknownLevel: true } : p) })) };
    expect(scheduleReadiness(bad, at(12)).canStart).toBe(false);
    expect(scheduleReadiness(bad, at(12)).needsRole).toEqual(['ASIDE']);
    expect(scheduleReadiness(week, at(12)).expiresSoon).toBe(true);
  });
});
