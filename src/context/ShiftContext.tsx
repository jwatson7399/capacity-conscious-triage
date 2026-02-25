import { createContext, useContext, useReducer, useMemo, type ReactNode } from 'react';
import type { ShiftState, ShiftAction, Recommendation, SimulationState } from '../types';
import { STATUS_EXPIRE_MS_MAP, BUFFER_DURATIONS_MS, TEAM_CLOSE_TRANSFER_MS, TEAM_CLOSE_TRANSFER_TARGETS, DECEASED_BUFFER_MS } from '../constants';
import { getRecommendation, createBuffer, type ScoringOverrides } from '../engine/recommendation';
import { uid } from '../uid';
import type { Provider, Patient, Buffer, TeamId } from '../types';
import { generateTimeline, takeSnapshot, addSnapshot } from '../engine/simulation';

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

const initialState: ShiftState = {
  providers: [],
  patients: [],
  buffers: [],
  overrides: [],
  patientCounter: { C: 0, F: 0 },
  currentRole: null,
  shiftStarted: false,
  now: Date.now(),
  closedTeams: {},
};

function shiftReducer(state: ShiftState, action: ShiftAction): ShiftState {
  const now = state.now;

  switch (action.type) {
    case 'SET_ROLE':
      return { ...state, currentRole: action.role };

    case 'START_SHIFT':
      return { ...state, providers: action.providers, shiftStarted: true };

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
      // Auto-transfer patients from closed teams after timeout
      // Skip permanently closed teams (from simulation setup)
      const permaClosed = sim?.permanentlyClosedTeams;
      let patients = state.patients;
      let closedTeams = state.closedTeams;
      for (const [teamIdStr, closedAt] of Object.entries(closedTeams)) {
        const teamId = Number(teamIdStr);
        if (permaClosed?.includes(teamId)) continue;
        if (tickNow >= closedAt + TEAM_CLOSE_TRANSFER_MS) {
          const target = TEAM_CLOSE_TRANSFER_TARGETS[teamId];
          if (target) {
            patients = patients.map(p =>
              p.assignedTeamId === teamId ? { ...p, assignedTeamId: target } : p
            );
          }
          const { [teamId]: _, ...rest } = closedTeams;
          closedTeams = rest;
        }
      }

      let newState: ShiftState = { ...state, now: tickNow, providers, buffers, patients, closedTeams };

      // Simulation: process pending arrivals
      if (sim?.active) {
        let { nextArrivalIndex, snapshots } = sim;
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

          // Get recommendation at arrival time
          const rec = getRecommendation(providers, simPatients, simBuffers, tickNow, closedTeams, scoringOverrides);
          const teamId = rec.first ?? (1 as TeamId);

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
          simulation: { ...sim, nextArrivalIndex, snapshots },
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

    case 'UPGRADE_PATIENT': {
      const patients = state.patients.map(p => {
        if (p.id !== action.patientId) return p;
        return {
          ...p,
          originalAcuity: p.acuity,
          acuity: 'tier_one' as const,
          upgradedAt: now,
        };
      });
      const upgraded = state.patients.find(p => p.id === action.patientId);
      let finalBuffers = state.buffers;
      if (upgraded) {
        const scoringOv = simOverridesToScoring(state.simulation);
        const newBuffer = createBuffer(upgraded.assignedTeamId, 'tier_one', now, scoringOv);
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
        return { ...p, assignedTeamId: action.toTeamId, assignedAt: now };
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

      // Create buffer on receiving team (Fix 1 & 4: buffer + fresh assignedAt)
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
        p.assignedTeamId === action.fromTeamId ? { ...p, assignedTeamId: action.toTeamId } : p
      );
      const { [action.fromTeamId]: _, ...closedTeams } = state.closedTeams;
      return { ...state, patients, closedTeams };
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
      return { ...state, patients: state.patients.filter(p => p.id !== action.patientId) };
    }

    case 'LOAD_TOUR_DEMO': {
      // Curated demo state for the guided tour.
      // Team 2 is buffer-free and recommended. Teams 1 & 3 have active buffers.
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
        // Team 3: 1 Yellow (recent → buffer source), 1 Purple (old)
        { id: 'F-001', acuity: 'tier_two', assignedTeamId: 3, assignedAt: now - 3 * m },
        { id: 'C-004', acuity: 'tier_three', assignedTeamId: 3, assignedAt: now - 55 * m },
        // Team 4: 1 Purple
        { id: 'F-002', acuity: 'tier_three', assignedTeamId: 4, assignedAt: now - 30 * m },
      ];

      // Team 1: Yellow buffer from C-003 (assigned 3m ago, 25m duration → 22m left)
      // Team 3: Yellow buffer from F-001 (assigned 3m ago, 25m duration → 22m left)
      // Team 2: no buffer (Red buffer from C-002 expired: 40m ago, 35m duration)
      // Buffers are set with plenty of remaining time so they survive the full tour.
      const tourBuffers: Buffer[] = [
        { id: 'tb1', teamId: 1, tier: 'tier_two', createdAt: now - 3 * m, expiresAt: now + 22 * m },
        { id: 'tb2', teamId: 3, tier: 'tier_two', createdAt: now - 3 * m, expiresAt: now + 22 * m },
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
      type PStatus = Provider['status'];
      const nonAttendingTypes: PType[] = ['senior_resident', 'junior_resident', 'pa', 'rotator'];
      const nonActiveStatuses: PStatus[] = ['in_procedure', 'taking_signout', 'off_floor'];
      let pId = 0;

      const makeProvider = (teamId: 1 | 2 | 3 | 4, type: PType): Provider => {
        const isActive = Math.random() > 0.2;
        const status: PStatus = isActive ? 'active' : pick(nonActiveStatuses);
        const statusExpiresAt = status === 'active' ? null : demoNow + randInt(5, 25) * min;
        return { id: `p${++pId}`, name: nextName(), type, status, statusExpiresAt, teamId };
      };

      const demoProviders: Provider[] = [];
      for (const teamId of [1, 2, 3, 4] as const) {
        // Every team gets an attending
        demoProviders.push(makeProvider(teamId, 'attending'));
        if (teamId === 4) {
          // Trauma: attending + 1 resident
          demoProviders.push(makeProvider(4, pick(['senior_resident', 'junior_resident'])));
        } else {
          // Teams 1-3: 2-4 additional providers
          const extra = randInt(2, 4);
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
      let simPatients: Patient[] = [];
      let simBuffers: Buffer[] = [];
      let bId = 0;

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
          const rec = getRecommendation(demoProviders, simPatients, simBuffers, arrivedAt);
          teamId = rec.first ?? pick([1, 2, 3] as const);
        }

        simPatients.push({ id, acuity: tier, assignedTeamId: teamId, assignedAt: arrivedAt });

        // Create buffer (will be filtered by expiry at the end)
        const buf: Buffer = {
          id: `b${++bId}`,
          teamId,
          tier,
          createdAt: arrivedAt,
          expiresAt: arrivedAt + BUFFER_DURATIONS_MS[tier],
        };
        simBuffers.push(buf);
      }

      const demoPatients = simPatients;
      // Only keep buffers that are still active at demoNow
      const demoBuffers = simBuffers.filter(b => b.expiresAt > demoNow);

      return {
        ...state,
        providers: demoProviders,
        patients: demoPatients,
        buffers: demoBuffers,
        patientCounter: { C: cCount, F: fCount },
        currentRole: 'charge_nurse',
        shiftStarted: true,
        now: demoNow,
        closedTeams: {},
      };
    }

    case 'START_SIMULATION': {
      const simNow = Date.now();
      const timeline = generateTimeline(action.seed, action.shiftDurationMs, action.overrides, simNow);
      const simState: SimulationState = {
        active: true,
        baseTime: simNow,
        speed: 100,
        paused: false,
        seed: action.seed,
        shiftDurationMs: action.shiftDurationMs,
        timeline,
        nextArrivalIndex: 0,
        snapshots: [],
        overrides: action.overrides,
        permanentlyClosedTeams: action.closedTeams ? Object.keys(action.closedTeams).map(Number) : [],
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
      return {
        ...snapshot.state,
        simulation: {
          ...state.simulation,
          paused: state.simulation.paused, // preserve play/pause state
          nextArrivalIndex: timelineIndex === -1 ? state.simulation.timeline.length : timelineIndex,
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

      // Auto-expire providers at the new time
      const providers = state.providers.map(p => {
        if (p.statusExpiresAt !== null && p.statusExpiresAt <= skipNow) {
          return { ...p, status: 'active' as const, statusExpiresAt: null };
        }
        return p;
      });
      const buffers = state.buffers.filter(b => b.expiresAt > skipNow);

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

        const rec = getRecommendation(providers, simPatients, simBuffers, skipNow, state.closedTeams, scoringOverrides);
        const teamId = rec.first ?? (1 as TeamId);

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
        simulation: { ...sim, nextArrivalIndex: nextIdx, snapshots, paused: sim.paused },
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

    default:
      return state;
  }
}

interface ShiftContextValue {
  state: ShiftState;
  dispatch: React.Dispatch<ShiftAction>;
  recommendation: Recommendation;
}

const ShiftContext = createContext<ShiftContextValue | null>(null);

export function ShiftProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(shiftReducer, initialState);

  const scoringOverrides = useMemo(() => simOverridesToScoring(state.simulation), [state.simulation]);
  const recommendation = useMemo(
    () => getRecommendation(state.providers, state.patients, state.buffers, state.now, state.closedTeams, scoringOverrides),
    [state.providers, state.patients, state.buffers, state.now, state.closedTeams, scoringOverrides],
  );

  const value = useMemo(
    () => ({ state, dispatch, recommendation }),
    [state, dispatch, recommendation],
  );

  return <ShiftContext.Provider value={value}>{children}</ShiftContext.Provider>;
}

export function useShift() {
  const ctx = useContext(ShiftContext);
  if (!ctx) throw new Error('useShift must be used within ShiftProvider');
  return ctx;
}
