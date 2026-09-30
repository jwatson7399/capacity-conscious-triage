// © 2026 New York University. All rights reserved.
import { displayName, providerFromRoster, slotsOf } from './follow';
import { floatsAt, nextChange, openTeams, rosterAt, SCHEDULE_PARSER_VERSION, unresolved, weekRange, type StoredWeek } from './week';

export function dayLabel(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}
export function scheduleRange(week: StoredWeek): string {
  const range = weekRange(week);
  return range ? `${dayLabel(range.first)} to ${dayLabel(range.last)}` : 'No dated schedule';
}

export function scheduleReadiness(week: StoredWeek | null, now: number) {
  const { slots, floats } = week ? slotsOf(week) : { slots: [], floats: [] };
  const roster = rosterAt(slots, now);
  const open = openTeams(slots, now);
  const needsRole = week ? unresolved(week.days, week.roleFixes) : [];
  const needsOriginal = !!week && (week.parserVersion !== SCHEDULE_PARSER_VERSION || !!week.migrationError);
  const coversNow = roster.some(e => e.teamId !== 4 && e.share > 0);
  const endsAt = slots.length ? Math.max(...slots.map(s => s.end)) : null;
  const reason = !week ? 'Upload this week\'s schedule to see who is on now.'
    : needsOriginal ? week.migrationError ?? 'The saved schedule needs to be re-read. Upload its original file again.'
    : !coversNow ? `Schedule on this device: ${scheduleRange(week)}. It has nobody on shift on A-side now. Upload a schedule that covers now.`
    : needsRole.length ? 'Pick the missing resident roles before starting.' : null;
  return { roster, open, floats: floatsAt(floats, now).map(displayName), needsRole, needsOriginal, coversNow, endsAt,
    expiresSoon: endsAt !== null && endsAt > now && endsAt - now <= 24 * 3600000,
    next: nextChange(slots, now, floats), canStart: reason === null, reason };
}

/** Called on the click, not at preview time, so a handoff while reviewing cannot start old staff. */
export function prepareScheduleStart(week: StoredWeek, now: number) {
  const ready = scheduleReadiness(week, now);
  if (!ready.canStart) throw new Error(ready.reason!);
  return { providers: ready.roster.map(providerFromRoster), floats: ready.floats, follow: { week, suppress: {} } };
}
