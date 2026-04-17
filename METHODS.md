# METHODS

Living methodology log for the Capacity Conscious Triage project (paper + er-triage-app). Each numbered section records *what was done and why* so decisions are reconstructable without digging through chat history or git diffs.

---

## 1. Section 4 (Attention Decay) Revisions — v12 → v13

**Objective.** Upgrade the Decay Benchmark Table from a 5-condition sampler to the full 12-condition matrix from `DECAY_SCHEDULE_BENCHMARK_RESULTS_V2.md`, and rewrite the surrounding prose so the narrative matches what the expanded table now shows. Correct latent data errors in the prior table that were introduced before V2 benchmark values were available.

**Methodology / data.**
- Source of truth: `DECAY_SCHEDULE_BENCHMARK_RESULTS_V2.md` (means of Norm Avg Ratio, Slams/day, Acuity Spread across the 121-day replay).
- The v12 table contained only 4 linear conditions + D7 stepped + Actual. Several cells (notably D3 Slams/day and Acuity Spread, and all D9/D12 metrics) were holdovers from a pre-V2 run and disagreed with V2 numbers.
- Edits were applied via direct XML surgery on `word/document.xml` inside the .docx (zipfile → rewrite → rezip), using the existing D3 row as the row template so every new row inherits authentic run properties (Arial 9pt, bbbbbb borders, proper alignment). This preserved the reference-doc styling without going through Pandoc.
- Script: `/tmp/build_v13.py` (transient; the plan `SECTION4_EDITS_V13_PLAN.md` in the workspace is the durable spec).

**Results.** `Capacity_Conscious_Triage-13.docx` now contains:
- Decay table with 13 data rows (D1–D12 grouped by duration: 0.5x / 0.75x / 1.0x / 1.5x) plus Actual. Group-end rows (D3, D6, D9, D12) carry a thicker `w:sz="12"` bottom border to visually separate duration bands. No row shading — the previous green highlight on D6 was removed.
- A rewritten D6 selection block, split into two paragraphs: the first argues "why linear" from the full shape×duration grid, the second argues "why 0.75x over 0.5x" on clinical defensibility grounds (Purple-zero at 90 min while 95% of Purple patients are still present, vs. D3's 60 min / 98%).
- A condensed normalized-ratio explainer, collapsing the former bulleted paragraph + stepped-threshold enumeration (`00000183` + `00000184`) into a single prose paragraph that keeps the methodological explanation and drops the D7 threshold recitation (which duplicated the Condition Matrix).

**Design rationale.**
- **Show the whole grid, not a curated slice.** The v12 table only showed linear conditions plus a lone stepped reference, which made it impossible for a reader to verify the claim that "linear wins at every duration." The expanded table lets that claim be read off directly.
- **Group by duration, not by shape.** Duration is the axis the decision pivots on once shape is settled; grouping by duration with visual dividers makes the within-band shape comparisons immediate.
- **Two-paragraph D6 justification.** The original single paragraph conflated two independent arguments (shape selection and duration selection). Splitting them mirrors the actual decision tree: pick shape across all 12 conditions first, then pick duration among the 4 linear ones.
- **Drop the threshold enumeration.** D7's thresholds already appear in the Condition Matrix above; repeating them in the normalized-ratio paragraph added length without adding information. Removing the bullet formatting also visually reconciles this paragraph with the surrounding prose, which is not a list.
- **Smart quotes via XML entities.** `&#x2018;`/`&#x2019;`/`&#x201C;`/`&#x201D;` in the written XML to match the typographic convention of the rest of the document without relying on Word auto-correction on reopen.

**Implementation / congruency notes.**
- paraId allocation: reused `000001B2` and `00000183` for the edited paragraphs to preserve any downstream references; new paraIds allocated starting at `0x0272` (48 for the table's new cells + `0x02A2` for the second D6 paragraph) to avoid collision with the existing `0x0271` maximum.
- The `00000184` paragraph was deleted outright (net paragraph delta: 0 — one added in the D6 block, one removed here).
- v12 actually contained 661 `<w:p>` elements, not the 619 estimated in the plan; the count assertion in the plan was a miscount, not a structural error. Net change preserved.
- XML validated post-edit with `xmllint --noout`.

---

## 2. Load-Minutes SD as a Co-Primary Equity Metric

**Objective.** Determine whether load-minutes (acuity-weighted team load integrated over the shift) provides information not already captured by snapshot-based equity metrics (Gini on counts, Gini on acuity, team spread, acuity spread, ratio spread), and — if so — extend it across every benchmark that already tests parameter sensitivity so the paper's narrative is consistent.

**Motivation.** The capacity-ratio formula optimizes at the moment of assignment (an instantaneous decision). The clinical goal, however, is cumulative: distribute workload across teams in proportion to capacity *over the course of a shift.* A metric that integrates load across every minute of the shift bridges that gap. The question was whether such a metric is redundant with what is already reported, partially independent, or measuring something different.

### 2.1 Definition

For each team on each day, load-minutes is the minute-by-minute integral of acuity-weighted load across the cohort's shift window:

```
loadMinutes(team, day) = Σ_{t = shiftStart..shiftEnd} load(team, t)
```

where `load(team, t)` = `Σ_{p: p.team = team, p.assignedAt ≤ t} getDecayedAcuityWeight(p, t, scoringOv)`. The integration uses 1-minute steps. Capacity-minutes is defined analogously (integrating `getEffectiveCapacity` as providers come on and off shift). Normalized load-minutes per team = load-minutes / capacity-minutes, giving a dimensionless quantity directly comparable to the snapshot capacity ratio. Inter-team SD of raw and normalized load-minutes yields `loadMinutesSD` / `normalizedLoadMinutesSD`.

Shift window is anchored to the cohort: three-team cohort = 9 AM to midnight (15 h); two-team cohort = midnight to 9 AM (9 h). Using the shift window rather than "first to last arrival" ensures the tail-decay minutes after the last arrival are counted, and keeps the window from leaking into the adjacent cohort's provider schedule.

### 2.2 Phase 1 implementation (historical replay)

Extended `scripts/historical-replay.ts` to compute per-team `loadMinutesPerTeam`, `capacityMinutesPerTeam`, `normalizedLoadMinutesPerTeam`, `loadMinutesSD`, and `normalizedLoadMinutesSD` for all four arms (actual, formula, formula-no-buffer, round-robin) in the three-team cohort, and emit them in the per-day JSON. Reused the engine's own `getDecayedAcuityWeight` and `getEffectiveCapacity` so measurement semantics match the scoring formula exactly. Load is filtered to patients with `assignedAt ≤ now` inside the integration — otherwise `getDecayedAcuityWeight` returns base weight for patients who haven't arrived yet (an internal quirk where `elapsed ≤ 0` returns base rather than zero).

Run configuration for the primary analysis: `--weights 4:2:1 --decay current --json`, producing `data/historical-replay-runs/historical-replay-results-4-2-1.json`.

### 2.3 Phase 2–4 analysis (correlation, effect size, counterfactual)

Implemented in `scripts/load-minutes-analysis.ts`, reading the JSON and computing:

- Pearson r and Spearman ρ between `loadMinutesSD` / `normalizedLoadMinutesSD` and all existing equity metrics (formula arm, n = 121 three-team days).
- Paired effect sizes (Cohen's d) and two-sided paired t-tests for actual vs. formula-no-buffer across all metrics.
- Counterfactual comparison: formula-no-buffer vs. round-robin (same arrivals, different routing) — isolates routing quality from arrival-timing noise. This is the honest analog of the decomposition originally proposed in Phase 5 of the plan.
- Divergence-day search: days where `loadMinutesSD` ranks top-quartile but `acuitySpread` ranks below the median.

**Results.**
- `loadMinutesSD` vs. `acuitySpread`: r = 0.75, ρ = 0.73 (closest existing metric).
- `loadMinutesSD` vs. `giniAcuity`: r = 0.64.
- `normalizedLoadMinutesSD` vs. `acuitySpread`: r = 0.56. Roughly 69% of normalized-variant variance is not explained by `acuitySpread`.
- Actual vs. Formula effect sizes: raw d = 0.93 (211.1 → 90.6), normalized d = 0.92 (0.0050 → 0.0023). Sits on par with `acuitySpread` (d = 0.92) and `giniAcuity` (d = 0.91).
- Formula vs. Round-Robin counterfactual: d = 0.25 raw, d = 0.32 normalized (both p < 0.01). Modest but significant — the same pattern that existing metrics show.
- Zero divergence days under the quartile/median threshold.

**Phase 3 verdict.** Correlation with the closest existing metric (r = 0.75, 0.56) falls in the 0.50–0.85 "partially independent" band defined in the plan. Load-minutes is a **supplementary** metric: worth showing in the results tables alongside existing equity metrics, not worth its own dedicated results subsection. Written up in `docs/results/LOAD_MINUTES_RESULTS.md`.

### 2.4 Phase 5 redefined: counterfactual over decomposition

The original plan (Phase 5) called for decomposing load-minutes into "assignment load-minutes" (initial weight, attributable to routing) and "decay load-minutes" (the tail, attributable to arrival timing). This was abandoned because the decomposition is mathematically underspecified: load at minute *t* is a single number (`decayedWeight(tier, t − arrival)`), not a sum of an "initial" part and a "decay" part. More importantly, routing and arrival timing interact — a routing decision at minute 10 owns all subsequent minutes for that patient on that team, including the decay tail. "Routing vs. timing" doesn't cleanly map onto "initial vs. decay."

The correct isolation of routing effect is a counterfactual: same arrival stream, same patients, same teams, differing only in routing rule. Round-robin is already simulated alongside formula in `historical-replay.ts`, so `formulaLoadMinutesSD − roundRobinLoadMinutesSD` is free. This is what was reported.

### 2.5 Extension to decay and buffer benchmarks

Once load-minutes was promoted to a co-primary metric in paper v22, the decay and buffer benchmark tables (which previously omitted it) needed the same rows to keep the paper internally consistent.

**Buffer benchmark** (`scripts/buffer-duration-benchmark.ts`, 14 conditions = 12 buffered + no-buffer + actual). Direct extension: added `loadMinutesSD` and `normalizedLoadMinutesSD` to `DayResult`, computed per-day via the same integration helper used in historical-replay, added to the `METRICS` array so the mean/SD/range output flows automatically. Result: load-minutes varies by **2.8%** across the 12 buffered conditions (80.3 – 82.5), normalized by 3.3%. Both sit inside the paper's established "0.2 to 3.5% stable band" — the narrative of parameter robustness holds across 9/9 metrics for the buffer section with no caveats.

**Decay benchmark** (`scripts/decay-schedule-benchmark.ts`, 13 conditions). First-pass extension produced an 87.9% variation in `loadMinutesSD` across the 12 formula conditions, which initially looked like catastrophic parameter sensitivity. It was not. Investigation revealed a *methodological* cause: load-minutes was being integrated using each condition's own decay schedule, so short-decay conditions mechanically produced smaller integrands (load clears off teams faster) and long-decay conditions produced larger ones. The SD scaled with the integrand magnitude, not with routing quality. Capacity-normalization did not correct for it because decay changes the load numerator without changing the capacity denominator.

### 2.6 Routing decay vs. measurement decay — decoupling

**Design decision.** Decouple the two roles of the decay schedule, mirroring how the paper already decouples routing weights (4:2:1) from measurement weights (5:4:3):

- **Routing decay** varies across D1–D12 as before. This is the parameter under test — it drives the formula's assignment decisions.
- **Measurement decay** is held constant at D6 (0.75× linear, 4:2:1) across all 13 conditions. This is the common yardstick used to compute load-minutes *after* the replay is complete.

Implementation added a module-level `MEASUREMENT_OV: ScoringOverrides` constant built from `buildDecaySchedule(ROUTING_WEIGHTS, 0.75, 'linear')` and 4:2:1 weights, used as a second call into `computeLoadMinutesSDs`. Two new fields appear per day: `loadMinutesSDFixed` / `normalizedLoadMinutesSDFixed`. Both variants are retained in the output (metric rows `LM SD (routing decay)` and `LM SD (D6 meas.)`) for transparency, so a reader can see that the 87.9% artifact was a scale effect rather than a routing effect.

**Results after decoupling.**
- Raw load-minutes SD variation across 12 formula conditions: 87.9% → **24.0%** (72.6 – 92.4).
- Normalized: 86.5% → **21.6%** (0.0018 – 0.0023).
- Remaining variation sits alongside Gini count (34.7%) and acuity spread (14.4%) in the same range as other equity metrics — indicating decay choice *does* affect routing quality modestly, just not catastrophically.
- D6 row (paper's chosen condition) is identical in both columns by construction: 80.67 / 0.00203.
- Actual (A1) is also identical in both columns because the production `ACUITY_DECAY` in `src/constants.ts` (single endpoints at 180/180/90 min to 0, with 4:2:1 weights) is mathematically equivalent to D6 linear — so "routing-matched" and "D6-measurement" reduce to the same integration for A1. No reassumption or re-run was needed for the Actual baseline; the equivalence is a consequence of the production defaults already being D6.

**Design rationale.**
- **Analogy to weights.** The paper already uses routing weights (the 4:2:1 ratio the formula treats as "what matters for routing") separately from measurement weights (the 5:4:3 ratio used to score outcome equity). Applying the same discipline to decay keeps the paper internally consistent and avoids conflating "what the formula optimizes for" with "what the reader measures outcomes on."
- **Why D6 as the yardstick.** D6 is the paper's chosen production condition. Using any other schedule as the measurement constant would introduce a second arbitrary choice. Using D6 makes the measurement view match what the deployed tool will see in practice.
- **Keep both columns.** Reporting routing-matched alongside fixed-measurement lets a reviewer confirm that the scale effect is what it looks like (magnitude of integrands moving with decay duration) rather than a hidden routing-quality issue.
- **Buffer benchmark left alone.** Buffers do not change the decay schedule, so no decoupling is necessary there; the 2.8% / 3.3% variation is already routing-attributable.

### 2.7 Artifacts

- Code: `scripts/historical-replay.ts` (per-arm load-minutes for the main replay), `scripts/load-minutes-analysis.ts` (correlation + effect-size + counterfactual analysis), `scripts/decay-schedule-benchmark.ts` (dual routing/measurement variants), `scripts/buffer-duration-benchmark.ts` (single variant, no decoupling needed).
- Results: `docs/results/LOAD_MINUTES_RESULTS.md` (primary analysis), `docs/results/DECAY_SCHEDULE_BENCHMARK_RESULTS_V2.md` (four new rows covering both variants), `docs/results/BUFFER_DURATION_BENCHMARK_RESULTS.md` (two new rows).
- JSON: `data/historical-replay-runs/historical-replay-results-4-2-1.json`, `scripts/decay-schedule-benchmark-results.json`, `scripts/buffer-duration-benchmark-results.json` — each day's entry includes all load-minutes fields for downstream re-analysis without re-simulation.

### 2.8 Congruency notes

- `getDecayedAcuityWeight` returns base weight when `elapsed ≤ 0` (a quirk of the engine that doesn't matter during live recommendation because `now` is always ≥ `assignedAt` there). When integrating over a historical window, patients with `assignedAt > now` must be filtered before summing; otherwise future patients contribute their initial weight to past minutes. This is easy to miss and was the first bug in the initial implementation.
- Capacity integration (`getEffectiveCapacity`) must reuse the replay's own `toProviders(getProvidersForShift(day, hourOfDay))` per minute, because providers come on and off shift within the 15-hour window. A single snapshot-at-midpoint capacity would bias normalization for days where staffing changes mid-shift.
- Analyses should always use `--decay current --weights 4:2:1` for load-minutes runs. Any other combination changes both what the formula routes on and what the yardstick measures, and then no comparison to the paper's primary numbers is valid.

---

## 3. Walkthrough Prototype — Slide Deck Design & Visual Language

**Objective.** Build a standalone HTML walkthrough (`walkthrough-prototype.html`) that teaches the Capacity Conscious Triage formula to clinicians unfamiliar with the system. The walkthrough presents the core equation — Strength ÷ Load = Capacity — as a progressive, slide-based narrative. Each slide fills the viewport with no scrolling required. The prototype is separate from the React app; it is a single self-contained HTML file with inline CSS and JS, suitable for embedding in presentations or sharing as a link.

### 3.1 Slide Architecture

The walkthrough uses a phase-based navigation system within a single logical step (`stepIntro`). Seven phases (0–6) map to seven slide-rendering functions:

| Phase | Function | Purpose |
|-------|----------|---------|
| 0 | `slideIntro()` | Title slide |
| 1 | `slideProblem1()` | What's wrong with round-robin — team cards showing unequal rosters |
| 2 | `slideProblem2()` | Round-robin ignores patient acuity — color-coded patient examples |
| 3 | `slideFormula()` | Introduce the core formula: Strength ÷ Load = Capacity |
| 4 | `slideStrength()` | Provider role weights + three team roster cards with weighted totals |
| 5 | `slideLoad()` | Patient acuity weights + three patient cards with tier colors |
| 6 | `slideCapacity()` | Two worked division examples using team/patient data from prior slides |

Navigation: left/right arrows or keyboard arrows. Header shows progress dots and an eyebrow label that changes per slide.

### 3.2 Visual Design System

**Typography.** Two-font system: EB Garamond (serif) for headlines, hero numbers, and the formula; Inter (sans-serif) for body text, labels, and UI elements. This mirrors the React app's typography and the paper's typographic tone — clinical authority (serif) paired with modern clarity (sans-serif).

**Color system.** Semantic colors carry meaning across all slides:
- **Strength green** (#2e7d32) — provider capacity, the numerator
- **Load red** (#c0392b) — patient workload, the denominator
- **Capacity blue** (#1a3a7b) — the result, used for the capacity score
- **Team colors**: Team 1 teal (#1f8a8a), Team 2 orange (#d97706), Team 3 slate (#4a5568)
- **Acuity tiers**: Red (#c0392b) = Tier 1, Yellow (#b8a000) = Tier 2, Purple (#7b1fa2) = Tier 3

Team 2's color was changed from the app's default purple (#7b3fa0) to orange (#d97706) to avoid collision with purple acuity on the Load and Problem slides.

**Recurring patterns:**
- `.problem-eyebrow`: uppercase tracked label flanked by thin horizontal rules — used as a section identifier above each slide's headline
- `.formula-mini`: miniaturized version of the formula at slide bottom for persistent reference
- `.callout-card` / `.chart-wrap`: white surface cards with 1px border and 12px radius — the primary container for diagrams and data
- Dotted leaders (`.dots`): flex-grow dotted border connecting role names to their numeric scores, used on Strength and Load reference tables

### 3.3 Round-Robin Diagram (Phase 1)

**Design.** SVG triangle diagram with three team boxes and curved/straight arrows forming a clockwise rotation pattern. The arrows represent the round-robin assignment sequence (Team 1 → Team 2 → Team 3 → Team 1).

**Arrow orientation decision.** Arrows tilt "in to out" — meaning each arrow exits its source team at an outward angle rather than following the triangle's edge. This was iterated with reference screenshots:
- Arrow a1 (Team 1 → Team 2): tilts down-right
- Arrow a2 (Team 2 → Team 3): horizontal leftward
- Arrow a3 (Team 3 → Team 1): tilts up-right

Arrows are ~40 SVG units long with `<marker>` arrowheads using `orient="auto-start-reverse"`. The diagram container is 360×280px, tight enough to sit within a callout card without dominating the slide.

### 3.4 Strength Slide (Phase 4)

**Structure:** Eyebrow "Strength" → headline "Weigh each provider according to their role" → subtitle "The team's strength is the sum of its provider weights" → role reference table → three team roster cards → miniaturized formula at bottom.

**Role reference table.** Compact two-column table (Role / Weight) with values sourced from the Delphi survey averages documented in CLAUDE.md: Attending 20, Senior Resident (PGY 3-4) 15.2, PA 11.6, Junior Resident (PGY-2) 10.9, Intern (PGY-1) 6.7, Rotator 2.3. The reference table uses the same dotted-leader pattern as the team cards for visual consistency.

**Team roster cards (`tsCard` helper).** Each card shows:
- Team label header
- Provider roles with dotted leaders to numeric weights
- Shaded footer in team color with white text showing the Strength total

The shaded footer design was iterated: initially plain text, then team-colored text, finally a full-width color band with white text and rounded bottom corners (`border-radius: 0 0 10px 10px`). This creates a strong visual anchor tying the numeric total to its team identity.

**Card data:**
- Team 1: Attending (20) + PGY4 (15.2) + PGY2 (10.9) + PA (11.6) = 57.7
- Team 2: Attending (20) + PA (11.6) + Intern (6.7) = 38.3
- Team 3: Attending (20) + Rotator (2.3) = 22.3

These deliberately show unequal team compositions to set up why simple round-robin fails — the Capacity slide will show how the formula accounts for these differences.

### 3.5 Load Slide (Phase 5)

**Structure:** Eyebrow "Load" → headline "Weigh each patient by acuity" → subtitle → acuity reference table → three patient example cards → miniaturized formula at bottom.

**Acuity reference table.** Three columns: Acuity Tier / Initial Weight / Clinical Examples. Tier names are color-coded to match the acuity color system. Clinical examples:
- Red (Tier 1, weight 4.0): Cardiac arrest, intubation, anaphylaxis
- Yellow (Tier 2, weight 2.0): Chest pain, stroke alert, sepsis
- Purple (Tier 3, weight 1.0): Complex but stable, requires closer monitoring

**Patient cards (`pcard` helper).** Compact cards with patient label, clinical example text, and a color-shaded weight footer matching the tier color. The footer pattern mirrors the Strength slide's team card footers for cross-slide visual congruence — both use the same structural pattern (full-width color band, white text, rounded bottom corners) but with different semantic colors (team colors vs. acuity colors).

**Yellow color decision.** Initial yellow (#a16207) read as amber/gold. Changed to #b8a000, a more pure yellow that maintains readability on white backgrounds while being distinguishable from the orange used for Team 2.

### 3.6 Capacity Slide (Phase 6) — In Progress

**Structure:** Eyebrow "Capacity" → headline "Divide" → subtitle "Strength of its providers ÷ Load of its patients" → two callout cards each showing a worked example of the division.

**Layout approach.** Each callout card contains a CSS Grid row (`.cap-row`) with five columns:

```
[Team roster card + Strength total] [÷] [Patient mini-bars + Load total] [=] [Capacity score]
```

Grid template: `180px 28px 120px 28px 100px`. The operator symbols (÷, =) are centered in narrow columns. Each term (Strength, Load, Capacity) displays as a stacked pair: large EB Garamond number + small uppercase Inter label, colored by semantic meaning (green/red/blue).

**Worked examples:**
- Team 1: Strength 57.7 ÷ Load 5.0 (Red 4.0 + Purple 1.0) = Capacity 11.5
- Team 2: Strength 38.3 ÷ Load 4.0 (Yellow 2.0 + Yellow 2.0) = Capacity 9.6

**Patient mini-bars.** Proportional-height colored rectangles representing patients: Red = 64px, Yellow = 32px, Purple = 16px. Width 34px with 4px border-radius and dark border.

**Open design question.** The team roster card's height significantly exceeds the patient mini-bars' height, creating asymmetric whitespace. Five approaches were proposed (A: strip roster to just totals; B: scale patient bars; C: two-tier layout; D: fraction layout; E: numbers-as-hero with de-emphasized cards). Resolution pending user selection.

### 3.7 Design Rationale — Cross-Slide Congruence

**Principle: visual grammar teaches before words do.** Each slide introduces one term of the formula, and the visual language is designed so patterns repeat and rhyme:

- Shaded footers on both team cards (Strength) and patient cards (Load) use the same structural pattern, teaching the viewer to read "colored band = this thing's numeric contribution"
- The dotted-leader pattern appears on both the reference tables and the roster cards, establishing "role → score" as a consistent visual idiom
- The miniaturized formula at the bottom of each slide tracks which term is currently being taught (bold) vs. yet to come (muted)
- Color semantics are introduced on the Formula slide and then carried through consistently — green for provider-side, red for patient-side, blue for the result

**Principle: show the data that motivates the formula.** The Strength and Capacity slides deliberately use asymmetric team compositions (57.7 vs. 38.3 vs. 22.3) to make the case that equal rotation is unfair. The Capacity slide's two worked examples are chosen so Team 1 has higher strength but also higher load, demonstrating that the formula's output is not simply "biggest team wins."

---
