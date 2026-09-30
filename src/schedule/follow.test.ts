// © 2026 New York University. All rights reserved.
// The live board following the uploaded schedule, through the real session reducer.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Provider, ShiftState } from '../types';
import type { ScheduleProvider } from '../utils/scheduleParser';
import { initialState, scoringFor, shiftReducer } from '../context/ShiftContext';
import { emptySession, makeSessionReducer, type SessionAction, type SessionState } from '../context/session';
import { getRecommendation } from '../engine/recommendation';
import { CAPACITY_WEIGHTS } from '../constants';
import { mergeWeek, type StoredWeek, type WeekDay } from './week';

const reducer = makeSessionReducer(shiftReducer, scoringFor);
const MON = '2026-09-28';
const at = (h: number, m = 0) => new Date(2026, 8, 28, h, m).getTime();
const p = (name: string, teamId: 1 | 2 | 3 | 4, shiftStart: string, shiftEnd: string, extra: Partial<ScheduleProvider> = {}): ScheduleProvider =>
  ({ name, type: 'attending', teamId, shiftStart, shiftEnd, ...extra });

const DAY: WeekDay = {
  isoDate: MON, date: 'September 28', dayOfWeek: 'Monday', floatAttendings: [{ name: 'FLOAT', shiftStart: '9A', shiftEnd: '9P' }],
  providers: [
    p('ALPHA', 1, '7A', '3P'), p('BRAVO', 1, '3P', '11P'), p('SENIOR', 1, '7A', '7P', { type: 'senior_resident' }),
    p('CHARLIE', 2, '7A', '7P'), p('INTERN', 2, '3P', '11P', { type: 'intern' }),
    p('DELTA', 3, '9A', '12A'),
    p('ECHO', 4, '9A', '1A'),
    p('NPA', 1, '7P', '7A', { type: 'pa', coverTeams: [1, 3] }), p('NPA', 3, '7P', '7A', { type: 'pa', coverTeams: [1, 3] }),
  ],
};
const WEEK: StoredWeek = mergeWeek(null, [DAY], 'test.xlsx', {}, at(6));

function run(s: SessionState, a: SessionAction): SessionState { return reducer(s, a); }
function tickAt(s: SessionState, t: number): SessionState { vi.setSystemTime(t); return run(s, { type: 'TICK' }); }
function startAt(t: number, providers: Provider[] = []): SessionState {
  vi.setSystemTime(t);
  let s = emptySession({ ...initialState, now: t } as ShiftState);
  s = run(s, { type: 'START_SHIFT', providers });
  return run(s, { type: 'SCHEDULE_FOLLOW', week: WEEK });
}
const on = (s: SessionState, team?: number) => s.shift.providers.filter(x => team === undefined || x.teamId === team).map(x => x.name).sort();

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

describe('following the schedule', () => {
  it('fills the board with who is on now and logs it as from the schedule', () => {
    const s = startAt(at(10));
    expect(on(s, 1)).toEqual(['Alpha', 'Senior']);
    expect(on(s, 3)).toEqual(['Delta']);
    expect(s.shift.floatAttendings).toEqual(['Float']);
    expect(s.activity.filter(e => e.kind === 'provider_add').every(e => 'auto' in e && e.auto)).toBe(true);
  });

  it('switches providers at 3 PM and the team strength changes with them', () => {
    let s = startAt(at(14, 59));
    const before = getRecommendation(s.shift.providers, [], [], s.shift.now, s.shift.closedTeams, scoringFor(s.shift)).scores.find(x => x.teamId === 2)!.capacity;
    s = tickAt(s, at(15, 0));
    expect(on(s, 1)).toEqual(['Bravo', 'Senior']);
    expect(on(s, 2)).toEqual(['Charlie', 'Intern']);
    const after = getRecommendation(s.shift.providers, [], [], s.shift.now, s.shift.closedTeams, scoringFor(s.shift)).scores.find(x => x.teamId === 2)!.capacity;
    expect(after - before).toBeCloseTo(CAPACITY_WEIGHTS.intern);
    const log = s.activity.map(e => e.kind === 'provider_add' || e.kind === 'provider_remove' ? `${e.kind}:${e.name}` : '').filter(Boolean);
    expect(log).toContain('provider_remove:Alpha');
    expect(log).toContain('provider_add:Bravo');
  });

  it('splits the N-side PA half and half, then counts them fully on Team 1 when Team 3 closes at 11 PM', () => {
    let s = startAt(at(21));
    const npa = (team: number) => s.shift.providers.find(x => x.name === 'Npa' && x.teamId === team);
    expect(npa(1)?.share).toBe(0.5);
    expect(npa(3)?.share).toBe(0.5);
    const t1Before = getRecommendation(s.shift.providers, [], [], s.shift.now, {}, scoringFor(s.shift)).scores.find(x => x.teamId === 1)!.capacity;
    expect(t1Before).toBeCloseTo(CAPACITY_WEIGHTS.attending + CAPACITY_WEIGHTS.pa / 2);
    s = tickAt(s, at(23, 0));
    expect(3 in s.shift.closedTeams).toBe(true);
    expect(npa(3)).toBeUndefined();
    expect(npa(1)?.share).toBe(1);
    // Team 3's own attending stays on the board until 12 AM, so its patients still count.
    expect(on(s, 3)).toEqual(['Delta']);
    expect(s.activity.some(e => e.kind === 'team_close' && e.teamId === 3 && e.auto)).toBe(true);
    // The PA is still on shift, so the log does not say they left.
    expect(s.activity.some(e => e.kind === 'provider_remove' && e.name === 'Npa')).toBe(false);
  });

  it('never recommends Team 3 after 11 PM', () => {
    let s = startAt(at(22, 50));
    s = tickAt(s, at(23, 5));
    const rec = getRecommendation(s.shift.providers, [], [], s.shift.now, s.shift.closedTeams, scoringFor(s.shift));
    expect(rec.first).not.toBe(3);
    expect(rec.second).not.toBe(3);
  });

  it('keeps a hand removal until that shift ends', () => {
    let s = startAt(at(10));
    const alpha = s.shift.providers.find(x => x.name === 'Alpha')!;
    s = run(s, { type: 'REMOVE_PROVIDER', providerId: alpha.id });
    s = tickAt(s, at(10, 1));
    expect(on(s, 1)).toEqual(['Senior']);
    s = tickAt(s, at(15, 0));
    expect(on(s, 1)).toEqual(['Bravo', 'Senior']);
  });

  it('a hand swap fills the slot until its shift ends, then the schedule takes over', () => {
    let s = startAt(at(10));
    const alpha = s.shift.providers.find(x => x.name === 'Alpha')!;
    s = run(s, { type: 'SWAP_PROVIDER', outProviderId: alpha.id, incoming: { name: 'Cover', type: 'attending', teamId: 1 } });
    s = tickAt(s, at(12));
    expect(on(s, 1)).toEqual(['Cover', 'Senior']);
    s = tickAt(s, at(15));
    expect(on(s, 1)).toEqual(['Bravo', 'Senior']);
  });

  it('keeps a provider added by hand', () => {
    let s = startAt(at(10));
    s = run(s, { type: 'ADD_PROVIDERS', providers: [{ id: 'x', name: 'Extra', type: 'pa', status: 'active', statusExpiresAt: null, teamId: 2 }] });
    s = tickAt(s, at(15));
    expect(on(s, 2)).toContain('Extra');
  });

  it('a team closed by hand stays closed', () => {
    let s = startAt(at(10));
    s = run(s, { type: 'CLOSE_TEAM', teamId: 2 });
    s = tickAt(s, at(15));
    expect(2 in s.shift.closedTeams).toBe(true);
  });

  it('a team reopened by hand while the schedule has it closed stays open', () => {
    let s = startAt(at(23, 10));
    expect(3 in s.shift.closedTeams).toBe(true);
    s = run(s, { type: 'REOPEN_TEAM', teamId: 3 });
    s = tickAt(s, at(23, 20));
    expect(3 in s.shift.closedTeams).toBe(false);
  });

  it('opens Team 3 in the morning when its own shift starts', () => {
    let s = startAt(at(8));
    expect(3 in s.shift.closedTeams).toBe(true);
    s = tickAt(s, at(9));
    expect(3 in s.shift.closedTeams).toBe(false);
    expect(s.activity.some(e => e.kind === 'team_reopen' && e.teamId === 3 && e.auto)).toBe(true);
  });

  it('keeps the draft people it was started with and does not add them twice', () => {
    vi.setSystemTime(at(10));
    let s = emptySession({ ...initialState, now: at(10) } as ShiftState);
    s = run(s, { type: 'START_SHIFT', providers: [{ id: 'a', name: 'Alpha', type: 'attending', status: 'active', statusExpiresAt: null, teamId: 1, scheduleKey: `${MON}|1|alpha|7A`, endsAt: at(15) }] });
    s = run(s, { type: 'SCHEDULE_FOLLOW', week: WEEK });
    expect(s.shift.providers.filter(x => x.name === 'Alpha')).toHaveLength(1);
  });

  it('respects people deleted from the setup draft', () => {
    vi.setSystemTime(at(10));
    let s = emptySession({ ...initialState, now: at(10) } as ShiftState);
    s = run(s, { type: 'START_SHIFT', providers: [] });
    s = run(s, { type: 'SCHEDULE_FOLLOW', week: WEEK, suppress: { [`${MON}|1|alpha|7A`]: at(15) } });
    expect(on(s, 1)).toEqual(['Senior']);
  });

  it('stops changing the board after Stop following', () => {
    let s = startAt(at(14));
    s = run(s, { type: 'SCHEDULE_STOP' });
    s = tickAt(s, at(15, 30));
    expect(on(s, 1)).toEqual(['Alpha', 'Senior']);
  });

  it('holds the board as it is once the uploaded week has ended', () => {
    let s = startAt(at(21));
    const before = on(s);
    s = tickAt(s, new Date(2026, 8, 29, 8).getTime());
    expect(on(s)).toEqual(before);
    expect(1 in s.shift.closedTeams).toBe(false);
  });
});
