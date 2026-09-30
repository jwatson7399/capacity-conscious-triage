// © 2026 New York University. All rights reserved.
//
// The uploaded weekly schedule, turned into timed slots, and who is on each team at a given
// moment. Pure functions: the session reducer (src/context/session.ts) calls them on each tick
// so the board follows the schedule (Roundtable Decisions 40 to 42).
//
// Rules:
// - A provider joins exactly at the start of their shift and leaves exactly at its end.
// - Team 3 takes no new patients from 11 PM, Team 4 from 12 AM (both until 7 AM); their people
//   stay on the board until their shifts end. A team with nobody of its own on shift is closed.
// - An overnight side provider (N-side: Teams 1 and 3, B-side: Teams 2 and 4) or a day swing
//   resident counts half on each team they cover while both are open, and fully on the one that
//   stays open once the other closes.
// - Dental residents are listed but add no strength.
// Times are the device's local clock, the same clock the board runs on.

import type { ProviderType, TeamId } from '../types';
import { parseTimeToHour, type DaySchedule, type ScheduleProvider } from '../utils/scheduleParser';

/** One day of the stored week. isoDate is the calendar date, YYYY-MM-DD. */
export interface WeekDay extends DaySchedule { isoDate: string }

export interface StoredWeek {
  days: WeekDay[];
  /** File name(s) the days came from, newest last. */
  sources: string[];
  loadedAt: number;
  /** Roles picked by hand for residents the sheet gives no level for, keyed by lowercase name. */
  roleFixes: Record<string, ProviderType>;
}

export interface Slot {
  key: string;
  name: string;
  type: ProviderType;
  /** The team column the sheet lists them under. */
  teamId: TeamId;
  start: number;
  end: number;
  /** Teams covered at once (overnight side or day swing). */
  coverTeams?: TeamId[];
  countsZero?: boolean;
  unknownLevel?: boolean;
}

export interface FloatSlot { name: string; start: number; end: number }

/** One provider the schedule puts on a team at a moment. */
export interface RosterEntry {
  /** Stable id for this slot on this team; the board provider carries it as scheduleKey. */
  scheduleKey: string;
  name: string;
  type: ProviderType;
  teamId: TeamId;
  /** Fraction of the provider's strength counted on this team (1, 0.5, or 0 for dental). */
  share: number;
  endsAt: number;
  note?: string;
}

export const TEAMS: TeamId[] = [1, 2, 3, 4];
/** Local hour a team stops taking new patients, and the hour it may reopen (Decision 42). */
export const NIGHT_CUTOFF: Partial<Record<TeamId, { from: number; until: number }>> = {
  3: { from: 23, until: 7 },
  4: { from: 0, until: 7 },
};
/** The team a two-team cover counts on when only one of its teams is open. */
const HOME: Record<TeamId, TeamId> = { 1: 1, 2: 2, 3: 1, 4: 2 };

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function localMidnight(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function isoOf(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Days with a calendar date. When a sheet's date disagrees with its weekday (one old sheet was typed
 * with the wrong year), the year is moved by one to match the weekday, and the day is reported as
 * corrected so the upload screen can say so. Days with no readable date are dropped and counted.
 */
export function datedDays(days: DaySchedule[]): { days: WeekDay[]; corrected: number; undated: number } {
  let corrected = 0;
  let undated = 0;
  const out: WeekDay[] = [];
  for (const d of days) {
    if (!d.isoDate) { undated++; continue; }
    let date = localMidnight(d.isoDate);
    if (DAY_NAMES[date.getDay()] !== d.dayOfWeek) {
      const fix = [-1, 1].map(dy => new Date(date.getFullYear() + dy, date.getMonth(), date.getDate()))
        .find(x => DAY_NAMES[x.getDay()] === d.dayOfWeek);
      if (fix) { date = fix; corrected++; }
    }
    out.push({ ...d, isoDate: isoOf(date) });
  }
  return { days: out.sort((a, b) => a.isoDate.localeCompare(b.isoDate)), corrected, undated };
}

/** Absolute start and end for a shift listed on a day. An end at or before the start is the next day. */
export function shiftWindow(isoDate: string, start?: string, end?: string): { start: number; end: number } | null {
  if (!start || !end) return null;
  const s = parseTimeToHour(start);
  const e = parseTimeToHour(end);
  if (s < 0 || e < 0) return null;
  const base = localMidnight(isoDate);
  const at = (h: number) => new Date(base.getFullYear(), base.getMonth(), base.getDate(), Math.floor(h), Math.round((h % 1) * 60)).getTime();
  const startMs = at(s);
  let endMs = at(e);
  if (endMs <= startMs) endMs = at(e + 24);
  return { start: startMs, end: endMs };
}

/** Merge a new upload into a stored week: the new file's dates replace the same dates (a mid-week resend). */
export function mergeWeek(prev: StoredWeek | null, days: WeekDay[], source: string, roleFixes: Record<string, ProviderType>, now: number): StoredWeek {
  const incoming = new Set(days.map(d => d.isoDate));
  // Keep earlier days only for the overnight carry-over into the new week; drop anything older than 8 days.
  const oldest = isoOf(new Date(now - 8 * 86_400_000));
  const kept = (prev?.days ?? []).filter(d => !incoming.has(d.isoDate) && d.isoDate >= oldest);
  return {
    days: [...kept, ...days].sort((a, b) => a.isoDate.localeCompare(b.isoDate)),
    sources: [...(prev?.sources ?? []), source].slice(-4),
    loadedAt: now,
    roleFixes: { ...(prev?.roleFixes ?? {}), ...roleFixes },
  };
}

/** Every timed slot in the week. The same person listed under both covered teams becomes one slot. */
export function buildSlots(week: Pick<StoredWeek, 'days' | 'roleFixes'>): { slots: Slot[]; floats: FloatSlot[]; untimed: number } {
  const byKey = new Map<string, Slot>();
  const floats: FloatSlot[] = [];
  let untimed = 0;
  for (const d of week.days) {
    for (const p of d.providers as ScheduleProvider[]) {
      const w = shiftWindow(d.isoDate, p.shiftStart, p.shiftEnd);
      if (!w) { untimed++; continue; }
      const fixed = week.roleFixes[p.name.toLowerCase()];
      const type = p.unknownLevel && fixed ? fixed : p.type;
      const cover = p.coverTeams && p.coverTeams.length > 1 ? [...p.coverTeams].sort() : undefined;
      const key = cover
        ? `${d.isoDate}|${cover.join('+')}|${p.name.toLowerCase()}|${p.shiftStart}`
        : `${d.isoDate}|${p.teamId}|${p.name.toLowerCase()}|${p.shiftStart}`;
      if (byKey.has(key)) continue;
      byKey.set(key, {
        key, name: p.name, type, teamId: p.teamId, start: w.start, end: w.end,
        ...(cover ? { coverTeams: cover } : {}),
        ...(p.countsZero ? { countsZero: true } : {}),
        ...(p.unknownLevel && !fixed ? { unknownLevel: true } : {}),
      });
    }
    for (const f of d.floatAttendings) {
      const w = shiftWindow(d.isoDate, f.shiftStart, f.shiftEnd);
      if (w) floats.push({ name: f.name, ...w });
    }
  }
  return { slots: [...byKey.values()].sort((a, b) => a.start - b.start), floats, untimed };
}

const on = (s: { start: number; end: number }, t: number) => s.start <= t && t < s.end;

function inCutoff(team: TeamId, t: number): boolean {
  const c = NIGHT_CUTOFF[team];
  if (!c) return false;
  const h = new Date(t).getHours();
  return c.from < c.until ? h >= c.from && h < c.until : h >= c.from || h < c.until;
}

/** Teams the schedule has open at t: someone of their own on shift, and not in the night cutoff. */
export function openTeams(slots: Slot[], t: number): Set<TeamId> {
  const open = new Set<TeamId>();
  for (const s of slots) if (!s.coverTeams && on(s, t)) open.add(s.teamId);
  for (const team of TEAMS) if (inCutoff(team, t)) open.delete(team);
  return open;
}

/** Who the schedule puts on each team at t. */
export function rosterAt(slots: Slot[], t: number): RosterEntry[] {
  const open = openTeams(slots, t);
  const out: RosterEntry[] = [];
  for (const s of slots) {
    if (!on(s, t)) continue;
    const base = s.countsZero ? 0 : 1;
    const zeroNote = s.countsZero ? 'Dental resident, not counted' : undefined;
    if (!s.coverTeams) {
      out.push({ scheduleKey: s.key, name: s.name, type: s.type, teamId: s.teamId, share: base, endsAt: s.end, note: zeroNote });
      continue;
    }
    const live = s.coverTeams.filter(team => open.has(team));
    const teams = live.length > 0 ? live : [HOME[s.coverTeams[0]]];
    const share = base / teams.length;
    const note = teams.length > 1
      ? `Covers ${teams.map(x => `Team ${x}`).join(' and ')}, counted ${share === 0.5 ? 'half' : `${Math.round(share * 100)}%`} here`
      : `Covers ${s.coverTeams.map(x => `Team ${x}`).join(' and ')}; only this team is open`;
    for (const team of teams) {
      out.push({ scheduleKey: `${s.key}#${team}`, name: s.name, type: s.type, teamId: team, share, endsAt: s.end, note: zeroNote ?? note });
    }
  }
  return out;
}

/** Float attendings on shift at t, in schedule order, without repeats. */
export function floatsAt(floats: FloatSlot[], t: number): string[] {
  return [...new Set(floats.filter(f => on(f, t)).map(f => f.name))];
}

/** The next moment after t when anyone joins or leaves, a team opens or closes, or a split changes. */
export function nextChange(slots: Slot[], t: number): number | null {
  let best = Infinity;
  for (const s of slots) {
    if (s.start > t && s.start < best) best = s.start;
    if (s.end > t && s.end < best) best = s.end;
  }
  // Night cutoffs are changes too.
  const d = new Date(t);
  for (const c of Object.values(NIGHT_CUTOFF)) {
    for (const h of [c!.from, c!.until]) {
      const x = new Date(d.getFullYear(), d.getMonth(), d.getDate(), h).getTime();
      const cand = x > t ? x : x + 86_400_000;
      if (cand < best) best = cand;
    }
  }
  return isFinite(best) ? best : null;
}

/** Residents the sheet gives no level for and no one has picked a role for yet (one per name). */
export function unresolved(days: DaySchedule[], roleFixes: Record<string, ProviderType>): string[] {
  const names = new Set<string>();
  for (const d of days) for (const p of d.providers) {
    if (p.unknownLevel && !roleFixes[p.name.toLowerCase()]) names.add(p.name);
  }
  return [...names].sort();
}

/** The first and last calendar day stored. */
export function weekRange(week: StoredWeek): { first: string; last: string } | null {
  if (week.days.length === 0) return null;
  return { first: week.days[0].isoDate, last: week.days[week.days.length - 1].isoDate };
}
