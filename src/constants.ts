import type { ProviderType, ProviderStatus, AcuityTier, TeamId, FloatModifier } from './types';

// Fallback defaults — overridden at runtime by Delphi survey averages (see useSurveyWeights)
export const CAPACITY_WEIGHTS: Record<ProviderType, number> = {
  attending: 20,
  senior_resident: 15,
  junior_resident: 7.5,
  intern: 5,
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
    { afterMs: 240 * 60 * 1000, weight: 0 },
  ],
  tier_two: [
    { afterMs: 90 * 60 * 1000, weight: 1 },
    { afterMs: 240 * 60 * 1000, weight: 0 },
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

export const FLOAT_MODIFIER_MULTIPLIERS: Record<FloatModifier, number> = {
  none: 1.0,
  float_supervising: 0.65,
  float_primary: 0.0,
};

export const FLOAT_MODIFIER_LABELS: Record<FloatModifier, string> = {
  none: 'None',
  float_supervising: 'Float Supervising',
  float_primary: 'Float Primary',
};

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
  junior_resident: 'Resident (PGY-2)',
  intern: 'Intern (PGY-1)',
  pa: 'PA',
  rotator: 'Rotator',
};

export const PROVIDER_TYPE_SHORT: Record<ProviderType, string> = {
  attending: 'ATT',
  senior_resident: 'SR',
  junior_resident: 'JR',
  intern: 'INT',
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

export const OVERWHELM_THRESHOLD = 3.75;  // p5 of empirical distribution (23,193 obs)

export const CAPACITY_TERMS: Array<{ minRatio: number; label: string; color: string }> = [
  { minRatio: 21.25, label: 'Comfortable', color: 'text-emerald-500' },  // top 25% (≥ p75)
  { minRatio: 10, label: 'Manageable', color: 'text-green-500' },        // p50–p75 (above median)
  { minRatio: 7.5, label: 'Busy', color: 'text-yellow-600' },            // p33–p50 (secondary peak)
  { minRatio: 5, label: 'Very Busy', color: 'text-orange-500' },         // p15–p33 (modal plateau)
  { minRatio: OVERWHELM_THRESHOLD, label: 'High Demand', color: 'text-red-500' },  // p5–p15
];

const COLOR_STOPS: Array<{ ratio: number; r: number; g: number; b: number }> = [
  { ratio: 0, r: 153, g: 27, b: 27 },      // red-800
  { ratio: 3.75, r: 239, g: 68, b: 68 },    // red-500
  { ratio: 5.0, r: 249, g: 115, b: 22 },    // orange-500
  { ratio: 7.5, r: 250, g: 204, b: 21 },    // yellow-400
  { ratio: 10.0, r: 34, g: 197, b: 94 },    // green-500
  { ratio: 21.25, r: 16, g: 185, b: 129 },  // emerald-500
];

export function getCapacityColor(ratio: number): string {
  if (!isFinite(ratio) || ratio >= 21.25) return 'rgb(16, 185, 129)';
  if (ratio <= 0) return 'rgb(153, 27, 27)';
  for (let i = 0; i < COLOR_STOPS.length - 1; i++) {
    const a = COLOR_STOPS[i], b = COLOR_STOPS[i + 1];
    if (ratio <= b.ratio) {
      const t = (ratio - a.ratio) / (b.ratio - a.ratio);
      return `rgb(${Math.round(a.r + t * (b.r - a.r))}, ${Math.round(a.g + t * (b.g - a.g))}, ${Math.round(a.b + t * (b.b - a.b))})`;
    }
  }
  return 'rgb(16, 185, 129)';
}

export const CAPACITY_GRADIENT_CSS = `linear-gradient(to right, ${COLOR_STOPS.map((s, i) => `rgb(${s.r},${s.g},${s.b}) ${(i / (COLOR_STOPS.length - 1) * 100).toFixed(1)}%`).join(', ')})`;

export function getCapacityTerm(capacityRatio: number): CapacityTerm {
  if (capacityRatio === Infinity) return { label: 'Comfortable', color: 'text-emerald-500' };
  for (const term of CAPACITY_TERMS) {
    if (capacityRatio >= term.minRatio) return { label: term.label, color: term.color };
  }
  return { label: 'Overwhelmed', color: 'text-red-700' };
}
