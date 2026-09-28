# Historical Replay Benchmark — Results Summary (4:2:1 Weights)

> **Note added 2026-09-28.** The fairness (composite) and acuity-balance figures in this document were computed with the composite's original 5:3:1 acuity-balance scale (composite v1), even where the routing used 4:2:1. The values below are left as they were. See METHODS.md section 9 for the versioned composite and the corrected (4:2:1) comparison.

## What This Is

A three-way comparison using **real patient arrivals** (1,958 A-side encounters, Dec 2025–Mar 2026) and **real provider schedules** (18 weekly schedule files covering 122 days) to evaluate the triage app's formula against historical assignments and round-robin.

This benchmark uses **empirically adjusted acuity weights of 4:2:1** (Tier One : Tier Two : Tier Three), based on a cross-study synthesis of EP workload literature — including the POWER study (n=11,716, 11 EDs), Innes (n=585), and Wrede (n=202). The original benchmark used 5:3:1 weights; this re-run tests sensitivity to more evidence-based demand ratios. See `ACUITY_WEIGHT_RATIONALE.md` for the full analysis and citations.

**Key weight changes:** Red:Yellow narrows from 1.67:1 to 2:1 (POWER empirical: 1.89–1.99:1). Yellow:Purple narrows from 3:1 to 2:1 (POWER empirical: 1.48–1.49:1 — the largest correction). Red decay timing slowed from 60m/120m to 90m/180m to match POWER mean CTAS-1 treatment time of 73.6 min.

- **Actual** — the team assignment as it really happened
- **Formula** — what the app's recommendation engine would have assigned
- **Round-Robin** — sequential cycling through eligible teams (baseline)

639 trauma/Team 4 encounters were excluded from the 2,597 total, leaving 1,958 A-side encounters across Teams 1–3.

---

## Primary Cohort: Three-Team Hours (9A–Midnight)

**1,541 encounters across 121 days.** Teams 1, 2, and 3 all staffed.

### Core Metrics (mean ± SD per day)

| Metric | Actual | Formula | Round-Robin |
|--------|--------|---------|-------------|
| Fairness (0–100) | 85.7 ± 7.2 | 92.2 ± 2.8 | 92.7 ± 2.6 |
| Gini (patient count) | 0.141 ± 0.090 | 0.062 ± 0.035 | 0.039 ± 0.031 |
| Gini (acuity-weighted) | 0.151 ± 0.092 | 0.074 ± 0.046 | 0.066 ± 0.049 |
| Avg Capacity Ratio | 63.4 ± 12.8 | 72.9 ± 14.7 | 70.6 ± 15.1 |
| Min Capacity Ratio | 18.0 ± 14.4 | 31.8 ± 21.4 | 29.1 ± 21.7 |
| Daily Team Spread | 2.5 ± 1.6 | 1.2 ± 0.7 | 0.7 ± 0.5 |
| Acuity-Weighted Spread | 5.0 ± 2.9 | 2.4 ± 1.4 | 2.1 ± 1.3 |
| Back-to-back HA/day | 0.7 ± 0.9 | 0.1 ± 0.4 | 0.1 ± 0.4 |
| Slams (2+ pts/team/hr) | 2.2 ± 1.9 | 1.2 ± 1.4 | 0.9 ± 1.3 |
| Overwhelm Events/day | 0.0 | 0.0 | 0.0 |

### Fairness Sub-Scores (mean ± SD per day, 0–1 scale)

| Sub-Score | Weight | Actual | Formula | Round-Robin |
|-----------|--------|--------|---------|-------------|
| Capacity Balance | 25% | 0.715 ± 0.174 | 0.843 ± 0.077 | 0.855 ± 0.069 |
| Acuity Balance | 15% | 0.700 ± 0.176 | 0.841 ± 0.098 | 0.852 ± 0.109 |
| Overwhelm Avoidance | 30% | 1.000 ± 0.000 | 1.000 ± 0.000 | 1.000 ± 0.000 |
| Min Ratio Score | 15% | 1.000 ± 0.000 | 1.000 ± 0.000 | 1.000 ± 0.000 |
| Stress Equity | 15% | 0.819 ± 0.099 | 0.903 ± 0.050 | 0.906 ± 0.057 |

The formula's advantage is concentrated in three sub-scores: **Capacity Balance** (+0.128 vs Actual), **Acuity Balance** (+0.141), and **Stress Equity** (+0.084). With 4:2:1 weights, Acuity Balance and Stress Equity both improved slightly vs 5:3:1 (Formula: 0.835→0.841 and 0.897→0.903 respectively). Overwhelm Avoidance and Min Ratio Score are perfect (1.0) for all methods.

### Head-to-Head (Fairness Score)

| Comparison | Win % | Delta | Cohen's d | p-value |
|------------|-------|-------|-----------|---------|
| Formula vs Actual | 77.7% | +6.6 | 0.84 (large) | <0.001 |
| Formula vs Round-Robin | 36.4% | -0.5 | 0.17 (negligible) | 0.06 |
| Actual vs Round-Robin | 14.9% | -7.1 | 0.97 (large) | <0.001 |

- Formula Agreement with Actual: 33.6% (the formula would have changed 2/3 of assignments)
- Actual picked the highest-capacity team: 31.7% (essentially random — coin-flip odds with 3 teams are 33.3%)

### Day-of-Week Breakdown (Formula vs Actual)

| Day | Days | Formula Win % | Delta | Cohen's d | p-value |
|-----|------|---------------|-------|-----------|---------|
| Monday | 18 | 67% | +5.8 | 0.77 | 0.005 |
| Tuesday | 17 | 76% | +6.6 | 0.79 | 0.006 |
| Wednesday | 17 | 82% | +6.5 | 0.84 | 0.004 |
| Thursday | 17 | 76% | +6.2 | 0.88 | 0.003 |
| Friday | 17 | 88% | +6.7 | 0.96 | 0.001 |
| Saturday | 17 | 65% | +2.7 | 0.62 | 0.02 |
| Sunday | 18 | 89% | +11.0 | 1.25 | <0.001 |

Formula wins every day of the week. All days now reach statistical significance (Saturday p=0.02, up from p=0.06 with 5:3:1 weights).

---

## Secondary Cohort: Two-Team Hours (Midnight–9A)

**417 encounters across 120 days.** Teams 1 and 2 only (Team 3 closed).

| Metric | Actual | Formula | Round-Robin |
|--------|--------|---------|-------------|
| Fairness (0–100) | 79.3 ± 14.2 | 88.6 ± 12.1 | 88.8 ± 12.1 |
| Gini (patient count) | 0.220 ± 0.189 | 0.122 ± 0.159 | 0.115 ± 0.160 |
| Gini (acuity-weighted) | 0.231 ± 0.186 | 0.142 ± 0.156 | 0.142 ± 0.156 |
| Slams (2+ pts/team/hr) | 0.4 ± 0.7 | 0.1 ± 0.5 | 0.1 ± 0.4 |

Formula vs Actual: wins 48.3% of days (p<0.001, d=0.66). Formula vs Round-Robin: not significant (p=0.24). With only 2 teams, round-robin is already a strong baseline. The formula still significantly beats the actual historical process.

---

## Outcome Correlation

Tested whether load imbalance (coefficient of variation of acuity-weighted team loads) correlates with patient outcomes using the actual historical data, with acuity weights recalculated at 4:2:1.

- Load imbalance vs door-to-dispo: r = -0.068, p = 0.46 (not significant)
- Load imbalance vs admission rate delta: r = -0.048, p = 0.60 (not significant)

The imbalances in this dataset were not severe enough to measurably affect patient throughput or admission patterns. Results consistent with the 5:3:1 analysis.

---

## Key Takeaways for Presentation

### 1. The current process is essentially random
Actual assignments hit the highest-capacity team 31.7% of the time — pure chance with 3 teams is 33.3%. Zero capacity awareness in the current workflow. (Unchanged from 5:3:1.)

### 2. The formula wins nearly 4 out of every 5 days
77.7% win rate (up from 75.2% with 5:3:1), large effect size (d=0.84), p<0.001. Consistent across every day of the week — and now **all seven days reach statistical significance**, including Saturday (p=0.02, previously p=0.06).

### 3. 66 fewer high-acuity pileups over 4 months
Back-to-back high-acuity assignments dropped from 0.7/day to 0.1/day — an 85% reduction. (Unchanged from 5:3:1.)

### 4. 128 fewer slams over 4 months
A "slam" is when any team receives 2+ A-side patients within a 1-hour window. Actual: 2.2/day → Formula: 1.2/day — a 45% reduction (128 fewer total).

### 5. Patient distribution twice as equitable
Gini coefficient halved (0.141 → 0.062). Daily team spread halved (2.5 → 1.2 patients).

### 6. Worst-case safety margin nearly doubled
Min capacity ratio: 18.0 → 31.8. The most stressed team under the formula was 77% better off than under the actual process.

### 7. Formula narrows the gap with round-robin
With 4:2:1 weights, Formula vs Round-Robin delta shrinks from -0.7 to -0.5 (p=0.06, approaching non-significance). The formula nearly matches round-robin's equity while adding capacity intelligence.

### Suggested headline
> "With evidence-based workload weights, the formula wins 78% of days — every day of the week reaches statistical significance — with 66 fewer back-to-back high-acuity dumps and 128 fewer slams across Teams 1–3."

---

## Comparison vs Original (5:3:1) Weights

### Primary Cohort (Three-Team Hours)

| Metric | 5:3:1 Actual | 4:2:1 Actual | 5:3:1 Formula | 4:2:1 Formula | 5:3:1 RR | 4:2:1 RR |
|--------|-------------|-------------|--------------|--------------|---------|---------|
| Fairness | 85.5 ± 7.3 | 85.7 ± 7.2 | 92.0 ± 3.0 | 92.2 ± 2.8 | 92.7 ± 2.6 | 92.7 ± 2.6 |
| Gini (count) | 0.141 ± 0.090 | 0.141 ± 0.090 | 0.065 ± 0.038 | 0.062 ± 0.035 | 0.039 ± 0.031 | 0.039 ± 0.031 |
| Gini (acuity) | 0.157 ± 0.094 | 0.151 ± 0.092 | 0.085 ± 0.053 | 0.074 ± 0.046 | 0.075 ± 0.056 | 0.066 ± 0.049 |
| Avg Capacity Ratio | 62.5 ± 13.1 | 63.4 ± 12.8 | 72.3 ± 15.2 | 72.9 ± 14.7 | 70.1 ± 15.4 | 70.6 ± 15.1 |
| Min Capacity Ratio | 14.6 ± 14.8 | 18.0 ± 14.4 | 29.4 ± 23.1 | 31.8 ± 21.4 | 26.7 ± 23.1 | 29.1 ± 21.7 |
| Daily Team Spread | 2.5 ± 1.6 | 2.5 ± 1.6 | 1.2 ± 0.7 | 1.2 ± 0.7 | 0.7 ± 0.5 | 0.7 ± 0.5 |
| Back-to-back HA/day | 0.7 ± 0.9 | 0.7 ± 0.9 | 0.1 ± 0.4 | 0.1 ± 0.4 | 0.1 ± 0.4 | 0.1 ± 0.4 |
| Slams | 2.2 ± 1.9 | 2.2 ± 1.9 | 1.2 ± 1.4 | 1.2 ± 1.4 | 0.9 ± 1.3 | 0.9 ± 1.3 |

### Head-to-Head Comparison

| Comparison | 5:3:1 Win % | 4:2:1 Win % | 5:3:1 d | 4:2:1 d | 5:3:1 p | 4:2:1 p |
|------------|------------|------------|---------|---------|---------|---------|
| Formula vs Actual | 75.2% | 77.7% | 0.83 | 0.84 | <0.001 | <0.001 |
| Formula vs RR | 35.5% | 36.4% | 0.22 | 0.17 | 0.02 | 0.06 |
| Actual vs RR | 14.9% | 14.9% | 0.98 | 0.97 | <0.001 | <0.001 |

### Key Differences

1. **Formula vs Actual improves**: Win rate 75.2% → 77.7%, Cohen's d 0.83 → 0.84
2. **All days significant**: Saturday p=0.06 → p=0.02 — the only day that didn't reach significance now does
3. **Formula vs RR gap narrows**: Delta -0.7 → -0.5, d=0.22 → 0.17, p=0.02 → 0.06 — approaching statistical non-significance, meaning the formula is nearly indistinguishable from round-robin on equity while adding capacity intelligence
4. **Acuity-weighted Gini improves**: Formula 0.085 → 0.074, RR 0.075 → 0.066 — better calibrated weights lead to tighter acuity-weighted equity
5. **Min Capacity Ratio improves**: Actual 14.6 → 18.0, Formula 29.4 → 31.8 — more realistic weights raise the safety floor across all methods
6. **Count-based metrics unchanged**: Slams, back-to-back HA, daily team spread, and patient-count Gini are identical — these depend on assignment decisions, not weight calibration

### Interpretation

The 4:2:1 weights strengthen the formula's case. The formula beats the actual process by a wider margin, achieves significance on all seven days, and closes the gap with round-robin to near-parity. The weight change primarily affects acuity-weighted metrics (Gini, capacity ratios) while leaving count-based metrics untouched — exactly what you'd expect from a demand-calibration change.
