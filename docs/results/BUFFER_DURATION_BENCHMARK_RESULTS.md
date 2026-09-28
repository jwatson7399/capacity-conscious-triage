# Buffer Duration Benchmark Results

> **Note added 2026-09-28 (time zone).** The figures in this document come from a run that read the census arrival times in the machine's America/New_York time zone instead of the workbook's wall-clock time: arrivals from 2026-03-08 onward (daylight time) were read one hour late (earlier arrivals were read correctly), giving 1,541 three-team and 417 two-team encounters instead of 1,540 and 418. The values below are unchanged. See METHODS.md section 10.

## Configuration

- **Encounters:** 1541 (primary, three-team, 9A-midnight)
- **Days:** 121
- **Date range:** 2025-12-01 to 2026-03-31
- **Routing weights:** 1:2:4 (tier_three:tier_two:tier_one)
- **Decay schedule:** D6 — 0.75x linear
- **Measurement weights:** 5:4:3 (tier_one:tier_two:tier_three)
- **Conditions:** 12 buffer configs (3 bases x 4 ratios) + No Buffer + Actual = 14 total

## Condition Matrix

| ID | Base | Ratio | Purple | Yellow | Red |
|----|------|-------|--------|--------|-----|
| B1 | 10m | 1:1:1 | 10m | 10m | 10m |
| B2 | 10m | 1:1.7:2.3 | 10m | 17m | 23m |
| B3 | 10m | 1:2:3 | 10m | 20m | 30m |
| B4 | 10m | 1:2:4 | 10m | 20m | 40m |
| B5 | 15m | 1:1:1 | 15m | 15m | 15m |
| B6 | 15m | 1:1.7:2.3 | 15m | 26m | 35m |
| B7 | 15m | 1:2:3 | 15m | 30m | 45m |
| B8 | 15m | 1:2:4 | 15m | 30m | 60m |
| B9 | 20m | 1:1:1 | 20m | 20m | 20m |
| B10 | 20m | 1:1.7:2.3 | 20m | 34m | 46m |
| B11 | 20m | 1:2:3 | 20m | 40m | 60m |
| B12 | 20m | 1:2:4 | 20m | 40m | 80m |
| NB | — | — | 0m | 0m | 0m |
| A1 | — | — | Actual (historical) | | |

## Results (Mean ± SD across days)

| Metric | B1 | B2 | B3 | B4 | B5 | B6 | B7 | B8 | B9 | B10 | B11 | B12 | NB | A1 |
|--------|------|------|------|------|------|------|------|------|------|------|------|------|------|------|
| Avg Ratio | 138.5±87.5 | 138.5±87.5 | 138.5±87.5 | 138.5±87.5 | 137.9±87.4 | 137.9±87.4 | 137.8±87.4 | 137.8±87.4 | 138.1±87.3 | 138.1±87.2 | 138.5±87.2 | 138.5±87.2 | 138.8±87.4* | 110.1±47.6 |
| Min Ratio | 56.2±29.0 | 56.1±29.0 | 56.1±29.1 | 56.1±29.1 | 55.7±29.3 | 55.6±29.4 | 55.5±29.5 | 55.5±29.5 | 55.3±29.6 | 55.1±29.7 | 55.1±29.8 | 55.1±29.8 | 56.4±28.7* | 29.5±21.0 |
| B2B HA/day | 0.10±0.41 | 0.10±0.41 | 0.08±0.38* | 0.08±0.38* | 0.12±0.43 | 0.10±0.41 | 0.09±0.39 | 0.09±0.39 | 0.12±0.44 | 0.11±0.40 | 0.11±0.40 | 0.11±0.40 | 0.10±0.39 | 0.65±0.88 |
| Slams/day | 1.1±1.3 | 1.1±1.3 | 1.1±1.3 | 1.1±1.3 | 1.1±1.3 | 1.1±1.3 | 1.1±1.3 | 1.1±1.3 | 1.1±1.3 | 1.1±1.3 | 1.1±1.3* | 1.1±1.3* | 1.2±1.3 | 2.2±1.9 |
| Gini (count) | 0.055±0.038 | 0.055±0.038 | 0.055±0.038 | 0.055±0.038 | 0.055±0.038 | 0.055±0.038 | 0.054±0.038 | 0.054±0.038 | 0.054±0.038 | 0.054±0.038 | 0.053±0.038* | 0.053±0.038* | 0.054±0.038 | 0.141±0.090 |
| Gini (acuity 5:4:3) | 0.056±0.036 | 0.056±0.036 | 0.057±0.035 | 0.057±0.035 | 0.056±0.036 | 0.056±0.036 | 0.056±0.036 | 0.056±0.036 | 0.056±0.036 | 0.056±0.036 | 0.055±0.036 | 0.055±0.036 | 0.055±0.035* | 0.144±0.089 |
| Count Spread | 1.0±0.7 | 1.0±0.7 | 1.0±0.7 | 1.0±0.7 | 1.0±0.7 | 1.0±0.7 | 1.0±0.7 | 1.0±0.7 | 1.0±0.7 | 1.0±0.7 | 1.0±0.7* | 1.0±0.7* | 1.0±0.7 | 2.5±1.6 |
| Acuity Spread | 3.8±2.1 | 3.8±2.2 | 3.9±2.1 | 3.9±2.1 | 3.8±2.1 | 3.8±2.1 | 3.8±2.1 | 3.8±2.1 | 3.8±2.1 | 3.8±2.1 | 3.7±2.2* | 3.7±2.2* | 3.7±2.1 | 9.9±5.9 |
| Load-Minutes SD | 80.9±47.0 | 80.3±46.9 | 80.6±46.8 | 80.6±46.8 | 81.2±46.7 | 80.7±46.6 | 81.3±46.6 | 81.3±46.6 | 81.2±46.9 | 82.5±47.2 | 80.3±46.8 | 80.3±46.8 | 80.1±45.1* | 183.5±103.9 |
| Norm LM SD | 0.0020±0.0011 | 0.0020±0.0011 | 0.0020±0.0011 | 0.0020±0.0011 | 0.0020±0.0011 | 0.0020±0.0011 | 0.0020±0.0011 | 0.0020±0.0011 | 0.0021±0.0011 | 0.0021±0.0011 | 0.0021±0.0011 | 0.0021±0.0011 | 0.0020±0.0010* | 0.0043±0.0024 |

## Robustness Assessment (B1-B12)

| Metric | Min | Max | % Variation |
|--------|-----|-----|-------------|
| Avg Ratio | 137.8 | 138.5 | 0.5% |
| Min Ratio | 55.1 | 56.2 | 1.9% |
| B2B HA/day | 0.08 | 0.12 | 40.0% |
| Slams/day | 1.1 | 1.1 | 1.5% |
| Gini (count) | 0.053 | 0.055 | 3.7% |
| Gini (acuity 5:4:3) | 0.055 | 0.057 | 2.5% |
| Count Spread | 1.0 | 1.0 | 5.0% |
| Acuity Spread | 3.7 | 3.9 | 3.3% |
| Load-Minutes SD | 80.3 | 82.5 | 2.8% |
| Norm LM SD | 0.0020 | 0.0021 | 3.3% |

## Base Effect Summary

Best base within each ratio:

| Metric | 1:1:1 | 1:1.7:2.3 | 1:2:3 | 1:2:4 |
|--------|------|------|------|------|
| Avg Ratio | b=10 | b=10 | b=20 | b=20 |
| Min Ratio | b=10 | b=10 | b=10 | b=10 |
| B2B HA/day | b=10 | b=10 | b=10 | b=10 |
| Slams/day | b=10 | b=10 | b=20 | b=20 |
| Gini (count) | b=20 | b=20 | b=20 | b=20 |
| Gini (acuity 5:4:3) | b=20 | b=20 | b=20 | b=20 |
| Count Spread | b=20 | b=20 | b=20 | b=20 |
| Acuity Spread | b=20 | b=20 | b=20 | b=20 |
| Load-Minutes SD | b=10 | b=10 | b=20 | b=20 |
| Norm LM SD | b=15 | b=15 | b=10 | b=10 |

## Ratio Effect Summary

Best ratio within each base:

| Metric | b=10 | b=15 | b=20 |
|--------|------|------|------|
| Avg Ratio | 1:1:1 | 1:1:1 | 1:2:3 |
| Min Ratio | 1:1:1 | 1:1:1 | 1:1:1 |
| B2B HA/day | 1:2:3 | 1:2:3 | 1:1.7:2.3 |
| Slams/day | 1:1:1 | 1:1:1 | 1:2:3 |
| Gini (count) | 1:1:1 | 1:2:3 | 1:2:3 |
| Gini (acuity 5:4:3) | 1:1:1 | 1:1:1 | 1:2:3 |
| Count Spread | 1:1:1 | 1:2:3 | 1:2:3 |
| Acuity Spread | 1:1:1 | 1:1:1 | 1:2:3 |
| Load-Minutes SD | 1:1.7:2.3 | 1:1.7:2.3 | 1:2:3 |
| Norm LM SD | 1:1.7:2.3 | 1:1.7:2.3 | 1:2:3 |

## Significant Pairwise Comparisons (p < 0.05)

| Metric | Cond A | Cond B | Delta | p-value | Cohen's d |
|--------|--------|--------|-------|---------|-----------|
| Avg Ratio | B1 | A1 | 28.4 | <0.001 | 0.40 |
| Avg Ratio | B2 | A1 | 28.4 | <0.001 | 0.40 |
| Avg Ratio | B3 | A1 | 28.4 | <0.001 | 0.40 |
| Avg Ratio | B4 | A1 | 28.4 | <0.001 | 0.40 |
| Avg Ratio | B5 | A1 | 27.8 | <0.001 | 0.39 |
| Avg Ratio | B6 | A1 | 27.8 | <0.001 | 0.39 |
| Avg Ratio | B7 | A1 | 27.8 | <0.001 | 0.39 |
| Avg Ratio | B8 | A1 | 27.8 | <0.001 | 0.39 |
| Avg Ratio | B9 | A1 | 28.0 | <0.001 | 0.40 |
| Avg Ratio | B10 | A1 | 28.0 | <0.001 | 0.40 |
| Avg Ratio | B11 | A1 | 28.4 | <0.001 | 0.40 |
| Avg Ratio | B12 | A1 | 28.4 | <0.001 | 0.40 |
| Avg Ratio | NB | A1 | 28.7 | <0.001 | 0.41 |
| Min Ratio | B5 | B7 | 0.1 | 0.050 | 0.01 |
| Min Ratio | B5 | B8 | 0.1 | 0.050 | 0.01 |
| Min Ratio | B9 | B10 | 0.2 | 0.043 | 0.01 |
| Min Ratio | B9 | B11 | 0.2 | 0.015 | 0.01 |
| Min Ratio | B9 | B12 | 0.2 | 0.015 | 0.01 |
| Min Ratio | B1 | B5 | 0.5 | 0.046 | 0.02 |
| Min Ratio | B1 | B9 | 0.9 | 0.006 | 0.03 |
| Min Ratio | B2 | B6 | 0.5 | 0.035 | 0.02 |
| Min Ratio | B2 | B10 | 1.0 | 0.002 | 0.03 |
| Min Ratio | B6 | B10 | 0.5 | 0.024 | 0.02 |
| Min Ratio | B3 | B7 | 0.5 | 0.020 | 0.02 |
| Min Ratio | B3 | B11 | 1.0 | 0.002 | 0.03 |
| Min Ratio | B7 | B11 | 0.5 | 0.033 | 0.02 |
| Min Ratio | B4 | B8 | 0.5 | 0.020 | 0.02 |
| Min Ratio | B4 | B12 | 1.0 | 0.002 | 0.03 |
| Min Ratio | B8 | B12 | 0.5 | 0.033 | 0.02 |
| Min Ratio | B5 | NB | -0.7 | 0.014 | 0.03 |
| Min Ratio | B6 | NB | -0.8 | 0.008 | 0.03 |
| Min Ratio | B7 | NB | -0.9 | 0.004 | 0.03 |
| Min Ratio | B8 | NB | -0.9 | 0.004 | 0.03 |
| Min Ratio | B9 | NB | -1.1 | 0.002 | 0.04 |
| Min Ratio | B10 | NB | -1.3 | <0.001 | 0.04 |
| Min Ratio | B11 | NB | -1.4 | <0.001 | 0.05 |
| Min Ratio | B12 | NB | -1.4 | <0.001 | 0.05 |
| Min Ratio | B1 | A1 | 26.7 | <0.001 | 1.06 |
| Min Ratio | B2 | A1 | 26.7 | <0.001 | 1.05 |
| Min Ratio | B3 | A1 | 26.6 | <0.001 | 1.05 |
| Min Ratio | B4 | A1 | 26.6 | <0.001 | 1.05 |
| Min Ratio | B5 | A1 | 26.2 | <0.001 | 1.03 |
| Min Ratio | B6 | A1 | 26.2 | <0.001 | 1.03 |
| Min Ratio | B7 | A1 | 26.1 | <0.001 | 1.02 |
| Min Ratio | B8 | A1 | 26.1 | <0.001 | 1.02 |
| Min Ratio | B9 | A1 | 25.8 | <0.001 | 1.01 |
| Min Ratio | B10 | A1 | 25.7 | <0.001 | 1.00 |
| Min Ratio | B11 | A1 | 25.6 | <0.001 | 0.99 |
| Min Ratio | B12 | A1 | 25.6 | <0.001 | 0.99 |
| Min Ratio | NB | A1 | 27.0 | <0.001 | 1.07 |
| B2B HA/day | B1 | A1 | -0.55 | <0.001 | 0.81 |
| B2B HA/day | B2 | A1 | -0.55 | <0.001 | 0.81 |
| B2B HA/day | B3 | A1 | -0.57 | <0.001 | 0.84 |
| B2B HA/day | B4 | A1 | -0.57 | <0.001 | 0.84 |
| B2B HA/day | B5 | A1 | -0.54 | <0.001 | 0.78 |
| B2B HA/day | B6 | A1 | -0.55 | <0.001 | 0.81 |
| B2B HA/day | B7 | A1 | -0.56 | <0.001 | 0.83 |
| B2B HA/day | B8 | A1 | -0.56 | <0.001 | 0.83 |
| B2B HA/day | B9 | A1 | -0.53 | <0.001 | 0.76 |
| B2B HA/day | B10 | A1 | -0.55 | <0.001 | 0.80 |
| B2B HA/day | B11 | A1 | -0.55 | <0.001 | 0.80 |
| B2B HA/day | B12 | A1 | -0.55 | <0.001 | 0.80 |
| B2B HA/day | NB | A1 | -0.55 | <0.001 | 0.81 |
| Slams/day | B1 | A1 | -1.1 | <0.001 | 0.69 |
| Slams/day | B2 | A1 | -1.1 | <0.001 | 0.69 |
| Slams/day | B3 | A1 | -1.1 | <0.001 | 0.69 |
| Slams/day | B4 | A1 | -1.1 | <0.001 | 0.69 |
| Slams/day | B5 | A1 | -1.1 | <0.001 | 0.69 |
| Slams/day | B6 | A1 | -1.1 | <0.001 | 0.68 |
| Slams/day | B7 | A1 | -1.1 | <0.001 | 0.69 |
| Slams/day | B8 | A1 | -1.1 | <0.001 | 0.69 |
| Slams/day | B9 | A1 | -1.1 | <0.001 | 0.68 |
| Slams/day | B10 | A1 | -1.1 | <0.001 | 0.68 |
| Slams/day | B11 | A1 | -1.1 | <0.001 | 0.69 |
| Slams/day | B12 | A1 | -1.1 | <0.001 | 0.69 |
| Slams/day | NB | A1 | -1.1 | <0.001 | 0.67 |
| Gini (count) | B1 | A1 | -0.086 | <0.001 | 1.24 |
| Gini (count) | B2 | A1 | -0.085 | <0.001 | 1.24 |
| Gini (count) | B3 | A1 | -0.085 | <0.001 | 1.24 |
| Gini (count) | B4 | A1 | -0.085 | <0.001 | 1.24 |
| Gini (count) | B5 | A1 | -0.086 | <0.001 | 1.25 |
| Gini (count) | B6 | A1 | -0.086 | <0.001 | 1.25 |
| Gini (count) | B7 | A1 | -0.086 | <0.001 | 1.26 |
| Gini (count) | B8 | A1 | -0.086 | <0.001 | 1.26 |
| Gini (count) | B9 | A1 | -0.086 | <0.001 | 1.25 |
| Gini (count) | B10 | A1 | -0.087 | <0.001 | 1.26 |
| Gini (count) | B11 | A1 | -0.087 | <0.001 | 1.27 |
| Gini (count) | B12 | A1 | -0.087 | <0.001 | 1.27 |
| Gini (count) | NB | A1 | -0.086 | <0.001 | 1.25 |
| Gini (acuity 5:4:3) | B1 | A1 | -0.088 | <0.001 | 1.30 |
| Gini (acuity 5:4:3) | B2 | A1 | -0.088 | <0.001 | 1.29 |
| Gini (acuity 5:4:3) | B3 | A1 | -0.088 | <0.001 | 1.29 |
| Gini (acuity 5:4:3) | B4 | A1 | -0.088 | <0.001 | 1.29 |
| Gini (acuity 5:4:3) | B5 | A1 | -0.088 | <0.001 | 1.30 |
| Gini (acuity 5:4:3) | B6 | A1 | -0.088 | <0.001 | 1.29 |
| Gini (acuity 5:4:3) | B7 | A1 | -0.088 | <0.001 | 1.29 |
| Gini (acuity 5:4:3) | B8 | A1 | -0.088 | <0.001 | 1.29 |
| Gini (acuity 5:4:3) | B9 | A1 | -0.088 | <0.001 | 1.30 |
| Gini (acuity 5:4:3) | B10 | A1 | -0.088 | <0.001 | 1.30 |
| Gini (acuity 5:4:3) | B11 | A1 | -0.089 | <0.001 | 1.31 |
| Gini (acuity 5:4:3) | B12 | A1 | -0.089 | <0.001 | 1.31 |
| Gini (acuity 5:4:3) | NB | A1 | -0.089 | <0.001 | 1.31 |
| Count Spread | B1 | A1 | -1.5 | <0.001 | 1.27 |
| Count Spread | B2 | A1 | -1.5 | <0.001 | 1.26 |
| Count Spread | B3 | A1 | -1.5 | <0.001 | 1.26 |
| Count Spread | B4 | A1 | -1.5 | <0.001 | 1.26 |
| Count Spread | B5 | A1 | -1.5 | <0.001 | 1.28 |
| Count Spread | B6 | A1 | -1.5 | <0.001 | 1.27 |
| Count Spread | B7 | A1 | -1.5 | <0.001 | 1.29 |
| Count Spread | B8 | A1 | -1.5 | <0.001 | 1.29 |
| Count Spread | B9 | A1 | -1.5 | <0.001 | 1.29 |
| Count Spread | B10 | A1 | -1.6 | <0.001 | 1.30 |
| Count Spread | B11 | A1 | -1.6 | <0.001 | 1.30 |
| Count Spread | B12 | A1 | -1.6 | <0.001 | 1.30 |
| Count Spread | NB | A1 | -1.5 | <0.001 | 1.29 |
| Acuity Spread | B1 | A1 | -6.1 | <0.001 | 1.37 |
| Acuity Spread | B2 | A1 | -6.1 | <0.001 | 1.36 |
| Acuity Spread | B3 | A1 | -6.1 | <0.001 | 1.36 |
| Acuity Spread | B4 | A1 | -6.1 | <0.001 | 1.36 |
| Acuity Spread | B5 | A1 | -6.1 | <0.001 | 1.37 |
| Acuity Spread | B6 | A1 | -6.1 | <0.001 | 1.36 |
| Acuity Spread | B7 | A1 | -6.1 | <0.001 | 1.37 |
| Acuity Spread | B8 | A1 | -6.1 | <0.001 | 1.37 |
| Acuity Spread | B9 | A1 | -6.1 | <0.001 | 1.37 |
| Acuity Spread | B10 | A1 | -6.1 | <0.001 | 1.37 |
| Acuity Spread | B11 | A1 | -6.2 | <0.001 | 1.39 |
| Acuity Spread | B12 | A1 | -6.2 | <0.001 | 1.39 |
| Acuity Spread | NB | A1 | -6.2 | <0.001 | 1.39 |
| Load-Minutes SD | B1 | A1 | -102.6 | <0.001 | 1.27 |
| Load-Minutes SD | B2 | A1 | -103.2 | <0.001 | 1.28 |
| Load-Minutes SD | B3 | A1 | -103.0 | <0.001 | 1.28 |
| Load-Minutes SD | B4 | A1 | -103.0 | <0.001 | 1.28 |
| Load-Minutes SD | B5 | A1 | -102.3 | <0.001 | 1.27 |
| Load-Minutes SD | B6 | A1 | -102.9 | <0.001 | 1.28 |
| Load-Minutes SD | B7 | A1 | -102.3 | <0.001 | 1.27 |
| Load-Minutes SD | B8 | A1 | -102.3 | <0.001 | 1.27 |
| Load-Minutes SD | B9 | A1 | -102.3 | <0.001 | 1.27 |
| Load-Minutes SD | B10 | A1 | -101.0 | <0.001 | 1.25 |
| Load-Minutes SD | B11 | A1 | -103.2 | <0.001 | 1.28 |
| Load-Minutes SD | B12 | A1 | -103.2 | <0.001 | 1.28 |
| Load-Minutes SD | NB | A1 | -103.4 | <0.001 | 1.29 |
| Norm LM SD | B10 | NB | 0.0001 | 0.037 | 0.09 |
| Norm LM SD | B1 | A1 | -0.0023 | <0.001 | 1.21 |
| Norm LM SD | B2 | A1 | -0.0023 | <0.001 | 1.22 |
| Norm LM SD | B3 | A1 | -0.0023 | <0.001 | 1.22 |
| Norm LM SD | B4 | A1 | -0.0023 | <0.001 | 1.22 |
| Norm LM SD | B5 | A1 | -0.0023 | <0.001 | 1.21 |
| Norm LM SD | B6 | A1 | -0.0023 | <0.001 | 1.22 |
| Norm LM SD | B7 | A1 | -0.0023 | <0.001 | 1.21 |
| Norm LM SD | B8 | A1 | -0.0023 | <0.001 | 1.21 |
| Norm LM SD | B9 | A1 | -0.0022 | <0.001 | 1.19 |
| Norm LM SD | B10 | A1 | -0.0022 | <0.001 | 1.18 |
| Norm LM SD | B11 | A1 | -0.0023 | <0.001 | 1.20 |
| Norm LM SD | B12 | A1 | -0.0023 | <0.001 | 1.20 |
| Norm LM SD | NB | A1 | -0.0023 | <0.001 | 1.25 |
