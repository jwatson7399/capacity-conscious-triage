import { createContext, useContext, useReducer, useMemo, type ReactNode } from 'react';
import type { ShiftState, ShiftAction, Recommendation } from '../types';
import { STATUS_EXPIRE_MS_MAP, BUFFER_DURATIONS_MS } from '../constants';
import { getRecommendation, createBuffer } from '../engine/recommendation';
import { uid } from '../uid';
import type { Provider, Patient, Buffer, TeamId } from '../types';

const initialState: ShiftState = {
  providers: [],
  patients: [],
  buffers: [],
  overrides: [],
  patientCounter: { C: 0, F: 0 },
  currentRole: null,
  shiftStarted: false,
  now: Date.now(),
};

function shiftReducer(state: ShiftState, action: ShiftAction): ShiftState {
  const now = state.now;

  switch (action.type) {
    case 'SET_ROLE':
      return { ...state, currentRole: action.role };

    case 'START_SHIFT':
      return { ...state, providers: action.providers, shiftStarted: true };

    case 'TICK': {
      const tickNow = Date.now();
      // Auto-expire provider statuses
      const providers = state.providers.map(p => {
        if (p.statusExpiresAt !== null && p.statusExpiresAt <= tickNow) {
          return { ...p, status: 'active' as const, statusExpiresAt: null };
        }
        return p;
      });
      // Remove expired buffers
      const buffers = state.buffers.filter(b => b.expiresAt > tickNow);
      return { ...state, now: tickNow, providers, buffers };
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
      const newBuffer = createBuffer(action.teamId, action.tier, now);
      // Merge stacked buffers for the same team
      const existingTeamBuffers = state.buffers.filter(b => b.teamId === action.teamId && b.expiresAt > now);
      const otherBuffers = state.buffers.filter(b => !(b.teamId === action.teamId && b.expiresAt > now));
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
      const buffers = upgraded
        ? [...state.buffers, createBuffer(upgraded.assignedTeamId, 'tier_one', now)]
        : state.buffers;
      return { ...state, patients, buffers };
    }

    case 'REASSIGN_PATIENT': {
      const patients = state.patients.map(p => {
        if (p.id !== action.patientId) return p;
        return { ...p, assignedTeamId: action.toTeamId };
      });
      const original = state.patients.find(p => p.id === action.patientId);
      const overrides = original
        ? [...state.overrides, {
            patientId: action.patientId,
            recommendedTeamId: original.assignedTeamId,
            assignedTeamId: action.toTeamId,
            reason: action.reason,
            overriddenAt: now,
          }]
        : state.overrides;
      return { ...state, patients, overrides };
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

  const recommendation = useMemo(
    () => getRecommendation(state.providers, state.patients, state.buffers, state.now),
    [state.providers, state.patients, state.buffers, state.now],
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
