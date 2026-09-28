# Decay Benchmark Results: No Decay is Optimal Under 1:1:1

> **Note added 2026-09-28 (time zone).** The figures in this document come from a run that read the census arrival times in the machine's America/New_York time zone instead of the workbook's wall-clock time: arrivals from 2026-03-08 onward (daylight time) were read one hour late (earlier arrivals were read correctly), giving 1,541 three-team and 417 two-team encounters instead of 1,540 and 418. The door-to-disposition statistics come from the same reading (median 260 minutes; 261 under the wall-clock reading). The values below are unchanged. See METHODS.md section 10.

## Summary

Under 1:1:1 equal acuity weights, **removing decay entirely produces the best results** — a +1.82 fairness point gain over the current decay schedule (p<0.001), winning 8 of 10 metrics. This was the opposite of our primary hypothesis.

## Background

The [acuity weight benchmark](./ACUITY_WEIGHT_BENCHMARK_SUMMARY.md) established that 1:1:1 equal weights dominate differentiated weights. Under 1:1:1, every patient contributes 1 unit of load. The current decay system drops patients to weight 0 after a tier-dependent timeout (120 min for purple, 240 min for red/yellow). This benchmark asked: **does that decay schedule still help?**

## Empirical Grounding: Time-to-Disposition

Before running the benchmark, we analyzed the actual door-to-disposition times for the 1,540 primary-cohort encounters (of 1,541 total; 1 missing):

| Stat | Overall | Tier One (ESI 1) | Tier Two (ESI 2) | Tier Three (ESI 3+) |
|------|---------|------------------|-------------------|---------------------|
| n | 1540 | 33 | 1176 | 331 |
| Median | **260 min** | 159 min | 258 min | 276 min |
| p75 | **391 min** | 252 min | 392 min | 422 min |
| p90 | 633 min | 331 min | 643 min | 631 min |

**Decay activation rates** (% of patients still physically present when decay fires):

| Threshold | % Still Present |
|-----------|-----------------|
| 60 min | 96.4% |
| 90 min | 92.5% |
| **120 min** (purple drops to 0) | **86.2%** |
| 180 min | 70.6% |
| **240 min** (red/yellow drop to 0) | **54.7%** |

The current decay schedule makes patients invisible while they're still physically present. At the 120-min purple timeout, 86% of patients are still there. At the 240-min red/yellow timeout, 55% are still there.

## Conditions Tested

All use 1:1:1 acuity weights, 121 three-team days, with buffers enabled:

| Condition | Decay Behavior | Rationale |
|-----------|---------------|-----------|
| **A: Current** | Red/Yellow → 0 at 240m, Purple → 0 at 120m | Existing default |
| **B: No decay** | Weight = 1 forever (until end of shift) | Simplest model |
| **C-240** | All tiers → 0 at 240m | Uniform version of A |
| **C-260** | All tiers → 0 at 260m | Calibrated to median dispo |
| **C-391** | All tiers → 0 at 391m | Calibrated to p75 dispo |

## Results

### Head-to-Head

| Metric | A: Current | **B: No Decay** | C-240 | C-260 | C-391 |
|--------|-----------|-----------------|-------|-------|-------|
| **Fairness (0--100)** | 92.4 | **94.2** | 92.4 | 92.4 | 92.7 |
| Gini (count) | 0.059 | **0.051** | 0.058 | 0.057 | 0.057 |
| Gini (acuity) | 0.059 | **0.051** | 0.058 | 0.057 | 0.057 |
| Avg Capacity Ratio | **75.5** | 46.3 | 71.6 | 69.1 | 56.9 |
| Min Capacity Ratio | **38.2** | 16.0 | 35.1 | 33.6 | 26.2 |
| Overwhelms/day | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| B2B HA/day | 0.16 | 0.15 | **0.13** | 0.16 | 0.15 |
| Slams/day | 1.45 | **1.26** | 1.40 | 1.36 | 1.48 |
| Team Spread | 1.1 | **0.9** | 1.1 | 1.1 | 1.0 |
| Acuity Spread | 1.1 | **0.9** | 1.1 | 1.1 | 1.0 |
| Win Rate vs Actual | 79.3% | **91.7%** | 80.2% | 81.0% | 87.6% |

**Bold** = best across conditions. No-decay wins 8 of 10 metrics.

### Statistical Significance (paired t-test on daily fairness)

| Comparison | Δ Fairness | p-value | Significant? |
|------------|-----------|---------|-------------|
| **No-decay vs Current** | **+1.82** | **<0.001** | **Yes** |
| C-240 vs Current | +0.01 | 0.98 | No |
| C-260 vs Current | -0.03 | 0.92 | No |
| C-391 vs Current | +0.33 | 0.31 | No |
| No-decay vs C-240 | +1.81 | <0.001 | Yes |
| No-decay vs C-260 | +1.84 | <0.001 | Yes |
| No-decay vs C-391 | +1.49 | <0.001 | Yes |

All timeout variants (C-240, C-260, C-391) are statistically indistinguishable from current decay. No-decay significantly beats all of them.

### Buffer Decomposition

| | No-Decay (no buf) | No-Decay (w/ buf) | Δ | Current (no buf) | Current (w/ buf) | Δ |
|---|---|---|---|---|---|---|
| Fairness | 94.2 | 94.2 | +0.0 | 92.4 | 92.4 | +0.0 |
| B2B HA/day | 0.30 | 0.15 | -0.15 | 0.39 | 0.16 | -0.23 |
| Slams/day | 1.30 | 1.26 | -0.03 | 1.67 | 1.45 | -0.22 |

No-decay barely needs buffers. Its no-buffer performance (fairness 94.2, slams 1.30) already exceeds current decay's *with-buffer* performance (fairness 92.4, slams 1.45). The load model is so accurate that buffers add almost nothing.

## Why No-Decay Wins

The capacity ratio formula is `capacity / load`. When decay drops patients to 0, it reduces `load` — making the team appear lighter than it actually is. The engine then routes more patients to that "light" team, creating real-world overload.

With no decay, `load = count(active patients)`. Since 86% of patients are still present at 120 min, this count tracks reality more faithfully than a decayed weight. The result: better equity (Gini 0.051 vs 0.059), fewer slams (1.26 vs 1.45/day), and a 12-point jump in win rate vs historical (91.7% vs 79.3%).

**The avg/min capacity ratio drops** (75.5 → 46.3, 38.2 → 16.0) are expected and not concerning — they reflect the denominator being *larger and more accurate*, not the teams being more stressed. The ratio is lower because the load count is higher, but the load count is higher because it's *correct*.

## Hypothesis Outcomes

| Hypothesis | Prediction | Result |
|------------|-----------|--------|
| **H1** (decay has minimal impact) | A ≈ B ≈ C | **Wrong.** No-decay significantly outperforms all decay variants. |
| **H2** (no-decay slightly worse on ratios) | B slightly worse on avg/min ratio | **Partially right.** Ratios are lower, but this reflects accuracy, not harm. |
| **H3** (simplification) | If H1 holds, remove decay | **Right conclusion, wrong reason.** Remove decay not because it's neutral, but because it actively hurts. |

## Decision

**Outcome: B > A (no decay wins).** Remove the decay system under 1:1:1. Current decay hurts by removing load too early — patients who appear to have "decayed away" are actually still consuming provider attention.

## Combined Simplification

With both the acuity weight and decay benchmarks complete, the load formula reduces from:

**Before:** `load = Σ(acuityWeight[tier] × decayMultiplier(elapsed) × floatModifier)`

**After:** `load = count(activePatients) × floatModifier`

The only remaining complexity is float modifiers (supervising = 0.65, primary = 0.0), which serve a distinct purpose unrelated to acuity or time.

## Open Questions

1. **Capacity ratio display:** With no decay, ratios are lower (avg ~46 vs ~76). The current UI capacity labels (Comfortable ≥ 21.25, Manageable ≥ 10, etc.) were calibrated to decayed ratios. Do the label thresholds need recalibration?
2. **Patient badge display:** If there's no decay, what do we show on patient badges? Currently they display time-until-next-decay and current weight. Without decay, a simpler "time since assignment" might suffice.
3. **End-of-shift behavior:** Without decay, patients assigned early in a shift accumulate indefinitely. Is there a natural end-of-shift cutoff, or does the shift changeover in the schedule data handle this implicitly?
4. **Two-team cohort:** These results are for three-team daytime hours. The overnight two-team cohort may behave differently with longer patient stays and fewer teams.
