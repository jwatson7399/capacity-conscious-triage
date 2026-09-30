// © 2026 New York University. All rights reserved.
//
// Keeping the live board in step with the uploaded schedule. Called by the session reducer on
// each live tick and when following starts. Pure: it returns the new shift and the activity
// events to log, and never touches a provider or team someone changed by hand:
// - A provider removed or swapped out by hand stays off until that slot's shift ends.
// - Providers added by hand stay until someone removes them; one swapped into a scheduled slot
//   leaves when that slot's shift ends.
// - A team closed by hand stays closed until reopened by hand. A team the schedule closed and
//   someone reopened stays open until the schedule next opens it on its own.
// Nothing here changes how a team is scored; it only changes who is on the board.

import type { Provider, ShiftAction, ShiftState, TeamId } from '../types';
import type { NewEvent } from '../activity';
import { uid } from '../uid';
import { buildSlots, floatsAt, openTeams, rosterAt, TEAMS, type Slot, type FloatSlot, type StoredWeek } from './week';

export interface FollowState {
  week: StoredWeek;
  /** Schedule slots taken off by hand, with the time the hand edit stops applying. */
  suppressed: Record<string, number>;
  /** Teams the schedule closed (only these does the schedule reopen). */
  autoClosed: TeamId[];
  /** Teams reopened by hand while the schedule had them closed. */
  held: TeamId[];
}

type Core = (state: ShiftState, action: ShiftAction) => ShiftState;

const cache = new WeakMap<StoredWeek, { slots: Slot[]; floats: FloatSlot[] }>();
export function slotsOf(week: StoredWeek): { slots: Slot[]; floats: FloatSlot[] } {
  let hit = cache.get(week);
  if (!hit) { const b = buildSlots(week); hit = { slots: b.slots, floats: b.floats }; cache.set(week, hit); }
  return hit;
}

export function displayName(s: string): string {
  return s.replace(/[A-Za-z][^\s-]*/g, w => w[0].toUpperCase() + w.slice(1).toLowerCase());
}

export function startFollowing(week: StoredWeek, suppress: Record<string, number> = {}): FollowState {
  return { week, suppressed: { ...suppress }, autoClosed: [], held: [] };
}

/** Bring the shift in line with the schedule at shift.now. Returns the inputs unchanged when nothing changed. */
export function syncToSchedule(shift: ShiftState, follow: FollowState, core: Core): { shift: ShiftState; follow: FollowState; events: NewEvent[] } {
  const now = shift.now;
  const { slots, floats } = slotsOf(follow.week);
  const want = new Map(rosterAt(slots, now).map(e => [e.scheduleKey, e]));
  // Past the end of the uploaded week (or before it starts) the schedule says nobody is on. Emptying
  // the board then would be wrong, so the board holds as it is until a newer schedule is loaded.
  if (want.size === 0) return { shift, follow, events: [] };
  const events: NewEvent[] = [];
  let changed = false;

  const suppressed = Object.fromEntries(Object.entries(follow.suppressed).filter(([, until]) => until > now));
  if (Object.keys(suppressed).length !== Object.keys(follow.suppressed).length) changed = true;

  // Leave: scheduled providers whose slot is over (or moved), and hand swap-ins whose slot ended.
  const leaving = shift.providers.filter(p =>
    (p.scheduleKey !== undefined && !want.has(p.scheduleKey)) ||
    (p.scheduleKey === undefined && p.endsAt !== undefined && p.endsAt <= now));
  let providers: Provider[] = shift.providers.filter(p => !leaving.includes(p));
  // A cover provider dropping one of their teams (because it closed) is still on shift, now counted
  // fully on the other team; the team_close entry records that, so it is not logged as leaving.
  const stillOn = new Set([...want.keys()].map(k => k.split('#')[0]));
  for (const p of leaving) {
    if (p.scheduleKey?.includes('#') && stillOn.has(p.scheduleKey.split('#')[0])) continue;
    events.push({ kind: 'provider_remove', teamId: p.teamId, name: p.name, providerType: p.type, auto: true });
  }

  // Stay: keep the split and note current (a cover goes from half to full when a team closes).
  providers = providers.map(p => {
    if (p.scheduleKey === undefined) return p;
    const e = want.get(p.scheduleKey)!;
    if (p.share === e.share && p.note === e.note && p.endsAt === e.endsAt) return p;
    changed = true;
    return { ...p, share: e.share, note: e.note, endsAt: e.endsAt };
  });

  // Join: scheduled now, not on the board, not taken off by hand.
  const have = new Set(providers.map(p => p.scheduleKey));
  for (const e of want.values()) {
    if (have.has(e.scheduleKey) || (suppressed[e.scheduleKey] ?? 0) > now) continue;
    const p: Provider = {
      id: uid(), name: displayName(e.name), type: e.type, status: 'active', statusExpiresAt: null, teamId: e.teamId,
      scheduleKey: e.scheduleKey, share: e.share, endsAt: e.endsAt, ...(e.note ? { note: e.note } : {}),
    };
    providers.push(p);
    events.push({ kind: 'provider_add', teamId: p.teamId, name: p.name, providerType: p.type, auto: true });
  }

  let next: ShiftState = leaving.length || events.length || changed ? { ...shift, providers } : shift;

  // Teams: close what the schedule has closed, reopen only what the schedule itself closed.
  const open = openTeams(slots, now);
  let autoClosed = follow.autoClosed;
  let held = follow.held;
  for (const team of TEAMS) {
    if (open.has(team)) {
      if (held.includes(team)) held = held.filter(x => x !== team);
      if (team in next.closedTeams && autoClosed.includes(team)) {
        const closedTeams = { ...next.closedTeams };
        delete closedTeams[team];
        next = { ...next, closedTeams };
        autoClosed = autoClosed.filter(x => x !== team);
        events.push({ kind: 'team_reopen', teamId: team, auto: true });
      }
    } else if (!(team in next.closedTeams) && !held.includes(team)) {
      next = core(next, { type: 'CLOSE_TEAM', teamId: team });
      autoClosed = [...autoClosed, team];
      events.push({ kind: 'team_close', teamId: team, auto: true });
    }
  }

  const f = floatsAt(floats, now).map(displayName);
  if (f.join('|') !== next.floatAttendings.join('|')) next = { ...next, floatAttendings: f };

  const followChanged = changed || autoClosed !== follow.autoClosed || held !== follow.held;
  return {
    shift: next,
    follow: followChanged ? { ...follow, suppressed, autoClosed, held } : follow,
    events,
  };
}
