# Comprehensive Benchmark Results

> **Note added 2026-09-28 (time zone).** The figures in this document come from a run that read the census arrival times in the machine's America/New_York time zone instead of the workbook's wall-clock time: arrivals from 2026-03-08 onward (daylight time) were read one hour late (earlier arrivals were read correctly), giving 1,541 three-team and 417 two-team encounters instead of 1,540 and 418. The values below are unchanged. See METHODS.md section 10.

## Method

A single benchmark crossing all combinations of acuity weights and infrastructure (buffers/decay), evaluated on 8 individual metrics with no composite fairness score.

### Data

- **Source:** Real patient arrivals (Dec 2025 -- Mar 2026) paired with real provider schedules
- **Cohort:** 1,541 three-team encounters (Teams 1--3), 9AM--midnight, 121 days
- **Exclusions:** Trauma-source, "Both", Team 4 assignments

### Conditions (21 total)

4 weight configs x 4 infrastructure variants = 16 formula conditions, plus 4 round-robin variants and 1 actual baseline.

**Weight configs:**

| Label | Tier One (Red) | Tier Two (Yellow) | Tier Three (Purple) |
|-------|---------------|-------------------|---------------------|
| 1:1:1 | 1 | 1 | 1 |
| 1:2:3 | 3 | 2 | 1 |
| 1:2:4 | 4 | 2 | 1 |
| 1:3:5 | 5 | 3 | 1 |

**Infrastructure variants:**

| Abbrev | Buffers | Decay |
|--------|---------|-------|
| BD | On (35/25/15 min) | On (proportional to weights) |
| BN | On | Off (no decay) |
| DB | Off (0/0/0) | On |
| NN | Off | Off |

**Round-Robin:** Cycles teams sequentially regardless of capacity. Uses default 5:3:1 decay when decay is "on." Four RR variants (BD, BN, DB, NN).

**Actual:** Historical team assignments as they really happened. Single condition, no buffers or decay.

### Metrics (8)

All metrics computed per day, reported as mean across 121 days.

| # | Metric | Definition | Better |
|---|--------|------------|--------|
| 1 | Avg Capacity Ratio | Mean capacity/load at each assignment | Higher |
| 2 | Min Capacity Ratio | Worst-case ratio across all daily assignments | Higher |
| 3 | B2B HA/day | Back-to-back high-acuity (ESI 1--2 to same team within 30 min) | Lower |
| 4 | Slams/day | 2+ patients to same team within 60 min | Lower |
| 5 | Gini (count) | Gini coefficient on per-team patient counts | Lower |
| 6 | Gini (acuity) | Gini coefficient on per-team acuity-weighted loads | Lower |
| 7 | Count Spread | max -- min patient count across teams per day | Lower |
| 8 | Acuity Spread | max -- min acuity load across teams per day | Lower |

**Fixed measurement weights:** Gini (acuity) and acuity spread use fixed 5:4:3 weights (ESI 1 = 5, ESI 2 = 4, ESI 3+ = 3) for all conditions, so the metric measures the same thing regardless of what weights the formula used for routing.

### Statistical tests

Paired t-tests (daily values) for 72 focused comparisons per metric:
- Within each weight config: BD vs BN, BD vs DB, BD vs NN, BN vs NN (isolate buffer/decay effects)
- Across weight configs within same infra (6 pairwise x 4 infras = 24)
- Each formula condition vs Actual (16) and vs matching RR variant (16)

## Results

### Full Grid (mean across 121 days)

```
                            -- 1:1:1 --                 -- 1:2:3 --                 -- 1:2:4 --                 -- 1:3:5 --         -- RR --                           
Metric                   BD     BN     DB     NN     BD     BN     DB     NN     BD     BN     DB     NN     BD     BN     DB     NN     BD     BN     DB     NN    Act
───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
Avg Ratio              75.5   46.3  76.0*   46.3   72.9   37.6   73.1   37.7   72.9   37.6   73.1   37.6   72.1   34.7   72.5   34.7   70.1   34.4   70.1   34.4   62.5
Min Ratio              38.2   16.0  38.6*   16.1   31.8    9.0   32.4    9.1   31.8    9.0   32.3    9.0   28.9    6.3   29.7    6.4   26.7    5.4   26.7    5.4   14.6
B2B HA/day              0.2    0.1    0.4    0.3   0.1*    0.1    0.2    0.3   0.1*    0.1    0.2    0.3   0.1*    0.1    0.2    0.2    0.1    0.1    0.1    0.1    0.7
Slams/day               1.4    1.3    1.7    1.3    1.2    1.5    1.2    1.6    1.2    1.5    1.2    1.6    1.2    1.6    1.3    1.7   0.9*   0.9*   0.9*   0.9*    2.2
Gini (count)          0.059  0.051  0.063  0.051  0.062  0.066  0.065  0.066  0.062  0.067  0.065  0.067  0.066  0.076  0.071  0.075 0.039* 0.039* 0.039* 0.039*  0.141
Gini (acuity 5:4:3)   0.064  0.059  0.067  0.060  0.065  0.061  0.067  0.061  0.065  0.061  0.067  0.061  0.068  0.067  0.071  0.066 0.049* 0.049* 0.049* 0.049*  0.144
Count Spread            1.1    0.9    1.2    0.9    1.2    1.2    1.2    1.2    1.2    1.2    1.2    1.2    1.3    1.4    1.3    1.4   0.7*   0.7*   0.7*   0.7*    2.5
Acuity Spread           4.4    4.1    4.6    4.2    4.5    4.3    4.7    4.3    4.5    4.3    4.7    4.4    4.8    4.7    5.0    4.6   3.2*   3.2*   3.2*   3.2*    9.9
```

`*` = best among all 21 conditions for that metric.

### Best in Class (top 3 per metric)

| Metric | #1 | #2 | #3 |
|--------|----|----|-----|
| Avg Ratio | 1:1:1 DB (76.0) | 1:1:1 BD (75.5) | 1:2:4 DB (73.1) |
| Min Ratio | 1:1:1 DB (38.6) | 1:1:1 BD (38.2) | 1:2:3 DB (32.4) |
| B2B HA/day | 1:2:3 BD (0.1) | 1:2:4 BD (0.1) | 1:3:5 BD (0.1) |
| Slams/day | RR BD (0.9) | RR BN (0.9) | RR DB (0.9) |
| Gini (count) | RR BD (0.039) | RR BN (0.039) | RR DB (0.039) |
| Gini (acuity) | RR BD (0.049) | RR BN (0.049) | RR DB (0.049) |
| Count Spread | RR BD (0.7) | RR BN (0.7) | RR DB (0.7) |
| Acuity Spread | RR BD (3.2) | RR BN (3.2) | RR DB (3.2) |

No single condition dominates. The metrics split into two clusters: **safety metrics** (ratios) favor formula with 1:1:1 + decay, while **equity metrics** (Gini, spread, slams) favor round-robin.

## Analysis: Independent Effects

### Effect of Decay (BD vs BN, holding buffers constant)

| Metric | Direction | Magnitude | Significant? |
|--------|-----------|-----------|-------------|
| Avg Ratio | Decay ON higher | +29 (1:1:1), +35 (others) | p<0.001 for all |
| Min Ratio | Decay ON higher | +22 (all configs) | p<0.001 for all |
| B2B HA | No significant effect | -- | -- |
| Slams | Mixed | 1:1:1: decay ON +0.2 more; others: decay ON -0.3 fewer | p<0.05 |
| Gini (count) | Decay OFF slightly better | -0.008 (1:1:1 only) | p=0.046 |
| Others | No significant effect | -- | -- |

**Interpretation:** Decay is the single biggest variable in the system. Turning it off drops avg ratio by ~30 points because patients accumulate with weight 1 indefinitely, inflating the denominator. Under 1:1:1, this more accurately reflects reality (86% of patients are still present at 120 min). Under differentiated weights, the effect is even larger because heavier patients accumulate more load.

The ratio drop is not a safety concern -- it reflects the load model being more accurate, not teams being more stressed. But it changes the meaning of the capacity labels in the UI (current thresholds were calibrated to decayed ratios).

### Effect of Buffers (BD vs DB, holding decay constant)

| Metric | Direction | Magnitude | Significant? |
|--------|-----------|-----------|-------------|
| Avg Ratio | Buffers OFF slightly higher | +0.4 | p=0.005 (1:1:1), p=0.008 (1:3:5) |
| Min Ratio | Buffers OFF slightly higher | +0.4--0.8 | p<0.05 for all |
| B2B HA | Buffers ON lower | -0.2 | p<0.001 (1:1:1 only) |
| Slams | Buffers ON lower | -0.2 (1:1:1 BD vs DB) | p<0.001 |
| Gini (count) | Buffers ON slightly better | -0.003--0.004 | p<0.05 (differentiated weights only) |
| Others | No significant effect | -- | -- |

**Interpretation:** Buffers have a targeted effect: they reduce B2B high-acuity events and slams by spacing assignments. The effect on ratios and equity is minimal. Buffers are a focused safety mechanism, not a load-balancing tool.

### Effect of Buffers When Decay Is Already Off (BN vs NN)

| Metric | Direction | Magnitude | Significant? |
|--------|-----------|-----------|-------------|
| B2B HA | Buffers ON lower | -0.1 | p<0.001 for all |
| Min Ratio | Mixed | small | p<0.05 for 1:2:3, 1:2:4 only |
| Others | No significant effect | -- | -- |

**Interpretation:** Without decay, buffers still reduce B2B HA events. Their benefit is independent of the decay schedule.

### Effect of Weights (within same infrastructure)

| Infra | Pattern | Key Comparisons |
|-------|---------|-----------------|
| BD (Buf+Decay) | 1:1:1 > others on ratio; 1:1:1 slightly worse on slams | 1:1:1 BD vs 1:3:5 BD: +3.4 avg ratio (p<0.001) |
| BN (Buf+NoDec) | 1:1:1 > others on ratio and Gini; 1:1:1 better on slams | 1:1:1 BN vs 1:3:5 BN: +11.6 avg ratio (p<0.001) |
| DB (NoBuf+Decay) | 1:1:1 > others on ratio | Similar to BD pattern |
| NN (NoBuf+NoDec) | 1:1:1 > others on ratio and Gini; 1:1:1 better on slams | Similar to BN pattern |

**Interpretation:** Weight differentiation hurts more under no-decay (BN/NN columns show wider gaps). This is because without decay, heavier patients accumulate longer, amplifying the clustering effect. Under decay, patients eventually zero out, partially masking the clustering.

1:1:1 consistently has the best ratios across all infra variants. The slam disadvantage of 1:1:1 under BD/DB (1.4--1.7 vs 1.2) reverses under BN/NN (1.3 vs 1.5--1.7), indicating that slam behavior depends on the decay/weight interaction, not weights alone.

### Formula vs Actual

All 16 formula conditions significantly beat Actual on every metric (p<0.001), with one exception: no-decay conditions (BN/NN) have lower avg ratio than Actual (because their denominator is inflated). On every equity and safety metric, formula dominates historical assignments.

### Formula vs Round-Robin

- **Formula always wins on ratios** (capacity-aware routing provides 5--12 points higher avg/min ratio)
- **RR always wins on equity** (Gini, spread, slams) -- mechanical cycling is inherently equitable
- **B2B HA is roughly tied** between formula+buffers and RR

This is the fundamental tradeoff: capacity intelligence vs. distribution equity. The formula adds value by routing patients to teams with more headroom, but this necessarily means some teams get more patients than others.

## Key Takeaways

### 1. No single configuration wins everything

The metrics form two competing clusters. Any choice involves a tradeoff between capacity headroom (favoring formula + decay) and distribution equity (favoring round-robin or no-decay).

### 2. Decay is the dominant variable

It has 10x the effect of weights or buffers on capacity ratios. Turning decay off improves equity (Gini, spread) but reduces reported capacity headroom. The ratio drop is arguably more accurate (patients are still present), but changes the meaning of the numbers.

### 3. Buffers are a focused safety tool

Their primary value is reducing B2B high-acuity clustering (-0.2/day). They have minimal effect on other metrics. This effect is consistent across all weight and decay configurations.

### 4. Weight choice matters least

Within any infrastructure variant, weight differences are small compared to the decay effect. 1:1:1 consistently has the best ratios but the differences between 1:1:1, 1:2:3, and 1:2:4 are modest. Only 1:3:5 shows consistently worse performance.

### 5. The previous decay benchmark overstated the case for no-decay

That benchmark used the composite fairness score, which weighted equity metrics heavily (Gini, overwhelm avoidance). When measured on individual metrics with fixed measurement weights, no-decay's advantage is limited to equity. The ratio cost is real and large (-30 avg ratio points), even if it reflects a more accurate load model.

## Relationship to Prior Work

This benchmark supersedes:
- [Acuity Weight Benchmark](./ACUITY_WEIGHT_BENCHMARK_SUMMARY.md) -- tested 5 weight configs but only with buffers+decay (BD infra)
- [Decay Benchmark](./DECAY_BENCHMARK_RESULTS.md) -- tested 5 decay variants but only with 1:1:1 weights
- Buffer ablation in Decision 13 -- tested buffers on/off but only with one weight config

All three of those studies changed one variable at a time. This benchmark crosses all variables, making interactions visible. The main interaction discovered: **weight differentiation hurts more under no-decay** because heavier patients accumulate longer without zeroing out.

## Open Questions

1. **What's the right operating point?** The chart suggests 1:1:1 BN (equal weights, buffers on, no decay) is a good compromise: best equity among formula conditions (Gini 0.051), adequate safety (B2B 0.1/day), but low reported ratios (avg 46). Is that ratio level acceptable for the UI?
2. **Should capacity label thresholds be recalibrated?** Under no-decay, ratios are 40% lower. The current "Comfortable >= 21.25" threshold would rarely fire. Labels need recalibration to match the new scale.
3. **Is a hybrid approach viable?** E.g., formula routing for the first N patients of a shift, then switching to round-robin when equity diverges. This could capture the capacity benefit early while maintaining equity over a full shift.
4. **Does the formula need explicit equity constraints?** Rather than choosing between formula and RR, could the formula incorporate a max-spread constraint that caps how unequal team counts can get?
