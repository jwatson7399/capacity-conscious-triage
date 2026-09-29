// © 2026 New York University. All rights reserved.
//
// Session layer around the core shift reducer (ShiftContext.tsx). The core reducer and
// the scoring engine are unchanged. This layer:
//   1. records the shift activity event list (src/activity.ts), and
//   2. adds a few interface-only actions the core reducer does not have
//      (load a prepared sample shift, remove a provider, reopen a team,
//      turn demo arrivals on or off).
// Nothing here changes how a team is scored or ranked.

import type { AcuityTier, ShiftAction, ShiftState, TeamId, Patient, Recommendation } from '../types';
import type { ActivityEvent, NewEvent, OverrideReasonCode, TeamSnapshot } from '../activity';
import { OVERRIDE_REASONS } from '../activity';
import { getRecommendation, type ScoringOverrides } from '../engine/recommendation';
import { generateTimeline, randomSeed } from '../engine/simulation';
import { uid } from '../uid';

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
  | { type: 'UNDO_ASSIGN'; eventId: string }
  /** Demo: go back to the moment of the previous arrival. */
  | { type: 'DEMO_BACK' };

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
  undoable: { eventId: string; patientId: string } | null;
  /**
   * Demo only, while arrivals are on: the session right after each arrival (the first is
   * the moment arrivals were turned on), so the demo can step back. Cleared by a new
   * sample or by turning arrivals off or on again, which changes the arrival schedule.
   */
  demoRewind?: Omit<SessionState, 'demoRewind'>[];
}

export const emptySession = (shift: ShiftState): SessionState => ({ shift, activity: [], seq: 0, undoable: null });

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
        return log(s, shift, [{ kind: 'provider_remove', teamId: p.teamId, name: p.name, providerType: p.type }]);
      }

      case 'REOPEN_TEAM': {
        if (!(action.teamId in before.closedTeams)) return s;
        const closedTeams = { ...before.closedTeams };
        delete closedTeams[action.teamId];
        return log(s, { ...before, closedTeams }, [{ kind: 'team_reopen', teamId: action.teamId }]);
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

      case 'UNDO_ASSIGN': {
        const u = s.undoable;
        if (!u || u.eventId !== action.eventId || !before.patients.some(p => p.id === u.patientId)) return { ...s, undoable: null };
        const shift = core(before, { type: 'DOWNGRADE_PATIENT', patientId: u.patientId });
        const out = log({ ...s, undoable: null }, shift, [{ kind: 'undo', patientId: u.patientId, undoesEventId: u.eventId }]);
        return { ...out, undoable: null };
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
        const shift = core(before, action);
        return log(s, shift, [{
          kind: 'provider_swap', teamId: action.incoming.teamId, name: action.incoming.name, providerType: action.incoming.type,
          replacedName: out?.name, replacedType: out?.type,
        }]);
      }

      case 'ADD_PROVIDERS': {
        const shift = core(before, action);
        if (!before.shiftStarted) return { ...s, shift };
        return log(s, shift, action.providers.map(p => ({ kind: 'provider_add' as const, teamId: p.teamId, name: p.name, providerType: p.type })));
      }

      case 'CLOSE_TEAM': {
        const shift = core(before, action);
        return log(s, shift, [{ kind: 'team_close', teamId: action.teamId }]);
      }

      case 'SIGNOUT_PATIENTS': {
        const count = before.patients.filter(p => p.assignedTeamId === action.fromTeamId).length;
        const shift = core(before, action);
        return log(s, shift, [{ kind: 'signout', teamId: action.fromTeamId, toTeamId: action.toTeamId, patientCount: count }]);
      }

      case 'TICK': {
        const shift = core(before, action);
        if (shift === before) return s;
        const events = arrivalEvents(before, shift);
        if (events.length === 0) return { ...s, shift };
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
