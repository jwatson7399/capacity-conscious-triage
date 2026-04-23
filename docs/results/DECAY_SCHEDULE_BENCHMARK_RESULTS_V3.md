# Decay Schedule Benchmark Results — V3

## Configuration

- **Encounters:** 1541 (primary, three-team, 9A-midnight)
- **Days:** 121
- **Date range:** 2025-12-01 to 2026-03-31
- **Routing weights:** 4:2:1 (tier_one:tier_two:tier_three)
- **Buffers:** ON (35/25/15 min for Red/Yellow/Purple)
- **Measurement weights:** 5:4:3 (tier_one:tier_two:tier_three)
- **Reference decay (for normalized ratios):** 1.0x Stepped (V2 D7 schedule)
- **Conditions:** 20 formula (4 durations × 5 shape families) + 1 Actual = 21 total
- **Ratio cap:** 1000 (MIN_LOAD_EPSILON = 0.000001)
- **Pairwise test:** Wilcoxon signed-rank (two-sided, normal approx.); BH correction (FDR=0.05) per metric × comparison family

### Shape families tested

- **Stepped:** multi-step plateau schedule (V2 stepped).
- **Linear:** 15-min-granularity linear ramp to 0 (V2 linear).
- **LogBack k∈{1,3,9}:** `w(t) = W0 · ln(1 + k(1 − t/T)) / ln(1 + k)`, sampled at 15-min granularity with endpoint pinned to 0. Larger k = more back-loaded (weight sustained longer before collapse).
- **Excluded from V3:** Direct Drop. Under the engine's piecewise-linear interpolation, a single-endpoint schedule (V2 Direct) is mathematically identical to Linear. V2's Direct column was never a distinct condition; see `DECAY_SCHEDULE_BENCHMARK_RESULTS_V2.md` for audit baseline.

### Caveats

- Wilcoxon normal-approximation p-values can be slightly anti-conservative in the presence of heavy ties (affects count-valued metrics: B2B HA/day, Slams/day, Count Spread). Cohen's d is reported alongside for effect-size context.
- "LM SD (D6 meas.)" refers to the V2 D6 schedule (0.75x linear, 4:2:1), pinned by construction as the common measurement yardstick. It does NOT refer to a V3 condition ID.

## Condition Matrix (21 conditions)

| ID | Duration | Family | Tier 1 Summary | Tier 3 Summary |
|----|----------|--------|----------------|----------------|
| D1 | 0.5x | Stepped | 4->2@45m->1@90m->0@120m | 1->0@60m |
| D2 | 0.5x | Linear | 4->...->0@120m | 1->...->0@60m |
| D3 | 0.5x | LogBack k=1 | 4->(log-back)->0@120m | 1->(log-back)->0@60m |
| D4 | 0.5x | LogBack k=3 | 4->(log-back)->0@120m | 1->(log-back)->0@60m |
| D5 | 0.5x | LogBack k=9 | 4->(log-back)->0@120m | 1->(log-back)->0@60m |
| D6 | 0.75x | Stepped | 4->2@68m->1@135m->0@180m | 1->0@90m |
| D7 | 0.75x | Linear | 4->...->0@180m | 1->...->0@90m |
| D8 | 0.75x | LogBack k=1 | 4->(log-back)->0@180m | 1->(log-back)->0@90m |
| D9 | 0.75x | LogBack k=3 | 4->(log-back)->0@180m | 1->(log-back)->0@90m |
| D10 | 0.75x | LogBack k=9 | 4->(log-back)->0@180m | 1->(log-back)->0@90m |
| D11 | 1x | Stepped | 4->2@90m->1@180m->0@240m | 1->0@120m |
| D12 | 1x | Linear | 4->...->0@240m | 1->...->0@120m |
| D13 | 1x | LogBack k=1 | 4->(log-back)->0@240m | 1->(log-back)->0@120m |
| D14 | 1x | LogBack k=3 | 4->(log-back)->0@240m | 1->(log-back)->0@120m |
| D15 | 1x | LogBack k=9 | 4->(log-back)->0@240m | 1->(log-back)->0@120m |
| D16 | 1.5x | Stepped | 4->2@135m->1@270m->0@360m | 1->0@180m |
| D17 | 1.5x | Linear | 4->...->0@360m | 1->...->0@180m |
| D18 | 1.5x | LogBack k=1 | 4->(log-back)->0@360m | 1->(log-back)->0@180m |
| D19 | 1.5x | LogBack k=3 | 4->(log-back)->0@360m | 1->(log-back)->0@180m |
| D20 | 1.5x | LogBack k=9 | 4->(log-back)->0@360m | 1->(log-back)->0@180m |
| A1 | — | Actual | (historical assignments) | |

## Results (Mean ± SD across days)

| Metric | D1 | D2 | D3 | D4 | D5 | D6 | D7 | D8 | D9 | D10 | D11 | D12 | D13 | D14 | D15 | D16 | D17 | D18 | D19 | D20 | A1 |
|--------|------|------|------|------|------|------|------|------|------|------|------|------|------|------|------|------|------|------|------|------|------|
| Avg Ratio | 867.5±127.6* | 862.9±130.9 | 856.9±134.9 | 852.4±137.2 | 849.8±137.3 | 723.7±181.1 | 715.8±185.1 | 706.4±188.5 | 698.7±190.9 | 693.1±191.7 | 596.4±198.2 | 587.0±200.1 | 576.8±202.4 | 568.4±203.5 | 561.4±206.5 | 428.5±192.1 | 418.6±193.0 | 408.4±191.8 | 402.9±188.8 | 396.5±185.7 | 616.3±154.6 |
| Min Ratio | 370.2±426.6* | 358.9±430.2 | 346.3±431.5 | 334.5±430.1 | 324.2±430.3 | 191.3±320.0 | 181.7±319.4 | 169.0±312.9 | 159.8±310.3 | 151.8±309.8 | 112.7±227.6 | 104.8±227.3 | 97.3±226.6 | 91.9±226.7 | 87.1±227.1 | 69.8±174.5 | 64.9±174.8 | 60.2±171.5 | 55.0±161.4 | 50.3±155.6 | 59.6±174.9 |
| Norm Avg Ratio | 591.1±198.2 | 591.1±198.2 | 591.1±198.2 | 590.5±197.9 | 590.1±197.7 | 590.0±198.3 | 588.8±198.1 | 588.9±198.0 | 588.7±198.4 | 589.2±198.1 | 596.4±198.2 | 596.9±197.2 | 598.4±196.5 | 599.3±195.5 | 600.7±195.1* | 595.7±194.3 | 596.2±194.7 | 597.4±191.7 | 593.4±192.2 | 596.8±191.4 | 522.9±158.3 |
| Norm Min Ratio | 108.8±227.7 | 108.8±227.7 | 108.9±227.7 | 108.9±227.7 | 108.8±227.7 | 112.2±227.7 | 112.2±227.8 | 112.4±227.7 | 112.1±227.8 | 111.6±227.9 | 112.7±227.6* | 112.5±227.7 | 112.2±227.7 | 112.1±227.7 | 110.7±228.0 | 107.6±215.3 | 107.0±215.5 | 103.2±214.4 | 102.8±214.5 | 101.0±215.0 | 49.0±143.3 |
| B2B HA/day | 0.1±0.4* | 0.1±0.4* | 0.1±0.4 | 0.1±0.4 | 0.1±0.4 | 0.1±0.4 | 0.1±0.4 | 0.1±0.4 | 0.1±0.4 | 0.1±0.4 | 0.1±0.4 | 0.1±0.4 | 0.1±0.4 | 0.1±0.4 | 0.1±0.4 | 0.1±0.4* | 0.1±0.4 | 0.1±0.4 | 0.1±0.4 | 0.1±0.4 | 0.7±0.9 |
| Slams/day | 1.0±1.4* | 1.0±1.4 | 1.1±1.4 | 1.1±1.4 | 1.1±1.4 | 1.1±1.3 | 1.1±1.3 | 1.1±1.4 | 1.2±1.4 | 1.3±1.4 | 1.1±1.4 | 1.2±1.4 | 1.2±1.4 | 1.2±1.4 | 1.3±1.4 | 1.2±1.4 | 1.2±1.4 | 1.3±1.4 | 1.3±1.4 | 1.4±1.5 | 2.2±1.9 |
| Gini (count) | 0.046±0.032* | 0.047±0.032 | 0.047±0.032 | 0.047±0.032 | 0.051±0.036 | 0.054±0.035 | 0.055±0.038 | 0.055±0.038 | 0.055±0.038 | 0.056±0.038 | 0.059±0.038 | 0.062±0.041 | 0.064±0.040 | 0.063±0.040 | 0.063±0.041 | 0.063±0.043 | 0.066±0.045 | 0.070±0.044 | 0.070±0.046 | 0.070±0.046 | 0.141±0.090 |
| Gini (acuity 5:4:3) | 0.054±0.033 | 0.055±0.033 | 0.054±0.032* | 0.054±0.033 | 0.056±0.035 | 0.057±0.034 | 0.056±0.036 | 0.056±0.036 | 0.056±0.035 | 0.056±0.036 | 0.059±0.034 | 0.062±0.036 | 0.063±0.035 | 0.062±0.035 | 0.062±0.036 | 0.059±0.037 | 0.062±0.040 | 0.065±0.039 | 0.065±0.040 | 0.065±0.040 | 0.144±0.089 |
| Count Spread | 0.9±0.6* | 0.9±0.6 | 0.9±0.6 | 0.9±0.6 | 0.9±0.6 | 1.0±0.6 | 1.0±0.7 | 1.0±0.7 | 1.0±0.7 | 1.0±0.7 | 1.1±0.7 | 1.1±0.7 | 1.2±0.7 | 1.2±0.7 | 1.2±0.7 | 1.1±0.7 | 1.2±0.8 | 1.3±0.7 | 1.3±0.8 | 1.3±0.8 | 2.5±1.6 |
| Acuity Spread | 3.7±1.9* | 3.7±1.9 | 3.7±1.9* | 3.7±2.0 | 3.8±2.2 | 3.9±2.1 | 3.8±2.1 | 3.8±2.1 | 3.8±2.1 | 3.8±2.1 | 4.0±2.1 | 4.2±2.3 | 4.4±2.3 | 4.3±2.3 | 4.3±2.3 | 3.9±2.2 | 4.1±2.4 | 4.4±2.3 | 4.4±2.4 | 4.4±2.4 | 9.9±5.9 |
| LM SD (routing decay) | 54.7±32.7* | 63.2±37.2 | 69.0±40.9 | 75.2±45.7 | 82.8±49.2 | 70.9±41.5 | 80.7±46.6 | 89.8±50.7 | 95.8±53.9 | 107.3±59.8 | 91.6±51.9 | 105.9±58.1 | 120.5±70.6 | 131.4±80.1 | 141.4±88.8 | 120.9±64.2 | 140.5±72.3 | 155.0±79.8 | 163.8±82.9 | 175.3±92.2 | 183.5±103.9 |
| Norm LM SD (routing) | 0.0014±0.0008* | 0.0016±0.0009 | 0.0017±0.0010 | 0.0019±0.0011 | 0.0021±0.0012 | 0.0018±0.0010 | 0.0020±0.0011 | 0.0023±0.0012 | 0.0024±0.0013 | 0.0027±0.0015 | 0.0023±0.0013 | 0.0027±0.0015 | 0.0029±0.0016 | 0.0032±0.0018 | 0.0035±0.0020 | 0.0031±0.0016 | 0.0034±0.0018 | 0.0037±0.0020 | 0.0038±0.0020 | 0.0040±0.0022 | 0.0043±0.0024 |
| LM SD (D6 meas.) | 92.2±55.4 | 92.4±54.8 | 90.9±54.1 | 90.7±55.0 | 90.8±53.8 | 81.2±47.2 | 80.7±46.6 | 80.7±45.7 | 78.7±44.5 | 80.1±44.8 | 79.9±45.7 | 81.0±45.2 | 82.9±48.9 | 82.4±50.8 | 80.4±50.9 | 72.6±42.3 | 74.7±41.6 | 74.9±41.6 | 73.0±40.2 | 72.2±40.4* | 183.5±103.9 |
| Norm LM SD (D6 meas.) | 0.0023±0.0013 | 0.0023±0.0013 | 0.0023±0.0013 | 0.0022±0.0013 | 0.0023±0.0013 | 0.0020±0.0011 | 0.0020±0.0011 | 0.0020±0.0011 | 0.0020±0.0011 | 0.0020±0.0011 | 0.0020±0.0011 | 0.0020±0.0011 | 0.0020±0.0011 | 0.0020±0.0012 | 0.0020±0.0012 | 0.0019±0.0010 | 0.0018±0.0010 | 0.0018±0.0010 | 0.0017±0.0009 | 0.0017±0.0010* | 0.0043±0.0024 |
| Clip Rate | 81.51% ⚑ | 81.44% ⚑ | 81.18% ⚑ | 80.92% ⚑ | 81.05% ⚑ | 63.53% ⚑ | 63.21% ⚑ | 62.82% ⚑ | 62.69% ⚑ | 62.69% ⚑ | 49.06% ⚑ | 48.93% ⚑ | 48.86% ⚑ | 48.54% ⚑ | 48.54% ⚑ | 32.64% ⚑ | 32.38% ⚑ | 32.25% ⚑ | 32.38% ⚑ | 32.45% ⚑ | 54.38% ⚑ |

## Robustness Assessment

Range across all 20 formula conditions. Excludes the Actual baseline.

| Metric | Min | Max | % Variation |
|--------|-----|-----|-------------|
| Avg Ratio | 396.5 | 867.5 | 74.5% |
| Min Ratio | 50.3 | 370.2 | 152.1% |
| Norm Avg Ratio | 588.7 | 600.7 | 2.0% |
| Norm Min Ratio | 101.0 | 112.7 | 11.0% |
| B2B HA/day | 0.1 | 0.1 | 37.0% |
| Slams/day | 1.0 | 1.4 | 32.8% |
| Gini (count) | 0.046 | 0.070 | 41.1% |
| Gini (acuity 5:4:3) | 0.054 | 0.065 | 18.8% |
| Count Spread | 0.9 | 1.3 | 40.9% |
| Acuity Spread | 3.7 | 4.4 | 18.6% |
| LM SD (routing decay) | 54.7 | 175.3 | 104.9% |
| Norm LM SD (routing) | 0.0014 | 0.0040 | 98.7% |
| LM SD (D6 meas.) | 72.2 | 92.4 | 24.5% |
| Norm LM SD (D6 meas.) | 0.0017 | 0.0023 | 30.4% |

## Shape Effect Summary

Best shape family within each duration level.

| Metric | 0.5x | 0.75x | 1.0x | 1.5x |
|--------|------|------|------|------|
| Avg Ratio | Stepped | Stepped | Stepped | Stepped |
| Min Ratio | Stepped | Stepped | Stepped | Stepped |
| Norm Avg Ratio | Stepped | Stepped | LogBack k=9 | LogBack k=1 |
| Norm Min Ratio | LogBack k=3 | LogBack k=1 | Stepped | Stepped |
| B2B HA/day | Stepped | Stepped | Stepped | Stepped |
| Slams/day | Stepped | Stepped | Stepped | Stepped |
| Gini (count) | Stepped | Stepped | Stepped | Stepped |
| Gini (acuity 5:4:3) | LogBack k=1 | LogBack k=3 | Stepped | Stepped |
| Count Spread | Stepped | Stepped | Stepped | Stepped |
| Acuity Spread | Stepped | LogBack k=3 | Stepped | Stepped |
| LM SD (routing decay) | Stepped | Stepped | Stepped | Stepped |
| Norm LM SD (routing) | Stepped | Stepped | Stepped | Stepped |
| LM SD (D6 meas.) | LogBack k=3 | LogBack k=3 | Stepped | LogBack k=9 |
| Norm LM SD (D6 meas.) | LogBack k=3 | LogBack k=3 | LogBack k=9 | LogBack k=9 |

## Duration Effect Summary

Best duration within each shape family.

| Metric | Stepped | Linear | LogBack k=1 | LogBack k=3 | LogBack k=9 |
|--------|------|------|------|------|------|
| Avg Ratio | 0.5x | 0.5x | 0.5x | 0.5x | 0.5x |
| Min Ratio | 0.5x | 0.5x | 0.5x | 0.5x | 0.5x |
| Norm Avg Ratio | 1x | 1x | 1x | 1x | 1x |
| Norm Min Ratio | 1x | 1x | 0.75x | 1x | 0.75x |
| B2B HA/day | 0.5x | 0.5x | 0.5x | 0.5x | 0.5x |
| Slams/day | 0.5x | 0.5x | 0.5x | 0.5x | 0.5x |
| Gini (count) | 0.5x | 0.5x | 0.5x | 0.5x | 0.5x |
| Gini (acuity 5:4:3) | 0.5x | 0.5x | 0.5x | 0.5x | 0.75x |
| Count Spread | 0.5x | 0.5x | 0.5x | 0.5x | 0.5x |
| Acuity Spread | 0.5x | 0.5x | 0.5x | 0.5x | 0.75x |
| LM SD (routing decay) | 0.5x | 0.5x | 0.5x | 0.5x | 0.5x |
| Norm LM SD (routing) | 0.5x | 0.5x | 0.5x | 0.5x | 0.5x |
| LM SD (D6 meas.) | 1.5x | 1.5x | 1.5x | 1.5x | 1.5x |
| Norm LM SD (D6 meas.) | 1.5x | 1.5x | 1.5x | 1.5x | 1.5x |

## Pairwise Comparisons (BH-significant, FDR = 0.05)

Wilcoxon signed-rank with BH correction applied separately within each metric × comparison family (shape / duration / vs-Actual). Full pairwise matrix — including non-significant rows and raw p-values — is in the JSON output.

### Shape Effect

| Metric | Cond A | Cond B | Delta | p-value | Cohen's d |
|--------|--------|--------|-------|---------|-----------|
| Avg Ratio | D1 | D2 | 4.6 | <0.001 | 0.04 |
| Avg Ratio | D1 | D3 | 10.6 | <0.001 | 0.08 |
| Avg Ratio | D1 | D4 | 15.0 | <0.001 | 0.11 |
| Avg Ratio | D1 | D5 | 17.6 | <0.001 | 0.13 |
| Avg Ratio | D2 | D3 | 6.0 | <0.001 | 0.05 |
| Avg Ratio | D2 | D4 | 10.5 | <0.001 | 0.08 |
| Avg Ratio | D2 | D5 | 13.1 | <0.001 | 0.10 |
| Avg Ratio | D3 | D4 | 4.5 | <0.001 | 0.03 |
| Avg Ratio | D3 | D5 | 7.1 | <0.001 | 0.05 |
| Avg Ratio | D4 | D5 | 2.6 | <0.001 | 0.02 |
| Avg Ratio | D6 | D7 | 7.8 | <0.001 | 0.04 |
| Avg Ratio | D6 | D8 | 17.2 | <0.001 | 0.09 |
| Avg Ratio | D6 | D9 | 24.9 | <0.001 | 0.13 |
| Avg Ratio | D6 | D10 | 30.5 | <0.001 | 0.16 |
| Avg Ratio | D7 | D8 | 9.4 | <0.001 | 0.05 |
| Avg Ratio | D7 | D9 | 17.1 | <0.001 | 0.09 |
| Avg Ratio | D7 | D10 | 22.7 | <0.001 | 0.12 |
| Avg Ratio | D8 | D9 | 7.7 | <0.001 | 0.04 |
| Avg Ratio | D8 | D10 | 13.3 | <0.001 | 0.07 |
| Avg Ratio | D9 | D10 | 5.6 | <0.001 | 0.03 |
| Avg Ratio | D11 | D12 | 9.4 | <0.001 | 0.05 |
| Avg Ratio | D11 | D13 | 19.6 | <0.001 | 0.10 |
| Avg Ratio | D11 | D14 | 28.0 | <0.001 | 0.14 |
| Avg Ratio | D11 | D15 | 35.0 | <0.001 | 0.17 |
| Avg Ratio | D12 | D13 | 10.2 | <0.001 | 0.05 |
| Avg Ratio | D12 | D14 | 18.6 | <0.001 | 0.09 |
| Avg Ratio | D12 | D15 | 25.6 | <0.001 | 0.13 |
| Avg Ratio | D13 | D14 | 8.4 | <0.001 | 0.04 |
| Avg Ratio | D13 | D15 | 15.4 | <0.001 | 0.08 |
| Avg Ratio | D14 | D15 | 7.0 | <0.001 | 0.03 |
| Avg Ratio | D16 | D17 | 9.8 | <0.001 | 0.05 |
| Avg Ratio | D16 | D18 | 20.1 | <0.001 | 0.10 |
| Avg Ratio | D16 | D19 | 25.6 | <0.001 | 0.13 |
| Avg Ratio | D16 | D20 | 31.9 | <0.001 | 0.17 |
| Avg Ratio | D17 | D18 | 10.3 | <0.001 | 0.05 |
| Avg Ratio | D17 | D19 | 15.8 | <0.001 | 0.08 |
| Avg Ratio | D17 | D20 | 22.1 | <0.001 | 0.12 |
| Avg Ratio | D18 | D19 | 5.5 | <0.001 | 0.03 |
| Avg Ratio | D18 | D20 | 11.8 | <0.001 | 0.06 |
| Avg Ratio | D19 | D20 | 6.3 | <0.001 | 0.03 |
| Min Ratio | D1 | D2 | 11.3 | <0.001 | 0.03 |
| Min Ratio | D1 | D3 | 23.9 | <0.001 | 0.06 |
| Min Ratio | D1 | D4 | 35.7 | <0.001 | 0.08 |
| Min Ratio | D1 | D5 | 46.0 | <0.001 | 0.11 |
| Min Ratio | D2 | D3 | 12.7 | <0.001 | 0.03 |
| Min Ratio | D2 | D4 | 24.5 | <0.001 | 0.06 |
| Min Ratio | D2 | D5 | 34.8 | <0.001 | 0.08 |
| Min Ratio | D3 | D4 | 11.8 | <0.001 | 0.03 |
| Min Ratio | D3 | D5 | 22.1 | <0.001 | 0.05 |
| Min Ratio | D4 | D5 | 10.3 | <0.001 | 0.02 |
| Min Ratio | D6 | D7 | 9.6 | <0.001 | 0.03 |
| Min Ratio | D6 | D8 | 22.3 | <0.001 | 0.07 |
| Min Ratio | D6 | D9 | 31.5 | <0.001 | 0.10 |
| Min Ratio | D6 | D10 | 39.6 | <0.001 | 0.13 |
| Min Ratio | D7 | D8 | 12.7 | <0.001 | 0.04 |
| Min Ratio | D7 | D9 | 21.9 | <0.001 | 0.07 |
| Min Ratio | D7 | D10 | 29.9 | <0.001 | 0.10 |
| Min Ratio | D8 | D9 | 9.2 | <0.001 | 0.03 |
| Min Ratio | D8 | D10 | 17.2 | <0.001 | 0.06 |
| Min Ratio | D9 | D10 | 8.0 | <0.001 | 0.03 |
| Min Ratio | D11 | D12 | 7.9 | <0.001 | 0.03 |
| Min Ratio | D11 | D13 | 15.4 | <0.001 | 0.07 |
| Min Ratio | D11 | D14 | 20.9 | <0.001 | 0.09 |
| Min Ratio | D11 | D15 | 25.6 | <0.001 | 0.11 |
| Min Ratio | D12 | D13 | 7.5 | <0.001 | 0.03 |
| Min Ratio | D12 | D14 | 12.9 | <0.001 | 0.06 |
| Min Ratio | D12 | D15 | 17.7 | <0.001 | 0.08 |
| Min Ratio | D13 | D14 | 5.4 | <0.001 | 0.02 |
| Min Ratio | D13 | D15 | 10.1 | <0.001 | 0.04 |
| Min Ratio | D14 | D15 | 4.7 | <0.001 | 0.02 |
| Min Ratio | D16 | D17 | 5.0 | <0.001 | 0.03 |
| Min Ratio | D16 | D18 | 9.6 | <0.001 | 0.06 |
| Min Ratio | D16 | D19 | 14.9 | <0.001 | 0.09 |
| Min Ratio | D16 | D20 | 19.5 | <0.001 | 0.12 |
| Min Ratio | D17 | D18 | 4.7 | <0.001 | 0.03 |
| Min Ratio | D17 | D19 | 9.9 | <0.001 | 0.06 |
| Min Ratio | D17 | D20 | 14.5 | <0.001 | 0.09 |
| Min Ratio | D18 | D19 | 5.2 | <0.001 | 0.03 |
| Min Ratio | D18 | D20 | 9.9 | <0.001 | 0.06 |
| Min Ratio | D19 | D20 | 4.7 | <0.001 | 0.03 |
| Norm Avg Ratio | D11 | D15 | -4.3 | 0.003 | 0.02 |
| Norm Avg Ratio | D12 | D15 | -3.8 | 0.002 | 0.02 |
| Norm Avg Ratio | D13 | D15 | -2.3 | 0.002 | 0.01 |
| Norm Min Ratio | D8 | D10 | 0.8 | 0.002 | 0.00 |
| Norm Min Ratio | D9 | D10 | 0.5 | 0.012 | 0.00 |
| Norm Min Ratio | D11 | D12 | 0.3 | 0.015 | 0.00 |
| Norm Min Ratio | D11 | D13 | 0.5 | 0.010 | 0.00 |
| Norm Min Ratio | D11 | D14 | 0.6 | 0.016 | 0.00 |
| Norm Min Ratio | D11 | D15 | 2.0 | <0.001 | 0.01 |
| Norm Min Ratio | D12 | D15 | 1.7 | 0.002 | 0.01 |
| Norm Min Ratio | D13 | D15 | 1.5 | 0.004 | 0.01 |
| Norm Min Ratio | D14 | D15 | 1.4 | 0.003 | 0.01 |
| Norm Min Ratio | D16 | D17 | 0.5 | 0.008 | 0.00 |
| Norm Min Ratio | D16 | D18 | 4.4 | <0.001 | 0.02 |
| Norm Min Ratio | D16 | D19 | 4.8 | <0.001 | 0.02 |
| Norm Min Ratio | D16 | D20 | 6.6 | <0.001 | 0.03 |
| Norm Min Ratio | D17 | D18 | 3.8 | 0.019 | 0.02 |
| Norm Min Ratio | D17 | D19 | 4.2 | 0.006 | 0.02 |
| Norm Min Ratio | D17 | D20 | 6.1 | <0.001 | 0.03 |
| Norm Min Ratio | D18 | D20 | 2.3 | <0.001 | 0.01 |
| Norm Min Ratio | D19 | D20 | 1.8 | <0.001 | 0.01 |
| Slams/day | D1 | D5 | -0.1 | 0.011 | 0.06 |
| Slams/day | D6 | D7 | -0.1 | 0.018 | 0.05 |
| Slams/day | D6 | D8 | -0.1 | 0.018 | 0.06 |
| Slams/day | D6 | D9 | -0.1 | <0.001 | 0.10 |
| Slams/day | D6 | D10 | -0.2 | <0.001 | 0.14 |
| Slams/day | D7 | D10 | -0.1 | 0.004 | 0.09 |
| Slams/day | D8 | D9 | -0.1 | 0.018 | 0.04 |
| Slams/day | D8 | D10 | -0.1 | 0.002 | 0.08 |
| Slams/day | D11 | D12 | -0.1 | 0.003 | 0.07 |
| Slams/day | D11 | D13 | -0.1 | 0.002 | 0.08 |
| Slams/day | D11 | D14 | -0.1 | 0.005 | 0.08 |
| Slams/day | D11 | D15 | -0.2 | <0.001 | 0.14 |
| Slams/day | D16 | D18 | -0.1 | 0.005 | 0.06 |
| Slams/day | D16 | D19 | -0.1 | 0.006 | 0.08 |
| Slams/day | D16 | D20 | -0.2 | <0.001 | 0.17 |
| Slams/day | D17 | D20 | -0.2 | <0.001 | 0.14 |
| Slams/day | D18 | D20 | -0.2 | <0.001 | 0.11 |
| Slams/day | D19 | D20 | -0.1 | <0.001 | 0.09 |
| LM SD (routing decay) | D1 | D2 | -8.5 | <0.001 | 0.24 |
| LM SD (routing decay) | D1 | D3 | -14.3 | <0.001 | 0.39 |
| LM SD (routing decay) | D1 | D4 | -20.4 | <0.001 | 0.51 |
| LM SD (routing decay) | D1 | D5 | -28.1 | <0.001 | 0.67 |
| LM SD (routing decay) | D2 | D3 | -5.8 | <0.001 | 0.15 |
| LM SD (routing decay) | D2 | D4 | -11.9 | <0.001 | 0.29 |
| LM SD (routing decay) | D2 | D5 | -19.5 | <0.001 | 0.45 |
| LM SD (routing decay) | D3 | D4 | -6.2 | <0.001 | 0.14 |
| LM SD (routing decay) | D3 | D5 | -13.8 | <0.001 | 0.30 |
| LM SD (routing decay) | D4 | D5 | -7.6 | <0.001 | 0.16 |
| LM SD (routing decay) | D6 | D7 | -9.8 | <0.001 | 0.22 |
| LM SD (routing decay) | D6 | D8 | -18.9 | <0.001 | 0.41 |
| LM SD (routing decay) | D6 | D9 | -24.9 | <0.001 | 0.52 |
| LM SD (routing decay) | D6 | D10 | -36.5 | <0.001 | 0.71 |
| LM SD (routing decay) | D7 | D8 | -9.1 | <0.001 | 0.19 |
| LM SD (routing decay) | D7 | D9 | -15.1 | <0.001 | 0.30 |
| LM SD (routing decay) | D7 | D10 | -26.7 | <0.001 | 0.50 |
| LM SD (routing decay) | D8 | D9 | -6.0 | <0.001 | 0.12 |
| LM SD (routing decay) | D8 | D10 | -17.6 | <0.001 | 0.32 |
| LM SD (routing decay) | D9 | D10 | -11.6 | <0.001 | 0.20 |
| LM SD (routing decay) | D11 | D12 | -14.3 | <0.001 | 0.26 |
| LM SD (routing decay) | D11 | D13 | -28.9 | <0.001 | 0.47 |
| LM SD (routing decay) | D11 | D14 | -39.8 | <0.001 | 0.59 |
| LM SD (routing decay) | D11 | D15 | -49.8 | <0.001 | 0.68 |
| LM SD (routing decay) | D12 | D13 | -14.6 | <0.001 | 0.23 |
| LM SD (routing decay) | D12 | D14 | -25.5 | <0.001 | 0.36 |
| LM SD (routing decay) | D12 | D15 | -35.5 | <0.001 | 0.47 |
| LM SD (routing decay) | D13 | D14 | -10.9 | <0.001 | 0.14 |
| LM SD (routing decay) | D13 | D15 | -20.9 | <0.001 | 0.26 |
| LM SD (routing decay) | D14 | D15 | -9.9 | <0.001 | 0.12 |
| LM SD (routing decay) | D16 | D17 | -19.6 | <0.001 | 0.29 |
| LM SD (routing decay) | D16 | D18 | -34.2 | <0.001 | 0.47 |
| LM SD (routing decay) | D16 | D19 | -42.9 | <0.001 | 0.58 |
| LM SD (routing decay) | D16 | D20 | -54.4 | <0.001 | 0.69 |
| LM SD (routing decay) | D17 | D18 | -14.6 | <0.001 | 0.19 |
| LM SD (routing decay) | D17 | D19 | -23.3 | <0.001 | 0.30 |
| LM SD (routing decay) | D17 | D20 | -34.8 | <0.001 | 0.42 |
| LM SD (routing decay) | D18 | D19 | -8.8 | <0.001 | 0.11 |
| LM SD (routing decay) | D18 | D20 | -20.3 | <0.001 | 0.24 |
| LM SD (routing decay) | D19 | D20 | -11.5 | <0.001 | 0.13 |
| Norm LM SD (routing) | D1 | D2 | -0.0002 | <0.001 | 0.24 |
| Norm LM SD (routing) | D1 | D3 | -0.0004 | <0.001 | 0.40 |
| Norm LM SD (routing) | D1 | D4 | -0.0005 | <0.001 | 0.52 |
| Norm LM SD (routing) | D1 | D5 | -0.0007 | <0.001 | 0.69 |
| Norm LM SD (routing) | D2 | D3 | -0.0002 | <0.001 | 0.17 |
| Norm LM SD (routing) | D2 | D4 | -0.0003 | <0.001 | 0.30 |
| Norm LM SD (routing) | D2 | D5 | -0.0005 | <0.001 | 0.48 |
| Norm LM SD (routing) | D3 | D4 | -0.0001 | <0.001 | 0.14 |
| Norm LM SD (routing) | D3 | D5 | -0.0003 | <0.001 | 0.32 |
| Norm LM SD (routing) | D4 | D5 | -0.0002 | <0.001 | 0.18 |
| Norm LM SD (routing) | D6 | D7 | -0.0002 | <0.001 | 0.23 |
| Norm LM SD (routing) | D6 | D8 | -0.0005 | <0.001 | 0.43 |
| Norm LM SD (routing) | D6 | D9 | -0.0007 | <0.001 | 0.57 |
| Norm LM SD (routing) | D6 | D10 | -0.0010 | <0.001 | 0.76 |
| Norm LM SD (routing) | D7 | D8 | -0.0002 | <0.001 | 0.20 |
| Norm LM SD (routing) | D7 | D9 | -0.0004 | <0.001 | 0.34 |
| Norm LM SD (routing) | D7 | D10 | -0.0007 | <0.001 | 0.55 |
| Norm LM SD (routing) | D8 | D9 | -0.0002 | <0.001 | 0.15 |
| Norm LM SD (routing) | D8 | D10 | -0.0005 | <0.001 | 0.36 |
| Norm LM SD (routing) | D9 | D10 | -0.0003 | <0.001 | 0.21 |
| Norm LM SD (routing) | D11 | D12 | -0.0003 | <0.001 | 0.24 |
| Norm LM SD (routing) | D11 | D13 | -0.0006 | <0.001 | 0.43 |
| Norm LM SD (routing) | D11 | D14 | -0.0009 | <0.001 | 0.57 |
| Norm LM SD (routing) | D11 | D15 | -0.0012 | <0.001 | 0.70 |
| Norm LM SD (routing) | D12 | D13 | -0.0003 | <0.001 | 0.19 |
| Norm LM SD (routing) | D12 | D14 | -0.0006 | <0.001 | 0.34 |
| Norm LM SD (routing) | D12 | D15 | -0.0009 | <0.001 | 0.48 |
| Norm LM SD (routing) | D13 | D14 | -0.0003 | <0.001 | 0.16 |
| Norm LM SD (routing) | D13 | D15 | -0.0006 | <0.001 | 0.31 |
| Norm LM SD (routing) | D14 | D15 | -0.0003 | <0.001 | 0.15 |
| Norm LM SD (routing) | D16 | D17 | -0.0004 | <0.001 | 0.21 |
| Norm LM SD (routing) | D16 | D18 | -0.0006 | <0.001 | 0.35 |
| Norm LM SD (routing) | D16 | D19 | -0.0007 | <0.001 | 0.41 |
| Norm LM SD (routing) | D16 | D20 | -0.0009 | <0.001 | 0.48 |
| Norm LM SD (routing) | D17 | D18 | -0.0003 | <0.001 | 0.14 |
| Norm LM SD (routing) | D17 | D19 | -0.0004 | <0.001 | 0.20 |
| Norm LM SD (routing) | D17 | D20 | -0.0006 | <0.001 | 0.28 |
| Norm LM SD (routing) | D18 | D19 | -0.0001 | <0.001 | 0.06 |
| Norm LM SD (routing) | D18 | D20 | -0.0003 | <0.001 | 0.15 |
| Norm LM SD (routing) | D19 | D20 | -0.0002 | <0.001 | 0.09 |

### Duration Effect

| Metric | Cond A | Cond B | Delta | p-value | Cohen's d |
|--------|--------|--------|-------|---------|-----------|
| Avg Ratio | D1 | D6 | 143.8 | <0.001 | 0.92 |
| Avg Ratio | D1 | D11 | 271.1 | <0.001 | 1.63 |
| Avg Ratio | D1 | D16 | 439.0 | <0.001 | 2.69 |
| Avg Ratio | D6 | D11 | 127.3 | <0.001 | 0.67 |
| Avg Ratio | D6 | D16 | 295.2 | <0.001 | 1.58 |
| Avg Ratio | D11 | D16 | 167.9 | <0.001 | 0.86 |
| Avg Ratio | D2 | D7 | 147.1 | <0.001 | 0.92 |
| Avg Ratio | D2 | D12 | 275.9 | <0.001 | 1.63 |
| Avg Ratio | D2 | D17 | 444.2 | <0.001 | 2.69 |
| Avg Ratio | D7 | D12 | 128.8 | <0.001 | 0.67 |
| Avg Ratio | D7 | D17 | 297.2 | <0.001 | 1.57 |
| Avg Ratio | D12 | D17 | 168.4 | <0.001 | 0.86 |
| Avg Ratio | D3 | D8 | 150.5 | <0.001 | 0.92 |
| Avg Ratio | D3 | D13 | 280.1 | <0.001 | 1.63 |
| Avg Ratio | D3 | D18 | 448.5 | <0.001 | 2.70 |
| Avg Ratio | D8 | D13 | 129.6 | <0.001 | 0.66 |
| Avg Ratio | D8 | D18 | 298.0 | <0.001 | 1.57 |
| Avg Ratio | D13 | D18 | 168.4 | <0.001 | 0.85 |
| Avg Ratio | D4 | D9 | 153.7 | <0.001 | 0.92 |
| Avg Ratio | D4 | D14 | 284.0 | <0.001 | 1.64 |
| Avg Ratio | D4 | D19 | 449.5 | <0.001 | 2.72 |
| Avg Ratio | D9 | D14 | 130.3 | <0.001 | 0.66 |
| Avg Ratio | D9 | D19 | 295.9 | <0.001 | 1.56 |
| Avg Ratio | D14 | D19 | 165.6 | <0.001 | 0.84 |
| Avg Ratio | D5 | D10 | 156.7 | <0.001 | 0.94 |
| Avg Ratio | D5 | D15 | 288.4 | <0.001 | 1.64 |
| Avg Ratio | D5 | D20 | 453.3 | <0.001 | 2.78 |
| Avg Ratio | D10 | D15 | 131.7 | <0.001 | 0.66 |
| Avg Ratio | D10 | D20 | 296.6 | <0.001 | 1.57 |
| Avg Ratio | D15 | D20 | 164.9 | <0.001 | 0.84 |
| Min Ratio | D1 | D6 | 178.9 | <0.001 | 0.47 |
| Min Ratio | D1 | D11 | 257.5 | <0.001 | 0.75 |
| Min Ratio | D1 | D16 | 300.4 | <0.001 | 0.92 |
| Min Ratio | D6 | D11 | 78.6 | <0.001 | 0.28 |
| Min Ratio | D6 | D16 | 121.5 | <0.001 | 0.47 |
| Min Ratio | D11 | D16 | 42.9 | <0.001 | 0.21 |
| Min Ratio | D2 | D7 | 177.3 | <0.001 | 0.47 |
| Min Ratio | D2 | D12 | 254.1 | <0.001 | 0.74 |
| Min Ratio | D2 | D17 | 294.1 | <0.001 | 0.90 |
| Min Ratio | D7 | D12 | 76.8 | <0.001 | 0.28 |
| Min Ratio | D7 | D17 | 116.8 | <0.001 | 0.45 |
| Min Ratio | D12 | D17 | 40.0 | <0.001 | 0.20 |
| Min Ratio | D3 | D8 | 177.3 | <0.001 | 0.47 |
| Min Ratio | D3 | D13 | 249.0 | <0.001 | 0.72 |
| Min Ratio | D3 | D18 | 286.1 | <0.001 | 0.87 |
| Min Ratio | D8 | D13 | 71.7 | <0.001 | 0.26 |
| Min Ratio | D8 | D18 | 108.8 | <0.001 | 0.43 |
| Min Ratio | D13 | D18 | 37.1 | <0.001 | 0.18 |
| Min Ratio | D4 | D9 | 174.7 | <0.001 | 0.47 |
| Min Ratio | D4 | D14 | 242.6 | <0.001 | 0.71 |
| Min Ratio | D4 | D19 | 279.5 | <0.001 | 0.86 |
| Min Ratio | D9 | D14 | 67.9 | <0.001 | 0.25 |
| Min Ratio | D9 | D19 | 104.8 | <0.001 | 0.42 |
| Min Ratio | D14 | D19 | 36.9 | <0.001 | 0.19 |
| Min Ratio | D5 | D10 | 172.4 | <0.001 | 0.46 |
| Min Ratio | D5 | D15 | 237.0 | <0.001 | 0.69 |
| Min Ratio | D5 | D20 | 273.9 | <0.001 | 0.85 |
| Min Ratio | D10 | D15 | 64.6 | <0.001 | 0.24 |
| Min Ratio | D10 | D20 | 101.4 | <0.001 | 0.41 |
| Min Ratio | D15 | D20 | 36.8 | <0.001 | 0.19 |
| Norm Avg Ratio | D1 | D11 | -5.3 | 0.014 | 0.03 |
| Norm Avg Ratio | D6 | D11 | -6.4 | <0.001 | 0.03 |
| Norm Avg Ratio | D6 | D16 | -5.7 | 0.013 | 0.03 |
| Norm Avg Ratio | D2 | D12 | -5.9 | 0.013 | 0.03 |
| Norm Avg Ratio | D7 | D12 | -8.1 | <0.001 | 0.04 |
| Norm Avg Ratio | D7 | D17 | -7.4 | 0.002 | 0.04 |
| Norm Avg Ratio | D3 | D13 | -7.3 | 0.004 | 0.04 |
| Norm Avg Ratio | D8 | D13 | -9.4 | <0.001 | 0.05 |
| Norm Avg Ratio | D8 | D18 | -8.5 | 0.003 | 0.04 |
| Norm Avg Ratio | D4 | D14 | -8.7 | <0.001 | 0.04 |
| Norm Avg Ratio | D9 | D14 | -10.6 | <0.001 | 0.05 |
| Norm Avg Ratio | D5 | D15 | -10.6 | <0.001 | 0.05 |
| Norm Avg Ratio | D10 | D15 | -11.4 | <0.001 | 0.06 |
| Norm Min Ratio | D1 | D6 | -3.4 | <0.001 | 0.02 |
| Norm Min Ratio | D1 | D11 | -3.9 | <0.001 | 0.02 |
| Norm Min Ratio | D1 | D16 | 1.2 | 0.009 | 0.01 |
| Norm Min Ratio | D6 | D11 | -0.5 | 0.009 | 0.00 |
| Norm Min Ratio | D11 | D16 | 5.1 | 0.004 | 0.02 |
| Norm Min Ratio | D2 | D7 | -3.4 | <0.001 | 0.02 |
| Norm Min Ratio | D2 | D12 | -3.7 | <0.001 | 0.02 |
| Norm Min Ratio | D12 | D17 | 5.4 | 0.004 | 0.02 |
| Norm Min Ratio | D3 | D8 | -3.5 | <0.001 | 0.02 |
| Norm Min Ratio | D3 | D13 | -3.3 | 0.001 | 0.01 |
| Norm Min Ratio | D8 | D18 | 9.1 | <0.001 | 0.04 |
| Norm Min Ratio | D13 | D18 | 9.0 | <0.001 | 0.04 |
| Norm Min Ratio | D4 | D9 | -3.2 | <0.001 | 0.01 |
| Norm Min Ratio | D4 | D14 | -3.3 | 0.003 | 0.01 |
| Norm Min Ratio | D9 | D19 | 9.3 | 0.002 | 0.04 |
| Norm Min Ratio | D14 | D19 | 9.3 | <0.001 | 0.04 |
| Norm Min Ratio | D5 | D10 | -2.8 | 0.021 | 0.01 |
| Norm Min Ratio | D5 | D20 | 7.8 | 0.009 | 0.04 |
| Norm Min Ratio | D10 | D20 | 10.6 | <0.001 | 0.05 |
| Norm Min Ratio | D15 | D20 | 9.8 | <0.001 | 0.04 |
| Slams/day | D1 | D16 | -0.2 | 0.004 | 0.12 |
| Slams/day | D6 | D16 | -0.1 | 0.005 | 0.09 |
| Slams/day | D2 | D12 | -0.2 | <0.001 | 0.13 |
| Slams/day | D2 | D17 | -0.2 | 0.002 | 0.14 |
| Slams/day | D3 | D13 | -0.2 | <0.001 | 0.13 |
| Slams/day | D3 | D18 | -0.2 | <0.001 | 0.16 |
| Slams/day | D8 | D18 | -0.1 | 0.007 | 0.10 |
| Slams/day | D4 | D9 | -0.1 | 0.007 | 0.09 |
| Slams/day | D4 | D14 | -0.2 | 0.003 | 0.11 |
| Slams/day | D4 | D19 | -0.2 | <0.001 | 0.16 |
| Slams/day | D5 | D10 | -0.1 | 0.007 | 0.10 |
| Slams/day | D5 | D15 | -0.2 | 0.002 | 0.14 |
| Slams/day | D5 | D20 | -0.3 | <0.001 | 0.23 |
| Slams/day | D10 | D20 | -0.2 | 0.005 | 0.13 |
| Gini (count) | D1 | D6 | -0.008 | 0.003 | 0.23 |
| Gini (count) | D1 | D11 | -0.013 | <0.001 | 0.36 |
| Gini (count) | D1 | D16 | -0.017 | <0.001 | 0.44 |
| Gini (count) | D6 | D11 | -0.005 | 0.039 | 0.14 |
| Gini (count) | D6 | D16 | -0.009 | 0.029 | 0.22 |
| Gini (count) | D2 | D7 | -0.008 | 0.003 | 0.23 |
| Gini (count) | D2 | D12 | -0.015 | <0.001 | 0.42 |
| Gini (count) | D2 | D17 | -0.019 | <0.001 | 0.49 |
| Gini (count) | D7 | D12 | -0.007 | 0.011 | 0.18 |
| Gini (count) | D7 | D17 | -0.011 | 0.009 | 0.26 |
| Gini (count) | D3 | D8 | -0.008 | 0.004 | 0.24 |
| Gini (count) | D3 | D13 | -0.018 | <0.001 | 0.48 |
| Gini (count) | D3 | D18 | -0.023 | <0.001 | 0.59 |
| Gini (count) | D8 | D13 | -0.009 | 0.003 | 0.23 |
| Gini (count) | D8 | D18 | -0.014 | <0.001 | 0.35 |
| Gini (count) | D4 | D9 | -0.007 | 0.008 | 0.21 |
| Gini (count) | D4 | D14 | -0.016 | <0.001 | 0.43 |
| Gini (count) | D4 | D19 | -0.023 | <0.001 | 0.58 |
| Gini (count) | D9 | D14 | -0.008 | 0.005 | 0.21 |
| Gini (count) | D9 | D19 | -0.016 | <0.001 | 0.37 |
| Gini (count) | D5 | D15 | -0.012 | 0.001 | 0.32 |
| Gini (count) | D5 | D20 | -0.019 | <0.001 | 0.47 |
| Gini (count) | D10 | D15 | -0.007 | 0.029 | 0.19 |
| Gini (count) | D10 | D20 | -0.014 | <0.001 | 0.34 |
| Count Spread | D1 | D6 | -0.2 | 0.003 | 0.26 |
| Count Spread | D1 | D11 | -0.2 | <0.001 | 0.38 |
| Count Spread | D1 | D16 | -0.3 | <0.001 | 0.43 |
| Count Spread | D2 | D7 | -0.2 | 0.004 | 0.25 |
| Count Spread | D2 | D12 | -0.3 | <0.001 | 0.44 |
| Count Spread | D2 | D17 | -0.3 | <0.001 | 0.49 |
| Count Spread | D7 | D12 | -0.1 | 0.030 | 0.19 |
| Count Spread | D7 | D17 | -0.2 | 0.030 | 0.24 |
| Count Spread | D3 | D8 | -0.2 | 0.010 | 0.25 |
| Count Spread | D3 | D13 | -0.3 | <0.001 | 0.50 |
| Count Spread | D3 | D18 | -0.4 | <0.001 | 0.61 |
| Count Spread | D8 | D13 | -0.2 | 0.006 | 0.24 |
| Count Spread | D8 | D18 | -0.2 | <0.001 | 0.35 |
| Count Spread | D4 | D9 | -0.1 | 0.017 | 0.21 |
| Count Spread | D4 | D14 | -0.3 | <0.001 | 0.43 |
| Count Spread | D4 | D19 | -0.4 | <0.001 | 0.59 |
| Count Spread | D9 | D14 | -0.1 | 0.011 | 0.22 |
| Count Spread | D9 | D19 | -0.3 | <0.001 | 0.38 |
| Count Spread | D5 | D15 | -0.2 | 0.004 | 0.34 |
| Count Spread | D5 | D20 | -0.4 | <0.001 | 0.49 |
| Count Spread | D10 | D20 | -0.3 | <0.001 | 0.36 |
| LM SD (routing decay) | D1 | D6 | -16.2 | <0.001 | 0.43 |
| LM SD (routing decay) | D1 | D11 | -36.9 | <0.001 | 0.85 |
| LM SD (routing decay) | D1 | D16 | -66.2 | <0.001 | 1.30 |
| LM SD (routing decay) | D6 | D11 | -20.7 | <0.001 | 0.44 |
| LM SD (routing decay) | D6 | D16 | -50.0 | <0.001 | 0.92 |
| LM SD (routing decay) | D11 | D16 | -29.3 | <0.001 | 0.50 |
| LM SD (routing decay) | D2 | D7 | -17.4 | <0.001 | 0.41 |
| LM SD (routing decay) | D2 | D12 | -42.7 | <0.001 | 0.88 |
| LM SD (routing decay) | D2 | D17 | -77.3 | <0.001 | 1.34 |
| LM SD (routing decay) | D7 | D12 | -25.3 | <0.001 | 0.48 |
| LM SD (routing decay) | D7 | D17 | -59.8 | <0.001 | 0.98 |
| LM SD (routing decay) | D12 | D17 | -34.6 | <0.001 | 0.53 |
| LM SD (routing decay) | D3 | D8 | -20.8 | <0.001 | 0.45 |
| LM SD (routing decay) | D3 | D13 | -51.5 | <0.001 | 0.89 |
| LM SD (routing decay) | D3 | D18 | -86.0 | <0.001 | 1.36 |
| LM SD (routing decay) | D8 | D13 | -30.8 | <0.001 | 0.50 |
| LM SD (routing decay) | D8 | D18 | -65.3 | <0.001 | 0.98 |
| LM SD (routing decay) | D13 | D18 | -34.5 | <0.001 | 0.46 |
| LM SD (routing decay) | D4 | D9 | -20.6 | <0.001 | 0.41 |
| LM SD (routing decay) | D4 | D14 | -56.3 | <0.001 | 0.86 |
| LM SD (routing decay) | D4 | D19 | -88.7 | <0.001 | 1.32 |
| LM SD (routing decay) | D9 | D14 | -35.7 | <0.001 | 0.52 |
| LM SD (routing decay) | D9 | D19 | -68.0 | <0.001 | 0.97 |
| LM SD (routing decay) | D14 | D19 | -32.4 | <0.001 | 0.40 |
| LM SD (routing decay) | D5 | D10 | -24.6 | <0.001 | 0.45 |
| LM SD (routing decay) | D5 | D15 | -58.6 | <0.001 | 0.82 |
| LM SD (routing decay) | D5 | D20 | -92.5 | <0.001 | 1.25 |
| LM SD (routing decay) | D10 | D15 | -34.0 | <0.001 | 0.45 |
| LM SD (routing decay) | D10 | D20 | -68.0 | <0.001 | 0.87 |
| LM SD (routing decay) | D15 | D20 | -33.9 | <0.001 | 0.37 |
| Norm LM SD (routing) | D1 | D6 | -0.0004 | <0.001 | 0.48 |
| Norm LM SD (routing) | D1 | D11 | -0.0010 | <0.001 | 0.89 |
| Norm LM SD (routing) | D1 | D16 | -0.0017 | <0.001 | 1.38 |
| Norm LM SD (routing) | D6 | D11 | -0.0005 | <0.001 | 0.45 |
| Norm LM SD (routing) | D6 | D16 | -0.0013 | <0.001 | 0.97 |
| Norm LM SD (routing) | D11 | D16 | -0.0007 | <0.001 | 0.52 |
| Norm LM SD (routing) | D2 | D7 | -0.0005 | <0.001 | 0.48 |
| Norm LM SD (routing) | D2 | D12 | -0.0011 | <0.001 | 0.90 |
| Norm LM SD (routing) | D2 | D17 | -0.0019 | <0.001 | 1.31 |
| Norm LM SD (routing) | D7 | D12 | -0.0006 | <0.001 | 0.48 |
| Norm LM SD (routing) | D7 | D17 | -0.0014 | <0.001 | 0.92 |
| Norm LM SD (routing) | D12 | D17 | -0.0008 | <0.001 | 0.46 |
| Norm LM SD (routing) | D3 | D8 | -0.0006 | <0.001 | 0.51 |
| Norm LM SD (routing) | D3 | D13 | -0.0012 | <0.001 | 0.92 |
| Norm LM SD (routing) | D3 | D18 | -0.0020 | <0.001 | 1.27 |
| Norm LM SD (routing) | D8 | D13 | -0.0007 | <0.001 | 0.48 |
| Norm LM SD (routing) | D8 | D18 | -0.0014 | <0.001 | 0.87 |
| Norm LM SD (routing) | D13 | D18 | -0.0007 | <0.001 | 0.41 |
| Norm LM SD (routing) | D4 | D9 | -0.0006 | <0.001 | 0.49 |
| Norm LM SD (routing) | D4 | D14 | -0.0014 | <0.001 | 0.90 |
| Norm LM SD (routing) | D4 | D19 | -0.0019 | <0.001 | 1.22 |
| Norm LM SD (routing) | D9 | D14 | -0.0008 | <0.001 | 0.49 |
| Norm LM SD (routing) | D9 | D19 | -0.0013 | <0.001 | 0.81 |
| Norm LM SD (routing) | D14 | D19 | -0.0006 | <0.001 | 0.30 |
| Norm LM SD (routing) | D5 | D10 | -0.0007 | <0.001 | 0.52 |
| Norm LM SD (routing) | D5 | D15 | -0.0015 | <0.001 | 0.88 |
| Norm LM SD (routing) | D5 | D20 | -0.0019 | <0.001 | 1.09 |
| Norm LM SD (routing) | D10 | D15 | -0.0008 | <0.001 | 0.44 |
| Norm LM SD (routing) | D10 | D20 | -0.0013 | <0.001 | 0.67 |
| Norm LM SD (routing) | D15 | D20 | -0.0005 | 0.002 | 0.23 |
| LM SD (D6 meas.) | D1 | D6 | 11.0 | 0.008 | 0.21 |
| LM SD (D6 meas.) | D1 | D16 | 19.6 | <0.001 | 0.40 |
| LM SD (D6 meas.) | D2 | D7 | 11.7 | 0.009 | 0.23 |
| LM SD (D6 meas.) | D2 | D17 | 17.7 | <0.001 | 0.36 |
| LM SD (D6 meas.) | D3 | D18 | 15.9 | 0.003 | 0.33 |
| LM SD (D6 meas.) | D4 | D19 | 17.7 | 0.002 | 0.37 |
| LM SD (D6 meas.) | D5 | D20 | 18.6 | 0.002 | 0.39 |
| Norm LM SD (D6 meas.) | D1 | D6 | 0.0002 | 0.008 | 0.20 |
| Norm LM SD (D6 meas.) | D1 | D16 | 0.0004 | 0.003 | 0.36 |
| Norm LM SD (D6 meas.) | D2 | D7 | 0.0003 | 0.008 | 0.21 |
| Norm LM SD (D6 meas.) | D2 | D17 | 0.0004 | <0.001 | 0.38 |
| Norm LM SD (D6 meas.) | D3 | D18 | 0.0005 | <0.001 | 0.40 |
| Norm LM SD (D6 meas.) | D13 | D18 | 0.0002 | 0.012 | 0.21 |
| Norm LM SD (D6 meas.) | D4 | D19 | 0.0005 | <0.001 | 0.45 |
| Norm LM SD (D6 meas.) | D9 | D19 | 0.0003 | 0.007 | 0.28 |
| Norm LM SD (D6 meas.) | D14 | D19 | 0.0003 | 0.002 | 0.28 |
| Norm LM SD (D6 meas.) | D5 | D20 | 0.0006 | <0.001 | 0.49 |
| Norm LM SD (D6 meas.) | D10 | D20 | 0.0004 | <0.001 | 0.34 |
| Norm LM SD (D6 meas.) | D15 | D20 | 0.0003 | 0.002 | 0.30 |

### Formula vs Actual

| Metric | Cond A | Cond B | Delta | p-value | Cohen's d |
|--------|--------|--------|-------|---------|-----------|
| Avg Ratio | D1 | A1 | 251.1 | <0.001 | 1.77 |
| Avg Ratio | D2 | A1 | 246.5 | <0.001 | 1.72 |
| Avg Ratio | D3 | A1 | 240.5 | <0.001 | 1.66 |
| Avg Ratio | D4 | A1 | 236.1 | <0.001 | 1.62 |
| Avg Ratio | D5 | A1 | 233.5 | <0.001 | 1.60 |
| Avg Ratio | D6 | A1 | 107.3 | <0.001 | 0.64 |
| Avg Ratio | D7 | A1 | 99.5 | <0.001 | 0.58 |
| Avg Ratio | D8 | A1 | 90.1 | <0.001 | 0.52 |
| Avg Ratio | D9 | A1 | 82.4 | <0.001 | 0.47 |
| Avg Ratio | D10 | A1 | 76.8 | <0.001 | 0.44 |
| Avg Ratio | D11 | A1 | -19.9 | 0.018 | 0.11 |
| Avg Ratio | D12 | A1 | -29.3 | 0.001 | 0.16 |
| Avg Ratio | D13 | A1 | -39.5 | <0.001 | 0.22 |
| Avg Ratio | D14 | A1 | -47.9 | <0.001 | 0.27 |
| Avg Ratio | D15 | A1 | -54.9 | <0.001 | 0.30 |
| Avg Ratio | D16 | A1 | -187.9 | <0.001 | 1.08 |
| Avg Ratio | D17 | A1 | -197.7 | <0.001 | 1.13 |
| Avg Ratio | D18 | A1 | -207.9 | <0.001 | 1.19 |
| Avg Ratio | D19 | A1 | -213.5 | <0.001 | 1.24 |
| Avg Ratio | D20 | A1 | -219.8 | <0.001 | 1.29 |
| Min Ratio | D1 | A1 | 310.6 | <0.001 | 0.95 |
| Min Ratio | D2 | A1 | 299.3 | <0.001 | 0.91 |
| Min Ratio | D3 | A1 | 286.7 | <0.001 | 0.87 |
| Min Ratio | D4 | A1 | 274.9 | <0.001 | 0.84 |
| Min Ratio | D5 | A1 | 264.6 | <0.001 | 0.81 |
| Min Ratio | D6 | A1 | 131.7 | <0.001 | 0.51 |
| Min Ratio | D7 | A1 | 122.1 | <0.001 | 0.47 |
| Min Ratio | D8 | A1 | 109.4 | <0.001 | 0.43 |
| Min Ratio | D9 | A1 | 100.2 | <0.001 | 0.40 |
| Min Ratio | D10 | A1 | 92.2 | <0.001 | 0.37 |
| Min Ratio | D11 | A1 | 53.1 | <0.001 | 0.26 |
| Min Ratio | D12 | A1 | 45.2 | <0.001 | 0.22 |
| Min Ratio | D13 | A1 | 37.7 | <0.001 | 0.19 |
| Min Ratio | D14 | A1 | 32.3 | <0.001 | 0.16 |
| Min Ratio | D15 | A1 | 27.5 | <0.001 | 0.14 |
| Min Ratio | D16 | A1 | 10.2 | <0.001 | 0.06 |
| Min Ratio | D17 | A1 | 5.2 | <0.001 | 0.03 |
| Min Ratio | D20 | A1 | -9.3 | <0.001 | 0.06 |
| Norm Avg Ratio | D1 | A1 | 68.2 | <0.001 | 0.38 |
| Norm Avg Ratio | D2 | A1 | 68.2 | <0.001 | 0.38 |
| Norm Avg Ratio | D3 | A1 | 68.2 | <0.001 | 0.38 |
| Norm Avg Ratio | D4 | A1 | 67.6 | <0.001 | 0.38 |
| Norm Avg Ratio | D5 | A1 | 67.2 | <0.001 | 0.38 |
| Norm Avg Ratio | D6 | A1 | 67.1 | <0.001 | 0.37 |
| Norm Avg Ratio | D7 | A1 | 65.9 | <0.001 | 0.37 |
| Norm Avg Ratio | D8 | A1 | 66.0 | <0.001 | 0.37 |
| Norm Avg Ratio | D9 | A1 | 65.8 | <0.001 | 0.37 |
| Norm Avg Ratio | D10 | A1 | 66.3 | <0.001 | 0.37 |
| Norm Avg Ratio | D11 | A1 | 73.5 | <0.001 | 0.41 |
| Norm Avg Ratio | D12 | A1 | 74.0 | <0.001 | 0.41 |
| Norm Avg Ratio | D13 | A1 | 75.5 | <0.001 | 0.42 |
| Norm Avg Ratio | D14 | A1 | 76.4 | <0.001 | 0.43 |
| Norm Avg Ratio | D15 | A1 | 77.8 | <0.001 | 0.44 |
| Norm Avg Ratio | D16 | A1 | 72.8 | <0.001 | 0.41 |
| Norm Avg Ratio | D17 | A1 | 73.3 | <0.001 | 0.41 |
| Norm Avg Ratio | D18 | A1 | 74.5 | <0.001 | 0.42 |
| Norm Avg Ratio | D19 | A1 | 70.5 | <0.001 | 0.40 |
| Norm Avg Ratio | D20 | A1 | 73.9 | <0.001 | 0.42 |
| Norm Min Ratio | D1 | A1 | 59.8 | <0.001 | 0.31 |
| Norm Min Ratio | D2 | A1 | 59.7 | <0.001 | 0.31 |
| Norm Min Ratio | D3 | A1 | 59.8 | <0.001 | 0.31 |
| Norm Min Ratio | D4 | A1 | 59.8 | <0.001 | 0.31 |
| Norm Min Ratio | D5 | A1 | 59.7 | <0.001 | 0.31 |
| Norm Min Ratio | D6 | A1 | 63.2 | <0.001 | 0.33 |
| Norm Min Ratio | D7 | A1 | 63.2 | <0.001 | 0.33 |
| Norm Min Ratio | D8 | A1 | 63.3 | <0.001 | 0.33 |
| Norm Min Ratio | D9 | A1 | 63.1 | <0.001 | 0.33 |
| Norm Min Ratio | D10 | A1 | 62.6 | <0.001 | 0.33 |
| Norm Min Ratio | D11 | A1 | 63.7 | <0.001 | 0.33 |
| Norm Min Ratio | D12 | A1 | 63.4 | <0.001 | 0.33 |
| Norm Min Ratio | D13 | A1 | 63.2 | <0.001 | 0.33 |
| Norm Min Ratio | D14 | A1 | 63.1 | <0.001 | 0.33 |
| Norm Min Ratio | D15 | A1 | 61.7 | <0.001 | 0.32 |
| Norm Min Ratio | D16 | A1 | 58.6 | <0.001 | 0.32 |
| Norm Min Ratio | D17 | A1 | 58.0 | <0.001 | 0.32 |
| Norm Min Ratio | D18 | A1 | 54.2 | <0.001 | 0.30 |
| Norm Min Ratio | D19 | A1 | 53.8 | <0.001 | 0.29 |
| Norm Min Ratio | D20 | A1 | 51.9 | <0.001 | 0.28 |
| B2B HA/day | D1 | A1 | -0.6 | <0.001 | 0.83 |
| B2B HA/day | D2 | A1 | -0.6 | <0.001 | 0.83 |
| B2B HA/day | D3 | A1 | -0.6 | <0.001 | 0.81 |
| B2B HA/day | D4 | A1 | -0.6 | <0.001 | 0.81 |
| B2B HA/day | D5 | A1 | -0.6 | <0.001 | 0.81 |
| B2B HA/day | D6 | A1 | -0.6 | <0.001 | 0.81 |
| B2B HA/day | D7 | A1 | -0.6 | <0.001 | 0.81 |
| B2B HA/day | D8 | A1 | -0.6 | <0.001 | 0.81 |
| B2B HA/day | D9 | A1 | -0.6 | <0.001 | 0.81 |
| B2B HA/day | D10 | A1 | -0.6 | <0.001 | 0.81 |
| B2B HA/day | D11 | A1 | -0.6 | <0.001 | 0.81 |
| B2B HA/day | D12 | A1 | -0.5 | <0.001 | 0.79 |
| B2B HA/day | D13 | A1 | -0.5 | <0.001 | 0.79 |
| B2B HA/day | D14 | A1 | -0.5 | <0.001 | 0.79 |
| B2B HA/day | D15 | A1 | -0.5 | <0.001 | 0.76 |
| B2B HA/day | D16 | A1 | -0.6 | <0.001 | 0.83 |
| B2B HA/day | D17 | A1 | -0.6 | <0.001 | 0.81 |
| B2B HA/day | D18 | A1 | -0.6 | <0.001 | 0.81 |
| B2B HA/day | D19 | A1 | -0.5 | <0.001 | 0.76 |
| B2B HA/day | D20 | A1 | -0.5 | <0.001 | 0.75 |
| Slams/day | D1 | A1 | -1.2 | <0.001 | 0.74 |
| Slams/day | D2 | A1 | -1.2 | <0.001 | 0.73 |
| Slams/day | D3 | A1 | -1.2 | <0.001 | 0.72 |
| Slams/day | D4 | A1 | -1.2 | <0.001 | 0.71 |
| Slams/day | D5 | A1 | -1.1 | <0.001 | 0.68 |
| Slams/day | D6 | A1 | -1.2 | <0.001 | 0.72 |
| Slams/day | D7 | A1 | -1.1 | <0.001 | 0.68 |
| Slams/day | D8 | A1 | -1.1 | <0.001 | 0.66 |
| Slams/day | D9 | A1 | -1.0 | <0.001 | 0.63 |
| Slams/day | D10 | A1 | -1.0 | <0.001 | 0.60 |
| Slams/day | D11 | A1 | -1.1 | <0.001 | 0.68 |
| Slams/day | D12 | A1 | -1.0 | <0.001 | 0.62 |
| Slams/day | D13 | A1 | -1.0 | <0.001 | 0.61 |
| Slams/day | D14 | A1 | -1.0 | <0.001 | 0.61 |
| Slams/day | D15 | A1 | -0.9 | <0.001 | 0.56 |
| Slams/day | D16 | A1 | -1.0 | <0.001 | 0.64 |
| Slams/day | D17 | A1 | -1.0 | <0.001 | 0.61 |
| Slams/day | D18 | A1 | -1.0 | <0.001 | 0.58 |
| Slams/day | D19 | A1 | -0.9 | <0.001 | 0.57 |
| Slams/day | D20 | A1 | -0.8 | <0.001 | 0.48 |
| Gini (count) | D1 | A1 | -0.094 | <0.001 | 1.40 |
| Gini (count) | D2 | A1 | -0.094 | <0.001 | 1.39 |
| Gini (count) | D3 | A1 | -0.094 | <0.001 | 1.39 |
| Gini (count) | D4 | A1 | -0.093 | <0.001 | 1.39 |
| Gini (count) | D5 | A1 | -0.090 | <0.001 | 1.32 |
| Gini (count) | D6 | A1 | -0.086 | <0.001 | 1.27 |
| Gini (count) | D7 | A1 | -0.086 | <0.001 | 1.25 |
| Gini (count) | D8 | A1 | -0.085 | <0.001 | 1.24 |
| Gini (count) | D9 | A1 | -0.086 | <0.001 | 1.25 |
| Gini (count) | D10 | A1 | -0.085 | <0.001 | 1.23 |
| Gini (count) | D11 | A1 | -0.081 | <0.001 | 1.18 |
| Gini (count) | D12 | A1 | -0.078 | <0.001 | 1.13 |
| Gini (count) | D13 | A1 | -0.076 | <0.001 | 1.10 |
| Gini (count) | D14 | A1 | -0.078 | <0.001 | 1.12 |
| Gini (count) | D15 | A1 | -0.078 | <0.001 | 1.11 |
| Gini (count) | D16 | A1 | -0.078 | <0.001 | 1.11 |
| Gini (count) | D17 | A1 | -0.075 | <0.001 | 1.05 |
| Gini (count) | D18 | A1 | -0.071 | <0.001 | 1.00 |
| Gini (count) | D19 | A1 | -0.070 | <0.001 | 0.98 |
| Gini (count) | D20 | A1 | -0.071 | <0.001 | 0.99 |
| Gini (acuity 5:4:3) | D1 | A1 | -0.090 | <0.001 | 1.34 |
| Gini (acuity 5:4:3) | D2 | A1 | -0.089 | <0.001 | 1.33 |
| Gini (acuity 5:4:3) | D3 | A1 | -0.090 | <0.001 | 1.34 |
| Gini (acuity 5:4:3) | D4 | A1 | -0.090 | <0.001 | 1.34 |
| Gini (acuity 5:4:3) | D5 | A1 | -0.088 | <0.001 | 1.29 |
| Gini (acuity 5:4:3) | D6 | A1 | -0.088 | <0.001 | 1.30 |
| Gini (acuity 5:4:3) | D7 | A1 | -0.088 | <0.001 | 1.29 |
| Gini (acuity 5:4:3) | D8 | A1 | -0.088 | <0.001 | 1.29 |
| Gini (acuity 5:4:3) | D9 | A1 | -0.088 | <0.001 | 1.30 |
| Gini (acuity 5:4:3) | D10 | A1 | -0.088 | <0.001 | 1.29 |
| Gini (acuity 5:4:3) | D11 | A1 | -0.085 | <0.001 | 1.26 |
| Gini (acuity 5:4:3) | D12 | A1 | -0.082 | <0.001 | 1.21 |
| Gini (acuity 5:4:3) | D13 | A1 | -0.081 | <0.001 | 1.20 |
| Gini (acuity 5:4:3) | D14 | A1 | -0.082 | <0.001 | 1.21 |
| Gini (acuity 5:4:3) | D15 | A1 | -0.082 | <0.001 | 1.21 |
| Gini (acuity 5:4:3) | D16 | A1 | -0.085 | <0.001 | 1.25 |
| Gini (acuity 5:4:3) | D17 | A1 | -0.082 | <0.001 | 1.19 |
| Gini (acuity 5:4:3) | D18 | A1 | -0.080 | <0.001 | 1.16 |
| Gini (acuity 5:4:3) | D19 | A1 | -0.079 | <0.001 | 1.14 |
| Gini (acuity 5:4:3) | D20 | A1 | -0.079 | <0.001 | 1.15 |
| Count Spread | D1 | A1 | -1.7 | <0.001 | 1.44 |
| Count Spread | D2 | A1 | -1.7 | <0.001 | 1.43 |
| Count Spread | D3 | A1 | -1.7 | <0.001 | 1.43 |
| Count Spread | D4 | A1 | -1.7 | <0.001 | 1.42 |
| Count Spread | D5 | A1 | -1.6 | <0.001 | 1.35 |
| Count Spread | D6 | A1 | -1.5 | <0.001 | 1.28 |
| Count Spread | D7 | A1 | -1.5 | <0.001 | 1.27 |
| Count Spread | D8 | A1 | -1.5 | <0.001 | 1.27 |
| Count Spread | D9 | A1 | -1.5 | <0.001 | 1.28 |
| Count Spread | D10 | A1 | -1.5 | <0.001 | 1.27 |
| Count Spread | D11 | A1 | -1.5 | <0.001 | 1.20 |
| Count Spread | D12 | A1 | -1.4 | <0.001 | 1.14 |
| Count Spread | D13 | A1 | -1.4 | <0.001 | 1.11 |
| Count Spread | D14 | A1 | -1.4 | <0.001 | 1.14 |
| Count Spread | D15 | A1 | -1.4 | <0.001 | 1.13 |
| Count Spread | D16 | A1 | -1.4 | <0.001 | 1.16 |
| Count Spread | D17 | A1 | -1.4 | <0.001 | 1.10 |
| Count Spread | D18 | A1 | -1.3 | <0.001 | 1.05 |
| Count Spread | D19 | A1 | -1.3 | <0.001 | 1.01 |
| Count Spread | D20 | A1 | -1.3 | <0.001 | 1.01 |
| Acuity Spread | D1 | A1 | -6.2 | <0.001 | 1.42 |
| Acuity Spread | D2 | A1 | -6.2 | <0.001 | 1.41 |
| Acuity Spread | D3 | A1 | -6.2 | <0.001 | 1.41 |
| Acuity Spread | D4 | A1 | -6.2 | <0.001 | 1.40 |
| Acuity Spread | D5 | A1 | -6.1 | <0.001 | 1.36 |
| Acuity Spread | D6 | A1 | -6.0 | <0.001 | 1.36 |
| Acuity Spread | D7 | A1 | -6.1 | <0.001 | 1.36 |
| Acuity Spread | D8 | A1 | -6.1 | <0.001 | 1.36 |
| Acuity Spread | D9 | A1 | -6.1 | <0.001 | 1.38 |
| Acuity Spread | D10 | A1 | -6.1 | <0.001 | 1.37 |
| Acuity Spread | D11 | A1 | -5.9 | <0.001 | 1.32 |
| Acuity Spread | D12 | A1 | -5.7 | <0.001 | 1.26 |
| Acuity Spread | D13 | A1 | -5.5 | <0.001 | 1.23 |
| Acuity Spread | D14 | A1 | -5.7 | <0.001 | 1.26 |
| Acuity Spread | D15 | A1 | -5.6 | <0.001 | 1.25 |
| Acuity Spread | D16 | A1 | -6.0 | <0.001 | 1.34 |
| Acuity Spread | D17 | A1 | -5.8 | <0.001 | 1.28 |
| Acuity Spread | D18 | A1 | -5.5 | <0.001 | 1.23 |
| Acuity Spread | D19 | A1 | -5.5 | <0.001 | 1.21 |
| Acuity Spread | D20 | A1 | -5.5 | <0.001 | 1.21 |
| LM SD (routing decay) | D1 | A1 | -128.8 | <0.001 | 1.67 |
| LM SD (routing decay) | D2 | A1 | -120.3 | <0.001 | 1.54 |
| LM SD (routing decay) | D3 | A1 | -114.5 | <0.001 | 1.45 |
| LM SD (routing decay) | D4 | A1 | -108.4 | <0.001 | 1.35 |
| LM SD (routing decay) | D5 | A1 | -100.8 | <0.001 | 1.24 |
| LM SD (routing decay) | D6 | A1 | -112.7 | <0.001 | 1.42 |
| LM SD (routing decay) | D7 | A1 | -102.9 | <0.001 | 1.28 |
| LM SD (routing decay) | D8 | A1 | -93.8 | <0.001 | 1.15 |
| LM SD (routing decay) | D9 | A1 | -87.7 | <0.001 | 1.06 |
| LM SD (routing decay) | D10 | A1 | -76.2 | <0.001 | 0.90 |
| LM SD (routing decay) | D11 | A1 | -91.9 | <0.001 | 1.12 |
| LM SD (routing decay) | D12 | A1 | -77.6 | <0.001 | 0.92 |
| LM SD (routing decay) | D13 | A1 | -63.0 | <0.001 | 0.71 |
| LM SD (routing decay) | D14 | A1 | -52.1 | <0.001 | 0.56 |
| LM SD (routing decay) | D15 | A1 | -42.1 | <0.001 | 0.44 |
| LM SD (routing decay) | D16 | A1 | -62.6 | <0.001 | 0.73 |
| LM SD (routing decay) | D17 | A1 | -43.0 | <0.001 | 0.48 |
| LM SD (routing decay) | D18 | A1 | -28.5 | 0.019 | 0.31 |
| Norm LM SD (routing) | D1 | A1 | -0.0030 | <0.001 | 1.65 |
| Norm LM SD (routing) | D2 | A1 | -0.0028 | <0.001 | 1.53 |
| Norm LM SD (routing) | D3 | A1 | -0.0026 | <0.001 | 1.42 |
| Norm LM SD (routing) | D4 | A1 | -0.0025 | <0.001 | 1.32 |
| Norm LM SD (routing) | D5 | A1 | -0.0023 | <0.001 | 1.19 |
| Norm LM SD (routing) | D6 | A1 | -0.0025 | <0.001 | 1.37 |
| Norm LM SD (routing) | D7 | A1 | -0.0023 | <0.001 | 1.22 |
| Norm LM SD (routing) | D8 | A1 | -0.0021 | <0.001 | 1.08 |
| Norm LM SD (routing) | D9 | A1 | -0.0019 | <0.001 | 0.96 |
| Norm LM SD (routing) | D10 | A1 | -0.0016 | <0.001 | 0.79 |
| Norm LM SD (routing) | D11 | A1 | -0.0020 | <0.001 | 1.03 |
| Norm LM SD (routing) | D12 | A1 | -0.0017 | <0.001 | 0.83 |
| Norm LM SD (routing) | D13 | A1 | -0.0014 | <0.001 | 0.67 |
| Norm LM SD (routing) | D14 | A1 | -0.0011 | <0.001 | 0.51 |
| Norm LM SD (routing) | D15 | A1 | -0.0008 | 0.008 | 0.36 |
| Norm LM SD (routing) | D16 | A1 | -0.0013 | <0.001 | 0.62 |
| Norm LM SD (routing) | D17 | A1 | -0.0009 | 0.001 | 0.42 |
| Norm LM SD (routing) | D18 | A1 | -0.0006 | 0.028 | 0.29 |
| LM SD (D6 meas.) | D1 | A1 | -91.4 | <0.001 | 1.10 |
| LM SD (D6 meas.) | D2 | A1 | -91.1 | <0.001 | 1.10 |
| LM SD (D6 meas.) | D3 | A1 | -92.7 | <0.001 | 1.12 |
| LM SD (D6 meas.) | D4 | A1 | -92.9 | <0.001 | 1.12 |
| LM SD (D6 meas.) | D5 | A1 | -92.7 | <0.001 | 1.12 |
| LM SD (D6 meas.) | D6 | A1 | -102.3 | <0.001 | 1.27 |
| LM SD (D6 meas.) | D7 | A1 | -102.9 | <0.001 | 1.28 |
| LM SD (D6 meas.) | D8 | A1 | -102.8 | <0.001 | 1.28 |
| LM SD (D6 meas.) | D9 | A1 | -104.8 | <0.001 | 1.31 |
| LM SD (D6 meas.) | D10 | A1 | -103.4 | <0.001 | 1.29 |
| LM SD (D6 meas.) | D11 | A1 | -103.6 | <0.001 | 1.29 |
| LM SD (D6 meas.) | D12 | A1 | -102.5 | <0.001 | 1.28 |
| LM SD (D6 meas.) | D13 | A1 | -100.7 | <0.001 | 1.24 |
| LM SD (D6 meas.) | D14 | A1 | -101.1 | <0.001 | 1.24 |
| LM SD (D6 meas.) | D15 | A1 | -103.1 | <0.001 | 1.26 |
| LM SD (D6 meas.) | D16 | A1 | -110.9 | <0.001 | 1.40 |
| LM SD (D6 meas.) | D17 | A1 | -108.8 | <0.001 | 1.38 |
| LM SD (D6 meas.) | D18 | A1 | -108.6 | <0.001 | 1.37 |
| LM SD (D6 meas.) | D19 | A1 | -110.6 | <0.001 | 1.40 |
| LM SD (D6 meas.) | D20 | A1 | -111.3 | <0.001 | 1.41 |
| Norm LM SD (D6 meas.) | D1 | A1 | -0.0020 | <0.001 | 1.04 |
| Norm LM SD (D6 meas.) | D2 | A1 | -0.0020 | <0.001 | 1.05 |
| Norm LM SD (D6 meas.) | D3 | A1 | -0.0021 | <0.001 | 1.06 |
| Norm LM SD (D6 meas.) | D4 | A1 | -0.0021 | <0.001 | 1.06 |
| Norm LM SD (D6 meas.) | D5 | A1 | -0.0021 | <0.001 | 1.06 |
| Norm LM SD (D6 meas.) | D6 | A1 | -0.0023 | <0.001 | 1.20 |
| Norm LM SD (D6 meas.) | D7 | A1 | -0.0023 | <0.001 | 1.22 |
| Norm LM SD (D6 meas.) | D8 | A1 | -0.0023 | <0.001 | 1.23 |
| Norm LM SD (D6 meas.) | D9 | A1 | -0.0023 | <0.001 | 1.24 |
| Norm LM SD (D6 meas.) | D10 | A1 | -0.0023 | <0.001 | 1.22 |
| Norm LM SD (D6 meas.) | D11 | A1 | -0.0023 | <0.001 | 1.22 |
| Norm LM SD (D6 meas.) | D12 | A1 | -0.0023 | <0.001 | 1.22 |
| Norm LM SD (D6 meas.) | D13 | A1 | -0.0023 | <0.001 | 1.21 |
| Norm LM SD (D6 meas.) | D14 | A1 | -0.0023 | <0.001 | 1.21 |
| Norm LM SD (D6 meas.) | D15 | A1 | -0.0023 | <0.001 | 1.22 |
| Norm LM SD (D6 meas.) | D16 | A1 | -0.0024 | <0.001 | 1.33 |
| Norm LM SD (D6 meas.) | D17 | A1 | -0.0025 | <0.001 | 1.34 |
| Norm LM SD (D6 meas.) | D18 | A1 | -0.0025 | <0.001 | 1.36 |
| Norm LM SD (D6 meas.) | D19 | A1 | -0.0026 | <0.001 | 1.41 |
| Norm LM SD (D6 meas.) | D20 | A1 | -0.0026 | <0.001 | 1.43 |

## Clip Rate Report

Per-condition ratio-clip rate (rawRatio > 1000 triggers a clip). Flagged rows exceed the 5% threshold and should have Avg Ratio interpreted with caution — their mean is pulled toward the cap.

| Condition | Label | Clip Rate | Flag |
|-----------|-------|-----------|------|
| D1 | 0.5x Stepped | 81.51% | ⚑ (>5%) |
| D2 | 0.5x Linear | 81.44% | ⚑ (>5%) |
| D3 | 0.5x LogBack k=1 | 81.18% | ⚑ (>5%) |
| D4 | 0.5x LogBack k=3 | 80.92% | ⚑ (>5%) |
| D5 | 0.5x LogBack k=9 | 81.05% | ⚑ (>5%) |
| D6 | 0.75x Stepped | 63.53% | ⚑ (>5%) |
| D7 | 0.75x Linear | 63.21% | ⚑ (>5%) |
| D8 | 0.75x LogBack k=1 | 62.82% | ⚑ (>5%) |
| D9 | 0.75x LogBack k=3 | 62.69% | ⚑ (>5%) |
| D10 | 0.75x LogBack k=9 | 62.69% | ⚑ (>5%) |
| D11 | 1.0x Stepped | 49.06% | ⚑ (>5%) |
| D12 | 1.0x Linear | 48.93% | ⚑ (>5%) |
| D13 | 1.0x LogBack k=1 | 48.86% | ⚑ (>5%) |
| D14 | 1.0x LogBack k=3 | 48.54% | ⚑ (>5%) |
| D15 | 1.0x LogBack k=9 | 48.54% | ⚑ (>5%) |
| D16 | 1.5x Stepped | 32.64% | ⚑ (>5%) |
| D17 | 1.5x Linear | 32.38% | ⚑ (>5%) |
| D18 | 1.5x LogBack k=1 | 32.25% | ⚑ (>5%) |
| D19 | 1.5x LogBack k=3 | 32.38% | ⚑ (>5%) |
| D20 | 1.5x LogBack k=9 | 32.45% | ⚑ (>5%) |
| A1 | Actual | 54.38% | ⚑ (>5%) |

---

## Run Provenance

- **Run date:** 2026-04-23 12:10:12 (local TZ)
- **Git SHA:** a623a22
- **Git status:** dirty (42 modified files)

<details><summary>Modified files</summary>

```
METHODS.md
scripts/historical-replay.ts
src/components/Dashboard.tsx
src/components/PatientBadge.tsx
src/components/ProviderStatusToggle.tsx
src/components/TeamCard.tsx
src/constants.ts
src/index.css
.claude/
CLAUDE_CODE_HANDOFF_decay_v3.md
DECAY_SCHEDULE_BENCHMARK_RESULTS_V2.md
data/
design-export/
docs/
font-preview.html
for_later/
paper/
patient-decay-designs.html
"public/schedules/January 19_Weekly Schedule (1).xlsx"
"public/schedules/January 5_Weekly Schedule.xlsx"
"public/schedules/March 16_Weekly Schedule.xlsx"
"public/schedules/March 23_Weekly Schedule.xlsx"
"public/schedules/March 30_Weekly Schedule_Updated.xlsx"
"public/schedules/March 9_Weekly Schedule.xlsx"
"public/schedules/Week of 2.23.2026 - BK ED Schedule.xlsx"
scripts/buffer-duration-benchmark-results.json
scripts/buffer-duration-benchmark.ts
scripts/build-pdf.ts
scripts/compare-weights.ts
scripts/comprehensive-benchmark-results.json
scripts/comprehensive-benchmark.ts
scripts/decay-schedule-benchmark-results.json
scripts/decay-schedule-benchmark.ts
scripts/dispo-stats.ts
scripts/load-minutes-analysis.ts
scripts/test-log-back-loaded.ts
team-card-colors.html
team-card-designs.html
team-card-provider-layouts.html
walkthrough-prototype-v2.html
walkthrough-prototype.html
walkthrough-prototype.prev.html
```

</details>
- **RNG seed:** N/A (deterministic replay)
- **Sample size:** 1541 encounters, 121 days, 21 conditions
- **Script:** `scripts/decay-schedule-benchmark.ts`
- **Output JSON:** `data/decay-benchmark-runs/decay-benchmark-results-v3-20260423-121012.json`
