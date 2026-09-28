# Historical Replay Benchmark — Results Summary

> **Note added 2026-09-28 (time zone).** The figures in this document come from a run that read the census arrival times in the machine's America/New_York time zone instead of the workbook's wall-clock time: arrivals from 2026-03-08 onward (daylight time) were read one hour late (earlier arrivals were read correctly), giving 1,541 three-team and 417 two-team encounters instead of 1,540 and 418. Day-of-week labels in this run are also one day early (December 1, 2025, a Monday, is labeled Sunday), so any weekday breakdown is shifted by a day. The values below are unchanged. See METHODS.md section 10.

## What This Is

A three-way comparison using **real patient arrivals** (1,958 A-side encounters, Dec 2025–Mar 2026) and **real provider schedules** (18 weekly schedule files covering 122 days) to evaluate the triage app's formula against historical assignments and round-robin.

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
| Fairness (0–100) | 85.5 ± 7.3 | 92.0 ± 3.0 | 92.7 ± 2.6 |
| Gini (patient count) | 0.141 ± 0.090 | 0.065 ± 0.038 | 0.039 ± 0.031 |
| Gini (acuity-weighted) | 0.157 ± 0.094 | 0.085 ± 0.053 | 0.075 ± 0.056 |
| Avg Capacity Ratio | 62.5 ± 13.1 | 72.3 ± 15.2 | 70.1 ± 15.4 |
| Min Capacity Ratio | 14.6 ± 14.8 | 29.4 ± 23.1 | 26.7 ± 23.1 |
| Daily Team Spread | 2.5 ± 1.6 | 1.2 ± 0.7 | 0.7 ± 0.5 |
| Acuity-Weighted Spread | 7.3 ± 4.2 | 3.9 ± 2.1 | 3.4 ± 2.1 |
| Back-to-back HA/day | 0.7 ± 0.9 | 0.1 ± 0.4 | 0.1 ± 0.4 |
| Slams (2+ pts/team/hr) | 2.2 ± 1.9 | 1.2 ± 1.4 | 0.9 ± 1.3 |
| Overwhelm Events/day | 0.0 | 0.0 | 0.0 |

### Fairness Sub-Scores (mean ± SD per day, 0–1 scale)

| Sub-Score | Weight | Actual | Formula | Round-Robin |
|-----------|--------|--------|---------|-------------|
| Capacity Balance | 25% | 0.715 ± 0.174 | 0.841 ± 0.082 | 0.855 ± 0.069 |
| Acuity Balance | 15% | 0.700 ± 0.176 | 0.835 ± 0.103 | 0.852 ± 0.109 |
| Overwhelm Avoidance | 30% | 1.000 ± 0.000 | 1.000 ± 0.000 | 1.000 ± 0.000 |
| Min Ratio Score | 15% | 1.000 ± 0.000 | 1.000 ± 0.000 | 1.000 ± 0.000 |
| Stress Equity | 15% | 0.810 ± 0.102 | 0.897 ± 0.055 | 0.903 ± 0.059 |

The formula's advantage is concentrated in three sub-scores: **Capacity Balance** (+0.126 vs Actual), **Acuity Balance** (+0.135), and **Stress Equity** (+0.087). Overwhelm Avoidance and Min Ratio Score are perfect (1.0) for all methods — no team ever hit the overwhelm threshold (3.75) in this dataset, so the composite differences are driven entirely by distribution equity.

### Head-to-Head (Fairness Score)

| Comparison | Win % | Delta | Cohen's d | p-value |
|------------|-------|-------|-----------|---------|
| Formula vs Actual | 75.2% | +6.5 | 0.83 (large) | <0.001 |
| Formula vs Round-Robin | 35.5% | -0.7 | 0.22 (small) | 0.02 |
| Actual vs Round-Robin | 14.9% | -7.2 | 0.98 (large) | <0.001 |

- Formula Agreement with Actual: 33.2% (the formula would have changed 2/3 of assignments)
- Actual picked the highest-capacity team: 31.7% (essentially random — coin-flip odds with 3 teams are 33.3%)

### Day-of-Week Breakdown (Formula vs Actual)

| Day | Days | Formula Win % | Delta | Cohen's d | p-value |
|-----|------|---------------|-------|-----------|---------|
| Monday | 18 | 67% | +5.4 | 0.71 | 0.009 |
| Tuesday | 17 | 76% | +6.8 | 0.80 | 0.005 |
| Wednesday | 17 | 76% | +6.7 | 0.85 | 0.004 |
| Thursday | 17 | 71% | +6.3 | 0.87 | 0.003 |
| Friday | 17 | 82% | +6.9 | 0.98 | 0.001 |
| Saturday | 17 | 65% | +2.4 | 0.50 | 0.06 |
| Sunday | 18 | 89% | +10.8 | 1.25 | <0.001 |

Formula wins every day of the week. Saturday is weakest (p=0.06), Sunday is strongest (89% win rate, d=1.25).

---

## Secondary Cohort: Two-Team Hours (Midnight–9A)

**417 encounters across 120 days.** Teams 1 and 2 only (Team 3 closed).

| Metric | Actual | Formula | Round-Robin |
|--------|--------|---------|-------------|
| Fairness (0–100) | 79.2 ± 14.2 | 88.5 ± 12.1 | 88.8 ± 12.1 |
| Gini (patient count) | 0.220 ± 0.189 | 0.122 ± 0.159 | 0.115 ± 0.160 |
| Slams (2+ pts/team/hr) | 0.4 ± 0.7 | 0.1 ± 0.5 | 0.1 ± 0.4 |

Formula vs Actual: wins 48.3% of days (p<0.001, d=0.66). Formula vs Round-Robin: not significant (p=0.25). With only 2 teams, round-robin is already a strong baseline (just alternating). The formula still significantly beats the actual historical process.

---

## Outcome Correlation

Tested whether load imbalance (coefficient of variation of acuity-weighted team loads) correlates with patient outcomes using the actual historical data.

- Load imbalance vs door-to-dispo: r = -0.103, p = 0.26 (not significant)
- Load imbalance vs admission rate delta: r = -0.016, p = 0.86 (not significant)

The imbalances in this dataset were not severe enough to measurably affect patient throughput or admission patterns.

---

## Key Takeaways for Presentation

### 1. The current process is essentially random
Actual assignments hit the highest-capacity team 31.7% of the time — pure chance with 3 teams is 33.3%. There is zero capacity awareness in the current workflow.

### 2. The formula wins 3 out of every 4 days
75.2% win rate, large effect size (d=0.83), p<0.001. Consistent across every day of the week.

### 3. 66 fewer high-acuity pileups over 4 months
Back-to-back high-acuity assignments (same team, both ESI 1-2, within 30 min) dropped from 0.7/day to 0.1/day — an 85% reduction.

### 4. 129 fewer slams over 4 months
A "slam" is when any team receives 2+ A-side patients within a 1-hour window. Actual: 2.2/day → Formula: 1.2/day — a 45% reduction (129 fewer total). This is the metric providers feel most viscerally: getting hit with back-to-back patients before you've even started working up the first one.

### 5. Patient distribution twice as equitable
Gini coefficient halved (0.141 → 0.065). Daily team spread halved (2.5 → 1.2 patients).

### 6. Worst-case safety margin doubled
Min capacity ratio: 14.6 → 29.4. The most stressed team under the formula was still 2x better off than the most stressed team under the actual process.

### 7. Formula matches round-robin equity while adding capacity intelligence
Round-robin edges the formula slightly on pure count distribution (Gini 0.039 vs 0.065), but RR is blind to capacity — it will assign a critical patient to a team with one intern just as readily as a team with two attendings. The formula brings near-RR equity plus capacity-aware routing.

### Suggested headline
> "If we had been using this app during daytime shifts over the last 4 months for A-side patient assignment, fairness would have been 6.5 points higher on average, with 66 fewer back-to-back high-acuity dumps and 129 fewer slams across Teams 1–3."

---

## Methodology Notes

- All providers treated as `active` status (no in_procedure/off_floor simulation) — conservative assumption that slightly understates the formula's advantage since it can't react to status changes
- ESI distribution in real data: ESI 1 = 2.1%, ESI 2 = 75.8%, ESI 3+ = 22.1% (heavily ESI 2, unlike the synthetic 25/50/25 split)
- Cohort boundaries are fixed: 9A–midnight (3-team), midnight–9A (2-team)
- Provider rosters change dynamically each hour via schedule data
- Formula and Round-Robin modes include buffers; Actual mode does not (buffers didn't exist in the real workflow)

## How to Reproduce

```bash
cd er-triage-app
npx tsx scripts/historical-replay.ts                    # console report
npx tsx scripts/historical-replay.ts --outcomes         # + outcome correlation
npx tsx scripts/historical-replay.ts --verbose          # + per-date detail
npx tsx scripts/historical-replay.ts --json --outcomes  # + JSON export
```

## Data Sources

- Census: `provider data 12:25 - 3:26/Aside data Dec 2025–Mar 2026.xlsx` (sheet: "All A-sides + trauma lvl 1&2's")
- Schedules: 18 files across `provider data 12:25 - 3:26/schedules/` and `provider data 12:25 - 3:26/initially missing schedules/`
- JSON export: `historical-replay-results.json` (per-date results, no PHI)
