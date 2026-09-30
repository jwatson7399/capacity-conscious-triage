// © 2026 New York University. All rights reserved.
//
// Session layer around the core shift reducer (ShiftContext.tsx). The core reducer and
// the scoring engine are unchanged. This layer:
//   1. records the shift activity event list (src/activity.ts), and
//   2. adds a few interface-only actions the core reducer does not have
//      (load a prepared sample shift, remove a provider, reopen a team,
//      turn demo arrivals on or off).
// Nothing here changes how a team is scored or ranked.

import type { AcuityTier, FloatModifier, ShiftAction, ShiftState, TeamId, Patient, Recommendation } from '../types';
import type { ActivityEvent, NewEvent, OverrideReasonCode, TeamSnapshot } from '../activity';
import { OVERRIDE_REASONS, undoneAssignIds } from '../activity';
import { getRecommendation, type ScoringOverrides } from '../engine/recommendation';
import { generateTimeline, randomSeed } from '../engine/simulation';
import { uid } from '../uid';
import { startFollowing, syncToSchedule, type FollowState } from '../schedule/follow';
import type { StoredWeek } from '../schedule/week';

export interface AssignMeta {
  reasonCode?: OverrideReasonCode;
  note?: string;
}

export type SessionOnlyAction =
  | { type: 'HYDRATE'; shift: ShiftState }
  | { type: 'REMOVE_PROVIDER'; providerId: string }
  | { type: 'REOPEN_TEAM'; teamId: TeamId }
  | { type: 'DEMO_ARRIVALS'; on: boolean }
  /** A patient on teamId got sicker. Stays on that team; never routed by the recommendation. */
  | { type: 'ADD_FLOOR_UPGRADE'; tier: AcuityTier; teamId: TeamId }
  /** A new arrival the float takes: listed on teamId (the recommended team) at float primary, so no load. */
  | { type: 'ASSIGN_TO_FLOAT'; tier: AcuityTier; teamId: TeamId; floatName?: string }
  | { type: 'UNDO_ASSIGN'; eventId: string }
  /** Reverse one entry in the shift activity log (see undoBlocked). */
  | { type: 'UNDO_EVENT'; eventId: string }
  /** Demo: go back to the moment of the previous arrival. */
  | { type: 'DEMO_BACK' }
  /**
   * Live shift: follow the uploaded schedule from now on (Decisions 40 to 42). suppress lists
   * schedule slots already taken off by hand (e.g. deleted from the setup draft), with the time
   * each hand edit stops applying.
   */
  | { type: 'SCHEDULE_FOLLOW'; week: StoredWeek; suppress?: Record<string, number> }
  /** A resent or newer schedule replaces the stored one; hand edits are kept. */
  | { type: 'SCHEDULE_UPDATE'; week: StoredWeek }
  | { type: 'SCHEDULE_STOP' };

export type SessionAction =
  | (ShiftAction & { meta?: AssignMeta })
  | SessionOnlyAction;

export interface SessionState {
  shift: ShiftState;
  activity: ActivityEvent[];
  seq: number;
  /**
   * The one assignment that can still be undone, bound to its event id (not the patient
   * number, which restarts in every sample). Cleared by any later action on that patient,
   * by a new sample or shift, and by the undo itself. The 30-second window is kept by the
   * board on the device clock.
   */
  undoable: { eventId: string; patientId?: string } | null;
  /**
   * Demo only, while arrivals are on: the session right after each arrival (the first is
   * the moment arrivals were turned on), so the demo can step back. Cleared by a new
   * sample or by turning arrivals off or on again, which changes the arrival schedule.
   */
  demoRewind?: Omit<SessionState, 'demoRewind'>[];
  /** Live shift only: the schedule the board follows, and the hand edits it respects. */
  follow?: FollowState;
}

export const emptySession = (shift: ShiftState): SessionState => ({ shift, activity: [], seq: 0, undoable: null });

/** Logged actions that the activity log can reverse. */
const UNDOABLE = new Set<ActivityEvent['kind']>(['assign', 'floor_upgrade', 'float_arrival', 'reassign', 'signout', 'float', 'correct']);

/** Patients a sign-out moved that are still where it left them. */
function signoutMoved(shift: ShiftState, ev: ActivityEvent): Patient[] {
  if (ev.kind !== 'signout') return [];
  return shift.patients.filter(p => {
    const last = p.signouts?.at(-1);
    return p.assignedTeamId === ev.toTeamId && !!last && last.fromTeamId === ev.teamId && last.at === ev.at;
  });
}

/** The float setting a patient had before a float change. */
function previousFloat(activity: ActivityEvent[], ev: ActivityEvent): { modifier: FloatModifier; name: string | null } {
  const undone = undoneAssignIds(activity);
  const idx = activity.indexOf(ev);
  const pid = 'patientId' in ev ? ev.patientId : '';
  for (let i = idx - 1; i >= 0; i--) {
    const e = activity[i];
    if (undone.has(e.id) || !('patientId' in e) || e.patientId !== pid) continue;
    if (e.kind === 'float') return { modifier: e.modifier, name: e.floatName };
    if (e.kind === 'float_arrival') return { modifier: 'float_primary', name: e.floatName };
  }
  return { modifier: 'none', name: null };
}

/**
 * Why a logged action cannot be undone now, or null when it can. An action is undoable while
 * its patient is still exactly as that action left it: no later change that was not itself undone.
 */
export function undoBlocked(s: SessionState, eventId: string): 'kind' | 'undone' | 'gone' | 'changed' | null {
  const idx = s.activity.findIndex(e => e.id === eventId);
  const ev = s.activity[idx];
  if (!ev || !UNDOABLE.has(ev.kind)) return 'kind';
  const undone = undoneAssignIds(s.activity);
  if (undone.has(ev.id)) return 'undone';
  if (ev.kind === 'signout') return signoutMoved(s.shift, ev).length > 0 ? null : 'changed';
  const pid = (ev as { patientId: string }).patientId;
  const p = s.shift.patients.find(x => x.id === pid);
  if (!p) return 'gone';
  const later = s.activity.slice(idx + 1).some(e => e.kind !== 'undo' && !undone.has(e.id) && 'patientId' in e && e.patientId === pid);
  const signedOutSince = (p.signouts ?? []).some(o => o.at >= ev.at && s.activity.slice(idx + 1).some(e => e.kind === 'signout' && !undone.has(e.id) && e.teamId === o.fromTeamId && e.at === o.at));
  if (later || signedOutSince) return 'changed';
  if (ev.kind === 'reassign' && p.assignedTeamId !== ev.toTeamId) return 'changed';
  if (ev.kind === 'correct' && p.acuity !== ev.toAcuity) return 'changed';
  return null;
}

type CoreReducer = (state: ShiftState, action: ShiftAction) => ShiftState;
type ScoringFor = (state: ShiftState) => ScoringOverrides | undefined;

export function recommendFor(state: ShiftState, scoringFor: ScoringFor, patients = state.patients, now = state.now): Recommendation {
  return getRecommendation(state.providers, patients, state.buffers, now, state.closedTeams, scoringFor(state));
}

export function snapshotOf(rec: Recommendation, closedTeams: Record<number, number>): TeamSnapshot[] {
  return rec.scores.map(s => ({
    teamId: s.teamId,
    capacity: round(s.capacity, 2),
    load: round(s.load, 4),
    ratio: isFinite(s.capacityRatio) ? round(s.capacityRatio, 3) : 'infinity',
    closed: s.teamId in closedTeams,
    buffered: s.isBuffered,
  }));
}

function round(n: number, d: number): number {
  const f = 10 ** d;
  return Math.round(n * f) / f;
}

const DEMO_ARRIVAL_RATE_PER_HOUR = 5;
/** Percent of demo arrivals that are floor upgrades; they are uncommon (the engine default is 15). */
const DEMO_FLOOR_UPGRADE_CHANCE = 10;
/** Teams a demo floor upgrade can belong to (A-side). */
const DEMO_FLOOR_TEAMS: TeamId[] = [1, 2, 3];
const DEMO_REWIND_MAX = 200;
const DEMO_BACK_GRACE_S = 3;

export function makeSessionReducer(core: CoreReducer, scoringFor: ScoringFor) {
  /** Activity events for patients the demo clock (a tick or a skip) placed. */
  function arrivalEvents(before: ShiftState, shift: ShiftState): NewEvent[] {
    const events: NewEvent[] = [];
    // Arrivals the demo clock placed through the recommendation engine. Demo floor
    // upgrades went straight to their own team and are logged as upgrades.
    if (shift.patients.length > before.patients.length) {
      const known = new Set(before.patients.map(p => p.id));
      const arrived = before.simulation && shift.simulation
        ? before.simulation.timeline.slice(before.simulation.nextArrivalIndex, shift.simulation.nextArrivalIndex) : [];
      let pts = before.patients;
      let i = -1;
      for (const p of shift.patients) {
        if (known.has(p.id)) continue;
        i++;
        if (arrived[i]?.floorTeamId !== undefined) {
          events.push({ kind: 'floor_upgrade', patientId: p.id, acuity: p.acuity, teamId: p.assignedTeamId, auto: true, at: p.assignedAt } as NewEvent);
          pts = [...pts, p];
          continue;
        }
        const rec = recommendFor(before, scoringFor, pts, p.assignedAt);
        events.push({
          kind: 'assign',
          patientId: p.id,
          acuity: p.acuity,
          source: p.id.startsWith('F') ? 'floor' : 'critical',
          recommendedTeamId: rec.first,
          nextRankedTeamId: rec.second,
          chosenTeamId: p.assignedTeamId,
          followed: p.assignedTeamId === rec.first,
          override: null,
          snapshot: snapshotOf(rec, before.closedTeams),
          auto: true,
          at: p.assignedAt,
        } as NewEvent);
        pts = [...pts, p];
      }
    }
    return events;
  }

  /** Demo only: remember the moment after each arrival so DEMO_BACK can return to it. */
  function keepRewind(s: SessionState): SessionState {
    if (!s.demoRewind) return s;
    const { demoRewind, ...moment } = s;
    return { ...s, demoRewind: [...demoRewind, moment].slice(-DEMO_REWIND_MAX) };
  }

  /** Reverse one logged action, if undoBlocked allows it. The original entry stays; the undo is its own entry. */
  function undoEvent(s: SessionState, eventId: string): SessionState {
    if (undoBlocked(s, eventId) !== null) return s;
    const ev = s.activity.find(e => e.id === eventId)!;
    const before = s.shift;
    const done = (shift: ShiftState, patientId: string) => {
      const out = log(s, shift, [{ kind: 'undo', patientId, undoesEventId: ev.id }]);
      return out.undoable?.eventId === ev.id ? { ...out, undoable: null } : out;
    };
    const setPatient = (id: string, f: (p: Patient) => Patient): ShiftState =>
      ({ ...before, patients: before.patients.map(p => p.id === id ? f(p) : p) });
    switch (ev.kind) {
      case 'assign':
      case 'floor_upgrade':
      case 'float_arrival':
        return done(core(before, { type: 'DOWNGRADE_PATIENT', patientId: ev.patientId }), ev.patientId);
      case 'reassign':
        return done(setPatient(ev.patientId, p => ({ ...p, assignedTeamId: ev.teamId })), ev.patientId);
      case 'correct':
        return done(setPatient(ev.patientId, p => ({ ...p, acuity: ev.acuity })), ev.patientId);
      case 'float': {
        const prev = previousFloat(s.activity, ev);
        return done(setPatient(ev.patientId, p => ({ ...p, floatModifier: prev.modifier === 'none' ? undefined : prev.modifier, floatAttendingName: prev.name ?? undefined })), ev.patientId);
      }
      case 'signout': {
        const moved = signoutMoved(before, ev);
        const shift = { ...before, patients: before.patients.map(p => moved.includes(p)
          ? { ...p, assignedTeamId: ev.teamId, signouts: p.signouts!.length > 1 ? p.signouts!.slice(0, -1) : undefined }
          : p) };
        const out = log(s, shift, [{ kind: 'signout_undo', teamId: ev.teamId, toTeamId: ev.toTeamId, patientCount: moved.length, undoesEventId: ev.id }]);
        return out.undoable?.eventId === ev.id ? { ...out, undoable: null } : out;
      }
      default:
        return s;
    }
  }

  function log(s: SessionState, shift: ShiftState, events: NewEvent[], at?: number): SessionState {
    if (events.length === 0) return { ...s, shift };
    let seq = s.seq;
    // Any later action on the undoable patient ends its undo.
    const touched = s.undoable && events.some(e => 'patientId' in e && (e as { patientId: string }).patientId === s.undoable!.patientId);
    const stamped = events.map(e => {
      seq += 1;
      return { ...e, id: `ev-${uid()}`, seq, at: (e as { at?: number }).at ?? at ?? shift.now, recordedAt: Date.now() } as ActivityEvent;
    });
    return { ...s, shift, activity: [...s.activity, ...stamped], seq, undoable: touched ? null : s.undoable };
  }

  /** Live shift: apply the schedule at shift.now and log what it changed. */
  function follow(s: SessionState): SessionState {
    if (!s.follow || s.shift.simulation || !s.shift.shiftStarted) return s;
    const r = syncToSchedule(s.shift, s.follow, core);
    if (r.shift === s.shift && r.follow === s.follow && r.events.length === 0) return s;
    return { ...log(s, r.shift, r.events), follow: r.follow };
  }

  /** A hand edit to a scheduled slot holds until that slot's shift ends. */
  function suppress(s: SessionState, key: string | undefined, until: number | undefined): SessionState {
    if (!s.follow || !key) return s;
    return { ...s, follow: { ...s.follow, suppressed: { ...s.follow.suppressed, [key]: until ?? s.shift.now + 24 * 3_600_000 } } };
  }

  function findPatient(state: ShiftState, id: string): Patient | undefined {
    return state.patients.find(p => p.id === id);
  }

  return function sessionReducer(s: SessionState, action: SessionAction): SessionState {
    const before = s.shift;

    switch (action.type) {
      case 'HYDRATE': {
        const fresh = emptySession(action.shift);
        return log(fresh, action.shift, [{ kind: 'shift_start', providerCount: action.shift.providers.length }]);
      }

      case 'RESET':
        return emptySession(core(before, action));

      case 'START_SHIFT': {
        const shift = core(before, action);
        return log(emptySession(shift), shift, [{ kind: 'shift_start', providerCount: shift.providers.length }]);
      }

      case 'REMOVE_PROVIDER': {
        const p = before.providers.find(x => x.id === action.providerId);
        if (!p) return s;
        const shift = { ...before, providers: before.providers.filter(x => x.id !== p.id) };
        return suppress(log(s, shift, [{ kind: 'provider_remove', teamId: p.teamId, name: p.name, providerType: p.type }]), p.scheduleKey, p.endsAt);
      }

      case 'SCHEDULE_FOLLOW':
        return follow({ ...s, follow: startFollowing(action.week, action.suppress) });

      case 'SCHEDULE_UPDATE':
        return s.follow ? follow({ ...s, follow: { ...s.follow, week: action.week } }) : s;

      case 'SCHEDULE_STOP': {
        if (!s.follow) return s;
        return { ...s, follow: undefined };
      }

      case 'REOPEN_TEAM': {
        if (!(action.teamId in before.closedTeams)) return s;
        const closedTeams = { ...before.closedTeams };
        delete closedTeams[action.teamId];
        const out = log(s, { ...before, closedTeams }, [{ kind: 'team_reopen', teamId: action.teamId }]);
        // Reopened by hand while the schedule had it closed: stays open until the schedule opens it itself.
        if (!out.follow?.autoClosed.includes(action.teamId)) return out;
        return { ...out, follow: { ...out.follow, autoClosed: out.follow.autoClosed.filter(t => t !== action.teamId), held: [...out.follow.held, action.teamId] } };
      }

      case 'DEMO_ARRIVALS': {
        const sim = before.simulation;
        if (!sim) return s;
        const done = sim.timeline.slice(0, sim.nextArrivalIndex);
        let timeline = done;
        if (action.on) {
          const end = sim.baseTime + sim.shiftDurationMs;
          const remaining = Math.max(0, end - before.now);
          const future = generateTimeline(randomSeed(), remaining, { ...sim.overrides, arrivalRatePerHour: DEMO_ARRIVAL_RATE_PER_HOUR, floorUpgradeChance: DEMO_FLOOR_UPGRADE_CHANCE }, before.now)
            .filter(e => e.arrivalTime > before.now)
            // Upgrades stay on the team they already belong to: draw it now, not at arrival.
            .map(e => e.isFloor ? { ...e, floorTeamId: DEMO_FLOOR_TEAMS[Math.floor(Math.random() * DEMO_FLOOR_TEAMS.length)] } : e);
          timeline = [...done, ...future];
        }
        const out: SessionState = { ...s, shift: { ...before, simulation: { ...sim, timeline } } };
        const { demoRewind: _old, ...moment } = out;
        return action.on ? { ...moment, demoRewind: [moment] } : moment;
      }

      case 'ASSIGN_PATIENT': {
        const rec = recommendFor(before, scoringFor);
        const shift = core(before, action);
        const added = shift.patients.find(p => !before.patients.some(q => q.id === p.id));
        if (!added) return { ...s, shift };
        const followed = action.teamId === rec.first;
        const code = action.meta?.reasonCode;
        const reasonLabel = code ? (OVERRIDE_REASONS.find(r => r.code === code)?.label ?? code) : '';
        const logged = log(s, shift, [{
          kind: 'assign',
          patientId: added.id,
          acuity: action.tier,
          source: action.source,
          recommendedTeamId: rec.first,
          nextRankedTeamId: rec.second,
          chosenTeamId: action.teamId,
          followed,
          override: followed ? null : { reasonCode: code ?? 'other', reasonLabel: reasonLabel || 'Other', note: action.meta?.note ?? '' },
          snapshot: snapshotOf(rec, before.closedTeams),
          auto: false,
        }]);
        const ev = logged.activity[logged.activity.length - 1];
        return { ...logged, undoable: { eventId: ev.id, patientId: added.id } };
      }

      case 'ADD_FLOOR_UPGRADE': {
        const shift = core(before, { type: 'ASSIGN_PATIENT', tier: action.tier, teamId: action.teamId, source: 'floor' });
        const added = shift.patients.find(p => !before.patients.some(q => q.id === p.id));
        if (!added) return { ...s, shift };
        const logged = log(s, shift, [{ kind: 'floor_upgrade', patientId: added.id, acuity: action.tier, teamId: action.teamId, auto: false }]);
        const ev = logged.activity[logged.activity.length - 1];
        return { ...logged, undoable: { eventId: ev.id, patientId: added.id } };
      }

      case 'ASSIGN_TO_FLOAT': {
        const placed = core(before, { type: 'ASSIGN_PATIENT', tier: action.tier, teamId: action.teamId, source: 'critical' });
        const added = placed.patients.find(p => !before.patients.some(q => q.id === p.id));
        if (!added) return { ...s, shift: placed };
        const shift = core(placed, { type: 'SET_FLOAT_MODIFIER', patientId: added.id, modifier: 'float_primary', floatName: action.floatName });
        const logged = log(s, shift, [{ kind: 'float_arrival', patientId: added.id, acuity: action.tier, teamId: action.teamId, floatName: action.floatName ?? null }]);
        const ev = logged.activity[logged.activity.length - 1];
        return { ...logged, undoable: { eventId: ev.id, patientId: added.id } };
      }

      case 'UNDO_ASSIGN': {
        // The toast's quick undo: the same reversal as the activity log's, bound to its event.
        if (!s.undoable || s.undoable.eventId !== action.eventId) return { ...s, undoable: null };
        return { ...undoEvent(s, action.eventId), undoable: null };
      }

      case 'UNDO_EVENT':
        return undoEvent(s, action.eventId);

      case 'CORRECT_COLOR': {
        const p = findPatient(before, action.patientId);
        const shift = core(before, action);
        if (!p || shift === before) return s;
        return log(s, shift, [{ kind: 'correct', patientId: p.id, acuity: p.acuity, toAcuity: action.toTier, teamId: p.assignedTeamId }]);
      }

      case 'DOWNGRADE_PATIENT': {
        const p = findPatient(before, action.patientId);
        const shift = core(before, action);
        if (!p) return { ...s, shift };

        return log(s, shift, [{ kind: 'downgrade', patientId: p.id, acuity: p.acuity, teamId: p.assignedTeamId, reason: action.reason }]);
      }

      case 'UPGRADE_PATIENT':
      case 'DECEASE_PATIENT': {
        const p = findPatient(before, action.patientId);
        const shift = core(before, action);
        if (!p) return { ...s, shift };
        if (shift === before) return s;
        if (action.type === 'UPGRADE_PATIENT') {
          const to = shift.patients.find(x => x.id === p.id)?.acuity ?? p.acuity;
          return log(s, shift, [{ kind: 'upgrade', patientId: p.id, acuity: p.acuity, toAcuity: to, teamId: p.assignedTeamId }]);
        }
        return log(s, shift, [{ kind: 'deceased', patientId: p.id, acuity: p.acuity, teamId: p.assignedTeamId }]);
      }

      case 'REASSIGN_PATIENT': {
        const p = findPatient(before, action.patientId);
        const shift = core(before, action);
        if (!p) return { ...s, shift };
        return log(s, shift, [{ kind: 'reassign', patientId: p.id, acuity: p.acuity, teamId: p.assignedTeamId, toTeamId: action.toTeamId, reason: action.reason }]);
      }

      case 'SET_FLOAT_MODIFIER': {
        const p = findPatient(before, action.patientId);
        const shift = core(before, action);
        if (!p) return { ...s, shift };
        return log(s, shift, [{ kind: 'float', patientId: p.id, teamId: p.assignedTeamId, modifier: action.modifier, floatName: action.modifier === 'none' ? null : (action.floatName ?? null) }]);
      }

      case 'SWAP_PROVIDER': {
        const out = before.providers.find(p => p.id === action.outProviderId);
        // Someone swapped into a scheduled slot fills it until that slot's shift ends; the schedule
        // does not put the original provider back meanwhile. Share and note do not carry over.
        const incoming = out?.endsAt !== undefined ? { ...action.incoming, endsAt: out.endsAt } : action.incoming;
        const shift = core(before, { ...action, incoming });
        const logged = log(s, shift, [{
          kind: 'provider_swap', teamId: action.incoming.teamId, name: action.incoming.name, providerType: action.incoming.type,
          replacedName: out?.name, replacedType: out?.type,
        }]);
        return suppress(logged, out?.scheduleKey, out?.endsAt);
      }

      case 'ADD_PROVIDERS': {
        const shift = core(before, action);
        if (!before.shiftStarted) return { ...s, shift };
        return log(s, shift, action.providers.map(p => ({ kind: 'provider_add' as const, teamId: p.teamId, name: p.name, providerType: p.type })));
      }

      case 'CLOSE_TEAM': {
        const shift = core(before, action);
        const out = log(s, shift, [{ kind: 'team_close', teamId: action.teamId }]);
        // Closed by hand: the schedule never reopens it.
        if (!out.follow) return out;
        return { ...out, follow: { ...out.follow, autoClosed: out.follow.autoClosed.filter(t => t !== action.teamId), held: out.follow.held.filter(t => t !== action.teamId) } };
      }

      case 'SIGNOUT_PATIENTS': {
        const count = before.patients.filter(p => p.assignedTeamId === action.fromTeamId).length;
        const shift = core(before, action);
        const logged = log(s, shift, [{ kind: 'signout', teamId: action.fromTeamId, toTeamId: action.toTeamId, patientCount: count }]);
        if (count === 0) return logged;
        return { ...logged, undoable: { eventId: logged.activity[logged.activity.length - 1].id } };
      }

      case 'TICK': {
        const shift = core(before, action);
        if (shift === before) return s;
        const events = arrivalEvents(before, shift);
        if (events.length === 0) return follow({ ...s, shift });
        return keepRewind(log(s, shift, events));
      }

      case 'SIM_SKIP_TO_NEXT': {
        const shift = core(before, action);
        if (shift === before) return s;
        return keepRewind(log(s, shift, arrivalEvents(before, shift)));
      }

      case 'DEMO_BACK': {
        // A moment reached in the last few real seconds counts as "here", so repeated
        // presses keep stepping back while the clock runs.
        const cutoff = before.now - DEMO_BACK_GRACE_S * 1000 * (before.simulation?.paused ? 0 : before.simulation?.speed ?? 0);
        const stack = [...(s.demoRewind ?? [])];
        while (stack.length > 1 && stack[stack.length - 1].shift.now >= cutoff) stack.pop();
        const target = stack[stack.length - 1];
        if (!target || target.shift.now >= cutoff) return s;
        const sim = before.simulation;
        const shift = sim && target.shift.simulation
          ? { ...target.shift, simulation: { ...target.shift.simulation, paused: sim.paused, speed: sim.speed } }
          : target.shift;
        return { ...target, shift, undoable: null, demoRewind: stack };
      }

      default: {
        const shift = core(before, action as ShiftAction);
        return shift === before ? s : { ...s, shift };
      }
    }
  };
}
