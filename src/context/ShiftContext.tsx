import { createContext, useContext, useReducer, useMemo, type ReactNode } from 'react';
import type { ShiftState, ShiftAction, Recommendation, SimulationState } from '../types';
import type { ProviderType } from '../types';
import { STATUS_EXPIRE_MS_MAP, BUFFER_DURATIONS_MS, DECEASED_BUFFER_MS, TRAUMA_TEAM_ID, QUICK_UNDO_WINDOW_MS } from '../constants';
import { getRecommendation, createBuffer, type ScoringOverrides } from '../engine/recommendation';
import { uid } from '../uid';
import type { Provider, Patient, Buffer, TeamId, SimStatusChangeEntry } from '../types';
import { generateTimeline, generateStatusChanges, takeSnapshot, addSnapshot, runShadowSim, replayToTime } from '../engine/simulation';
import { getProvidersForShift } from '../utils/scheduleParser';
import { CAPACITY_WEIGHTS } from '../constants';
import type { ActivityEvent } from '../activity';
import { emptySession, makeSessionReducer, type SessionAction, type SessionState } from './session';

function simOverridesToScoring(sim: SimulationState | undefined): ScoringOverrides | undefined {
  if (!sim) return undefined;
  return {
    capacityWeights: sim.overrides.capacityWeights,
    statusMultipliers: sim.overrides.statusMultipliers,
    acuityWeights: sim.overrides.acuityWeights,
    decaySteps: sim.overrides.decaySteps,
    bufferDurations: sim.overrides.bufferDurations,
  };
}

export const initialState: ShiftState = {
  providers: [],
  patients: [],
  buffers: [],
  overrides: [],
  patientCounter: { C: 0, F: 0 },
  currentRole: null,
  shiftStarted: false,
  now: Date.now(),
  closedTeams: {},
  floatAttendings: [],
};

/** Providers whose timed status has ended by `at` return to active. */
function expireStatuses(providers: Provider[], at: number): Provider[] {
  return providers.map(p =>
    p.statusExpiresAt !== null && p.statusExpiresAt <= at ? { ...p, status: 'active' as const, statusExpiresAt: null } : p,
  );
}

/**
 * Applies the simulation's scheduled status changes up to `until` in time order:
 * before each change, statuses that ended by then expire, so back-to-back changes for
 * one provider both take effect. A change only applies to a provider who is active at
 * that moment. Returns the providers and the next unprocessed change index.
 */
export function applyStatusChangesUntil(
  providers: Provider[],
  changes: SimStatusChangeEntry[],
  startIndex: number,
  until: number,
): { providers: Provider[]; nextIndex: number } {
  let out = providers;
  let i = startIndex;
  while (i < changes.length && changes[i].time <= until) {
    const change = changes[i];
    i++;
    out = expireStatuses(out, change.time).map(p => {
      if (p.id !== change.providerId || p.status !== 'active') return p;
      return { ...p, status: change.status, statusExpiresAt: change.time + change.durationMs };
    });
  }
  return { providers: expireStatuses(out, until), nextIndex: i };
}

/** Round-robin pick among open A-side teams; returns the team and the advanced counter. */
function roundRobinTeam(sim: SimulationState, closedTeams: Record<number, number>, rrNext: number): { teamId: TeamId; rrNext: number } {
  const eligible = ([1, 2, 3, 4] as TeamId[]).filter(
    t => t !== TRAUMA_TEAM_ID && !(t in closedTeams) && !sim.permanentlyClosedTeams.includes(t)
  );
  return { teamId: eligible[rrNext % eligible.length], rrNext: rrNext + 1 };
}

export function shiftReducer(state: ShiftState, action: ShiftAction): ShiftState {
  const now = state.now;

  switch (action.type) {
    case 'RESET':
      return { ...initialState, now: Date.now(), scheduleData: undefined };

    case 'SET_ROLE':
      return { ...state, currentRole: action.role };

    case 'START_SHIFT':
      return { ...state, providers: action.providers, shiftStarted: true };

    case 'ADD_PROVIDERS':
      return { ...state, providers: [...state.providers, ...action.providers] };

    case 'TICK': {
      const sim = state.simulation;
      // In simulation mode: advance sim clock; when paused, no-op
      if (sim?.active && sim.paused) return state;

      const tickInterval = 1000; // 1s real-time tick
      const tickNow = sim?.active
        ? state.now + tickInterval * sim.speed
        : Date.now();

      // Check shift end in simulation mode
      if (sim?.active && tickNow >= sim.baseTime + sim.shiftDurationMs) {
        return {
          ...state,
          now: sim.baseTime + sim.shiftDurationMs,
          simulation: { ...sim, paused: true },
        };
      }

      // Auto-expire provider statuses
      const providers = state.providers.map(p => {
        if (p.statusExpiresAt !== null && p.statusExpiresAt <= tickNow) {
          return { ...p, status: 'active' as const, statusExpiresAt: null };
        }
        return p;
      });
      // Remove expired buffers
      const buffers = state.buffers.filter(b => b.expiresAt > tickNow);
      // Closed teams stay closed until someone reopens them (Roundtable 2026-09-28,
      // Decision 12). The former 60-minute auto-transfer and auto-reopen rule is removed;
      // patients leave a closed team only by sign-out.
      const patients = state.patients;
      const closedTeams = state.closedTeams;

      let newState: ShiftState = { ...state, now: tickNow, providers, buffers, patients, closedTeams };

      // Simulation: process pending status changes and arrivals
      if (sim?.active) {
        let { nextArrivalIndex, nextStatusChangeIndex, snapshots } = sim;
        const { roundRobinNext } = sim;

        // Process status changes
        let simProviders = newState.providers;
        while (nextStatusChangeIndex < sim.statusChanges.length && sim.statusChanges[nextStatusChangeIndex].time <= tickNow) {
          const change = sim.statusChanges[nextStatusChangeIndex];
          nextStatusChangeIndex++;
          // Only apply if provider is currently active (don't override existing non-active status)
          simProviders = simProviders.map(p => {
            if (p.id !== change.providerId) return p;
            if (p.status !== 'active') return p;
            return { ...p, status: change.status, statusExpiresAt: change.time + change.durationMs };
          });
        }
        newState = { ...newState, providers: simProviders };
        let rrNext = roundRobinNext ?? 0;
        let { patients: simPatients, buffers: simBuffers, patientCounter } = newState;
        const scoringOverrides = simOverridesToScoring(sim);
        let arrivedAny = false;

        while (nextArrivalIndex < sim.timeline.length && sim.timeline[nextArrivalIndex].arrivalTime <= tickNow) {
          const entry = sim.timeline[nextArrivalIndex];
          nextArrivalIndex++;
          arrivedAny = true;

          const prefix = entry.isFloor ? 'F' : 'C';
          const count = patientCounter[prefix] + 1;
          const id = `${prefix}-${String(count).padStart(3, '0')}`;

          // Get team assignment: round-robin or formula-driven. A demo floor upgrade
          // stays on the team it already belongs to.
          let teamId: TeamId;
          if (entry.isFloor && entry.floorTeamId !== undefined) {
            teamId = entry.floorTeamId;
          } else if (sim.roundRobin) {
            ({ teamId, rrNext } = roundRobinTeam(sim, closedTeams, rrNext));
          } else {
            const rec = getRecommendation(simProviders, simPatients, simBuffers, tickNow, closedTeams, scoringOverrides);
            teamId = rec.first ?? (1 as TeamId);
          }

          const patient = { id, acuity: entry.acuity, assignedTeamId: teamId, assignedAt: tickNow };
          const newBuffer = createBuffer(teamId, entry.acuity, tickNow, scoringOverrides);

          // Merge stacked buffers
          const existingTeamBuffers = simBuffers.filter(b => b.teamId === teamId && b.expiresAt > tickNow && !b.deceasedPatientId);
          const otherBuffers = simBuffers.filter(b => !(b.teamId === teamId && b.expiresAt > tickNow && !b.deceasedPatientId));
          if (existingTeamBuffers.length > 0) {
            const allBufs = [...existingTeamBuffers, newBuffer];
            const currentExpiry = Math.max(...existingTeamBuffers.map(b => b.expiresAt));
            const newDuration = newBuffer.expiresAt - newBuffer.createdAt;
            const latestExpiry = Math.max(currentExpiry, tickNow) + newDuration;
            const tierRank = { tier_one: 0, tier_two: 1, tier_three: 2 } as const;
            const bestTier = allBufs.reduce((best, b) => tierRank[b.tier] < tierRank[best.tier] ? b : best).tier;
            const totalCount = allBufs.reduce((sum, b) => sum + (b.mergedCount ?? 1), 0);
            simBuffers = [...otherBuffers, {
              id: newBuffer.id, teamId, tier: bestTier,
              createdAt: Math.min(...allBufs.map(b => b.createdAt)),
              expiresAt: latestExpiry, mergedCount: totalCount,
            }];
          } else {
            simBuffers = [...simBuffers, newBuffer];
          }

          simPatients = [...simPatients, patient];
          patientCounter = { ...patientCounter, [prefix]: count };
        }

        // Take snapshot on arrivals (or every 30 sim-seconds)
        if (arrivedAny) {
          snapshots = addSnapshot(snapshots, takeSnapshot(
            { ...newState, patients: simPatients, buffers: simBuffers, patientCounter },
            tickNow,
          ));
        }

        newState = {
          ...newState,
          patients: simPatients,
          buffers: simBuffers,
          patientCounter,
          simulation: { ...sim, nextArrivalIndex, nextStatusChangeIndex, snapshots, roundRobinNext: rrNext },
        };
      }

      return newState;
    }

    case 'ASSIGN_PATIENT': {
      const prefix = action.source === 'critical' ? 'C' : 'F';
      const count = state.patientCounter[prefix] + 1;
      const id = `${prefix}-${String(count).padStart(3, '0')}`;
      const patient = {
        id,
        acuity: action.tier,
        assignedTeamId: action.teamId,
        assignedAt: now,
      };
      const scoringOv = simOverridesToScoring(state.simulation);
      const newBuffer = createBuffer(action.teamId, action.tier, now, scoringOv);
      // Merge stacked buffers for the same team
      const existingTeamBuffers = state.buffers.filter(b => b.teamId === action.teamId && b.expiresAt > now && !b.deceasedPatientId);
      const otherBuffers = state.buffers.filter(b => !(b.teamId === action.teamId && b.expiresAt > now && !b.deceasedPatientId));
      let finalBuffers: typeof state.buffers;
      if (existingTeamBuffers.length > 0) {
        const allBuffers = [...existingTeamBuffers, newBuffer];
        const currentExpiry = Math.max(...existingTeamBuffers.map(b => b.expiresAt));
        const newDuration = newBuffer.expiresAt - newBuffer.createdAt;
        const latestExpiry = Math.max(currentExpiry, now) + newDuration;
        // Pick highest tier (tier_one > tier_two > tier_three)
        const tierRank = { tier_one: 0, tier_two: 1, tier_three: 2 } as const;
        const bestTier = allBuffers.reduce((best, b) => tierRank[b.tier] < tierRank[best.tier] ? b : best).tier;
        const totalCount = allBuffers.reduce((sum, b) => sum + (b.mergedCount ?? 1), 0);
        const merged: typeof newBuffer = {
          id: newBuffer.id,
          teamId: action.teamId,
          tier: bestTier,
          createdAt: Math.min(...allBuffers.map(b => b.createdAt)),
          expiresAt: latestExpiry,
          mergedCount: totalCount,
        };
        finalBuffers = [...otherBuffers, merged];
      } else {
        finalBuffers = [...state.buffers, newBuffer];
      }

      const overrides = action.overrideReason && action.recommendedTeamId
        ? [...state.overrides, {
            patientId: id,
            recommendedTeamId: action.recommendedTeamId,
            assignedTeamId: action.teamId,
            reason: action.overrideReason,
            overriddenAt: now,
          }]
        : state.overrides;

      return {
        ...state,
        patients: [...state.patients, patient],
        buffers: finalBuffers,
        patientCounter: { ...state.patientCounter, [prefix]: count },
        overrides,
      };
    }

    case 'SET_PROVIDER_STATUS': {
      const providers = state.providers.map(p => {
        if (p.id !== action.providerId) return p;
        const expireMs = STATUS_EXPIRE_MS_MAP[action.status];
        const expiresAt = expireMs === null ? null : now + expireMs;
        return { ...p, status: action.status, statusExpiresAt: expiresAt };
      });
      return { ...state, providers };
    }

    case 'CORRECT_COLOR': {
      const p = state.patients.find(x => x.id === action.patientId);
      if (!p || p.acuity === action.toTier) return state;
      return { ...state, patients: state.patients.map(x => x.id === action.patientId ? { ...x, acuity: action.toTier } : x) };
    }

    case 'UPGRADE_PATIENT': {
      // Upgrade to any higher color (Decision 14): the patient restarts at the new
      // color's full weight and count time. Default target is Red.
      const toTier = action.toTier ?? 'tier_one';
      const rank = { tier_one: 0, tier_two: 1, tier_three: 2 } as const;
      const current = state.patients.find(p => p.id === action.patientId);
      if (!current || rank[toTier] >= rank[current.acuity]) return state;
      const patients = state.patients.map(p => {
        if (p.id !== action.patientId) return p;
        return {
          ...p,
          originalAcuity: p.originalAcuity ?? p.acuity,
          acuity: toTier,
          upgradedAt: now,
        };
      });
      const upgraded = current;
      let finalBuffers = state.buffers;
      if (upgraded) {
        const scoringOv = simOverridesToScoring(state.simulation);
        const newBuffer = createBuffer(upgraded.assignedTeamId, toTier, now, scoringOv);
        const existingTeamBuffers = finalBuffers.filter(b => b.teamId === upgraded.assignedTeamId && b.expiresAt > now && !b.deceasedPatientId);
        const otherBuffers = finalBuffers.filter(b => !(b.teamId === upgraded.assignedTeamId && b.expiresAt > now && !b.deceasedPatientId));
        if (existingTeamBuffers.length > 0) {
          const allBuffers = [...existingTeamBuffers, newBuffer];
          const currentExpiry = Math.max(...existingTeamBuffers.map(b => b.expiresAt));
          const newDuration = newBuffer.expiresAt - newBuffer.createdAt;
          const latestExpiry = Math.max(currentExpiry, now) + newDuration;
          const tierRank = { tier_one: 0, tier_two: 1, tier_three: 2 } as const;
          const bestTier = allBuffers.reduce((best, b) => tierRank[b.tier] < tierRank[best.tier] ? b : best).tier;
          const totalCount = allBuffers.reduce((sum, b) => sum + (b.mergedCount ?? 1), 0);
          finalBuffers = [...otherBuffers, {
            id: newBuffer.id, teamId: upgraded.assignedTeamId, tier: bestTier,
            createdAt: Math.min(...allBuffers.map(b => b.createdAt)),
            expiresAt: latestExpiry, mergedCount: totalCount,
          }];
        } else {
          finalBuffers = [...finalBuffers, newBuffer];
        }
      }
      return { ...state, patients, buffers: finalBuffers };
    }

    case 'REASSIGN_PATIENT': {
      const original = state.patients.find(p => p.id === action.patientId);
      const patients = state.patients.map(p => {
        if (p.id !== action.patientId) return p;
        // Reassign corrects which team the patient is counted on (Decision 13): the
        // patient keeps its timer, so assignedAt and upgradedAt are unchanged.
        return { ...p, assignedTeamId: action.toTeamId };
      });
      const overrides = original
        ? [...state.overrides, {
            patientId: action.patientId,
            recommendedTeamId: original.assignedTeamId,
            assignedTeamId: action.toTeamId,
            reason: action.reason,
            overriddenAt: now,
          }]
        : state.overrides;

      // Buffer on the receiving team, as before. Buffer durations are zero, so this is inert.
      let finalBuffers = state.buffers;
      if (original) {
        const scoringOv = simOverridesToScoring(state.simulation);
        const newBuffer = createBuffer(action.toTeamId, original.acuity, now, scoringOv);
        const existingTeamBuffers = finalBuffers.filter(b => b.teamId === action.toTeamId && b.expiresAt > now && !b.deceasedPatientId);
        const otherBuffers = finalBuffers.filter(b => !(b.teamId === action.toTeamId && b.expiresAt > now && !b.deceasedPatientId));
        if (existingTeamBuffers.length > 0) {
          const allBuffers = [...existingTeamBuffers, newBuffer];
          const currentExpiry = Math.max(...existingTeamBuffers.map(b => b.expiresAt));
          const newDuration = newBuffer.expiresAt - newBuffer.createdAt;
          const latestExpiry = Math.max(currentExpiry, now) + newDuration;
          const tierRank = { tier_one: 0, tier_two: 1, tier_three: 2 } as const;
          const bestTier = allBuffers.reduce((best, b) => tierRank[b.tier] < tierRank[best.tier] ? b : best).tier;
          const totalCount = allBuffers.reduce((sum, b) => sum + (b.mergedCount ?? 1), 0);
          finalBuffers = [...otherBuffers, {
            id: newBuffer.id, teamId: action.toTeamId, tier: bestTier,
            createdAt: Math.min(...allBuffers.map(b => b.createdAt)),
            expiresAt: latestExpiry, mergedCount: totalCount,
          }];
        } else {
          finalBuffers = [...finalBuffers, newBuffer];
        }
      }

      return { ...state, patients, buffers: finalBuffers, overrides };
    }

    case 'SWAP_PROVIDER': {
      const providers = state.providers.filter(p => p.id !== action.outProviderId);
      const newProvider = {
        ...action.incoming,
        id: uid(),
        status: 'active' as const,
        statusExpiresAt: null,
      };
      return { ...state, providers: [...providers, newProvider] };
    }

    case 'CLOSE_TEAM': {
      const closedTeams = { ...state.closedTeams, [action.teamId]: now };
      const buffers = state.buffers.filter(b => b.teamId !== action.teamId);
      return { ...state, closedTeams, buffers };
    }

    case 'SIGNOUT_PATIENTS': {
      const patients = state.patients.map(p =>
        p.assignedTeamId === action.fromTeamId
          ? { ...p, assignedTeamId: action.toTeamId, signouts: [...(p.signouts ?? []), { fromTeamId: action.fromTeamId, toTeamId: action.toTeamId, at: now }] }
          : p
      );
      // A closed team stays closed after sign-out; only Reopen brings it back (Decision 12).
      return { ...state, patients };
    }

    case 'DECEASE_PATIENT': {
      const patient = state.patients.find(p => p.id === action.patientId);
      if (!patient) return state;
      const patients = state.patients.map(p =>
        p.id === action.patientId ? { ...p, deceased: true } : p
      );
      const newBuffer: Buffer = {
        id: uid(),
        teamId: patient.assignedTeamId,
        tier: patient.acuity,
        createdAt: now,
        expiresAt: now + DECEASED_BUFFER_MS,
        deceasedPatientId: patient.id,
      };
      // Merge with existing team buffers (same stacking logic as ASSIGN_PATIENT)
      const teamId = patient.assignedTeamId;
      const existingTeamBuffers = state.buffers.filter(b => b.teamId === teamId && b.expiresAt > now);
      const otherBuffers = state.buffers.filter(b => !(b.teamId === teamId && b.expiresAt > now));
      let finalBuffers: Buffer[];
      if (existingTeamBuffers.length > 0) {
        const allBuffers = [...existingTeamBuffers, newBuffer];
        const currentExpiry = Math.max(...existingTeamBuffers.map(b => b.expiresAt));
        const newDuration = newBuffer.expiresAt - newBuffer.createdAt;
        const latestExpiry = Math.max(currentExpiry, now) + newDuration;
        const tierRank = { tier_one: 0, tier_two: 1, tier_three: 2 } as const;
        const bestTier = allBuffers.reduce((best, b) => tierRank[b.tier] < tierRank[best.tier] ? b : best).tier;
        const totalCount = allBuffers.reduce((sum, b) => sum + (b.mergedCount ?? 1), 0);
        finalBuffers = [...otherBuffers, {
          id: newBuffer.id, teamId, tier: bestTier,
          createdAt: Math.min(...allBuffers.map(b => b.createdAt)),
          expiresAt: latestExpiry, mergedCount: totalCount,
        }];
      } else {
        finalBuffers = [...state.buffers, newBuffer];
      }
      return { ...state, patients, buffers: finalBuffers };
    }

    case 'DOWNGRADE_PATIENT': {
      const patient = state.patients.find(p => p.id === action.patientId);
      const patients = state.patients.filter(p => p.id !== action.patientId);
      // Quick undo (within 30s): also remove/reduce the buffer this patient created
      const isQuickUndo = patient && (now - patient.assignedAt) < QUICK_UNDO_WINDOW_MS;
      let buffers = state.buffers;
      if (isQuickUndo && patient) {
        const teamId = patient.assignedTeamId;
        const teamBuf = buffers.find(b => b.teamId === teamId && b.expiresAt > now && !b.deceasedPatientId);
        if (teamBuf) {
          const mergedCount = teamBuf.mergedCount ?? 1;
          if (mergedCount <= 1) {
            // Single buffer — remove it entirely
            buffers = buffers.filter(b => b.id !== teamBuf.id);
          } else {
            // Merged buffer — reduce duration by the undone patient's buffer contribution
            const scoringOv = simOverridesToScoring(state.simulation);
            const dur = scoringOv?.bufferDurations?.[patient.acuity] ?? BUFFER_DURATIONS_MS[patient.acuity];
            buffers = buffers.map(b =>
              b.id === teamBuf.id
                ? { ...b, expiresAt: Math.max(now, b.expiresAt - dur), mergedCount: mergedCount - 1 }
                : b
            );
          }
        }
      }
      return { ...state, patients, buffers };
    }

    case 'LOAD_TOUR_DEMO': {
      // Curated demo state for the guided tour.
      // Only Team 1 has an active buffer. Teams 2 & 3 are buffer-free.
      // Good mix of acuity tiers, provider types, and statuses.
      const now = Date.now();
      const m = 60_000; // 1 minute in ms

      const tourProviders: Provider[] = [
        // Team 1: Attending + 2 Juniors (one in procedure) + PA + Rotator
        // Capacity: 17.5 + (7.5×0.25) + 7.5 + 10 + 1 = 37.875 ≈ 37.9
        { id: 'tp1', name: 'King', type: 'attending', status: 'active', statusExpiresAt: null, teamId: 1 },
        { id: 'tp2', name: 'Chen', type: 'junior_resident', status: 'in_procedure', statusExpiresAt: now + 12 * m, teamId: 1 },
        { id: 'tp3', name: 'Reeves', type: 'junior_resident', status: 'active', statusExpiresAt: null, teamId: 1 },
        { id: 'tp3b', name: 'Patel', type: 'pa', status: 'active', statusExpiresAt: null, teamId: 1 },
        { id: 'tp3c', name: 'Ortiz', type: 'rotator', status: 'active', statusExpiresAt: null, teamId: 1 },
        // Team 2: Attending + Senior + PA (highest capacity, no buffer → recommended)
        { id: 'tp4', name: 'Rodriguez', type: 'attending', status: 'active', statusExpiresAt: null, teamId: 2 },
        { id: 'tp5', name: 'Garcia', type: 'senior_resident', status: 'active', statusExpiresAt: null, teamId: 2 },
        { id: 'tp6', name: 'Williams', type: 'pa', status: 'active', statusExpiresAt: null, teamId: 2 },
        // Team 3: Attending + Senior + Rotator
        { id: 'tp7', name: 'Edwards', type: 'attending', status: 'active', statusExpiresAt: null, teamId: 3 },
        { id: 'tp8', name: 'Taylor', type: 'senior_resident', status: 'taking_signout', statusExpiresAt: now + 18 * m, teamId: 3 },
        { id: 'tp9', name: 'Kim', type: 'rotator', status: 'active', statusExpiresAt: null, teamId: 3 },
        // Team 4 (Trauma): Attending + Junior
        { id: 'tp10', name: 'Allen', type: 'attending', status: 'active', statusExpiresAt: null, teamId: 4 },
        { id: 'tp11', name: 'Martinez', type: 'junior_resident', status: 'active', statusExpiresAt: null, teamId: 4 },
      ];

      const tourPatients: Patient[] = [
        // Team 1: 1 Red (old, decayed), 1 Yellow (recent → buffer source)
        { id: 'C-001', acuity: 'tier_one', assignedTeamId: 1, assignedAt: now - 70 * m },
        { id: 'C-003', acuity: 'tier_two', assignedTeamId: 1, assignedAt: now - 3 * m },
        // Team 2: 1 Red (old enough that buffer expired, ~40m ago)
        { id: 'C-002', acuity: 'tier_one', assignedTeamId: 2, assignedAt: now - 40 * m },
        // Team 3: 1 Yellow (old, buffer expired), 1 Purple (old)
        { id: 'F-001', acuity: 'tier_two', assignedTeamId: 3, assignedAt: now - 30 * m },
        { id: 'C-004', acuity: 'tier_three', assignedTeamId: 3, assignedAt: now - 55 * m },
        // Team 4: 1 Purple
        { id: 'F-002', acuity: 'tier_three', assignedTeamId: 4, assignedAt: now - 30 * m },
      ];

      // Team 1: Yellow buffer from C-003 (assigned 3m ago, 25m duration → 22m left)
      // Team 2: no buffer (Red buffer from C-002 expired: 40m ago, 35m duration)
      // Team 3: no buffer (Yellow buffer from F-001 expired: 30m ago, 25m duration)
      // Only Team 1 has an active buffer so users can see buffered vs non-buffered.
      const tourBuffers: Buffer[] = [
        { id: 'tb1', teamId: 1, tier: 'tier_two', createdAt: now - 3 * m, expiresAt: now + 22 * m },
      ];

      return {
        ...state,
        providers: tourProviders,
        patients: tourPatients,
        buffers: tourBuffers,
        patientCounter: { C: 4, F: 2 },
        currentRole: 'charge_nurse',
        shiftStarted: true,
        now,
        closedTeams: {},
      };
    }

    case 'LOAD_DEMO': {
      const demoNow = Date.now();
      const min = 60 * 1000;

      // Name pools
      const lastNames = [
        'Rodriguez', 'Chen', 'Patel', 'Garcia', 'Williams', 'Kim', 'Johnson',
        'Lee', 'Brown', 'Davis', 'Taylor', 'Martinez', 'Wilson', 'Anderson',
        'Thomas', 'Jackson', 'White', 'Harris', 'Clark', 'Lewis', 'Young',
        'Walker', 'Hall', 'Allen', 'King', 'Wright', 'Lopez', 'Hill', 'Scott',
        'Green', 'Adams', 'Baker', 'Nelson', 'Carter', 'Mitchell', 'Perez',
        'Roberts', 'Turner', 'Phillips', 'Campbell', 'Parker', 'Evans', 'Edwards',
      ];
      const shuffled = [...lastNames].sort(() => Math.random() - 0.5);
      let nameIdx = 0;
      const nextName = () => shuffled[nameIdx++] || `Doc${nameIdx}`;

      // Helper: pick random item from array
      const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(Math.random() * arr.length)];
      const randInt = (lo: number, hi: number) => Math.floor(Math.random() * (hi - lo + 1)) + lo;

      // Build providers per team with randomized compositions
      type PType = Provider['type'];
      const nonAttendingTypes: PType[] = ['senior_resident', 'junior_resident', 'intern', 'pa', 'rotator'];
      let pId = 0;

      const makeProvider = (teamId: 1 | 2 | 3 | 4, type: PType): Provider => {
        return { id: `p${++pId}`, name: nextName(), type, status: 'active', statusExpiresAt: null, teamId };
      };

      const demoProviders: Provider[] = [];
      for (const teamId of [1, 2, 3, 4] as const) {
        // Every team gets an attending
        demoProviders.push(makeProvider(teamId, 'attending'));
        if (teamId === 4) {
          // Trauma: attending + 1 resident
          demoProviders.push(makeProvider(4, pick(['senior_resident', 'junior_resident'])));
        } else if (teamId === 1) {
          // Team 1: attending + 1 junior resident + 1 PA + 1 rotator (compact for mobile tour)
          // All active so tour step 3 shows clean strength values
          for (const t of ['junior_resident', 'pa', 'rotator'] as PType[]) {
            demoProviders.push({ id: `p${++pId}`, name: nextName(), type: t, status: 'active', statusExpiresAt: null, teamId: 1 });
          }
        } else {
          // Teams 2-3: uneven staffing (1-4 additional providers)
          const extraOptions = [1, 2, 3, 4];
          const extra = pick(extraOptions);
          const available = [...nonAttendingTypes].sort(() => Math.random() - 0.5);
          for (let i = 0; i < extra; i++) {
            demoProviders.push(makeProvider(teamId, available[i % available.length]));
          }
        }
      }

      // Build patients by simulating assignments through the recommendation engine
      const tiers: Patient['acuity'][] = ['tier_one', 'tier_two', 'tier_three'];
      const patientCount = randInt(4, 8);
      // Generate arrival times spread over the last 90 minutes, sorted oldest first
      const arrivalTimes = Array.from({ length: patientCount }, () => demoNow - randInt(3, 90) * min)
        .sort((a, b) => a - b);

      let cCount = 0;
      let fCount = 0;
      const simPatients: Patient[] = [];

      for (const arrivedAt of arrivalTimes) {
        const tier = pick(tiers);
        const isCritical = tier === 'tier_one' || Math.random() > 0.6;
        const prefix = isCritical ? 'C' : 'F';
        if (prefix === 'C') cCount++; else fCount++;
        const id = `${prefix}-${String(prefix === 'C' ? cCount : fCount).padStart(3, '0')}`;

        // Occasionally assign to trauma (team 4) as a manual override (~15%)
        let teamId: TeamId;
        if (Math.random() < 0.15) {
          teamId = 4;
        } else {
          // Run the recommendation engine at the time of arrival
          const rec = getRecommendation(demoProviders, simPatients, [], arrivedAt);
          teamId = rec.first ?? pick([1, 2, 3] as const);
        }

        simPatients.push({ id, acuity: tier, assignedTeamId: teamId, assignedAt: arrivedAt });
      }

      return {
        ...state,
        providers: demoProviders,
        patients: simPatients,
        buffers: [],
        patientCounter: { C: cCount, F: fCount },
        currentRole: 'charge_nurse',
        shiftStarted: true,
        now: demoNow,
        closedTeams: {},
        demoMode: 'sandbox',
      };
    }

    case 'LOAD_SCHEDULE_DEMO': {
      const simNow = Date.now();
      // Shift baseTime back by currentHour so the sim starts with that many hours already elapsed
      const startHour = action.scheduleData.currentHour ?? 0;
      const baseTime = simNow - startHour * 3600000;
      const timeline = generateTimeline(action.seed, action.shiftDurationMs, action.overrides, baseTime);
      const generatedChanges = generateStatusChanges(action.seed, action.shiftDurationMs, action.overrides, baseTime, action.providers);
      const shadow = runShadowSim(
        action.providers, timeline, {}, [],
        action.overrides, baseTime, 'round_robin',
        generatedChanges,
      );
      const liveShadow = runShadowSim(
        action.providers, timeline, {}, [],
        action.overrides, baseTime, 'formula',
        generatedChanges,
      );
      const simState: SimulationState = {
        active: true,
        baseTime,
        speed: 100,
        paused: false,
        seed: action.seed,
        shiftDurationMs: action.shiftDurationMs,
        timeline,
        statusChanges: generatedChanges,
        nextArrivalIndex: 0,
        nextStatusChangeIndex: 0,
        snapshots: [],
        overrides: action.overrides,
        permanentlyClosedTeams: [],
        roundRobin: false,
        roundRobinNext: 0,
        shadow,
        liveShadow,
        initialProviders: action.providers.map(p => ({ ...p })),
      };
      return {
        ...state,
        providers: action.providers,
        patients: [],
        buffers: [],
        overrides: [],
        patientCounter: { C: 0, F: 0 },
        currentRole: 'charge_nurse',
        shiftStarted: true,
        now: simNow,
        closedTeams: {},
        simulation: simState,
        floatAttendings: action.floatAttendings,
        scheduleData: action.scheduleData,
        demoMode: 'real-schedule',
      };
    }

    case 'START_SIMULATION': {
      const simNow = Date.now();
      const timeline = generateTimeline(action.seed, action.shiftDurationMs, action.overrides, simNow);
      const generatedChanges = generateStatusChanges(action.seed, action.shiftDurationMs, action.overrides, simNow, action.providers);
      const statusChanges = action.presetStatusChanges
        ? [...generatedChanges, ...action.presetStatusChanges].sort((a, b) => a.time - b.time)
        : generatedChanges;
      const permaClosed = action.closedTeams ? Object.keys(action.closedTeams).map(Number) : [];
      const shadowMode = action.roundRobin ? 'formula' : 'round_robin';
      const liveMode = action.roundRobin ? 'round_robin' : 'formula';
      const shadow = runShadowSim(
        action.providers, timeline, action.closedTeams ?? {}, permaClosed,
        action.overrides, simNow, shadowMode as 'round_robin' | 'formula',
        statusChanges,
      );
      const liveShadow = runShadowSim(
        action.providers, timeline, action.closedTeams ?? {}, permaClosed,
        action.overrides, simNow, liveMode as 'round_robin' | 'formula',
        statusChanges,
      );
      const simState: SimulationState = {
        active: true,
        baseTime: simNow,
        speed: 100,
        paused: false,
        seed: action.seed,
        shiftDurationMs: action.shiftDurationMs,
        timeline,
        statusChanges,
        nextArrivalIndex: 0,
        nextStatusChangeIndex: 0,
        snapshots: [],
        overrides: action.overrides,
        permanentlyClosedTeams: permaClosed,
        roundRobin: action.roundRobin ?? false,
        roundRobinNext: 0,
        shadow,
        liveShadow,
        initialProviders: action.providers.map(p => ({ ...p })),
      };
      return {
        ...state,
        providers: action.providers,
        patients: [],
        buffers: [],
        overrides: [],
        patientCounter: { C: 0, F: 0 },
        currentRole: 'charge_nurse',
        shiftStarted: true,
        now: simNow,
        closedTeams: action.closedTeams ?? {},
        simulation: simState,
      };
    }

    case 'SET_SIM_SPEED': {
      if (!state.simulation) return state;
      return { ...state, simulation: { ...state.simulation, speed: action.speed } };
    }

    case 'TOGGLE_SIM_PAUSE': {
      if (!state.simulation) return state;
      return { ...state, simulation: { ...state.simulation, paused: !state.simulation.paused } };
    }

    case 'SIM_REWIND': {
      if (!state.simulation) return state;
      const snapshot = state.simulation.snapshots[action.snapshotIndex];
      if (!snapshot) return state;
      // Restore state from snapshot, keep simulation metadata and ALL snapshots
      const timelineIndex = state.simulation.timeline.findIndex(e => e.arrivalTime > snapshot.simTime);
      const statusChangeIndex = state.simulation.statusChanges.findIndex(e => e.time > snapshot.simTime);
      return {
        ...snapshot.state,
        simulation: {
          ...state.simulation,
          paused: state.simulation.paused, // preserve play/pause state
          nextArrivalIndex: timelineIndex === -1 ? state.simulation.timeline.length : timelineIndex,
          nextStatusChangeIndex: statusChangeIndex === -1 ? state.simulation.statusChanges.length : statusChangeIndex,
          snapshots: state.simulation.snapshots,
        },
        now: snapshot.simTime,
      };
    }

    case 'SIM_SKIP_TO_NEXT': {
      if (!state.simulation) return state;
      const sim = state.simulation;
      const nextEntry = sim.timeline[sim.nextArrivalIndex];
      if (!nextEntry) return state; // no more arrivals

      // Jump time to the next arrival, then let the TICK-like logic process it
      const skipNow = nextEntry.arrivalTime;

      // Apply the scheduled status changes up to the new time in time order, with
      // expiries in between, so the arrival is scored on the providers of that moment.
      const { providers, nextIndex: nextStatusChangeIndex } =
        applyStatusChangesUntil(state.providers, sim.statusChanges, sim.nextStatusChangeIndex, skipNow);
      const buffers = state.buffers.filter(b => b.expiresAt > skipNow);
      let rrNext = sim.roundRobinNext ?? 0;

      // Process all arrivals up to skipNow
      let nextIdx = sim.nextArrivalIndex;
      let simPatients = state.patients;
      let simBuffers = buffers;
      let patientCounter = state.patientCounter;
      let snapshots = sim.snapshots;
      const scoringOverrides = simOverridesToScoring(sim);

      while (nextIdx < sim.timeline.length && sim.timeline[nextIdx].arrivalTime <= skipNow) {
        const entry = sim.timeline[nextIdx];
        nextIdx++;

        const prefix = entry.isFloor ? 'F' : 'C';
        const count = patientCounter[prefix] + 1;
        const id = `${prefix}-${String(count).padStart(3, '0')}`;

        // Same assignment mode as TICK: round-robin runs stay round-robin, and a demo
        // floor upgrade stays on its team.
        let teamId: TeamId;
        if (entry.isFloor && entry.floorTeamId !== undefined) {
          teamId = entry.floorTeamId;
        } else if (sim.roundRobin) {
          ({ teamId, rrNext } = roundRobinTeam(sim, state.closedTeams, rrNext));
        } else {
          const rec = getRecommendation(providers, simPatients, simBuffers, skipNow, state.closedTeams, scoringOverrides);
          teamId = rec.first ?? (1 as TeamId);
        }

        const patient = { id, acuity: entry.acuity, assignedTeamId: teamId, assignedAt: skipNow };
        const newBuffer = createBuffer(teamId, entry.acuity, skipNow, scoringOverrides);

        const existingTeamBuffers = simBuffers.filter(b => b.teamId === teamId && b.expiresAt > skipNow && !b.deceasedPatientId);
        const otherBuffers = simBuffers.filter(b => !(b.teamId === teamId && b.expiresAt > skipNow && !b.deceasedPatientId));
        if (existingTeamBuffers.length > 0) {
          const allBufs = [...existingTeamBuffers, newBuffer];
          const currentExpiry = Math.max(...existingTeamBuffers.map(b => b.expiresAt));
          const newDuration = newBuffer.expiresAt - newBuffer.createdAt;
          const latestExpiry = Math.max(currentExpiry, skipNow) + newDuration;
          const tierRank = { tier_one: 0, tier_two: 1, tier_three: 2 } as const;
          const bestTier = allBufs.reduce((best, b) => tierRank[b.tier] < tierRank[best.tier] ? b : best).tier;
          const totalCount = allBufs.reduce((sum, b) => sum + (b.mergedCount ?? 1), 0);
          simBuffers = [...otherBuffers, {
            id: newBuffer.id, teamId, tier: bestTier,
            createdAt: Math.min(...allBufs.map(b => b.createdAt)),
            expiresAt: latestExpiry, mergedCount: totalCount,
          }];
        } else {
          simBuffers = [...simBuffers, newBuffer];
        }

        simPatients = [...simPatients, patient];
        patientCounter = { ...patientCounter, [prefix]: count };
      }

      snapshots = addSnapshot(snapshots, takeSnapshot(
        { ...state, providers, patients: simPatients, buffers: simBuffers, patientCounter },
        skipNow,
      ));

      return {
        ...state,
        now: skipNow,
        providers,
        patients: simPatients,
        buffers: simBuffers,
        patientCounter,
        simulation: { ...sim, nextArrivalIndex: nextIdx, nextStatusChangeIndex, roundRobinNext: rrNext, snapshots, paused: sim.paused },
      };
    }

    case 'SET_SIM_OVERRIDE': {
      if (!state.simulation) return state;
      return {
        ...state,
        simulation: {
          ...state.simulation,
          overrides: { ...state.simulation.overrides, ...action.overrides },
        },
      };
    }

    case 'SET_FLOAT_MODIFIER': {
      const patients = state.patients.map(p => {
        if (p.id !== action.patientId) return p;
        return {
          ...p,
          floatModifier: action.modifier === 'none' ? undefined : action.modifier,
          floatAttendingName: action.modifier === 'none' ? undefined : action.floatName,
        };
      });
      return { ...state, patients };
    }

    case 'SET_FLOAT_ATTENDINGS':
      return { ...state, floatAttendings: action.names };

    case 'SCHEDULE_CHANGE_HOUR': {
      if (!state.scheduleData || !state.simulation) return state;
      const sd = state.scheduleData;
      const day = sd.days[sd.selectedDayIdx];
      if (!day) return state;
      const { providers: schedProviders, floatAttendings } = getProvidersForShift(day, action.hour);
      const newProviders: Provider[] = schedProviders.map(sp => ({
        id: uid(),
        name: sp.name.replace(/\w\S*/g, w => w[0].toUpperCase() + w.slice(1).toLowerCase()),
        type: sp.type,
        status: 'active' as const,
        statusExpiresAt: null,
        teamId: sp.teamId,
      }));
      if (newProviders.length === 0) return { ...state, scheduleData: { ...sd, currentHour: action.hour } };
      const sim = state.simulation;
      // Keep same baseTime so the sim clock is continuous
      const baseTime = sim.baseTime;
      const elapsedMs = action.hour * 60 * 60 * 1000;
      const targetTime = baseTime + elapsedMs;
      const timeline = generateTimeline(sim.seed, sim.shiftDurationMs, sim.overrides, baseTime);
      const generatedChanges = generateStatusChanges(sim.seed, sim.shiftDurationMs, sim.overrides, baseTime, newProviders);
      const shadow = runShadowSim(newProviders, timeline, {}, [], sim.overrides, baseTime, 'round_robin', generatedChanges);
      const liveShadow = runShadowSim(newProviders, timeline, {}, [], sim.overrides, baseTime, 'formula', generatedChanges);
      // Fast-forward: replay all arrivals up to the current elapsed time
      const replay = replayToTime(
        newProviders, timeline, generatedChanges,
        {}, [], sim.overrides, baseTime, targetTime,
        sim.roundRobin ?? false,
      );
      const newSim: SimulationState = {
        active: true,
        baseTime,
        speed: sim.speed,
        paused: sim.paused,
        seed: sim.seed,
        shiftDurationMs: sim.shiftDurationMs,
        timeline,
        statusChanges: generatedChanges,
        nextArrivalIndex: replay.nextArrivalIndex,
        nextStatusChangeIndex: replay.nextStatusChangeIndex,
        snapshots: [],
        overrides: sim.overrides,
        permanentlyClosedTeams: [],
        roundRobin: sim.roundRobin ?? false,
        roundRobinNext: replay.roundRobinNext,
        shadow,
        liveShadow,
        initialProviders: newProviders.map(p => ({ ...p })),
      };
      return {
        ...state,
        providers: replay.providers,
        patients: replay.patients,
        buffers: replay.buffers,
        overrides: [],
        patientCounter: replay.patientCounter,
        now: targetTime,
        closedTeams: {},
        simulation: newSim,
        floatAttendings,
        scheduleData: { ...sd, currentHour: action.hour },
      };
    }

    default:
      return state;
  }
}

interface ShiftContextValue {
  state: ShiftState;
  dispatch: React.Dispatch<SessionAction>;
  recommendation: Recommendation;
  capacityWeights: Record<ProviderType, number>;
  /** Shift activity events, oldest first (see src/activity.ts). */
  activity: ActivityEvent[];
  /** The assignment that can still be undone, if any. */
  undoable: SessionState['undoable'];
  /** Live shift: the uploaded schedule the board follows, if any. */
  follow: SessionState['follow'];
}

// Provider weights are frozen for the whole study at the constants.ts values
// (Roundtable 2026-09-28, Decision 7). The app no longer polls the Delphi sheet for
// scoring; the survey and its endpoint stay in place for research (?lab).
const FROZEN_CAPACITY_WEIGHTS: Record<ProviderType, number> = { ...CAPACITY_WEIGHTS };

export function scoringFor(state: ShiftState): ScoringOverrides {
  // Simulation overrides (lab and demo clock) take precedence, as before.
  return { capacityWeights: FROZEN_CAPACITY_WEIGHTS, ...simOverridesToScoring(state.simulation) };
}

const sessionReducer = makeSessionReducer(shiftReducer, scoringFor);
const initialSession: SessionState = emptySession(initialState);

const ShiftContext = createContext<ShiftContextValue | null>(null);

/**
 * One provider holds one shift. The live shift, the demo and the tour each mount their
 * own provider, so a demo or tour can never overwrite a live shift.
 */
export function ShiftProvider({ children }: { children: ReactNode }) {
  const [session, dispatch] = useReducer(sessionReducer, initialSession);
  const state = session.shift;
  const capacityWeights = FROZEN_CAPACITY_WEIGHTS;

  const scoringOverrides = useMemo(
    (): ScoringOverrides => ({ capacityWeights: FROZEN_CAPACITY_WEIGHTS, ...simOverridesToScoring(state.simulation) }),
    [state.simulation],
  );

  const recommendation = useMemo(
    () => getRecommendation(state.providers, state.patients, state.buffers, state.now, state.closedTeams, scoringOverrides),
    [state.providers, state.patients, state.buffers, state.now, state.closedTeams, scoringOverrides],
  );

  const value = useMemo(
    () => ({ state, dispatch, recommendation, capacityWeights, activity: session.activity, undoable: session.undoable, follow: session.follow }),
    [state, dispatch, recommendation, capacityWeights, session.activity, session.undoable, session.follow],
  );

  return <ShiftContext.Provider value={value}>{children}</ShiftContext.Provider>;
}

export function useShift() {
  const ctx = useContext(ShiftContext);
  if (!ctx) throw new Error('useShift must be used within ShiftProvider');
  return ctx;
}
