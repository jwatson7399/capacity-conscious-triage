// © 2026 New York University. All rights reserved.
// Research comparison only. The app continues to use rosterAt's equal shares.
import type { Patient, Provider } from '../../src/types';
import { getCurrentLoad } from '../../src/engine/recommendation';
import { rosterAt, type Slot } from '../../src/schedule/week';

export type Rule = 'omit' | 'equal' | 'proportional' | 'legacy_duplicates';
export type Scope = 'all' | 'a_side' | 'overnight' | 'day_swing';
export const RULES: Rule[] = ['omit', 'equal', 'proportional', 'legacy_duplicates'];
export const SCOPES: Scope[] = ['all', 'a_side', 'overnight', 'day_swing'];

export function coverKind(slot: Slot): Exclude<Scope, 'all'> | null {
  if (!slot.coverTeams) return null;
  if (slot.coverSource) return slot.coverSource;
  if (slot.coverTeams.join(',') === '1,2,3') return 'a_side';
  return new Date(slot.start).getDate() !== new Date(slot.end).getDate() ? 'overnight' : 'day_swing';
}

export function providersForRule(slots: Slot[], now: number, patients: Patient[], rule: Rule, scope: Scope = 'all'): Provider[] {
  const entries = rosterAt(slots, now);
  const byKey = new Map(slots.map(s => [s.key, s]));
  const grouped = new Map<string, typeof entries>();
  for (const e of entries) {
    const key = e.scheduleKey.split('#')[0];
    const group = grouped.get(key) ?? [];
    group.push(e);
    grouped.set(key, group);
  }
  return entries.flatMap(e => {
    const key = e.scheduleKey.split('#')[0];
    const slot = byKey.get(key)!;
    if (slot.unknownLevel) throw new Error('Unresolved active role: this comparison window must be excluded.');
    const kind = coverKind(slot);
    let share = e.share;
    if (kind && (scope === 'all' || scope === kind)) {
      if (rule === 'omit' || (rule === 'legacy_duplicates' && kind === 'a_side')) return [];
      if (rule === 'legacy_duplicates') share = slot.countsZero ? 0 : 1;
      if (rule === 'proportional') {
        const group = grouped.get(key)!;
        const total = group.reduce((sum, x) => sum + getCurrentLoad(patients, x.teamId, now), 0);
        // An empty pool has no proportions. Equal shares preserve capacity and engine zero-load rules.
        share = slot.countsZero ? 0 : total > 0 ? getCurrentLoad(patients, e.teamId, now) / total : 1 / group.length;
      }
    }
    return [{ id: e.scheduleKey, name: 'SCHEDULED', type: e.type, teamId: e.teamId, share, status: 'active' as const, statusExpiresAt: null }];
  });
}
