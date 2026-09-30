// © 2026 New York University. All rights reserved.
import { describe, expect, it } from 'vitest';
import { getEffectiveCapacity, getRecommendation } from '../../src/engine/recommendation';
import type { Patient, TeamId } from '../../src/types';
import type { Slot } from '../../src/schedule/week';
import { coverKind, providersForRule, RULES } from './shared-provider-rules';
const now = new Date(2026, 8, 28, 12).getTime();
const teams: TeamId[] = [1, 2, 3];
const slot = (key: string, teamId: TeamId, extra: Partial<Slot> = {}): Slot => ({ key, name: key, teamId, type: 'attending', start: now - 3600000, end: now + 3600000, ...extra });
const base = teams.map(t => slot(`base${t}`, t));
const shared = slot('shared', 1, { type: 'senior_resident', coverTeams: teams });
const patients: Patient[] = teams.flatMap(t => Array.from({ length: t }, (_, i) => ({ id: `${t}-${i}`, assignedAt: now, assignedTeamId: t, acuity: 'tier_three' as const })));

describe('research sharing rules', () => {
  it('keeps a day swing ending at midnight separate from overnight cover', () => {
    const s = slot('swing', 1, { end: new Date(2026, 8, 29, 0).getTime(), coverTeams: [1, 3], coverSource: 'day_swing' });
    expect(coverKind(s)).toBe('day_swing');
  });
  it('conserves shared capacity for equal and proportional rules', () => {
    for (const rule of ['equal', 'proportional'] as const) {
      const ps = providersForRule([...base, shared], now, patients, rule);
      expect(getEffectiveCapacity(ps, now)).toBeCloseTo(60 + 15.2);
    }
    const ps = providersForRule([...base, shared], now, patients, 'proportional');
    expect(ps.filter(p => p.id.startsWith('shared')).map(p => p.share)).toEqual([1 / 6, 2 / 6, 3 / 6]);
  });
  it('proportional coverage of all eligible teams preserves their positive-load ranking', () => {
    const picks = ['omit', 'proportional'].map(rule => getRecommendation(providersForRule([...base, shared], now, patients, rule as 'omit' | 'proportional'), patients, [], now).first);
    expect(picks).toEqual([1, 1]);
  });
  it('a subset pool can change the recommendation under proportional sharing', () => {
    const subset = slot('subset', 2, { type: 'attending', coverTeams: [2, 3] });
    const two: Patient[] = [1, 2].map(t => ({ id: `${t}`, assignedAt: now, assignedTeamId: t as TeamId, acuity: 'tier_three' }));
    const slots = [...base.slice(0, 2), subset];
    expect(getRecommendation(providersForRule(slots, now, two, 'omit'), two, [], now, { 3: now }).first).toBe(1);
    expect(getRecommendation(providersForRule(slots, now, two, 'proportional'), two, [], now, { 3: now }).first).toBe(2);
  });
  it('all-zero loads use equal shares; a zero-load team gets zero proportional share when others have load', () => {
    expect(providersForRule([...base, shared], now, [], 'proportional').filter(p => p.id.startsWith('shared')).map(p => p.share)).toEqual([1 / 3, 1 / 3, 1 / 3]);
    expect(providersForRule([...base, shared], now, patients.filter(p => p.assignedTeamId !== 1), 'proportional').find(p => p.id === 'shared#1')?.share).toBe(0);
  });
  it('legacy duplicate comparison omits A-side and fully counts each other cover listing', () => {
    const side = slot('side', 1, { type: 'pa', coverTeams: [1, 3] });
    const ps = providersForRule([...base, shared, side], now, patients, 'legacy_duplicates');
    expect(ps.some(p => p.id.startsWith('shared'))).toBe(false);
    expect(getEffectiveCapacity(ps, now)).toBeCloseTo(60 + 2 * 11.4);
  });
  it('isolated A-side comparison holds other shared providers at equal shares', () => {
    const side = slot('side', 1, { type: 'pa', coverTeams: [1, 3] });
    const ps = providersForRule([...base, shared, side], now, patients, 'omit', 'a_side');
    expect(getEffectiveCapacity(ps, now)).toBeCloseTo(60 + 11.4);
  });
  it('refuses to guess unresolved active levels for any rule', () => {
    for (const rule of RULES) expect(() => providersForRule([...base, { ...shared, unknownLevel: true }], now, [], rule)).toThrow(/Unresolved/);
  });
});
