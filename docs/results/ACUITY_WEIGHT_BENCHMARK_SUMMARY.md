# Acuity Weight Benchmark: 1:1:1 vs Differentiated Weights

> **Note added 2026-09-28 (time zone).** The figures in this document come from a run that read the census arrival times in the machine's America/New_York time zone instead of the workbook's wall-clock time: arrivals from 2026-03-08 onward (daylight time) were read one hour late (earlier arrivals were read correctly), giving 1,541 three-team and 417 two-team encounters instead of 1,540 and 418. The values below are unchanged. See METHODS.md section 10.

## Question

Does differentiating acuity weights in the scoring formula (giving red/critical patients more "weight" than yellow/purple) improve assignment quality? And does considering the incoming patient's acuity at the moment of assignment help?

## Method

We ran the historical replay benchmark (1,541 three-team encounters across 121 days, Dec 2025 -- Mar 2026, real patient arrivals x real provider schedules) with five acuity weight configurations:

| Config | Tier One (Red) | Tier Two (Yellow) | Tier Three (Purple) | Rationale |
|--------|---------------|-------------------|---------------------|-----------|
| **1:1:1** | 1 | 1 | 1 | Equal weight -- all patients are "1 slot" |
| **1:2:3** | 3 | 2 | 1 | Linear scaling |
| **1:2:4** | 4 | 2 | 1 | Literature-based (POWER study, Innes, Wrede) |
| **1:3:5** | 5 | 3 | 1 | Steep differentiation |
| **1:2:4-post** | 4 | 2 | 1 | Same as 1:2:4 but scoring uses post-assignment ratio: `capacity / (load + incomingWeight)` |

All configs use the same capacity weights, buffer durations, and decay schedules (adjusted proportionally to the initial weights). Each config was compared against the same Actual (historical) and Round-Robin baselines.

## Results

### Head-to-head (three-team cohort, 121 days)

| Metric | Actual | 1:1:1 | 1:2:3 | 1:2:4 | 1:3:5 | 1:2:4-post |
|--------|--------|-------|-------|-------|-------|------------|
| **Fairness (0--100)** | 86.0 | **92.4** | 91.9 | 91.6 | 91.2 | 90.4 |
| Gini (count) | 0.141 | 0.059 | 0.056 | 0.055 | **0.055** | 0.079 |
| Gini (acuity) | 0.141 | **0.059** | 0.077 | 0.095 | 0.083 | 0.116 |
| Avg Capacity Ratio | 66.5 | **75.5** | 66.1 | 65.3 | 63.5 | 65.0 |
| Min Capacity Ratio | 24.6 | **38.2** | 18.1 | 15.9 | 13.4 | 15.6 |
| Overwhelms/day | 0.00 | **0.00** | **0.00** | 0.01 | 0.08 | 0.01 |
| B2B HA/day | 0.65 | **0.16** | 0.24 | 0.25 | 0.25 | 0.23 |
| Slams/day | 2.25 | **1.45** | 1.90 | 1.94 | 1.93 | 2.00 |
| Team Spread | 2.5 | 1.1 | 1.0 | **1.0** | **1.0** | 1.4 |
| Acuity Spread | 2.5 | **1.1** | 3.2 | 4.3 | 5.2 | 5.1 |
| Win Rate vs Actual | -- | 79.3% | 79.3% | 79.3% | 81.0% | 75.2% |

**Bold** = best across formula configs. 1:1:1 wins 8 of 10 metrics.

### Statistical significance (paired t-test on daily fairness, formula vs formula)

| Comparison | Delta Fairness | p-value | Significant? |
|------------|---------------|---------|-------------|
| 1:1:1 vs 1:2:3 | +0.47 | 0.06 | No |
| 1:1:1 vs 1:2:4 | +0.77 | 0.003 | **Yes** |
| 1:1:1 vs 1:3:5 | +1.14 | <0.001 | **Yes** |
| 1:1:1 vs 1:2:4-post | +2.02 | <0.001 | **Yes** |

All configs significantly beat Actual (p<0.001). Among formula configs, 1:1:1 is significantly better than all except 1:2:3 (borderline).

### Buffer decomposition

Buffers affect the two approaches very differently:

| | 1:1:1 No-Buf | 1:1:1 W/ Buf | Delta | 1:2:4 No-Buf | 1:2:4 W/ Buf | Delta |
|---|---|---|---|---|---|---|
| Fairness | 92.4 | 92.4 | +0.0 | 90.7 | 91.6 | **+0.9** |
| B2B HA/day | 0.39 | 0.16 | -0.23 | 0.93 | 0.25 | **-0.69** |
| Slams/day | 1.67 | 1.45 | -0.22 | 2.51 | 1.94 | **-0.57** |

1:1:1 barely needs buffers (fairness unchanged, modest B2B/slam improvement). 1:2:4 depends heavily on buffers to compensate for acuity clustering -- without them, it has 2.4x more B2B HA events and 50% more slams than 1:1:1.

**No-buffer head-to-head:** 1:1:1 still wins every metric (fairness 92.4 vs 90.7, p<0.001). The gap is *larger* without buffers.

## Interpretation

**Why differentiated weights hurt:** The capacity-ratio engine already routes patients to the least-loaded team. When all acuity weights are equal, this purely optimizes for balanced workload. When you make reds "heavier," the engine aggressively routes them to whichever team has the most capacity headroom. This creates acuity clustering: one team accumulates the reds, another gets mostly purples. The acuity spread metric captures this directly (1.1 for 1:1:1 vs 4.3 for 1:2:4).

**Why post-assignment scoring doesn't help:** Computing `capacity / (load + incomingWeight)` amplifies the same problem. A red (weight 4) penalizes teams unequally based on existing load, making the engine even more aggressive about concentrating reds on the highest-capacity team. The one marginal benefit (slightly fewer B2B HA events, 0.23 vs 0.25) is something buffers already handle better.

**The core insight:** Acuity differentiation is redundant with capacity-based routing. The engine already ensures sicker patients go to teams that can handle them -- because sicker patients consume more real-world attention, which shows up in the capacity ratio over time through provider status changes and patient decay. Adding explicit acuity weights on top of this just distorts the distribution.

## Open questions

1. **Is there a hybrid approach?** E.g., small differentiation (1:1.5:2) that captures some acuity signal without triggering clustering? The 1:2:3 result (p=0.06 vs 1:1:1) suggests the tipping point is somewhere around 2x differentiation.
2. **Does this hold under different team compositions?** Our data is predominantly three-team daytime shifts. Two-team overnight shifts might behave differently with differentiated weights.
3. **Acuity-aware buffers as an alternative?** Instead of weighting patient load, could we vary buffer duration more aggressively by acuity tier to space out high-acuity assignments without distorting the load calculation?
4. **Real-world validation:** The benchmark assumes the formula's assignment is final. In practice, charge nurses override ~67% of the time. Would 1:1:1's simpler mental model lead to higher compliance and fewer overrides?
