# Decay Schedule Benchmark Results

## Configuration

- **Encounters:** 1541 (primary, three-team, 9A-midnight)
- **Days:** 121
- **Date range:** 2025-12-01 to 2026-03-31
- **Routing weights:** 1:2:4 (tier_three:tier_two:tier_one)
- **Buffers:** ON (35/25/15 min for Red/Yellow/Purple)
- **Measurement weights:** 5:4:3 (tier_one:tier_two:tier_three)
- **Reference decay (for normalized ratios):** 1.0x Stepped (D7)
- **Conditions:** 12 formula (4 durations x 3 shapes) + 1 Actual = 13 total

## Condition Matrix

| ID | Duration | Shape | Tier 1 Summary | Tier 3 Summary |
|----|----------|-------|----------------|----------------|
| D1 | 0.5x | stepped | 4->2@45m->1@90m->0@120m | 1->0@60m |
| D2 | 0.5x | direct | 4->0@120m | 1->0@60m |
| D3 | 0.5x | linear | 4->...->0@120m | 1->...->0@60m |
| D4 | 0.75x | stepped | 4->2@68m->1@135m->0@180m | 1->0@90m |
| D5 | 0.75x | direct | 4->0@180m | 1->0@90m |
| D6 | 0.75x | linear | 4->...->0@180m | 1->...->0@90m |
| D7 | 1x | stepped | 4->2@90m->1@180m->0@240m | 1->0@120m |
| D8 | 1x | direct | 4->0@240m | 1->0@120m |
| D9 | 1x | linear | 4->...->0@240m | 1->...->0@120m |
| D10 | 1.5x | stepped | 4->2@135m->1@270m->0@360m | 1->0@180m |
| D11 | 1.5x | direct | 4->0@360m | 1->0@180m |
| D12 | 1.5x | linear | 4->...->0@360m | 1->...->0@180m |
| A1 | — | — | Actual (historical assignments) | |

## Results (Mean ± SD across days)

| Metric | D1 | D2 | D3 | D4 | D5 | D6 | D7 | D8 | D9 | D10 | D11 | D12 | A1 |
|--------|------|------|------|------|------|------|------|------|------|------|------|------|------|
| Avg Ratio (cond) | 357528833.4±2836212500.1* | 313263368.1±2437206199.3 | 313263496.3±2437207196.8 | 151.5±99.7 | 137.9±87.4 | 137.9±87.4 | 149.6±103.9 | 132.9±84.3 | 132.9±84.3 | 134.9±169.2 | 120.2±143.7 | 120.2±143.7 | 110.1±47.6 |
| Min Ratio (cond) | 75.5±27.9* | 70.2±29.9 | 70.2±29.9 | 61.0±28.6 | 55.6±29.4 | 55.6±29.4 | 51.1±28.0 | 45.9±27.5 | 45.9±27.5 | 38.1±23.9 | 33.6±22.5 | 33.6±22.5 | 29.5±21.0 |
| Avg Ratio (norm) | 750574193.6±8222126775.4 | 750574193.6±8222126775.4 | 750574193.6±8222126775.4 | 750574204.9±8222126774.4 | 750574205.0±8222126774.4* | 750574205.0±8222126774.4* | 149.6±103.9 | 148.9±103.3 | 148.9±103.3 | 152.2±118.1 | 149.4±116.2 | 149.4±116.2 | 120.8±105.3 |
| Min Ratio (norm) | 49.1±27.6 | 49.1±27.6 | 49.1±27.6 | 50.6±28.0 | 50.6±28.1 | 50.6±28.1 | 51.1±28.0* | 50.9±28.1 | 50.9±28.1 | 50.5±27.9 | 49.9±28.1 | 49.9±28.1 | 27.3±18.7 |
| B2B HA/day | 0.1±0.4* | 0.1±0.4* | 0.1±0.4* | 0.1±0.4 | 0.1±0.4 | 0.1±0.4 | 0.1±0.4 | 0.1±0.4 | 0.1±0.4 | 0.1±0.4* | 0.1±0.4 | 0.1±0.4 | 0.7±0.9 |
| Slams/day | 1.0±1.4* | 1.0±1.4 | 1.0±1.4 | 1.1±1.3 | 1.1±1.3 | 1.1±1.3 | 1.1±1.4 | 1.2±1.4 | 1.2±1.4 | 1.2±1.4 | 1.2±1.4 | 1.2±1.4 | 2.2±1.9 |
| Gini (count) | 0.046±0.032* | 0.047±0.032 | 0.047±0.032 | 0.054±0.035 | 0.055±0.038 | 0.055±0.038 | 0.059±0.038 | 0.062±0.041 | 0.062±0.041 | 0.063±0.043 | 0.066±0.045 | 0.066±0.045 | 0.141±0.090 |
| Gini (acuity 5:4:3) | 0.054±0.033* | 0.055±0.033 | 0.055±0.033 | 0.057±0.034 | 0.056±0.036 | 0.056±0.036 | 0.059±0.034 | 0.062±0.036 | 0.062±0.036 | 0.059±0.037 | 0.062±0.040 | 0.062±0.040 | 0.144±0.089 |
| Count Spread | 0.9±0.6* | 0.9±0.6 | 0.9±0.6 | 1.0±0.6 | 1.0±0.7 | 1.0±0.7 | 1.1±0.7 | 1.1±0.7 | 1.1±0.7 | 1.1±0.7 | 1.2±0.8 | 1.2±0.8 | 2.5±1.6 |
| Acuity Spread | 3.7±1.9* | 3.7±1.9 | 3.7±1.9 | 3.9±2.1 | 3.8±2.1 | 3.8±2.1 | 4.0±2.1 | 4.2±2.3 | 4.2±2.3 | 3.9±2.2 | 4.1±2.4 | 4.1±2.4 | 9.9±5.9 |
| LM SD (routing decay) | 54.7±32.7* | 63.2±37.2 | 63.2±37.2 | 70.9±41.5 | 80.7±46.6 | 80.7±46.6 | 91.6±51.9 | 105.9±58.1 | 105.9±58.1 | 120.9±64.2 | 140.5±72.3 | 140.5±72.3 | 183.5±103.9 |
| Norm LM SD (routing) | 0.0014±0.0008* | 0.0016±0.0009 | 0.0016±0.0009 | 0.0018±0.0010 | 0.0020±0.0011 | 0.0020±0.0011 | 0.0023±0.0013 | 0.0027±0.0015 | 0.0027±0.0015 | 0.0031±0.0016 | 0.0034±0.0018 | 0.0034±0.0018 | 0.0043±0.0024 |
| LM SD (D6 meas.) | 92.2±55.4 | 92.4±54.8 | 92.4±54.8 | 81.2±47.2 | 80.7±46.6 | 80.7±46.6 | 79.9±45.7 | 81.0±45.2 | 81.0±45.2 | 72.6±42.3* | 74.7±41.6 | 74.7±41.6 | 183.5±103.9 |
| Norm LM SD (D6 meas.) | 0.0023±0.0013 | 0.0023±0.0013 | 0.0023±0.0013 | 0.0020±0.0011 | 0.0020±0.0011 | 0.0020±0.0011 | 0.0020±0.0011 | 0.0020±0.0011 | 0.0020±0.0011 | 0.0019±0.0010 | 0.0018±0.0010* | 0.0018±0.0010* | 0.0043±0.0024 |

## Robustness Assessment

| Metric | Min | Max | % Variation |
|--------|-----|-----|-------------|
| Avg Ratio (cond) | 120.2 | 357528833.4 | 200.0% |
| Min Ratio (cond) | 33.6 | 75.5 | 76.9% |
| Avg Ratio (norm) | 148.9 | 750574205.0 | 200.0% |
| Min Ratio (norm) | 49.1 | 51.1 | 4.1% |
| B2B HA/day | 0.1 | 0.1 | 16.7% |
| Slams/day | 1.0 | 1.2 | 18.2% |
| Gini (count) | 0.046 | 0.066 | 34.7% |
| Gini (acuity 5:4:3) | 0.054 | 0.062 | 13.0% |
| Count Spread | 0.9 | 1.2 | 33.2% |
| Acuity Spread | 3.7 | 4.2 | 14.4% |
| LM SD (routing decay) | 54.7 | 140.5 | 87.9% |
| Norm LM SD (routing) | 0.0014 | 0.0034 | 86.5% |
| LM SD (D6 meas.) | 72.6 | 92.4 | 24.0% |
| Norm LM SD (D6 meas.) | 0.0018 | 0.0023 | 21.6% |

## Shape Effect Summary

Best shape within each duration level:

| Metric | 0.5x | 0.75x | 1.0x | 1.5x |
|--------|------|------|------|------|
| Avg Ratio (cond) | stepped | stepped | stepped | stepped |
| Min Ratio (cond) | stepped | stepped | stepped | stepped |
| Avg Ratio (norm) | stepped | direct | stepped | stepped |
| Min Ratio (norm) | stepped | direct | stepped | stepped |
| B2B HA/day | stepped | stepped | stepped | stepped |
| Slams/day | stepped | stepped | stepped | stepped |
| Gini (count) | stepped | stepped | stepped | stepped |
| Gini (acuity 5:4:3) | stepped | direct | stepped | stepped |
| Count Spread | stepped | stepped | stepped | stepped |
| Acuity Spread | stepped | direct | stepped | stepped |
| LM SD (routing decay) | stepped | stepped | stepped | stepped |
| Norm LM SD (routing) | stepped | stepped | stepped | stepped |
| LM SD (D6 meas.) | stepped | direct | stepped | stepped |
| Norm LM SD (D6 meas.) | direct | direct | stepped | direct |

## Duration Effect Summary

Best duration within each shape:

| Metric | stepped | direct | linear |
|--------|------|------|------|
| Avg Ratio (cond) | 0.5x | 0.5x | 0.5x |
| Min Ratio (cond) | 0.5x | 0.5x | 0.5x |
| Avg Ratio (norm) | 0.75x | 0.75x | 0.75x |
| Min Ratio (norm) | 1x | 1x | 1x |
| B2B HA/day | 0.5x | 0.5x | 0.5x |
| Slams/day | 0.5x | 0.5x | 0.5x |
| Gini (count) | 0.5x | 0.5x | 0.5x |
| Gini (acuity 5:4:3) | 0.5x | 0.5x | 0.5x |
| Count Spread | 0.5x | 0.5x | 0.5x |
| Acuity Spread | 0.5x | 0.5x | 0.5x |
| LM SD (routing decay) | 0.5x | 0.5x | 0.5x |
| Norm LM SD (routing) | 0.5x | 0.5x | 0.5x |
| LM SD (D6 meas.) | 1.5x | 1.5x | 1.5x |
| Norm LM SD (D6 meas.) | 1.5x | 1.5x | 1.5x |

## Significant Pairwise Comparisons (p < 0.05)

| Metric | Cond A | Cond B | Delta | p-value | Cohen's d |
|--------|--------|--------|-------|---------|-----------|
| Avg Ratio (cond) | D4 | D5 | 13.6 | <0.001 | 0.15 |
| Avg Ratio (cond) | D4 | D6 | 13.6 | <0.001 | 0.15 |
| Avg Ratio (cond) | D7 | D8 | 16.7 | <0.001 | 0.18 |
| Avg Ratio (cond) | D7 | D9 | 16.7 | <0.001 | 0.18 |
| Avg Ratio (cond) | D10 | D11 | 14.6 | <0.001 | 0.09 |
| Avg Ratio (cond) | D10 | D12 | 14.6 | <0.001 | 0.09 |
| Avg Ratio (cond) | D4 | A1 | 41.4 | <0.001 | 0.53 |
| Avg Ratio (cond) | D5 | A1 | 27.8 | <0.001 | 0.39 |
| Avg Ratio (cond) | D6 | A1 | 27.8 | <0.001 | 0.39 |
| Avg Ratio (cond) | D7 | A1 | 39.5 | <0.001 | 0.49 |
| Avg Ratio (cond) | D8 | A1 | 22.8 | 0.011 | 0.33 |
| Avg Ratio (cond) | D9 | A1 | 22.8 | 0.011 | 0.33 |
| Min Ratio (cond) | D1 | D2 | 5.3 | <0.001 | 0.18 |
| Min Ratio (cond) | D1 | D3 | 5.3 | <0.001 | 0.18 |
| Min Ratio (cond) | D4 | D5 | 5.4 | <0.001 | 0.19 |
| Min Ratio (cond) | D4 | D6 | 5.4 | <0.001 | 0.19 |
| Min Ratio (cond) | D7 | D8 | 5.3 | <0.001 | 0.19 |
| Min Ratio (cond) | D7 | D9 | 5.3 | <0.001 | 0.19 |
| Min Ratio (cond) | D10 | D11 | 4.5 | <0.001 | 0.20 |
| Min Ratio (cond) | D10 | D12 | 4.5 | <0.001 | 0.20 |
| Min Ratio (cond) | D1 | D4 | 14.5 | <0.001 | 0.51 |
| Min Ratio (cond) | D1 | D7 | 24.4 | <0.001 | 0.87 |
| Min Ratio (cond) | D1 | D10 | 37.4 | <0.001 | 1.44 |
| Min Ratio (cond) | D4 | D7 | 9.9 | <0.001 | 0.35 |
| Min Ratio (cond) | D4 | D10 | 22.9 | <0.001 | 0.87 |
| Min Ratio (cond) | D7 | D10 | 13.0 | <0.001 | 0.50 |
| Min Ratio (cond) | D2 | D5 | 14.6 | <0.001 | 0.49 |
| Min Ratio (cond) | D2 | D8 | 24.4 | <0.001 | 0.85 |
| Min Ratio (cond) | D2 | D11 | 36.7 | <0.001 | 1.39 |
| Min Ratio (cond) | D5 | D8 | 9.8 | <0.001 | 0.34 |
| Min Ratio (cond) | D5 | D11 | 22.1 | <0.001 | 0.84 |
| Min Ratio (cond) | D8 | D11 | 12.3 | <0.001 | 0.49 |
| Min Ratio (cond) | D3 | D6 | 14.6 | <0.001 | 0.49 |
| Min Ratio (cond) | D3 | D9 | 24.4 | <0.001 | 0.85 |
| Min Ratio (cond) | D3 | D12 | 36.7 | <0.001 | 1.39 |
| Min Ratio (cond) | D6 | D9 | 9.8 | <0.001 | 0.34 |
| Min Ratio (cond) | D6 | D12 | 22.1 | <0.001 | 0.84 |
| Min Ratio (cond) | D9 | D12 | 12.3 | <0.001 | 0.49 |
| Min Ratio (cond) | D1 | A1 | 46.0 | <0.001 | 1.87 |
| Min Ratio (cond) | D2 | A1 | 40.8 | <0.001 | 1.58 |
| Min Ratio (cond) | D3 | A1 | 40.8 | <0.001 | 1.58 |
| Min Ratio (cond) | D4 | A1 | 31.6 | <0.001 | 1.26 |
| Min Ratio (cond) | D5 | A1 | 26.2 | <0.001 | 1.03 |
| Min Ratio (cond) | D6 | A1 | 26.2 | <0.001 | 1.03 |
| Min Ratio (cond) | D7 | A1 | 21.7 | <0.001 | 0.88 |
| Min Ratio (cond) | D8 | A1 | 16.4 | <0.001 | 0.67 |
| Min Ratio (cond) | D9 | A1 | 16.4 | <0.001 | 0.67 |
| Min Ratio (cond) | D10 | A1 | 8.7 | <0.001 | 0.38 |
| Min Ratio (cond) | D11 | A1 | 4.1 | 0.002 | 0.19 |
| Min Ratio (cond) | D12 | A1 | 4.1 | 0.002 | 0.19 |
| Avg Ratio (norm) | D1 | D4 | -11.3 | 0.029 | 0.00 |
| Avg Ratio (norm) | D2 | D5 | -11.5 | 0.027 | 0.00 |
| Avg Ratio (norm) | D3 | D6 | -11.5 | 0.027 | 0.00 |
| Avg Ratio (norm) | D7 | A1 | 28.9 | 0.027 | 0.28 |
| Avg Ratio (norm) | D8 | A1 | 28.2 | 0.030 | 0.27 |
| Avg Ratio (norm) | D9 | A1 | 28.2 | 0.030 | 0.27 |
| Avg Ratio (norm) | D10 | A1 | 31.4 | 0.024 | 0.28 |
| Avg Ratio (norm) | D11 | A1 | 28.6 | 0.036 | 0.26 |
| Avg Ratio (norm) | D12 | A1 | 28.6 | 0.036 | 0.26 |
| Min Ratio (norm) | D7 | D8 | 0.3 | 0.045 | 0.01 |
| Min Ratio (norm) | D7 | D9 | 0.3 | 0.045 | 0.01 |
| Min Ratio (norm) | D10 | D11 | 0.5 | 0.009 | 0.02 |
| Min Ratio (norm) | D10 | D12 | 0.5 | 0.009 | 0.02 |
| Min Ratio (norm) | D1 | D4 | -1.5 | <0.001 | 0.06 |
| Min Ratio (norm) | D1 | D7 | -2.1 | <0.001 | 0.07 |
| Min Ratio (norm) | D1 | D10 | -1.4 | 0.011 | 0.05 |
| Min Ratio (norm) | D4 | D7 | -0.5 | 0.031 | 0.02 |
| Min Ratio (norm) | D7 | D10 | 0.7 | 0.010 | 0.02 |
| Min Ratio (norm) | D2 | D5 | -1.6 | <0.001 | 0.06 |
| Min Ratio (norm) | D2 | D8 | -1.8 | <0.001 | 0.06 |
| Min Ratio (norm) | D8 | D11 | 0.9 | 0.007 | 0.03 |
| Min Ratio (norm) | D3 | D6 | -1.6 | <0.001 | 0.06 |
| Min Ratio (norm) | D3 | D9 | -1.8 | <0.001 | 0.06 |
| Min Ratio (norm) | D9 | D12 | 0.9 | 0.007 | 0.03 |
| Min Ratio (norm) | D1 | A1 | 21.8 | <0.001 | 0.92 |
| Min Ratio (norm) | D2 | A1 | 21.7 | <0.001 | 0.92 |
| Min Ratio (norm) | D3 | A1 | 21.7 | <0.001 | 0.92 |
| Min Ratio (norm) | D4 | A1 | 23.3 | <0.001 | 0.98 |
| Min Ratio (norm) | D5 | A1 | 23.3 | <0.001 | 0.98 |
| Min Ratio (norm) | D6 | A1 | 23.3 | <0.001 | 0.98 |
| Min Ratio (norm) | D7 | A1 | 23.8 | <0.001 | 1.00 |
| Min Ratio (norm) | D8 | A1 | 23.6 | <0.001 | 0.99 |
| Min Ratio (norm) | D9 | A1 | 23.6 | <0.001 | 0.99 |
| Min Ratio (norm) | D10 | A1 | 23.2 | <0.001 | 0.98 |
| Min Ratio (norm) | D11 | A1 | 22.6 | <0.001 | 0.95 |
| Min Ratio (norm) | D12 | A1 | 22.6 | <0.001 | 0.95 |
| B2B HA/day | D1 | A1 | -0.6 | <0.001 | 0.83 |
| B2B HA/day | D2 | A1 | -0.6 | <0.001 | 0.83 |
| B2B HA/day | D3 | A1 | -0.6 | <0.001 | 0.83 |
| B2B HA/day | D4 | A1 | -0.6 | <0.001 | 0.81 |
| B2B HA/day | D5 | A1 | -0.6 | <0.001 | 0.81 |
| B2B HA/day | D6 | A1 | -0.6 | <0.001 | 0.81 |
| B2B HA/day | D7 | A1 | -0.6 | <0.001 | 0.81 |
| B2B HA/day | D8 | A1 | -0.5 | <0.001 | 0.79 |
| B2B HA/day | D9 | A1 | -0.5 | <0.001 | 0.79 |
| B2B HA/day | D10 | A1 | -0.6 | <0.001 | 0.83 |
| B2B HA/day | D11 | A1 | -0.6 | <0.001 | 0.81 |
| B2B HA/day | D12 | A1 | -0.6 | <0.001 | 0.81 |
| Slams/day | D4 | D5 | -0.1 | 0.011 | 0.05 |
| Slams/day | D4 | D6 | -0.1 | 0.011 | 0.05 |
| Slams/day | D7 | D8 | -0.1 | 0.001 | 0.07 |
| Slams/day | D7 | D9 | -0.1 | 0.001 | 0.07 |
| Slams/day | D1 | D7 | -0.1 | 0.034 | 0.07 |
| Slams/day | D1 | D10 | -0.2 | <0.001 | 0.12 |
| Slams/day | D4 | D10 | -0.1 | 0.002 | 0.09 |
| Slams/day | D7 | D10 | -0.1 | 0.049 | 0.05 |
| Slams/day | D2 | D5 | -0.1 | 0.016 | 0.07 |
| Slams/day | D2 | D8 | -0.2 | <0.001 | 0.13 |
| Slams/day | D2 | D11 | -0.2 | <0.001 | 0.14 |
| Slams/day | D5 | D8 | -0.1 | 0.025 | 0.06 |
| Slams/day | D5 | D11 | -0.1 | 0.014 | 0.07 |
| Slams/day | D3 | D6 | -0.1 | 0.016 | 0.07 |
| Slams/day | D3 | D9 | -0.2 | <0.001 | 0.13 |
| Slams/day | D3 | D12 | -0.2 | <0.001 | 0.14 |
| Slams/day | D6 | D9 | -0.1 | 0.025 | 0.06 |
| Slams/day | D6 | D12 | -0.1 | 0.014 | 0.07 |
| Slams/day | D1 | A1 | -1.2 | <0.001 | 0.74 |
| Slams/day | D2 | A1 | -1.2 | <0.001 | 0.73 |
| Slams/day | D3 | A1 | -1.2 | <0.001 | 0.73 |
| Slams/day | D4 | A1 | -1.2 | <0.001 | 0.72 |
| Slams/day | D5 | A1 | -1.1 | <0.001 | 0.68 |
| Slams/day | D6 | A1 | -1.1 | <0.001 | 0.68 |
| Slams/day | D7 | A1 | -1.1 | <0.001 | 0.68 |
| Slams/day | D8 | A1 | -1.0 | <0.001 | 0.62 |
| Slams/day | D9 | A1 | -1.0 | <0.001 | 0.62 |
| Slams/day | D10 | A1 | -1.0 | <0.001 | 0.64 |
| Slams/day | D11 | A1 | -1.0 | <0.001 | 0.61 |
| Slams/day | D12 | A1 | -1.0 | <0.001 | 0.61 |
| Gini (count) | D1 | D4 | -0.008 | 0.002 | 0.23 |
| Gini (count) | D1 | D7 | -0.013 | <0.001 | 0.36 |
| Gini (count) | D1 | D10 | -0.017 | <0.001 | 0.44 |
| Gini (count) | D4 | D10 | -0.009 | 0.034 | 0.22 |
| Gini (count) | D2 | D5 | -0.008 | 0.002 | 0.23 |
| Gini (count) | D2 | D8 | -0.015 | <0.001 | 0.42 |
| Gini (count) | D2 | D11 | -0.019 | <0.001 | 0.49 |
| Gini (count) | D5 | D8 | -0.007 | 0.010 | 0.18 |
| Gini (count) | D5 | D11 | -0.011 | 0.008 | 0.26 |
| Gini (count) | D3 | D6 | -0.008 | 0.002 | 0.23 |
| Gini (count) | D3 | D9 | -0.015 | <0.001 | 0.42 |
| Gini (count) | D3 | D12 | -0.019 | <0.001 | 0.49 |
| Gini (count) | D6 | D9 | -0.007 | 0.010 | 0.18 |
| Gini (count) | D6 | D12 | -0.011 | 0.008 | 0.26 |
| Gini (count) | D1 | A1 | -0.094 | <0.001 | 1.40 |
| Gini (count) | D2 | A1 | -0.094 | <0.001 | 1.39 |
| Gini (count) | D3 | A1 | -0.094 | <0.001 | 1.39 |
| Gini (count) | D4 | A1 | -0.086 | <0.001 | 1.27 |
| Gini (count) | D5 | A1 | -0.086 | <0.001 | 1.25 |
| Gini (count) | D6 | A1 | -0.086 | <0.001 | 1.25 |
| Gini (count) | D7 | A1 | -0.081 | <0.001 | 1.18 |
| Gini (count) | D8 | A1 | -0.078 | <0.001 | 1.13 |
| Gini (count) | D9 | A1 | -0.078 | <0.001 | 1.13 |
| Gini (count) | D10 | A1 | -0.078 | <0.001 | 1.11 |
| Gini (count) | D11 | A1 | -0.075 | <0.001 | 1.05 |
| Gini (count) | D12 | A1 | -0.075 | <0.001 | 1.05 |
| Gini (acuity 5:4:3) | D2 | D8 | -0.007 | 0.020 | 0.21 |
| Gini (acuity 5:4:3) | D2 | D11 | -0.007 | 0.047 | 0.19 |
| Gini (acuity 5:4:3) | D5 | D8 | -0.005 | 0.013 | 0.15 |
| Gini (acuity 5:4:3) | D3 | D9 | -0.007 | 0.020 | 0.21 |
| Gini (acuity 5:4:3) | D3 | D12 | -0.007 | 0.047 | 0.19 |
| Gini (acuity 5:4:3) | D6 | D9 | -0.005 | 0.013 | 0.15 |
| Gini (acuity 5:4:3) | D1 | A1 | -0.090 | <0.001 | 1.34 |
| Gini (acuity 5:4:3) | D2 | A1 | -0.089 | <0.001 | 1.33 |
| Gini (acuity 5:4:3) | D3 | A1 | -0.089 | <0.001 | 1.33 |
| Gini (acuity 5:4:3) | D4 | A1 | -0.088 | <0.001 | 1.30 |
| Gini (acuity 5:4:3) | D5 | A1 | -0.088 | <0.001 | 1.29 |
| Gini (acuity 5:4:3) | D6 | A1 | -0.088 | <0.001 | 1.29 |
| Gini (acuity 5:4:3) | D7 | A1 | -0.085 | <0.001 | 1.26 |
| Gini (acuity 5:4:3) | D8 | A1 | -0.082 | <0.001 | 1.21 |
| Gini (acuity 5:4:3) | D9 | A1 | -0.082 | <0.001 | 1.21 |
| Gini (acuity 5:4:3) | D10 | A1 | -0.085 | <0.001 | 1.25 |
| Gini (acuity 5:4:3) | D11 | A1 | -0.082 | <0.001 | 1.19 |
| Gini (acuity 5:4:3) | D12 | A1 | -0.082 | <0.001 | 1.19 |
| Count Spread | D1 | D4 | -0.2 | 0.001 | 0.26 |
| Count Spread | D1 | D7 | -0.2 | <0.001 | 0.38 |
| Count Spread | D1 | D10 | -0.3 | <0.001 | 0.43 |
| Count Spread | D2 | D5 | -0.2 | 0.002 | 0.25 |
| Count Spread | D2 | D8 | -0.3 | <0.001 | 0.44 |
| Count Spread | D2 | D11 | -0.3 | <0.001 | 0.49 |
| Count Spread | D5 | D8 | -0.1 | 0.018 | 0.19 |
| Count Spread | D5 | D11 | -0.2 | 0.021 | 0.24 |
| Count Spread | D3 | D6 | -0.2 | 0.002 | 0.25 |
| Count Spread | D3 | D9 | -0.3 | <0.001 | 0.44 |
| Count Spread | D3 | D12 | -0.3 | <0.001 | 0.49 |
| Count Spread | D6 | D9 | -0.1 | 0.018 | 0.19 |
| Count Spread | D6 | D12 | -0.2 | 0.021 | 0.24 |
| Count Spread | D1 | A1 | -1.7 | <0.001 | 1.44 |
| Count Spread | D2 | A1 | -1.7 | <0.001 | 1.43 |
| Count Spread | D3 | A1 | -1.7 | <0.001 | 1.43 |
| Count Spread | D4 | A1 | -1.5 | <0.001 | 1.28 |
| Count Spread | D5 | A1 | -1.5 | <0.001 | 1.27 |
| Count Spread | D6 | A1 | -1.5 | <0.001 | 1.27 |
| Count Spread | D7 | A1 | -1.5 | <0.001 | 1.20 |
| Count Spread | D8 | A1 | -1.4 | <0.001 | 1.14 |
| Count Spread | D9 | A1 | -1.4 | <0.001 | 1.14 |
| Count Spread | D10 | A1 | -1.4 | <0.001 | 1.16 |
| Count Spread | D11 | A1 | -1.4 | <0.001 | 1.10 |
| Count Spread | D12 | A1 | -1.4 | <0.001 | 1.10 |
| Acuity Spread | D2 | D8 | -0.5 | 0.017 | 0.25 |
| Acuity Spread | D5 | D8 | -0.4 | 0.019 | 0.19 |
| Acuity Spread | D3 | D9 | -0.5 | 0.017 | 0.25 |
| Acuity Spread | D6 | D9 | -0.4 | 0.019 | 0.19 |
| Acuity Spread | D1 | A1 | -6.2 | <0.001 | 1.42 |
| Acuity Spread | D2 | A1 | -6.2 | <0.001 | 1.41 |
| Acuity Spread | D3 | A1 | -6.2 | <0.001 | 1.41 |
| Acuity Spread | D4 | A1 | -6.0 | <0.001 | 1.36 |
| Acuity Spread | D5 | A1 | -6.1 | <0.001 | 1.36 |
| Acuity Spread | D6 | A1 | -6.1 | <0.001 | 1.36 |
| Acuity Spread | D7 | A1 | -5.9 | <0.001 | 1.32 |
| Acuity Spread | D8 | A1 | -5.7 | <0.001 | 1.26 |
| Acuity Spread | D9 | A1 | -5.7 | <0.001 | 1.26 |
| Acuity Spread | D10 | A1 | -6.0 | <0.001 | 1.34 |
| Acuity Spread | D11 | A1 | -5.8 | <0.001 | 1.28 |
| Acuity Spread | D12 | A1 | -5.8 | <0.001 | 1.28 |
| LM SD (routing decay) | D1 | D2 | -8.5 | <0.001 | 0.24 |
| LM SD (routing decay) | D1 | D3 | -8.5 | <0.001 | 0.24 |
| LM SD (routing decay) | D4 | D5 | -9.8 | <0.001 | 0.22 |
| LM SD (routing decay) | D4 | D6 | -9.8 | <0.001 | 0.22 |
| LM SD (routing decay) | D7 | D8 | -14.3 | <0.001 | 0.26 |
| LM SD (routing decay) | D7 | D9 | -14.3 | <0.001 | 0.26 |
| LM SD (routing decay) | D10 | D11 | -19.6 | <0.001 | 0.29 |
| LM SD (routing decay) | D10 | D12 | -19.6 | <0.001 | 0.29 |
| LM SD (routing decay) | D1 | D4 | -16.2 | <0.001 | 0.43 |
| LM SD (routing decay) | D1 | D7 | -36.9 | <0.001 | 0.85 |
| LM SD (routing decay) | D1 | D10 | -66.2 | <0.001 | 1.30 |
| LM SD (routing decay) | D4 | D7 | -20.7 | <0.001 | 0.44 |
| LM SD (routing decay) | D4 | D10 | -50.0 | <0.001 | 0.92 |
| LM SD (routing decay) | D7 | D10 | -29.3 | <0.001 | 0.50 |
| LM SD (routing decay) | D2 | D5 | -17.4 | <0.001 | 0.41 |
| LM SD (routing decay) | D2 | D8 | -42.7 | <0.001 | 0.88 |
| LM SD (routing decay) | D2 | D11 | -77.3 | <0.001 | 1.34 |
| LM SD (routing decay) | D5 | D8 | -25.3 | <0.001 | 0.48 |
| LM SD (routing decay) | D5 | D11 | -59.8 | <0.001 | 0.98 |
| LM SD (routing decay) | D8 | D11 | -34.6 | <0.001 | 0.53 |
| LM SD (routing decay) | D3 | D6 | -17.4 | <0.001 | 0.41 |
| LM SD (routing decay) | D3 | D9 | -42.7 | <0.001 | 0.88 |
| LM SD (routing decay) | D3 | D12 | -77.3 | <0.001 | 1.34 |
| LM SD (routing decay) | D6 | D9 | -25.3 | <0.001 | 0.48 |
| LM SD (routing decay) | D6 | D12 | -59.8 | <0.001 | 0.98 |
| LM SD (routing decay) | D9 | D12 | -34.6 | <0.001 | 0.53 |
| LM SD (routing decay) | D1 | A1 | -128.8 | <0.001 | 1.67 |
| LM SD (routing decay) | D2 | A1 | -120.3 | <0.001 | 1.54 |
| LM SD (routing decay) | D3 | A1 | -120.3 | <0.001 | 1.54 |
| LM SD (routing decay) | D4 | A1 | -112.7 | <0.001 | 1.42 |
| LM SD (routing decay) | D5 | A1 | -102.9 | <0.001 | 1.28 |
| LM SD (routing decay) | D6 | A1 | -102.9 | <0.001 | 1.28 |
| LM SD (routing decay) | D7 | A1 | -91.9 | <0.001 | 1.12 |
| LM SD (routing decay) | D8 | A1 | -77.6 | <0.001 | 0.92 |
| LM SD (routing decay) | D9 | A1 | -77.6 | <0.001 | 0.92 |
| LM SD (routing decay) | D10 | A1 | -62.6 | <0.001 | 0.73 |
| LM SD (routing decay) | D11 | A1 | -43.0 | <0.001 | 0.48 |
| LM SD (routing decay) | D12 | A1 | -43.0 | <0.001 | 0.48 |
| Norm LM SD (routing) | D1 | D2 | -0.0002 | <0.001 | 0.24 |
| Norm LM SD (routing) | D1 | D3 | -0.0002 | <0.001 | 0.24 |
| Norm LM SD (routing) | D4 | D5 | -0.0002 | <0.001 | 0.23 |
| Norm LM SD (routing) | D4 | D6 | -0.0002 | <0.001 | 0.23 |
| Norm LM SD (routing) | D7 | D8 | -0.0003 | <0.001 | 0.24 |
| Norm LM SD (routing) | D7 | D9 | -0.0003 | <0.001 | 0.24 |
| Norm LM SD (routing) | D10 | D11 | -0.0004 | <0.001 | 0.21 |
| Norm LM SD (routing) | D10 | D12 | -0.0004 | <0.001 | 0.21 |
| Norm LM SD (routing) | D1 | D4 | -0.0004 | <0.001 | 0.48 |
| Norm LM SD (routing) | D1 | D7 | -0.0010 | <0.001 | 0.89 |
| Norm LM SD (routing) | D1 | D10 | -0.0017 | <0.001 | 1.38 |
| Norm LM SD (routing) | D4 | D7 | -0.0005 | <0.001 | 0.45 |
| Norm LM SD (routing) | D4 | D10 | -0.0013 | <0.001 | 0.97 |
| Norm LM SD (routing) | D7 | D10 | -0.0007 | <0.001 | 0.52 |
| Norm LM SD (routing) | D2 | D5 | -0.0005 | <0.001 | 0.48 |
| Norm LM SD (routing) | D2 | D8 | -0.0011 | <0.001 | 0.90 |
| Norm LM SD (routing) | D2 | D11 | -0.0019 | <0.001 | 1.31 |
| Norm LM SD (routing) | D5 | D8 | -0.0006 | <0.001 | 0.48 |
| Norm LM SD (routing) | D5 | D11 | -0.0014 | <0.001 | 0.92 |
| Norm LM SD (routing) | D8 | D11 | -0.0008 | <0.001 | 0.46 |
| Norm LM SD (routing) | D3 | D6 | -0.0005 | <0.001 | 0.48 |
| Norm LM SD (routing) | D3 | D9 | -0.0011 | <0.001 | 0.90 |
| Norm LM SD (routing) | D3 | D12 | -0.0019 | <0.001 | 1.31 |
| Norm LM SD (routing) | D6 | D9 | -0.0006 | <0.001 | 0.48 |
| Norm LM SD (routing) | D6 | D12 | -0.0014 | <0.001 | 0.92 |
| Norm LM SD (routing) | D9 | D12 | -0.0008 | <0.001 | 0.46 |
| Norm LM SD (routing) | D1 | A1 | -0.0030 | <0.001 | 1.65 |
| Norm LM SD (routing) | D2 | A1 | -0.0028 | <0.001 | 1.53 |
| Norm LM SD (routing) | D3 | A1 | -0.0028 | <0.001 | 1.53 |
| Norm LM SD (routing) | D4 | A1 | -0.0025 | <0.001 | 1.37 |
| Norm LM SD (routing) | D5 | A1 | -0.0023 | <0.001 | 1.22 |
| Norm LM SD (routing) | D6 | A1 | -0.0023 | <0.001 | 1.22 |
| Norm LM SD (routing) | D7 | A1 | -0.0020 | <0.001 | 1.03 |
| Norm LM SD (routing) | D8 | A1 | -0.0017 | <0.001 | 0.83 |
| Norm LM SD (routing) | D9 | A1 | -0.0017 | <0.001 | 0.83 |
| Norm LM SD (routing) | D10 | A1 | -0.0013 | <0.001 | 0.62 |
| Norm LM SD (routing) | D11 | A1 | -0.0009 | <0.001 | 0.42 |
| Norm LM SD (routing) | D12 | A1 | -0.0009 | <0.001 | 0.42 |
| LM SD (D6 meas.) | D1 | D4 | 11.0 | 0.002 | 0.21 |
| LM SD (D6 meas.) | D1 | D7 | 12.2 | 0.006 | 0.24 |
| LM SD (D6 meas.) | D1 | D10 | 19.6 | <0.001 | 0.40 |
| LM SD (D6 meas.) | D4 | D10 | 8.6 | 0.037 | 0.19 |
| LM SD (D6 meas.) | D2 | D5 | 11.7 | 0.003 | 0.23 |
| LM SD (D6 meas.) | D2 | D8 | 11.4 | 0.009 | 0.23 |
| LM SD (D6 meas.) | D2 | D11 | 17.7 | <0.001 | 0.36 |
| LM SD (D6 meas.) | D3 | D6 | 11.7 | 0.003 | 0.23 |
| LM SD (D6 meas.) | D3 | D9 | 11.4 | 0.009 | 0.23 |
| LM SD (D6 meas.) | D3 | D12 | 17.7 | <0.001 | 0.36 |
| LM SD (D6 meas.) | D1 | A1 | -91.4 | <0.001 | 1.10 |
| LM SD (D6 meas.) | D2 | A1 | -91.1 | <0.001 | 1.10 |
| LM SD (D6 meas.) | D3 | A1 | -91.1 | <0.001 | 1.10 |
| LM SD (D6 meas.) | D4 | A1 | -102.3 | <0.001 | 1.27 |
| LM SD (D6 meas.) | D5 | A1 | -102.9 | <0.001 | 1.28 |
| LM SD (D6 meas.) | D6 | A1 | -102.9 | <0.001 | 1.28 |
| LM SD (D6 meas.) | D7 | A1 | -103.6 | <0.001 | 1.29 |
| LM SD (D6 meas.) | D8 | A1 | -102.5 | <0.001 | 1.28 |
| LM SD (D6 meas.) | D9 | A1 | -102.5 | <0.001 | 1.28 |
| LM SD (D6 meas.) | D10 | A1 | -110.9 | <0.001 | 1.40 |
| LM SD (D6 meas.) | D11 | A1 | -108.8 | <0.001 | 1.38 |
| LM SD (D6 meas.) | D12 | A1 | -108.8 | <0.001 | 1.38 |
| Norm LM SD (D6 meas.) | D1 | D4 | 0.0002 | 0.005 | 0.20 |
| Norm LM SD (D6 meas.) | D1 | D7 | 0.0003 | 0.013 | 0.22 |
| Norm LM SD (D6 meas.) | D1 | D10 | 0.0004 | <0.001 | 0.36 |
| Norm LM SD (D6 meas.) | D2 | D5 | 0.0003 | 0.005 | 0.21 |
| Norm LM SD (D6 meas.) | D2 | D8 | 0.0003 | 0.017 | 0.21 |
| Norm LM SD (D6 meas.) | D2 | D11 | 0.0004 | <0.001 | 0.38 |
| Norm LM SD (D6 meas.) | D3 | D6 | 0.0003 | 0.005 | 0.21 |
| Norm LM SD (D6 meas.) | D3 | D9 | 0.0003 | 0.017 | 0.21 |
| Norm LM SD (D6 meas.) | D3 | D12 | 0.0004 | <0.001 | 0.38 |
| Norm LM SD (D6 meas.) | D1 | A1 | -0.0020 | <0.001 | 1.04 |
| Norm LM SD (D6 meas.) | D2 | A1 | -0.0020 | <0.001 | 1.05 |
| Norm LM SD (D6 meas.) | D3 | A1 | -0.0020 | <0.001 | 1.05 |
| Norm LM SD (D6 meas.) | D4 | A1 | -0.0023 | <0.001 | 1.20 |
| Norm LM SD (D6 meas.) | D5 | A1 | -0.0023 | <0.001 | 1.22 |
| Norm LM SD (D6 meas.) | D6 | A1 | -0.0023 | <0.001 | 1.22 |
| Norm LM SD (D6 meas.) | D7 | A1 | -0.0023 | <0.001 | 1.22 |
| Norm LM SD (D6 meas.) | D8 | A1 | -0.0023 | <0.001 | 1.22 |
| Norm LM SD (D6 meas.) | D9 | A1 | -0.0023 | <0.001 | 1.22 |
| Norm LM SD (D6 meas.) | D10 | A1 | -0.0024 | <0.001 | 1.33 |
| Norm LM SD (D6 meas.) | D11 | A1 | -0.0025 | <0.001 | 1.34 |
| Norm LM SD (D6 meas.) | D12 | A1 | -0.0025 | <0.001 | 1.34 |
