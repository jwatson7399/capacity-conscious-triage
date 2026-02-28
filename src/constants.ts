import type { ProviderType, ProviderStatus, AcuityTier, TeamId } from './types';

export const CAPACITY_WEIGHTS: Record<ProviderType, number> = {
  attending: 17.5,
  senior_resident: 15,
  junior_resident: 7.5,
  pa: 10,
  rotator: 1,
};

export const STATUS_MULTIPLIERS: Record<ProviderStatus, number> = {
  active: 1.0,
  in_procedure: 0.25,
  taking_signout: 0.5,
  off_floor: 0,
};

export const ACUITY_WEIGHTS: Record<AcuityTier, number> = {
  tier_one: 5,
  tier_two: 3,
  tier_three: 1,
};

export const BUFFER_DURATIONS_MS: Record<AcuityTier, number> = {
  tier_one: 35 * 60 * 1000,
  tier_two: 25 * 60 * 1000,
  tier_three: 15 * 60 * 1000,
};

export const ACUITY_DECAY: Record<AcuityTier, Array<{ afterMs: number; weight: number }>> = {
  tier_one: [
    { afterMs: 60 * 60 * 1000, weight: 3 },
    { afterMs: 120 * 60 * 1000, weight: 1 },
  ],
  tier_two: [
    { afterMs: 90 * 60 * 1000, weight: 1 },
  ],
  tier_three: [
    { afterMs: 120 * 60 * 1000, weight: 0 },
  ],
};

export const STATUS_EXPIRE_MS = 30 * 60 * 1000;

export const STATUS_EXPIRE_MS_MAP: Record<ProviderStatus, number | null> = {
  active: null,
  in_procedure: 30 * 60 * 1000,
  taking_signout: 30 * 60 * 1000,
  off_floor: 15 * 60 * 1000,
};

export const TRAUMA_TEAM_ID = 4 as const;

export const TEAM_CLOSE_TRANSFER_MS = 60 * 60 * 1000;
export const TEAM_CLOSE_TRANSFER_TARGETS: Record<number, TeamId> = { 3: 1, 4: 2 };

export const DECEASED_BUFFER_MS = 30 * 60 * 1000;

export const QUICK_UNDO_WINDOW_MS = 30 * 1000;

export const ACUITY_LABELS: Record<AcuityTier, string> = {
  tier_one: 'Red',
  tier_two: 'Yellow',
  tier_three: 'Purple',
};

export const ACUITY_DESCRIPTORS: Record<AcuityTier, string> = {
  tier_one: 'Critical Action',
  tier_two: 'Emergent',
  tier_three: 'Soft A-Side',
};

export const PROVIDER_TYPE_LABELS: Record<ProviderType, string> = {
  attending: 'Attending',
  senior_resident: 'Resident (PGY 3-4)',
  junior_resident: 'Resident (PGY 1-2)',
  pa: 'PA',
  rotator: 'Rotator',
};

export const PROVIDER_TYPE_SHORT: Record<ProviderType, string> = {
  attending: 'ATT',
  senior_resident: 'SR',
  junior_resident: 'JR',
  pa: 'PA',
  rotator: 'ROT',
};

export const STATUS_LABELS: Record<ProviderStatus, string> = {
  active: 'Active',
  in_procedure: 'In Procedure',
  taking_signout: 'Taking Signout',
  off_floor: 'Off Floor',
};

export const ACUITY_COLORS: Record<AcuityTier, { bg: string; text: string; bar: string }> = {
  tier_one: { bg: 'bg-red-100', text: 'text-red-800', bar: 'bg-red-400' },
  tier_two: { bg: 'bg-amber-100', text: 'text-amber-800', bar: 'bg-amber-400' },
  tier_three: { bg: 'bg-violet-100', text: 'text-violet-800', bar: 'bg-violet-400' },
};

export const STATUS_COLORS: Record<ProviderStatus, string> = {
  active: 'bg-green-500',
  in_procedure: 'bg-yellow-500',
  taking_signout: 'bg-orange-500',
  off_floor: 'bg-gray-400',
};

export interface CapacityTerm {
  label: string;
  color: string;
}

export const CAPACITY_TERMS: Array<{ minRatio: number; label: string; color: string }> = [
  { minRatio: 10, label: 'Ready', color: 'text-emerald-500' },
  { minRatio: 5, label: 'Stable', color: 'text-green-500' },
  { minRatio: 3.35, label: 'Manageable', color: 'text-yellow-500' },
  { minRatio: 2, label: 'Very Busy', color: 'text-orange-500' },
  { minRatio: 0.05, label: 'High Demand', color: 'text-red-500' },
];

export function getCapacityTerm(capacityRatio: number): CapacityTerm {
  if (capacityRatio === 0) return { label: 'Overwhelmed', color: 'text-red-700' };
  if (capacityRatio === Infinity) return { label: 'Ready', color: 'text-emerald-500' };
  for (const term of CAPACITY_TERMS) {
    if (capacityRatio >= term.minRatio) return { label: term.label, color: term.color };
  }
  return { label: 'Overwhelmed', color: 'text-red-700' };
}
