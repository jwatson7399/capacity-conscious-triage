import type { ProviderType, ProviderStatus, AcuityTier, TeamId, FloatModifier } from './types';

// Fallback defaults — Delphi round-one survey averages (n=19); overridden at runtime by live sheet (see useSurveyWeights)
export const CAPACITY_WEIGHTS: Record<ProviderType, number> = {
  attending: 20,
  senior_resident: 15.2,
  junior_resident: 10.8,
  intern: 6.6,
  pa: 11.4,
  rotator: 2.4,
};

export const STATUS_MULTIPLIERS: Record<ProviderStatus, number> = {
  active: 1.0,
  in_procedure: 0.25,
  taking_signout: 0.5,
  off_floor: 0,
};

// Recommended config (per Methods & Validation paper): 4 : 2 : 1 (Red : Yellow : Purple)
export const ACUITY_WEIGHTS: Record<AcuityTier, number> = {
  tier_one: 4,
  tier_two: 2,
  tier_three: 1,
};

// Buffers removed (per Methods & Validation paper): the load model provides implicit protection.
export const BUFFER_DURATIONS_MS: Record<AcuityTier, number> = {
  tier_one: 0,
  tier_two: 0,
  tier_three: 0,
};

// D6 linear decay (per Methods & Validation paper): weight declines linearly from base to 0 over duration.
// The single endpoint encodes the linear duration; getDecayedAcuityWeight interpolates linearly.
export const ACUITY_DECAY: Record<AcuityTier, Array<{ afterMs: number; weight: number }>> = {
  tier_one: [{ afterMs: 180 * 60 * 1000, weight: 0 }],
  tier_two: [{ afterMs: 180 * 60 * 1000, weight: 0 }],
  tier_three: [{ afterMs: 90 * 60 * 1000, weight: 0 }],
};

export const STATUS_EXPIRE_MS = 30 * 60 * 1000;

export const STATUS_EXPIRE_MS_MAP: Record<ProviderStatus, number | null> = {
  active: null,
  in_procedure: 30 * 60 * 1000,
  taking_signout: 30 * 60 * 1000,
  off_floor: 15 * 60 * 1000,
};

// Delphi round currently being collected. New survey submissions are stamped with this.
// R2 panelists see R1 aggregate feedback (mean + IQR) on each slider.
export const CURRENT_ROUND: 1 | 2 = 2;
export const R2_MIN_RESPONSES = 5;

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
  senior_resident: 'PGY-3/4',
  junior_resident: 'PGY-2',
  intern: 'PGY-1',
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

// Red-zone boundary: p5 of the empirical capacity-ratio distribution (23,193 obs)
// under the recommended config. Purely descriptive — "this team-state is in the
// historically rarest, busiest 5%" — it makes no claim about subjective overwhelm.
export const RED_ZONE_THRESHOLD = 8.5;

export const CAPACITY_TERMS: Array<{ minRatio: number; label: string; color: string }> = [
  { minRatio: 50, label: 'Comfortable', color: 'text-emerald-500' },     // top 25% (≥ p75)
  { minRatio: 23, label: 'Manageable', color: 'text-green-500' },        // p50–p75 (above median)
  { minRatio: 16, label: 'Busy', color: 'text-yellow-600' },             // p33–p50
  { minRatio: 11.5, label: 'Very Busy', color: 'text-orange-500' },      // p15–p33 (modal plateau)
  { minRatio: RED_ZONE_THRESHOLD, label: 'High Demand', color: 'text-red-500' },  // p5–p15
];

// Color stops anchored to per-arrival percentiles of real 4:2:1 historical replay data
// (1,958 arrivals, 121 shift-days). p1=12 · p5=19 · p15=31 · p25=47.
const COLOR_STOPS: Array<{ ratio: number; r: number; g: number; b: number }> = [
  { ratio: 0, r: 153, g: 27, b: 27 },        // red-800
  { ratio: 8.5, r: 220, g: 38, b: 38 },      // red-600 (overwhelm threshold)
  { ratio: 12, r: 239, g: 68, b: 68 },       // red-500
  { ratio: 19, r: 249, g: 115, b: 22 },      // orange-500
  { ratio: 31, r: 234, g: 179, b: 8 },       // yellow-500
  { ratio: 47, r: 34, g: 197, b: 94 },       // green-500
  { ratio: 60, r: 16, g: 185, b: 129 },      // emerald-500
];

export function getCapacityColor(ratio: number): string {
  if (!isFinite(ratio) || ratio >= 60) return 'rgb(16, 185, 129)';
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

// Battery fill percentage (0–100) for the capacity widget.
// Anchored to per-arrival percentiles of 4:2:1 historical replay (1,958 arrivals across 121 shift-days):
// ratio 8.5 (overwhelm) → 7% · 12 (p1) → 20% · 19 (p5) → 40% · 31 (p15) → 60% · 47 (p25) → 80% · 60+ → 100%
export function capacityFillPercent(ratio: number): number {
  if (!isFinite(ratio) || ratio >= 60) return 100;
  if (ratio <= 0) return 0;
  const stops: Array<{ r: number; pct: number }> = [
    { r: 0, pct: 0 },
    { r: RED_ZONE_THRESHOLD, pct: 7 },
    { r: 12, pct: 20 },
    { r: 19, pct: 40 },
    { r: 31, pct: 60 },
    { r: 47, pct: 80 },
    { r: 60, pct: 100 },
  ];
  for (let i = 0; i < stops.length - 1; i++) {
    const a = stops[i], b = stops[i + 1];
    if (ratio <= b.r) {
      const t = (ratio - a.r) / (b.r - a.r);
      return a.pct + t * (b.pct - a.pct);
    }
  }
  return 100;
}

// Tinted card-header gradient per capacity tier.
// Transitions sit at the MIDPOINT between COLOR_STOPS so the tint hue tracks
// the interpolated number color (e.g., ratio 42.5 already reads visually green
// even though it's below the green stop at 47, so green tint starts at 39).
export function getCapacityHeaderGradient(ratio: number): string {
  if (!isFinite(ratio) || ratio >= 54) return 'linear-gradient(180deg, #ecfdf5 0%, #f6fdfa 100%)';
  if (ratio >= 39) return 'linear-gradient(180deg, #dcfce7 0%, #f2fdf4 100%)';
  if (ratio >= 25) return 'linear-gradient(180deg, #fef9c3 0%, #fffceb 100%)';
  if (ratio >= 15) return 'linear-gradient(180deg, #ffedd5 0%, #fff5eb 100%)';
  if (ratio >= 10) return 'linear-gradient(180deg, #fee2e2 0%, #fef4f4 100%)';
  return 'linear-gradient(180deg, #fecaca 0%, #fdebeb 100%)';
}

export function getCapacityTerm(capacityRatio: number): CapacityTerm {
  if (capacityRatio === Infinity) return { label: 'Comfortable', color: 'text-emerald-500' };
  for (const term of CAPACITY_TERMS) {
    if (capacityRatio >= term.minRatio) return { label: term.label, color: term.color };
  }
  return { label: 'Red Zone', color: 'text-red-700' };
}
