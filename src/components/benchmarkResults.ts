// © 2026 New York University. All rights reserved.
//
// Generated from `npx tsx scripts/benchmark.ts --json` on branch reconcile-june, 2026-09-28
// (200 seeds x 5 presets, 8-hour shifts). Regenerate from the script; do not edit by hand.
// Model: acuity 4:2:1, linear decay to 0 at 180/180/90 min, constants.ts provider weights,
// red zone below 8.5, current-ratio ranking. p is a two-tailed paired t-test on the per-seed
// values; cohensD is the mean paired difference (formula minus round-robin) over its SD.

export interface MetricResult {
  key: string; formulaMean: number; formulaSD: number; roundRobinMean: number; roundRobinSD: number;
  p: number; cohensD: number; wins: number; ties: number; losses: number;
}

export const RUNS_PER_PRESET = 200;

export const POOLED: MetricResult[] = [
  { key: 'redZone', formulaMean: 0.652, formulaSD: 2.013, roundRobinMean: 1.336, roundRobinSD: 2.326, p: 9.2e-61, cohensD: -0.56, wins: 372, ties: 609, losses: 19 },
  { key: 'minRatio', formulaMean: 17.63, formulaSD: 15.19, roundRobinMean: 13.03, roundRobinSD: 13.65, p: 3.6e-103, cohensD: 0.77, wins: 872, ties: 104, losses: 24 },
  { key: 'avgRatio', formulaMean: 97.37, formulaSD: 408.5, roundRobinMean: 149.8, roundRobinSD: 882.3, p: 0.056, cohensD: -0.06, wins: 399, ties: 65, losses: 536 },
  { key: 'b2bHA', formulaMean: 1.775, formulaSD: 2.206, roundRobinMean: 1.633, roundRobinSD: 2.201, p: 5.8e-07, cohensD: 0.16, wins: 171, ties: 552, losses: 277 },
  { key: 'slams', formulaMean: 7.726, formulaSD: 5.549, roundRobinMean: 7.47, roundRobinSD: 5.916, p: 3.8e-11, cohensD: 0.21, wins: 218, ties: 407, losses: 375 },
  { key: 'countSpread', formulaMean: 2.641, formulaSD: 1.753, roundRobinMean: 0.654, roundRobinSD: 0.4757, p: 3.9e-181, cohensD: 1.13, wins: 0, ties: 302, losses: 698 },
  { key: 'acuitySpread', formulaMean: 5.835, formulaSD: 3.626, roundRobinMean: 4.642, roundRobinSD: 2.799, p: 2.8e-23, cohensD: 0.32, wins: 298, ties: 170, losses: 532 },
  { key: 'stressSpread', formulaMean: 0.0531, formulaSD: 0.0359, roundRobinMean: 0.0748, roundRobinSD: 0.0469, p: 5.3e-55, cohensD: -0.53, wins: 546, ties: 240, losses: 214 },
  { key: 'acuityStressSpread', formulaMean: 0.0993, formulaSD: 0.0654, roundRobinMean: 0.1998, roundRobinSD: 0.1372, p: 8.1e-112, cohensD: -0.81, wins: 743, ties: 100, losses: 157 },
  { key: 'avgRatioSpread', formulaMean: 114.5, formulaSD: 954.2, roundRobinMean: 284.2, roundRobinSD: 2609.0, p: 0.039, cohensD: -0.07, wins: 617, ties: 63, losses: 320 },
];

export const PRESETS: { name: string; label: string; metrics: MetricResult[] }[] = [
  { name: 'typical_day', label: 'Typical Day', metrics: [
    { key: 'redZone', formulaMean: 0.13, formulaSD: 0.5942, roundRobinMean: 0.355, roundRobinSD: 0.8882, p: 5.2e-08, cohensD: -0.4, wins: 37, ties: 161, losses: 2 },
    { key: 'minRatio', formulaMean: 20.38, formulaSD: 13.65, roundRobinMean: 13.98, roundRobinSD: 8.548, p: 2.2e-26, cohensD: 0.88, wins: 188, ties: 8, losses: 4 },
    { key: 'avgRatio', formulaMean: 90.7, formulaSD: 114.9, roundRobinMean: 161.8, roundRobinSD: 850.4, p: 0.24, cohensD: -0.08, wins: 95, ties: 2, losses: 103 },
    { key: 'b2bHA', formulaMean: 1.125, formulaSD: 1.41, roundRobinMean: 1.025, roundRobinSD: 1.419, p: 0.061, cohensD: 0.13, wins: 33, ties: 118, losses: 49 },
    { key: 'slams', formulaMean: 6.045, formulaSD: 3.5, roundRobinMean: 5.545, roundRobinSD: 3.747, p: 8.8e-10, cohensD: 0.46, wins: 30, ties: 75, losses: 95 },
    { key: 'countSpread', formulaMean: 2.315, formulaSD: 1.321, roundRobinMean: 0.71, roundRobinSD: 0.4538, p: 5e-39, cohensD: 1.17, wins: 0, ties: 61, losses: 139 },
    { key: 'acuitySpread', formulaMean: 4.57, formulaSD: 2.318, roundRobinMean: 4.58, roundRobinSD: 2.471, p: 0.88, cohensD: -0.0, wins: 83, ties: 20, losses: 97 },
    { key: 'stressSpread', formulaMean: 0.0463, formulaSD: 0.0254, roundRobinMean: 0.0523, roundRobinSD: 0.0178, p: 0.0014, cohensD: -0.23, wins: 94, ties: 43, losses: 63 },
    { key: 'acuityStressSpread', formulaMean: 0.0782, formulaSD: 0.0451, roundRobinMean: 0.1443, roundRobinSD: 0.0825, p: 1.6e-20, cohensD: -0.74, wins: 149, ties: 4, losses: 47 },
    { key: 'avgRatioSpread', formulaMean: 99.58, formulaSD: 394.0, roundRobinMean: 314.8, roundRobinSD: 2540.0, p: 0.23, cohensD: -0.09, wins: 116, ties: 2, losses: 82 },
  ] },
  { name: 'uneven_staffing', label: 'Sporadic Staffing', metrics: [
    { key: 'redZone', formulaMean: 0.305, formulaSD: 1.087, roundRobinMean: 1.21, roundRobinSD: 1.614, p: 7.9e-21, cohensD: -0.74, wins: 99, ties: 100, losses: 1 },
    { key: 'minRatio', formulaMean: 16.93, formulaSD: 11.91, roundRobinMean: 10.13, roundRobinSD: 6.901, p: 2.2e-30, cohensD: 0.97, wins: 192, ties: 6, losses: 2 },
    { key: 'avgRatio', formulaMean: 80.3, formulaSD: 91.56, roundRobinMean: 130.8, roundRobinSD: 587.0, p: 0.22, cohensD: -0.09, wins: 97, ties: 2, losses: 101 },
    { key: 'b2bHA', formulaMean: 1.3, formulaSD: 1.503, roundRobinMean: 1.025, roundRobinSD: 1.419, p: 9.8e-07, cohensD: 0.36, wins: 21, ties: 112, losses: 67 },
    { key: 'slams', formulaMean: 6.255, formulaSD: 3.59, roundRobinMean: 5.545, roundRobinSD: 3.747, p: 3.5e-15, cohensD: 0.61, wins: 28, ties: 65, losses: 107 },
    { key: 'countSpread', formulaMean: 3.1, formulaSD: 1.53, roundRobinMean: 0.71, roundRobinSD: 0.4538, p: 6.1e-55, cohensD: 1.55, wins: 0, ties: 29, losses: 171 },
    { key: 'acuitySpread', formulaMean: 7.105, formulaSD: 2.882, roundRobinMean: 4.58, roundRobinSD: 2.471, p: 6.3e-20, cohensD: 0.72, wins: 40, ties: 20, losses: 140 },
    { key: 'stressSpread', formulaMean: 0.0816, formulaSD: 0.0413, roundRobinMean: 0.126, roundRobinSD: 0.0351, p: 3.5e-30, cohensD: -0.96, wins: 144, ties: 27, losses: 29 },
    { key: 'acuityStressSpread', formulaMean: 0.1631, formulaSD: 0.0784, roundRobinMean: 0.2966, roundRobinSD: 0.1421, p: 4.8e-30, cohensD: -0.96, wins: 168, ties: 6, losses: 26 },
    { key: 'avgRatioSpread', formulaMean: 75.77, formulaSD: 234.0, roundRobinMean: 240.3, roundRobinSD: 1747.0, p: 0.18, cohensD: -0.09, wins: 133, ties: 2, losses: 65 },
  ] },
  { name: 'mid_shift_chaos', label: 'Mid-Shift Chaos', metrics: [
    { key: 'redZone', formulaMean: 0.38, formulaSD: 1.298, roundRobinMean: 1.04, roundRobinSD: 1.627, p: 1.2e-16, cohensD: -0.64, wins: 82, ties: 113, losses: 5 },
    { key: 'minRatio', formulaMean: 14.05, formulaSD: 5.988, roundRobinMean: 9.902, roundRobinSD: 4.37, p: 1.5e-41, cohensD: 1.23, wins: 188, ties: 7, losses: 5 },
    { key: 'avgRatio', formulaMean: 104.1, formulaSD: 561.8, roundRobinMean: 123.2, roundRobinSD: 603.9, p: 0.17, cohensD: -0.1, wins: 65, ties: 0, losses: 135 },
    { key: 'b2bHA', formulaMean: 2.035, formulaSD: 1.973, roundRobinMean: 1.965, roundRobinSD: 1.991, p: 0.34, cohensD: 0.07, wins: 53, ties: 87, losses: 60 },
    { key: 'slams', formulaMean: 9.96, formulaSD: 4.605, roundRobinMean: 9.78, roundRobinSD: 4.924, p: 0.036, cohensD: 0.15, wins: 56, ties: 71, losses: 73 },
    { key: 'countSpread', formulaMean: 2.955, formulaSD: 1.62, roundRobinMean: 0.645, roundRobinSD: 0.4785, p: 7.2e-49, cohensD: 1.4, wins: 0, ties: 41, losses: 159 },
    { key: 'acuitySpread', formulaMean: 5.545, formulaSD: 2.632, roundRobinMean: 5.18, roundRobinSD: 2.673, p: 0.13, cohensD: 0.11, wins: 78, ties: 25, losses: 97 },
    { key: 'stressSpread', formulaMean: 0.0528, formulaSD: 0.0292, roundRobinMean: 0.0714, roundRobinSD: 0.0207, p: 2.7e-13, cohensD: -0.56, wins: 132, ties: 28, losses: 40 },
    { key: 'acuityStressSpread', formulaMean: 0.0886, formulaSD: 0.0437, roundRobinMean: 0.1807, roundRobinSD: 0.0913, p: 4.3e-27, cohensD: -0.89, wins: 159, ties: 6, losses: 35 },
    { key: 'avgRatioSpread', formulaMean: 150.8, formulaSD: 1336.0, roundRobinMean: 215.9, roundRobinSD: 1574.0, p: 0.12, cohensD: -0.11, wins: 142, ties: 0, losses: 58 },
  ] },
  { name: 'understaffed_night', label: 'Night Shift', metrics: [
    { key: 'redZone', formulaMean: 0.085, formulaSD: 0.4558, roundRobinMean: 0.18, roundRobinSD: 0.5896, p: 0.0012, cohensD: -0.23, wins: 17, ties: 182, losses: 1 },
    { key: 'minRatio', formulaMean: 27.49, formulaSD: 24.3, roundRobinMean: 24.59, roundRobinSD: 24.27, p: 1e-08, cohensD: 0.42, wins: 114, ties: 80, losses: 6 },
    { key: 'avgRatio', formulaMean: 167.1, formulaSD: 696.4, roundRobinMean: 132.2, roundRobinSD: 396.7, p: 0.39, cohensD: 0.06, wins: 72, ties: 60, losses: 68 },
    { key: 'b2bHA', formulaMean: 0.495, formulaSD: 0.8246, roundRobinMean: 0.48, roundRobinSD: 0.8773, p: 0.6, cohensD: 0.04, wins: 14, ties: 170, losses: 16 },
    { key: 'slams', formulaMean: 2.51, formulaSD: 2.128, roundRobinMean: 2.32, roundRobinSD: 2.258, p: 0.00031, cohensD: 0.26, wins: 16, ties: 140, losses: 44 },
    { key: 'countSpread', formulaMean: 1.0, formulaSD: 0.9165, roundRobinMean: 0.5, roundRobinSD: 0.5, p: 9.8e-12, cohensD: 0.51, wins: 0, ties: 155, losses: 45 },
    { key: 'acuitySpread', formulaMean: 2.305, formulaSD: 1.871, roundRobinMean: 2.885, roundRobinSD: 2.287, p: 0.001, cohensD: -0.24, wins: 66, ties: 97, losses: 37 },
    { key: 'stressSpread', formulaMean: 0.0237, formulaSD: 0.0193, roundRobinMean: 0.0136, roundRobinSD: 0.0087, p: 2.5e-12, cohensD: 0.53, wins: 6, ties: 131, losses: 63 },
    { key: 'acuityStressSpread', formulaMean: 0.0556, formulaSD: 0.0395, roundRobinMean: 0.0737, roundRobinSD: 0.0551, p: 1e-05, cohensD: -0.32, wins: 79, ties: 81, losses: 40 },
    { key: 'avgRatioSpread', formulaMean: 212.2, formulaSD: 1585.0, roundRobinMean: 133.2, roundRobinSD: 731.1, p: 0.46, cohensD: 0.05, wins: 85, ties: 59, losses: 56 },
  ] },
  { name: 'high_acuity', label: 'High Acuity Day', metrics: [
    { key: 'redZone', formulaMean: 2.36, formulaSD: 3.622, roundRobinMean: 3.895, roundRobinSD: 3.421, p: 9.3e-26, cohensD: -0.86, wins: 137, ties: 53, losses: 10 },
    { key: 'minRatio', formulaMean: 9.321, formulaSD: 3.363, roundRobinMean: 6.527, roundRobinSD: 2.721, p: 1.4e-53, cohensD: 1.52, wins: 190, ties: 3, losses: 7 },
    { key: 'avgRatio', formulaMean: 44.62, formulaSD: 63.58, roundRobinMean: 201.2, roundRobinSD: 1516.0, p: 0.15, cohensD: -0.1, wins: 70, ties: 1, losses: 129 },
    { key: 'b2bHA', formulaMean: 3.92, formulaSD: 2.926, roundRobinMean: 3.67, roundRobinSD: 3.022, p: 0.0049, cohensD: 0.2, wins: 50, ties: 65, losses: 85 },
    { key: 'slams', formulaMean: 13.86, formulaSD: 5.317, roundRobinMean: 14.16, roundRobinSD: 5.792, p: 0.0046, cohensD: -0.2, wins: 88, ties: 56, losses: 56 },
    { key: 'countSpread', formulaMean: 3.835, formulaSD: 1.81, roundRobinMean: 0.705, roundRobinSD: 0.456, p: 4.2e-59, cohensD: 1.66, wins: 0, ties: 16, losses: 184 },
    { key: 'acuitySpread', formulaMean: 9.65, formulaSD: 3.366, roundRobinMean: 5.985, roundRobinSD: 3.065, p: 3.7e-28, cohensD: 0.92, wins: 31, ties: 8, losses: 161 },
    { key: 'stressSpread', formulaMean: 0.0611, formulaSD: 0.0331, roundRobinMean: 0.1104, roundRobinSD: 0.0279, p: 2e-41, cohensD: -1.22, wins: 170, ties: 11, losses: 19 },
    { key: 'acuityStressSpread', formulaMean: 0.1113, formulaSD: 0.055, roundRobinMean: 0.3036, roundRobinSD: 0.1272, p: 2.2e-50, cohensD: -1.44, wins: 188, ties: 3, losses: 9 },
    { key: 'avgRatioSpread', formulaMean: 34.41, formulaSD: 165.3, roundRobinMean: 516.6, roundRobinSD: 4631.0, p: 0.14, cohensD: -0.1, wins: 141, ties: 0, losses: 59 },
  ] },
];
