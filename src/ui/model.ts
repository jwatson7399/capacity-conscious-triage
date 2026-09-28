// © 2026 New York University. All rights reserved.
//
// Display helpers for the Carbon interface. Everything numeric here is read from the
// engine (src/engine/recommendation.ts) and constants; nothing re-implements scoring.

import type { AcuityTier, Patient, Provider, ProviderType, ShiftState, TeamId, TeamScore } from '../types';
import { ACUITY_DECAY, ACUITY_WEIGHTS, FLOAT_MODIFIER_MULTIPLIERS, TRAUMA_TEAM_ID } from '../constants';
import { getDecayedAcuityWeight } from '../engine/recommendation';

export const A_SIDE: TeamId[] = [1, 2, 3];
export const ALL_TEAMS: TeamId[] = [1, 2, 3, 4];
export const TRAUMA = TRAUMA_TEAM_ID;

export const ACUITIES: AcuityTier[] = ['tier_one', 'tier_two', 'tier_three'];
export const ACUITY_NAME: Record<AcuityTier, string> = { tier_one: 'Red', tier_two: 'Yellow', tier_three: 'Purple' };
export const ACUITY_CLASS: Record<AcuityTier, 'red' | 'yellow' | 'purple'> = { tier_one: 'red', tier_two: 'yellow', tier_three: 'purple' };
export const ACUITY_HINT: Record<AcuityTier, string> = {
  tier_one: 'Critical action: ACLS, intubation or BiPAP, GIB needing blood, anaphylaxis, STEMI',
  tier_two: 'Emergent: septic shock, acute abdomen, AMS, afib with RVR but normotensive',
  tier_three: 'Soft A-side: EtCO2 monitoring, concerning story but normal vitals',
};

export const ROLE_SHORT: Record<ProviderType, string> = {
  attending: 'ATT', senior_resident: 'PGY3/4', junior_resident: 'PGY2', intern: 'PGY1', pa: 'PA', rotator: 'ROT',
};
export const ROLE_LONG: Record<ProviderType, string> = {
  attending: 'Attending', senior_resident: 'Resident PGY3/4', junior_resident: 'Resident PGY2', intern: 'Intern PGY1', pa: 'PA', rotator: 'Rotator',
};
export const ROLE_ORDER: ProviderType[] = ['attending', 'senior_resident', 'junior_resident', 'intern', 'pa', 'rotator'];

export function teamName(t: TeamId): string {
  return t === TRAUMA ? 'Trauma' : `Team ${t}`;
}

export function providerLabel(p: Pick<Provider, 'name' | 'type'>): string {
  return p.type === 'attending' ? `Dr. ${p.name}` : p.name;
}

/** Minutes a tier counts toward load (linear decay endpoint). */
export function countMinutes(tier: AcuityTier): number {
  const steps = ACUITY_DECAY[tier];
  return Math.round((steps[steps.length - 1]?.afterMs ?? 0) / 60000);
}

export function baseWeight(tier: AcuityTier): number {
  return ACUITY_WEIGHTS[tier];
}

/**
 * What this patient adds to its team's load right now (decay times float modifier).
 * A deceased patient adds nothing, matching getCurrentLoad (Decision 17).
 */
export function contribution(p: Patient, now: number): number {
  if (p.deceased) return 0;
  return getDecayedAcuityWeight(p, now) * FLOAT_MODIFIER_MULTIPLIERS[p.floatModifier ?? 'none'];
}

/** Whole minutes until the patient no longer counts toward load. */
export function minutesLeft(p: Patient, now: number): number {
  const elapsed = (now - (p.upgradedAt ?? p.assignedAt)) / 60000;
  return Math.max(0, Math.ceil(countMinutes(p.acuity) - elapsed));
}

/** True while the patient adds anything to its team's load (decay times float modifier). */
export function isCounted(p: Patient, now: number): boolean {
  return contribution(p, now) > 0;
}

/** True while the patient's decay timer is still running, whatever its float modifier. Deceased stops it. */
export function timerRunning(p: Patient, now: number): boolean {
  return !p.deceased && getDecayedAcuityWeight(p, now) > 0;
}

export function isFloatPrimary(p: Patient): boolean {
  return p.floatModifier === 'float_primary';
}

// ---------- ratio display ----------

/**
 * Infinity rule (Roundtable 2026-09-28, Decision 3):
 * - zero load is always infinity;
 * - a ratio of 100 or more shows as infinity, unless two or more A-side teams are at
 *   100 or more at the same time; then those show rounded whole numbers.
 * - Trauma follows the same display rule but does not count toward the two.
 * Counting follows the approved prototype: only finite ratios of 100+ on staffed
 * A-side teams count.
 */
export function highCount(scores: TeamScore[]): number {
  return scores.filter(s => A_SIDE.includes(s.teamId) && s.capacity > 0 && isFinite(s.capacityRatio) && s.capacityRatio >= 100).length;
}

export function formatRatio(ratio: number, capacity: number, high: number): string {
  if (capacity === 0) return '0.0';
  if (ratio === Infinity) return '∞';
  if (ratio >= 100) return high >= 2 ? String(Math.round(ratio)) : '∞';
  return ratio.toFixed(1);
}

export function displayRatio(s: TeamScore, scores: TeamScore[]): string {
  return formatRatio(s.capacityRatio, s.capacity, highCount(scores));
}

/** Ratio after one more patient of this tier, for the preview only. */
export function ratioAfter(s: TeamScore, tier: AcuityTier): number {
  if (s.capacity === 0) return 0;
  return s.capacity / (s.load + ACUITY_WEIGHTS[tier]);
}

/** Shared gauge scale: fuller means more room. ratio / (ratio + 22). */
export function gaugeLevel(ratio: number, capacity: number): number {
  if (capacity === 0) return 0;
  if (!isFinite(ratio)) return 100;
  return (100 * ratio) / (ratio + 22);
}

export const GAUGE_TICKS: [number, string][] = [
  [0, '0'], [10, '10'], [20, '20'], [30, '30'], [50, '50'], [100, '100'], [Infinity, '∞'],
];

// ---------- time ----------

export function clock(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function duration(mins: number): string {
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

export function ago(from: number, now: number): string {
  const m = Math.max(0, Math.floor((now - from) / 60000));
  return m === 0 ? 'just now' : `${duration(m)} ago`;
}

// ---------- team helpers ----------

export function teamPatients(state: ShiftState, t: TeamId): Patient[] {
  return state.patients.filter(p => p.assignedTeamId === t);
}

export function teamProviders(state: ShiftState, t: TeamId): Provider[] {
  return state.providers
    .filter(p => p.teamId === t)
    .sort((a, b) => ROLE_ORDER.indexOf(a.type) - ROLE_ORDER.indexOf(b.type));
}

/** Minutes left on a team's deceased buffer, or 0. */
export function deceasedMinutesLeft(state: ShiftState, t: TeamId): number {
  const active = state.buffers.filter(b => b.teamId === t && b.expiresAt > state.now);
  if (active.length === 0) return 0;
  return Math.max(1, Math.ceil((Math.max(...active.map(b => b.expiresAt)) - state.now) / 60000));
}
