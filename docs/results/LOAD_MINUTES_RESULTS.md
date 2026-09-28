# Load-Minutes Analysis — Results

> **Note added 2026-09-28 (time zone).** The figures in this document come from a run that read the census arrival times in the machine's America/New_York time zone instead of the workbook's wall-clock time: arrivals from 2026-03-08 onward (daylight time) were read one hour late (earlier arrivals were read correctly), giving 1,541 three-team and 417 two-team encounters instead of 1,540 and 418. Its source is data/historical-replay-runs/historical-replay-results-4-2-1.json, which is a New York run. The values below are unchanged. See METHODS.md section 10.

**Cohort:** 121 three-team daytime shifts (9A–12A), Dec 2025 – Mar 2026
**Configuration:** D6 linear decay, no buffers, 4:2:1 acuity weights
**Source JSON:** `data/historical-replay-runs/historical-replay-results-4-2-1.json`
**Analysis script:** `scripts/load-minutes-analysis.ts`

---

## What was computed

For every team on every day, load and capacity were integrated minute-by-minute across the shift window:

- **`loadMinutes(team, day)`** — sum of acuity-weighted, decay-adjusted load across every minute of the 9A–12A shift
- **`capacityMinutes(team, day)`** — sum of `getEffectiveCapacity` across the same minutes (captures provider schedule changes within the shift)
- **`normalizedLoadMinutes(team, day)`** — `loadMinutes / capacityMinutes` (dimensionless, directly comparable to capacity ratio)
- **`loadMinutesSD`** / **`normalizedLoadMinutesSD`** — inter-team SD across teams 1, 2, 3

Computed for all four arms (actual, formula, formula-no-buffer, round-robin). The no-buffer formula arm is the one analyzed below, per the paper's chosen configuration.

---

## Headline numbers

| Arm | Mean `loadMinutesSD` | Mean `normalizedLoadMinutesSD` |
|---|---|---|
| Actual | 211.10 | 0.0050 |
| Formula (no-buffer) | 90.62 | 0.0023 |
| Round-Robin | 105.34 | 0.0028 |

The formula cuts inter-team load-minutes SD by ~57% vs. historical assignments and ~14% vs. round-robin on the capacity-normalized version.

---

## Correlation with existing metrics (formula arm, n = 121)

### `loadMinutesSD` vs. existing metrics

| Metric | Pearson r | Spearman ρ |
|---|---|---|
| `acuitySpread` | **0.752** | 0.729 |
| `giniAcuity` | 0.642 | 0.620 |
| `giniCount` | 0.165 | 0.123 |
| `teamSpread` | 0.126 | 0.116 |
| `ratioGap` (avgRatio − minRatio) | −0.121 | −0.104 |

### `normalizedLoadMinutesSD` vs. existing metrics

| Metric | Pearson r | Spearman ρ |
|---|---|---|
| `acuitySpread` | **0.560** | 0.555 |
| `giniAcuity` | 0.503 | 0.483 |
| `giniCount` | 0.125 | 0.155 |
| `teamSpread` | 0.054 | 0.081 |
| `ratioGap` | −0.116 | −0.103 |

Load-minutes sits closest to `acuitySpread` (both are acuity-weighted) and `giniAcuity`. It's uncorrelated with count-based metrics — an expected finding, since count-based metrics don't see tier weighting. The capacity-normalized variant is even more independent: roughly 69% of its variance is not explained by `acuitySpread`.

---

## Paired effect sizes: Actual vs. Formula (no-buffer)

Positive `d` = formula improves the metric.

| Metric | Actual mean | Formula mean | Cohen's d | p |
|---|---|---|---|---|
| `loadMinutesSD` | 211.10 | 90.62 | **0.929** | <0.001 |
| `normalizedLoadMinutesSD` | 0.0050 | 0.0023 | **0.918** | <0.001 |
| `giniCount` | 0.141 | 0.060 | 0.824 | <0.001 |
| `giniAcuity` | 0.151 | 0.063 | 0.912 | <0.001 |
| `teamSpread` | 2.55 | 1.10 | 0.837 | <0.001 |
| `acuitySpread` | 4.95 | 2.01 | 0.920 | <0.001 |

Load-minutes effect sizes are on par with (and slightly above) the closest existing equity metrics. Formula is not weaker on load-minutes than on the metrics already in the paper.

---

## Counterfactual: Formula vs. Round-Robin (same arrivals, different routing)

Isolates the routing effect from arrival-timing noise. Both arms see the identical arrival stream; only the assignment rule differs.

| Metric | Round-Robin mean | Formula mean | Cohen's d | p |
|---|---|---|---|---|
| `loadMinutesSD` | 105.34 | 90.62 | 0.251 | 0.006 |
| `normalizedLoadMinutesSD` | 0.0028 | 0.0023 | 0.320 | <0.001 |

The formula's edge over round-robin on load-minutes is modest but statistically significant — same pattern the paper already shows for the other metrics. Most of the "win over actual" comes from the fact that actual routing is notably worse than round-robin, not from the formula being vastly better than RR.

---

## Divergence days

Threshold: `loadMinutesSD` in top quartile (≥ 130.8) **and** `acuitySpread` below median (< 2.0).

**0 days met this criterion.** The partial independence between load-minutes and acuity-spread is a continuous gradient rather than a regime shift — load-minutes doesn't flag days that the snapshot metrics entirely miss.

---

## Verdict

**Supplementary metric, not primary.** Decision criteria (per plan):

- Correlation with closest existing metric: r = 0.75 (raw) / 0.56 (normalized)
- Falls in the 0.50–0.85 "partially independent" band
- Effect size comparable to existing metrics — not a stronger signal, but a different temporal view

**Recommendation:**
- Add `loadMinutesSD` and `normalizedLoadMinutesSD` to the benchmark results tables alongside existing equity metrics
- Do not create a dedicated results subsection for load-minutes
- Keep the load-minutes visualization in Section 2 as a walkthrough illustration

**One-sentence framing for the paper:**
> Integrated over the shift, the formula reduces inter-team load-minutes SD from 211 to 91 (d = 0.93) and the capacity-normalized version from 0.0050 to 0.0023 (d = 0.92), confirming that the snapshot-based equity metrics hold under temporal integration.

---

## Reproducing the results

```bash
# 1. Generate the extended replay JSON
npx tsx scripts/historical-replay.ts --weights 4:2:1 --decay current --json

# 2. Run the correlation and effect-size analysis
npx tsx scripts/load-minutes-analysis.ts
```

The replay script was extended to integrate per-minute load and capacity for each team across each shift and emit `loadMinutesPerTeam`, `capacityMinutesPerTeam`, `normalizedLoadMinutesPerTeam`, `loadMinutesSD`, `normalizedLoadMinutesSD`, `windowStartMs`, `windowEndMs` on every arm in the three-team cohort.
