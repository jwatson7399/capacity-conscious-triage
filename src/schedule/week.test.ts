// © 2026 New York University. All rights reserved.
// Schedule-driven roster rules (Roundtable Decisions 40 to 42), on small made-up weeks.
import { describe, expect, it } from 'vitest';
import { getEffectiveCapacity, getRecommendation } from '../engine/recommendation';
import type { Provider, Patient, TeamId } from '../types';
import type { DaySchedule, ScheduleProvider } from '../utils/scheduleParser';
import { buildSlots, datedDays, floatsAt, mergeWeek, nextChange, openTeams, rosterAt, shiftWindow, unresolved, type WeekDay } from './week';

const at = (iso: string, h: number, m = 0) => { const [y, mo, d] = iso.split('-').map(Number); return new Date(y, mo - 1, d, h, m).getTime(); };
const MON = '2026-09-28';
const TUE = '2026-09-29';

function day(isoDate: string, dayOfWeek: string, providers: ScheduleProvider[], floats: DaySchedule['floatAttendings'] = []): WeekDay {
  return { isoDate, date: isoDate, dayOfWeek, providers, floatAttendings: floats };
}
const p = (name: string, teamId: 1 | 2 | 3 | 4, shiftStart: string, shiftEnd: string, extra: Partial<ScheduleProvider> = {}): ScheduleProvider =>
  ({ name, type: 'attending', teamId, shiftStart, shiftEnd, ...extra });
const roster = (days: WeekDay[], t: number) => rosterAt(buildSlots({ days, roleFixes: {} }).slots, t);
const names = (days: WeekDay[], t: number, team?: number) => roster(days, t).filter(e => team === undefined || e.teamId === team).map(e => e.name).sort();

describe('shift windows', () => {
  it('an end at or before the start is the next day', () => {
    const w = shiftWindow(MON, '11P', '7A')!;
    expect(w.start).toBe(at(MON, 23));
    expect(w.end).toBe(at(TUE, 7));
  });
  it('reads times without a colon', () => {
    const w = shiftWindow(MON, '830A', '1030P')!;
    expect(w.start).toBe(at(MON, 8, 30));
    expect(w.end).toBe(at(MON, 22, 30));
  });
});

describe('who is on', () => {
  const days = [
    day(MON, 'Monday', [p('DAY1', 1, '7A', '3P'), p('EVE1', 1, '3P', '11P'), p('NIGHTMON', 1, '11P', '7A')]),
    day(TUE, 'Tuesday', [p('DAY1B', 1, '7A', '3P'), p('NIGHTTUE', 1, '11P', '7A')]),
  ];
  it('at 3 AM Tuesday the Monday-night crew is on, not the Tuesday-night crew', () => {
    expect(names(days, at(TUE, 3))).toEqual(['NIGHTMON']);
  });
  it('a handoff switches exactly at the scheduled time', () => {
    expect(names(days, at(MON, 14, 59))).toEqual(['DAY1']);
    expect(names(days, at(MON, 15, 0))).toEqual(['EVE1']);
  });
  it('the next change is the next start or end', () => {
    const { slots } = buildSlots({ days, roleFixes: {} });
    expect(nextChange(slots, at(MON, 9))).toBe(at(MON, 15));
  });
});

describe('overnight side cover and night closing (Decision 42)', () => {
  const days = [day(MON, 'Monday', [
    p('T1ATT', 1, '7A', '7P'), p('T1NIGHT', 1, '7P', '7A'),
    p('T2ATT', 2, '7A', '7P'), p('T2NIGHT', 2, '7P', '7A'),
    p('T3ATT', 3, '3P', '12A'),
    p('T4ATT', 4, '4P', '1A'),
    p('NPA', 1, '7P', '7A', { type: 'pa', coverTeams: [1, 3] }), p('NPA', 3, '7P', '7A', { type: 'pa', coverTeams: [1, 3] }),
    p('BPA', 2, '7P', '7A', { type: 'pa', coverTeams: [2, 4] }), p('BPA', 4, '7P', '7A', { type: 'pa', coverTeams: [2, 4] }),
  ])];
  const share = (t: number, name: string, team: number) => roster(days, t).find(e => e.name === name && e.teamId === team)?.share;

  it('counts an N-side PA half on Team 1 and half on Team 3 while both are open', () => {
    expect(share(at(MON, 21), 'NPA', 1)).toBe(0.5);
    expect(share(at(MON, 21), 'NPA', 3)).toBe(0.5);
  });
  it('Team 3 stops taking patients at 11 PM; its attending stays on until 12 AM; the PA counts fully on Team 1', () => {
    const t = at(MON, 23, 30);
    expect(openTeams(buildSlots({ days, roleFixes: {} }).slots, t).has(3)).toBe(false);
    expect(names(days, t, 3)).toEqual(['T3ATT']);
    expect(share(t, 'NPA', 1)).toBe(1);
    expect(share(t, 'NPA', 3)).toBeUndefined();
  });
  it('Team 4 closes at 12 AM; the B-side PA then counts fully on Team 2', () => {
    expect(share(at(MON, 23, 30), 'BPA', 2)).toBe(0.5);
    const t = at(TUE, 0, 30);
    expect(openTeams(buildSlots({ days, roleFixes: {} }).slots, t).has(4)).toBe(false);
    expect(share(t, 'BPA', 2)).toBe(1);
  });
  it('a person listed under both covered teams is one person: their shares add to 1', () => {
    for (const h of [20, 22, 23.5, 25, 30]) {
      const t = at(MON, 0) + h * 3_600_000;
      const total = roster(days, t).filter(e => e.name === 'NPA').reduce((s, e) => s + e.share, 0);
      expect(total).toBe(1);
    }
  });
  it('Team 3 stays closed until 7 AM even if someone of its own is listed earlier', () => {
    const early = [day(TUE, 'Tuesday', [p('T3EARLY', 3, '5A', '1P')])];
    const { slots } = buildSlots({ days: early, roleFixes: {} });
    expect(openTeams(slots, at(TUE, 6)).has(3)).toBe(false);
    expect(openTeams(slots, at(TUE, 7)).has(3)).toBe(true);
  });
});

describe('A-side shared strength', () => {
  const teams: TeamId[] = [1, 2, 3];
  const days = [day(MON, 'Monday', [
    ...teams.map(t => p(`ATT${t}`, t, '7A', '1A')),
    ...teams.map(t => p('ASIDE', t, '10A', '12A', { type: 'senior_resident', coverTeams: teams })),
  ])];
  const now = at(MON, 12);
  const shared = roster(days, now).filter(e => e.name === 'ASIDE');
  const providers: Provider[] = shared.map(e => ({ ...e, id: e.scheduleKey, status: 'active', statusExpiresAt: null }));
  it('deduplicates three listings and conserves one provider with one third on each team', () => {
    expect(buildSlots({ days, roleFixes: {} }).slots.filter(s => s.name === 'ASIDE')).toHaveLength(1);
    expect(shared).toHaveLength(3);
    expect(shared.reduce((sum, e) => sum + e.share, 0)).toBeCloseTo(1);
    for (const e of shared) {
      expect(e.share).toBeCloseTo(1 / 3);
      expect(getEffectiveCapacity(providers.filter(p => p.teamId === e.teamId), now)).toBeCloseTo(15.2 / 3);
      expect(e.note).toBe('Covers Team 1, Team 2 and Team 3, counted a third here');
    }
  });
  it('splits between Teams 1 and 2 after the Team 3 scheduled close', () => {
    const late = roster(days, at(MON, 23)).filter(e => e.name === 'ASIDE');
    expect(late.map(e => [e.teamId, e.share])).toEqual([[1, 0.5], [2, 0.5]]);
  });
  it('the worked example changes the recommendation from Team 2 to Team 1', () => {
    // Synthetic capacities 20, 44, 30, with loads 1, 2, 3 at the same instant.
    const base: Provider[] = teams.map((teamId, i) => ({ id: `base${teamId}`, name: 'EXAMPLE', teamId, type: 'attending', status: 'active', statusExpiresAt: null, share: [20, 44, 30][i] / 20 }));
    const patients: Patient[] = teams.flatMap(teamId => Array.from({ length: teamId }, (_, i) => ({ id: `${teamId}-${i}`, acuity: 'tier_three' as const, assignedTeamId: teamId, assignedAt: now })));
    expect(getRecommendation(base, patients, [], now).first).toBe(2);
    const after = getRecommendation([...base, ...providers], patients, [], now);
    expect(after.first).toBe(1);
    expect(after.scores.find(s => s.teamId === 1)?.capacityRatio).toBeCloseTo(25.0667, 4);
    expect(after.scores.find(s => s.teamId === 2)?.capacityRatio).toBeCloseTo(24.5333, 4);
  });
});

describe('levels', () => {
  it('a dental resident is listed but adds no strength', () => {
    const days = [day(MON, 'Monday', [p('DENT', 2, '830A', '5P', { type: 'rotator', countsZero: true })])];
    const e = roster(days, at(MON, 10))[0];
    expect(e.share).toBe(0);
    expect(e.note).toMatch(/not counted/);
  });
  it('a resident with no level needs a role; the picked role is used', () => {
    const days = [day(MON, 'Monday', [p('NEWRES', 1, '7A', '7P', { type: 'senior_resident', unknownLevel: true })])];
    expect(unresolved(days, {})).toEqual(['NEWRES']);
    expect(unresolved(days, { newres: 'intern' })).toEqual([]);
    const { slots } = buildSlots({ days, roleFixes: { newres: 'intern' } });
    expect(rosterAt(slots, at(MON, 10))[0].type).toBe('intern');
  });
});

describe('dates and resends', () => {
  it('moves a mistyped year to match the weekday', () => {
    // 2025-02-16 is a Sunday; the sheet calls it Monday. 2026-02-16 is a Monday.
    const out = datedDays([{ date: 'February 16', dayOfWeek: 'Monday', providers: [], floatAttendings: [], isoDate: '2025-02-16' }]);
    expect(out.corrected).toBe(1);
    expect(out.days[0].isoDate).toBe('2026-02-16');
  });
  it('a resent file replaces the same dates and keeps the others', () => {
    const first = mergeWeek(null, [day(MON, 'Monday', [p('OLD', 1, '7A', '3P')]), day(TUE, 'Tuesday', [p('KEEP', 1, '7A', '3P')])], 'a.xlsx', {}, at(MON, 6));
    const next = mergeWeek(first, [day(MON, 'Monday', [p('NEW', 1, '7A', '3P')])], 'b.xlsx', {}, at(MON, 8));
    expect(next.days.map(d => d.providers[0].name)).toEqual(['NEW', 'KEEP']);
    expect(next.sources).toEqual(['a.xlsx', 'b.xlsx']);
  });
  it('floats follow their shift times', () => {
    const days = [day(MON, 'Monday', [], [{ name: 'FLOATAM', shiftStart: '7A', shiftEnd: '3P' }, { name: 'FLOATPM', shiftStart: '3P', shiftEnd: '11P' }])];
    const { floats } = buildSlots({ days, roleFixes: {} });
    expect(floatsAt(floats, at(MON, 10))).toEqual(['FLOATAM']);
    expect(floatsAt(floats, at(MON, 16))).toEqual(['FLOATPM']);
  });
});
