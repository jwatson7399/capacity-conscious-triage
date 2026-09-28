// © 2026 New York University. All rights reserved.
//
// Sample shifts for the demo and the tour. Made-up names only. Every sample provider is
// active (statuses are hidden for the trial), and every sample patient is placed through
// the real recommendation engine at its arrival time.

import type { AcuityTier, Patient, Provider, ProviderType, ShiftState, SimulationState, TeamId } from '../types';
import { getRecommendation } from '../engine/recommendation';
import { getDefaultOverrides, mulberry32, randomSeed } from '../engine/simulation';
import { getProvidersForShift, parseWeeklySchedule, type DaySchedule } from '../utils/scheduleParser';
import { initialState } from '../context/ShiftContext';
import { uid } from '../uid';

const MIN = 60_000;

function provider(name: string, type: ProviderType, teamId: TeamId): Provider {
  return { id: uid(), name, type, status: 'active', statusExpiresAt: null, teamId };
}

export function sampleRoster(): Provider[] {
  return [
    provider('Alvarez', 'attending', 1), provider('Chen', 'senior_resident', 1), provider('Patel', 'intern', 1),
    provider('Brooks', 'attending', 2), provider('Okafor', 'junior_resident', 2), provider('Nguyen', 'pa', 2),
    provider('Kowalski', 'attending', 3), provider('Haddad', 'senior_resident', 3), provider('Rivera', 'intern', 3), provider('Stein', 'rotator', 3),
    provider('Mensah', 'attending', 4), provider('Ito', 'senior_resident', 4),
  ];
}

function makeSim(now: number, providers: Provider[], opts: { speed: number; paused: boolean; startedMinAgo: number }): SimulationState {
  const baseTime = now - opts.startedMinAgo * MIN;
  return {
    active: true,
    baseTime,
    speed: opts.speed,
    paused: opts.paused,
    seed: randomSeed(),
    shiftDurationMs: 24 * 60 * MIN,
    timeline: [],
    statusChanges: [],
    nextArrivalIndex: 0,
    nextStatusChangeIndex: 0,
    snapshots: [],
    overrides: getDefaultOverrides(),
    permanentlyClosedTeams: [],
    roundRobin: false,
    roundRobinNext: 0,
    initialProviders: providers.map(p => ({ ...p })),
  };
}

/** Place a list of past arrivals through the engine, oldest first. */
function placeHistory(providers: Provider[], arrivals: { minsAgo: number; acuity: AcuityTier; trauma?: boolean; floor?: boolean }[], now: number) {
  const patients: Patient[] = [];
  const counter = { C: 0, F: 0 };
  for (const a of [...arrivals].sort((x, y) => y.minsAgo - x.minsAgo)) {
    const at = now - a.minsAgo * MIN;
    const prefix = a.floor ? 'F' : 'C';
    counter[prefix] += 1;
    const id = `${prefix}-${String(counter[prefix]).padStart(3, '0')}`;
    const teamId: TeamId = a.trauma ? 4 : (getRecommendation(providers, patients, [], at).first ?? 1);
    patients.push({ id, acuity: a.acuity, assignedTeamId: teamId, assignedAt: at });
  }
  return { patients, counter };
}

function randomHistory(seed: number): { minsAgo: number; acuity: AcuityTier; trauma?: boolean; floor?: boolean }[] {
  const rng = mulberry32(seed);
  const n = 9 + Math.floor(rng() * 4);
  return Array.from({ length: n }, () => {
    const r = rng();
    const acuity: AcuityTier = r < 0.25 ? 'tier_one' : r < 0.7 ? 'tier_two' : 'tier_three';
    return { minsAgo: 4 + Math.floor(rng() * 170), acuity, trauma: rng() < 0.1, floor: rng() < 0.15 };
  });
}

export function buildDemoShift(opts: { providers?: Provider[]; floatAttendings?: string[]; label?: string } = {}): ShiftState {
  const now = Date.now();
  const providers = opts.providers ?? sampleRoster();
  const { patients, counter } = placeHistory(providers, randomHistory(randomSeed()), now);
  return {
    ...initialState,
    providers,
    patients,
    buffers: [],
    overrides: [],
    patientCounter: counter,
    currentRole: 'charge_nurse',
    shiftStarted: true,
    now,
    closedTeams: {},
    floatAttendings: opts.floatAttendings ?? ['Lindqvist', 'Moreau'],
    simulation: makeSim(now, providers, { speed: 60, paused: false, startedMinAgo: 180 }),
    demoMode: 'sandbox',
  };
}

/** Fixed sample for the tour. The clock is held still so the numbers stay put. */
export function buildTourShift(): ShiftState {
  const now = Date.now();
  const providers = sampleRoster();
  const { patients, counter } = placeHistory(providers, [
    { minsAgo: 170, acuity: 'tier_two' }, { minsAgo: 150, acuity: 'tier_one' }, { minsAgo: 131, acuity: 'tier_two' },
    { minsAgo: 118, acuity: 'tier_three', floor: true }, { minsAgo: 96, acuity: 'tier_one' }, { minsAgo: 84, acuity: 'tier_two' },
    { minsAgo: 61, acuity: 'tier_three' }, { minsAgo: 40, acuity: 'tier_two' }, { minsAgo: 22, acuity: 'tier_one', trauma: true },
    { minsAgo: 14, acuity: 'tier_three' }, { minsAgo: 6, acuity: 'tier_two' },
  ], now);
  return {
    ...initialState,
    providers,
    patients,
    buffers: [],
    overrides: [],
    patientCounter: counter,
    currentRole: 'charge_nurse',
    shiftStarted: true,
    now,
    closedTeams: {},
    floatAttendings: ['Lindqvist'],
    simulation: makeSim(now, providers, { speed: 1, paused: true, startedMinAgo: 180 }),
    demoMode: 'sandbox',
  };
}

// ---------- the synthetic sample schedule ----------

function titleCase(s: string): string {
  return s.replace(/\w\S*/g, w => w[0].toUpperCase() + w.slice(1).toLowerCase());
}

export interface ScheduleChoice {
  days: DaySchedule[];
}

/**
 * Loads the synthetic schedule shipped at public/schedules/demo-week-schedule.xlsx
 * (real layout, pseudonymous names). Real schedules never live under public/.
 */
export async function loadSampleSchedule(): Promise<DaySchedule[]> {
  const resp = await fetch(`${import.meta.env.BASE_URL}schedules/demo-week-schedule.xlsx`);
  if (!resp.ok) throw new Error('Could not load the sample schedule.');
  const parsed = parseWeeklySchedule(await resp.arrayBuffer());
  if (parsed.days.length === 0) throw new Error('No days found in the sample schedule.');
  return parsed.days;
}

export function providersAt(day: DaySchedule, hour: number): { providers: Provider[]; floatAttendings: string[] } {
  const { providers, floatAttendings } = getProvidersForShift(day, hour);
  return {
    providers: providers.map(p => provider(titleCase(p.name), p.type, p.teamId)),
    floatAttendings: floatAttendings.map(titleCase),
  };
}

export async function buildScheduledDemoShift(): Promise<ShiftState> {
  const days = await loadSampleSchedule();
  const day = days[Math.floor(Math.random() * days.length)];
  const hour = 10;
  const { providers, floatAttendings } = providersAt(day, hour);
  if (providers.length === 0) throw new Error('No providers on the sample schedule at that hour.');
  return buildDemoShift({ providers, floatAttendings });
}
