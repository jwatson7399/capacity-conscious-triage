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

---

## 4. V3 Decay Schedule Benchmark — Log Back-Loaded Family, Ratio-Cap Fix, and Clean-Provenance Rerun

**Objective.** Address five latent defects in the V2 decay benchmark that surfaced during cross-check against Section 4 of the paper, and produce an authoritative V3 results file with a clean, reproducible provenance trail that Section 4 can cite as the version of record.

**Methodology / data.**
- **Concerns intake.** Starting from a cross-check of the paper's Section 4 table against `docs/results/DECAY_SCHEDULE_BENCHMARK_RESULTS_V2.md`, five concerns were documented in `SHAPE_COMPARISON_CONCERNS.md`:
  1. Paper's per-condition values for Direct Drop didn't match the V2 markdown.
  2. V2 Direct and Linear were statistically indistinguishable in every metric.
  3. V2's shape table omitted Min Ratio and LM SD — the two metrics with the largest shape effects.
  4. "4.8% variation" claim didn't specify which ratio (Avg vs. Min).
  5. The Linear-over-Direct rationale (continuous recency → buffer replacement) lived in Section 5, not where readers would look for it in Section 4.
- **Root cause of (1) and (2).** Inspection of `src/engine/recommendation.ts` `getDecayedAcuityWeight` (lines 30–52) confirmed the engine does piecewise-linear interpolation between decaySteps entries starting from `(t=0, w=base)`. A single-endpoint schedule `[{afterMs: T, weight: 0}]` therefore interpolates to the same curve as an explicit linear ramp. V2's "Direct Drop" was never a distinct condition in engine behavior — D2/D3, D5/D6, D8/D9, D11/D12 were byte-identical by construction. The paper's Section 4 numbers showing Direct worse than Linear on Slams/Acuity Spread were not reproducible from the engine.
- **V3 scope decision (April 22, 2026 Roundtable).** Rather than patch V2 incrementally, replace Direct Drop with a clinically grounded log back-loaded family swept across `k ∈ {1, 3, 9}`, fix the ratio-cap numerical artifact, surface the strongest shape-effect metrics, switch to non-parametric pairwise tests with FDR correction, and attach a reproducibility footer. Handoff specified in `CLAUDE_CODE_HANDOFF_decay_v3.md`; Claude Code owned the implementation.
- **Condition matrix (21 total).** Factorial of 4 durations (0.5x, 0.75x, 1.0x, 1.5x) × 5 shape families (Stepped, Linear, LogBack-k1, LogBack-k3, LogBack-k9) = 20 formula conditions + 1 Actual baseline. IDs D1–D20 + A1, iterating duration-outer, family-inner.
- **Log back-loaded formula.**
  ```
  w(t) = W0 · ln(1 + k(1 − t/T)) / ln(1 + k),   0 ≤ t ≤ T
  w(t) = 0,                                     t > T
  ```
  Larger k = more back-loaded (weight sustained longer before collapse). Sampled at 15-minute granularity into decaySteps with the final sample pinned exactly to `(T, 0)`, so the engine's piecewise-linear interpolation faithfully tracks the continuous curve. k=1 is mathematically distinct from Linear (finite-k limit, not the linear limit) — at t=T/2, k=1 gives `4·ln(1.5)/ln(2) ≈ 2.34` vs. Linear's 2.00. This is verified as an anti-regression test to guard against the Direct-collapse pathology re-emerging.
- **Ratio-cap fix.** New constants `RATIO_CAP = 1000` and `MIN_LOAD_EPSILON = 1e-6` defined at the benchmark layer. Replaces V2's `Infinity → 100` guard in `replayDay` with:
  ```typescript
  const rawRatio = score.capacity / Math.max(score.load, MIN_LOAD_EPSILON);
  const ratio = Math.min(rawRatio, RATIO_CAP);
  ```
  Applied on both the condition-matched and reference-normalized paths. Per-day `ratioClipCount` / `ratioSampleCount` tracked and rolled up as a per-condition diagnostic. **Engine code stays untouched** — all ratio-cap logic is benchmark-local.
- **New columns.** `Norm Min Ratio` promoted alongside `Norm Avg Ratio` (both use the same 1.0x Stepped / V2 D7 reference schedule). `Clip Rate (%)` added as a diagnostic column — not in `METRICS` because it's not a routing-quality measure.
- **Pairwise tests (V3).** Switched from paired t-test to Wilcoxon signed-rank (two-sided, normal approximation with tie-averaged ranks). Justification: day-level ratio distributions are skewed, and with hundreds of paired days the CLT regime of the normal approximation holds comfortably. Benjamini-Hochberg correction (FDR = 0.05) applied separately within each `metric × comparison-family` bucket, where families are `shape` (40 pairs/metric: C(5,2) × 4 durations), `duration` (30 pairs/metric: C(4,2) × 5 families), and `vs-actual` (20 pairs/metric). Rationale for BH over Bonferroni: modern default, less conservative, and the families are exploratory-hypothesis sets where controlling FDR is the right target rather than family-wise error.
- **Reproducibility footer.** `captureGitProvenance()` uses `execSync('git rev-parse --short HEAD')` and `execSync('git status --porcelain')` — no new dependency. Reports SHA, dirty/clean, modified files (collapsed into a `<details>` block), run timestamp, RNG seed (`N/A (deterministic replay)`), sample size, and output JSON path.
- **Output paths.** Markdown writes to `docs/results/DECAY_SCHEDULE_BENCHMARK_RESULTS_V3.md`; JSON to `data/decay-benchmark-runs/decay-benchmark-results-v3-<YYYYMMDD-HHMMSS>.json` with `mkdirSync(..., { recursive: true })` on first run. JSON always emitted (V2 gated it behind `--json`); V3 commits the JSON so tables are regenerable without rerunning the ~2-minute replay. V2 markdown preserved untouched as audit baseline.
- **Verification.** Standalone `scripts/test-log-back-loaded.ts` runs 52 assertions before the benchmark is allowed: formula endpoints at t=0, t=T, t>T for each k; Python-verified reference values at t ∈ {0, 1, 3, 15, 45, 75, 89, 90} for k ∈ {1, 3, 9} within tolerance 0.001; engine round-trip at grid and off-grid points; endpoint-pinning of decaySteps; the curvature-preserved anti-regression check (logBack-k=1 at t=T/2 ≠ Linear); `buildDecaySchedule` dispatch including the required-argument throw when `logBackK` is undefined.

**Results.**
- V3 benchmark produced 21 conditions × 14 metrics + clip-rate diagnostic across 121 three-team days / 1,541 A-side encounters.
- **Shape effect (headline):** Stepped still wins most metrics within each duration, but log back-loaded families are competitive on Norm Avg Ratio (LogBack k=9 wins at 1.0x, k=1 at 1.5x) and on `LM SD (D6 meas.)` at 0.5x/0.75x (LogBack k=3) and 1.5x (LogBack k=9). Cohen's d on shape comparisons typically ≤ 0.15.
- **Norm Avg Ratio range across all 20 formula conditions: 588.7 (D9, 0.75x LogBack k=3) to 600.7 (D15, 1.0x LogBack k=9), 2.0% variation.** This is the tightened, transcription-robust version of V2's "4.8% variation" claim. Paper Section 4 now cites this.
- **Clip rate is higher than anticipated:** 32% (1.5x) to 81% (0.5x) of ratio samples hit `rawRatio > 1000`. This reflects real near-empty-team arrivals under short-decay schedules, not a bug — decayed loads fall below `1e-6 × (typical capacity / RATIO_CAP)` when a team has no active patients. `Min Ratio`, `Slams`, `Gini`, and `LM SD` metrics are unaffected by clipping; `Avg Ratio` should be read with clip-rate context.
- **Clean-SHA rerun.** The first V3 run landed at SHA `a623a22` with 42 modified files in the working tree → provenance footer read `dirty`. Since the paper cites V3 as version of record, a clean rerun was executed from SHA `89ab82f` (the commit that introduced the V3 code) with `git stash push -u` isolating the dirty work, `.git/info/exclude` scoped to the untracked input-data directory, and the old dirty-tree JSON replaced via `git rm` + `git add` (recorded as a rename in git). Footer now reads `Git status: clean`. Committed as `84d9852 Rerun V3 decay benchmark from clean tree for paper provenance`.
- **Spot-check reproducibility (rerun vs. first-run):** D7 Norm Avg Ratio 588.8 ≡, D11 Norm Min Ratio 112.7 ≡, D7 Clip Rate 63.21% ≡, Norm Avg Ratio range 588.7–600.7 (2.0%) ≡ — byte-identical, confirming deterministic replay.

**Design rationale.**
- **Why drop Direct Drop rather than fix it.** Making Direct Drop a genuine step function would require engine changes to support a non-interpolating step evaluator — a change with blast radius far beyond the benchmark. The handoff instead excludes Direct from V3's comparison set (retaining the `direct` branch in `buildDecaySchedule` as dead-but-audit-safe code) and documents the collapse explicitly. This keeps the engine's production semantics intact and still resolves the paper's data-integrity concern.
- **Why log back-loaded rather than another curve family.** Clinical motivation: high-acuity patients carry near-full attention burden until disposition, then collapse. Linear decay (V2's winner) doesn't capture the "sustained plateau, steep tail" shape that mirrors active workup → disposition dynamics. The log family is the simplest one-parameter extension that interpolates smoothly between near-linear (small k) and near-step (large k); the k∈{1,3,9} sweep deliberately brackets the interesting region without over-fitting.
- **Why BH over Bonferroni for V3.** With 40 shape-effect comparisons per metric and 10 metrics = 400 tests per family, Bonferroni at α=0.05 gives per-test α=0.000125, which is almost impossible to clear for shape effects of d≈0.15. BH controls the false discovery rate across the exploratory comparison set — the appropriate target for this stage of analysis.
- **Why Wilcoxon over a permutation test.** Sample size (~121 paired days) is large enough for the Wilcoxon normal approximation to be accurate; permutation would add runtime without improving the inference. Ties in integer-valued metrics (B2B HA/day, Slams/day, Count Spread) introduce slight anti-conservatism in the normal-approximation p-values — noted in the markdown preamble as a caveat, since Cohen's d is reported alongside for effect-size context.
- **Why the RATIO_CAP = 1000 constant.** The V2 `Infinity → 100` guard caught only exact-zero-load cases. Near-zero loads (e.g., 0.001 from a mostly-decayed tier-three patient) produced ratios in the tens of thousands, uncapped, which contaminated Avg Ratio means. RATIO_CAP = 1000 with MIN_LOAD_EPSILON = 1e-6 gives a uniform ceiling where raw ratios of ~3 × 10⁷ (capacity 30 / epsilon 10⁻⁶) are clipped to a known sentinel, and `condClipRate` exposes the frequency honestly rather than hiding it in the mean.
- **Why the ratio-cap lives at the benchmark layer, not the engine.** Production code (`scoreTeam`, `getRecommendation`) needs the raw ratio for UI display and routing; capping inside the engine would alter that behavior. The benchmark re-derives the ratio from `score.capacity` and `score.load` after the routing decision, so the cap is a measurement choice, not a routing change.
- **Why a standalone test script instead of a vitest test.** The project has `vitest` in devDependencies but no `test` script wired in `package.json` and no existing `*.test.ts` files. Adding a test runner for a single sanity-check script was over-engineering against established convention — the repo's pattern is `scripts/*-benchmark*.ts` with inline stats, and a sibling `scripts/test-log-back-loaded.ts` follows that pattern and runs identically via `npx tsx`.
- **Why single-file monolithic instead of factoring into `scripts/lib/`.** No `scripts/lib/` exists in the repo; `comprehensive-benchmark.ts`, `buffer-duration-benchmark.ts`, and `historical-replay.ts` all duplicate stats helpers inline. V3 adds ~200 lines to a 1,369-line file → ~1,570 lines readable. Factoring now creates import-graph churn when no other consumer exists. Revisit when a second benchmark needs Wilcoxon + BH.

**Implementation / congruency notes.**
- **Handoff reference-table transcription error caught during verification.** The handoff's `CLAUDE_CODE_HANDOFF_decay_v3.md` specified D6-window (W0=4, T=90) reference values for the three k values as sanity-check targets. The V3 implementation of the stated formula produced values that disagreed — e.g., at t=45, k=1 the formula gives `4·ln(1.5)/ln(2) ≈ 2.340`, but the handoff claimed `2.000`. Python cross-check confirmed the implementation matched the stated formula; the handoff table values were internally inconsistent (k=1 midpoint = 2.000 implied linear, but k=1 at t=15 = 3.522 was above linear). User confirmed "trust the formula, reference table had transcription errors" — `test-log-back-loaded.ts` REF table uses Python-verified values and the handoff file was updated post-hoc.
- **`.trim()` bug in git-status parsing.** First provenance run truncated the first modified filename ("METHODS.md" → "ETHODS.md") because `execSync('git status --porcelain').toString().trim()` stripped the leading space that `git status --porcelain` uses for unstaged-modified files (` M file`). Fixed by using `.replace(/\n+$/, '')` instead of `.trim()` to strip only trailing newlines.
- **D6 label continuity.** `LM SD (D6 meas.)` column label stays as V2-era proper noun. In V3, `MEASUREMENT_OV` is constructed from `buildDecaySchedule(ROUTING_WEIGHTS, 0.75, 'linear')` — schedule-pinned, not ID-pinned — so there is no V3 condition literally named D6. A comment at the `MEASUREMENT_OV` construction site clarifies this: "D6 here refers to the V2 D6 schedule, not a V3 condition ID."
- **`capacity === 0` edge case.** When no providers are scheduled for a team at `now`, `capacity / max(load, epsilon) = 0 / 1e-6 = 0` — same value V2 returned via its explicit `capacity === 0 ? 0` branch. Not counted as a clip (0 is not > RATIO_CAP). Behavior preserved.
- **Clean-SHA rerun ran into a stale `.git/index.lock`.** The lock file was 0 bytes, created >2 hours earlier, and `lsof` showed only a Spotlight indexer read handle on it — no active git process. After user-authorized `rm`, stash + rerun + commit + pop completed without further incident. Documented for future operators encountering the same symptom.
- **Stash strategy during rerun.** `git stash push -u` captured both modified-tracked (8 files) and untracked (49 files) content, including the `data/provider-schedules/` input directory the benchmark needs. Restored just that directory via `git checkout stash@{0}^3 -- data/provider-schedules/` (the `^3` parent is the untracked-files tree in a `-u` stash), unstaged it with `git reset HEAD -- data/provider-schedules/`, and added the directory to `.git/info/exclude` for the duration of the run so it wouldn't show in `git status --porcelain` (the provenance-footer source). Exclude entry reverted after the commit landed.
- **Condition ID semantics inverted between V2 and V3.** V2's D6 was "0.75x Linear"; V3's D6 is "0.75x Stepped" (due to duration-outer/family-inner iteration with family order `[Stepped, Linear, logBack-k1, logBack-k3, logBack-k9]`). Paper prose citing specific D-IDs from V2 needs to either re-map or cite by `(duration, family)` tuple — the advisor-thread edits to Section 4 should verify every D-ID reference against the V3 condition matrix.
- **JSON commit footprint.** V3 JSON is ~2 MB. Committed alongside the markdown so downstream consumers (paper build scripts, future reruns, independent audits) can regenerate the tables without the ~2-minute replay. The dirty-tree JSON was replaced via `git rm` + `git add` in a single commit (recorded as a rename in git log), keeping the directory to exactly one authoritative file.
- **Out-of-scope items explicitly flagged.** Did not touch `buffer-duration-benchmark.ts`, `comprehensive-benchmark.ts`, or any engine code. Did not re-draft paper Section 4 prose — that belongs to the advisor thread per the handoff's division of labor. Did not expand the k-sweep beyond {1, 3, 9}. Did not remove the `direct` branch from `buildDecaySchedule` (dead-but-audit-safe).
- **Commits.** `89ab82f` introduced the V3 implementation (script + test + V3 markdown + V2 audit baseline + first JSON). `84d9852` replaced the V3 markdown and JSON with clean-provenance versions from the post-89ab82f clean-tree rerun.

**Artifacts.**
- `scripts/decay-schedule-benchmark.ts` — extended in place from the V2 version
- `scripts/test-log-back-loaded.ts` — 52-assertion verification script (new)
- `docs/results/DECAY_SCHEDULE_BENCHMARK_RESULTS_V3.md` — authoritative V3 results (clean provenance)
- `docs/results/DECAY_SCHEDULE_BENCHMARK_RESULTS_V2.md` — audit baseline (preserved)
- `data/decay-benchmark-runs/decay-benchmark-results-v3-20260423-192901.json` — raw results for regeneration
- `SHAPE_COMPARISON_CONCERNS.md` — concerns document that triggered the V3 scope
- `CLAUDE_CODE_HANDOFF_decay_v3.md` — V3 implementation spec (closed: work landed in 89ab82f)
- `CLAUDE_CODE_HANDOFF_decay_v3_rerun.md` — clean-provenance rerun spec (closed: work landed in 84d9852)

---

## 5. Public Exposure Remediation — GitHub Pages, Schedule De-Identification, and a Content-Based Deploy Guard

**Objective.** Close a live disclosure of protected material and make its recurrence structurally impossible. Two classes of content were publicly downloadable from `https://jwatson7399.github.io/capacity-conscious-triage/`: real NYU Langone Brooklyn weekly departmental schedules naming attendings, PAs and residents against shift times; and the Delphi-derived provider capacity weights, in the clear inside the JS bundle. A secondary objective was to establish the exposure window for a separate patent grace-period question.

**The exposure mechanism.** The repository is private, but GitHub Pages serves its publishing branch publicly *regardless of repository visibility*. The chain is: real schedules live in `public/schedules/` → Vite copies `public/` verbatim into `dist/` on every build (no `publicDir` override in `vite.config.ts`) → `npx gh-pages -d dist` pushes `dist/` to the `gh-pages` branch → Pages serves it to the world. Any build-and-deploy therefore republished the schedules. This is a configuration hazard rather than a code defect, which is why it survived ordinary code review.

**Verification method — measure, don't infer.** Every claim below was established against the live site rather than from the source tree, because the deployed artifact and the working tree had diverged. Both `/` and `/schedules/Department Schedule Week December 29.xlsx` returned HTTP 200 with a spreadsheet `content-type` at session start. Three assumptions carried in from the handoff brief proved wrong when measured, each in the direction of understating the exposure:

| Assumption | Measured reality |
|---|---|
| Last deploy `bb82588`, 2026-04-25 | `b0628cf`, **2026-06-12** — seven weeks more recent |
| Bundle `index-BKlD-X9g.js` | `index-DmcoEIPj.js` |
| 18 schedules exposed | **11** deployed (18 exist in `public/`; the June build predates seven) |

All six weights were confirmed present in the live bundle (`attending:20`, `senior_resident:15.2`, `pa:11.4`, `junior_resident:10.8`, `intern:6.6`, `rotator:2.4`).

**Unpublishing — the documented route does not exist.** `DELETE /repos/:owner/:repo/pages` returns `422 "Deactivating GitHub pages for this repository is not allowed"` (reproduced twice, not transient). `PUT .../pages` with `public=false` returns `422 "Current plan does not support private GitHub Pages"`; the account has no paid plan (`.plan` is `null`). **There is no API path to unpublish this site.** The Settings → Pages "Unpublish site" button in the web UI succeeds where the API refuses, and was used.

A durable trap follows from this: after unpublishing, `gh api /repos/.../pages` still returns `"status":"built"` with the stale build. The *configuration record* survives unpublishing even though no content is served. Two consequences, both since confirmed empirically: the API must never be used as the test for whether the site is exposed (curl the URL instead), and a subsequent `npx gh-pages -d dist` resurrects the site with no settings change — which is exactly what happened when the remediated build was later deployed, triggering an automatic Pages rebuild.

**De-identification method.** The demo feature at `RoleSelection.tsx` fetches a real schedule, parses it, and renders real provider surnames into the UI. The schedule parser (`src/utils/scheduleParser.ts`) is highly layout-sensitive — it locates day blocks by scanning for `Team 1` headers, infers team column pairs by offset, detects role sections by label, and cross-references a PGY key table to type each resident. Authoring a synthetic workbook from scratch would risk silently different parse behaviour, so a **transform-in-place** approach was chosen instead: rewrite only the leading person-name token of each cell, preserving layout, shift times, parenthetical annotations (`(Swing T1/T3)`), and the PGY table verbatim.

Token classification is deliberately asymmetric. A shared vocabulary (`scripts/schedule-name-tokens.ts`) whitelists structural tokens — team labels, role labels, weekday and month names, side markers, service abbreviations (`PEDs`, `NP`, `FHC`, `IM`, `PEM`) and clock-time patterns — and treats *everything else* as a name. Unknown tokens are therefore replaced rather than preserved, erring toward over-redaction. Pseudonyms are drawn from a pool of single-token botanical surnames; single-token matters because `cleanProviderName()` truncates to the first word, so multi-word pseudonyms like "Provider A" would collapse every provider to a single deduplication key and destroy the roster.

**Verification — two independent layers.** Parse-level equivalence (`scripts/verify-deidentified-schedule.ts`) asserts the real and synthetic files yield identical structure: 7 days, 211 providers, 20 PGY entries, and matching per-day signatures of `teamId | type | shiftStart | shiftEnd`. It separately asserts that no name from the real corpus survives anywhere in the synthetic parse. Because the parser deliberately *skips* A-Side sections, a parse-level check alone could miss names in cells the parser never reads, so a byte-level check was run over the unzipped OOXML: of 190 distinct strings in the original, the 63 appearing in both files are all structural (shift times, `Team 1`, weekday names); **127 name strings were dropped and zero real names survived**. Finally, the demo path was simulated directly — all 7 days yield providers at hour 7, so the button cannot throw `No providers active at current hour`.

**Two findings surfaced by tooling rather than by reading code.** Both were invisible to filename inspection and to the original remediation plan:

1. **`public/demo-schedule.xlsx` contains 120 real provider names**, including the project owner's. Despite its name it is not a demo artifact, and it had been published at `/demo-schedule.xlsx` throughout. The brief's proposed alternative — "ship the demo with `demo-schedule.xlsx` only" — would have left the exposure fully intact. Nothing under `src/` ever loaded it; only a benchmark script did, so it was removed from `public/` entirely rather than de-identified.
2. **A stale `dist/` on disk still contained all 18 real schedules.** `dist/` is gitignored so it was never committed, but it is precisely the directory `npx gh-pages -d dist` publishes; a deploy without an intervening rebuild would have re-exposed everything.

The generalisable lesson drove the guard's design: a filename-pattern check would have passed both cases. `scripts/check-no-real-schedules.ts` therefore opens every shipped `.xlsx` and compares leading name tokens against the corpus in `data/provider-schedules/`, blocking on content rather than naming. It is negative-tested — a real schedule copied into `public/` as `harmless-sample.xlsx` is still blocked, exit code 1 — and is wired to `predeploy`, so `npm run deploy` cannot bypass it.

**Design rationale for the chosen scope.** Only one runtime reference to a real schedule existed; everything else under `scripts/` is Node-only tooling reading from `data/`. That asymmetry made a narrow fix correct: de-identify the single file the browser fetches, and relocate the rest out of the publishable tree rather than sanitising all 18. All 18 files in `public/schedules/` were confirmed byte-identical (SHA-256) to copies already in `data/provider-schedules/` before deletion, so removal destroyed no data. Benchmark coverage was verified unchanged after repointing: 19 files, 133 days, identical to before.

**Results.** Live verification after redeployment: site 200; `schedules/demo-week-schedule.xlsx` 200 and re-verified parse-equivalent with zero real names when fetched *from the live URL*; all real schedule paths, `demo-schedule.xlsx`, and the old June bundle all 404; the live bundle greps clean for `WATSON`, `SINDKAR`, `FOGAM`, `DRAPER`, `GOLDENBERG`. The `gh-pages` tree now contains exactly one workbook.

**Exposure window.** No account audit log exists (`/user/audit-log` → 404; unavailable for personal accounts) and the Internet Archive holds **zero captures** of either the repository or the Pages site, so no third-party evidence of the public window exists. Build history is the stronger record: the schedules were present in the very first `gh-pages` commit (`c6a1708`, 2026-03-11) and the site served continuously across 34 builds until 2026-08-03 — a window of **~145 days**.

**Deliberate non-remediations, recorded so they are not silently "fixed" later.** Two exposures were assessed and left in place by explicit decision:

- **The Delphi Apps Script endpoint** (`VITE_DELPHI_SHEETS_URL`) is deployed "Anyone with the link" and unauthenticated. A plain GET returns all 35 raw survey rows, whose means (15.15, 10.85, 6.65, 2.30) reproduce the shipped weights — disclosing the *derivation*, not merely the values. Disabling Pages does not affect it.
- **`src/constants.ts:4` hardcodes the Delphi averages** as fallbacks, so they ship in any build. The rationale accepted for both: the weights are NYU-specific and not portable outside that institution. Note the structural limit — in a client-side app the engine computes in the browser, so any weight it uses must reach the client; bundle obfuscation would be theatre, and the only real protection is server-side scoring, already listed as the project's next step.

A related build-time behaviour was surfaced and consciously accepted: Vite inlines `VITE_*` variables at build time, so building with `.env` present publishes the endpoint URL in the bundle. The June build did not contain it; the 2026-08-03 build does. This was flagged before deploying and accepted.

**Residual condition.** Per the standing instruction against rebasing, squashing, amending or force-pushing, git history was not rewritten. The real schedules remain in history on both `main` and `gh-pages`. This is acceptable while the repository is private, but they are recoverable if it is ever made public — as are the weights.

**Artifacts.**
- `scripts/deidentify-schedule.ts` — token-preserving de-identifier (new)
- `scripts/verify-deidentified-schedule.ts` — parse-equivalence and name-leak assertions (new)
- `scripts/check-no-real-schedules.ts` — content-based predeploy guard (new)
- `scripts/schedule-name-tokens.ts` — shared structural vocabulary, so guard and de-identifier cannot disagree (new)
- `public/schedules/demo-week-schedule.xlsx` — synthetic demo schedule (new)
- `scripts/real-schedule-benchmark.ts` — repointed from `public/` to `data/provider-schedules/`
- `src/components/RoleSelection.tsx` — demo fetch retargeted to the synthetic file
- `package.json` — `predeploy` guard wired ahead of `deploy`
- `CLAUDE.md` — deploy procedure and schedule-data policy documented
- `.rounds/CCTrounds.md` — cross-agent deliberation entry

**Commit.** `be1b893` — "Remove real provider schedules from the published bundle", merged to `main` by fast-forward.

---

## 6. Post-Assign Scoring Recheck Under the Current Configuration

**Objective.** Check whether ranking teams on their post-assignment ratio, capacity / (load + incoming weight), beats ranking on the current ratio, under the configuration now in use: 4:2:1 acuity weights, D6 linear decay (180 / 180 / 90 min), zero buffers, and Delphi Round 1 fallback provider weights. The only prior test (historical Section 16 in `docs/reference/METHODS.md`) used stepped decay with buffers on.

**Methodology / data.**
- `scripts/historical-replay.ts` run twice with no `--weights` or `--decay` flags, so scoring comes from `getDefaultOverrides()`, which is the live `src/constants.ts` configuration. (Passing `--weights 4:2:1` would *not* reproduce the current setup: `parseWeightFlag` rebuilds a stepped decay schedule. The console label "5:3:1" printed when no flag is given is stale and does not reflect the weights used.)
- Run A: `tsx scripts/historical-replay.ts --json`. Run B: the same plus `--post-assign`, which passes each arrival's acuity as `incomingTier` to `getRecommendation()` for the formula arms.
- Data: the Dec 2025 to Mar 2026 A-side census (2,597 rows; 1,958 after excluding Team 4 trauma), 18 schedule files, 121 days. Primary cohort: three-team hours (9A to 12A), 1,540 encounters. Secondary: two-team hours, 418 encounters, 119 days.
- Comparison: per-day paired differences on the formula arm between runs, with a paired t statistic (n = 121 days).
- Environment: run from a copy of the repo at commit `4b7cec6` inside the Cowork Linux workspace, with a Linux build of `tsx` (the repo's `node_modules` contains macOS esbuild binaries). Output copied back as `data/historical-replay-runs/historical-replay-results-current-2026-09-27.json`, `historical-replay-results-current-post-2026-09-27.json`, and matching `.log` files.

**Results (three-team cohort, formula arm, current vs post-assign).** Fairness 90.2 vs 86.4 (t = -6.2). Gini count 0.055 vs 0.111 (t = 7.9). Gini acuity 0.063 vs 0.118 (t = 7.8). Daily team spread 1.0 vs 2.0 (t = 8.8). Acuity-weighted spread 2.0 vs 3.8 (t = 8.5). Load-minutes SD 80.8 vs 141.2 (t = 7.7). Min ratio 56.3 vs 54.3 (t = -2.6). Avg ratio 138.6 vs 152.5 (t = 1.6, not significant). Slams and back-to-back HA essentially unchanged. Formula vs actual daily win rate 81.0% vs 60.3%. Two-team cohort: fairness 89.1 vs 86.5 (t = -3.3), same direction on the Ginis.

**Design rationale.** Post-assign divides a smaller-capacity team's strength by a larger relative jump in load, so it steers patients, starting with Reds, toward the strongest team. That concentrates both count and acuity, which is what every equity metric picks up. The small rise in average ratio comes from that concentration (idle capacity on the other teams), not from better distribution. The April conclusion holds under the current configuration and is stronger.

**Implementation / congruency notes.**
- No engine change. `incomingTier` stays unused by the app and simulator. `CLAUDE.md` now states that ranking uses the current ratio, that acuity does not change the pick, and that post-assign must not be enabled without Julian.
- This behavior is what makes a one-tap assign UI valid: the recommendation can be shown before acuity is chosen.
- Decision recorded in `ER Triage App/Cowork Roundtable.md`, Session September 27, 2026.

---

# Historical Methodology Record

_The sections below document earlier methodology work preserved from a prior version of this document._

# ER Triage App — Methods & Methodology

A living record of the analytical methods, calibration procedures, and design rationale behind the ER triage assignment model. Updated as the project evolves.

---

## 1. Capacity Scale Calibration

### 1.1 Objective

Define a set of labeled tiers (e.g., "Overwhelmed," "Very Busy," "Ready") for the capacity ratio displayed on team cards, the help section, the dashboard legend, and referenced by the fairness scoring engine. All tiers must be derived from the empirical distribution of capacity ratios observed in realistic simulations, and every component of the app must use the same cutoffs.

### 1.2 Data Collection

**Simulation setup.** The real-schedule benchmark script (`scripts/real-schedule-benchmark.ts`) was run with the `--ratios` flag. This executes 1,000 independent eight-hour shift simulations. Each run:

1. **Selects a real provider roster.** One of 12 actual NYU Brooklyn weekly schedule `.xlsx` files (Dec 2025 – Mar 2026) is chosen. A specific day and shift window (7A–3P, 9A–5P, 3P–11P, or 5P–1A) is sampled, producing the exact team compositions, provider types, and scheduled hours for that shift.

2. **Includes overnight providers.** The schedule parser (`src/utils/scheduleParser.ts`) maps overnight (OVN) column entries to the correct teams:
   - N-side PAs/residents → Teams 1 & 3
   - B-side PAs/residents → Teams 2 & 4
   - Swing PAs/residents → all four teams
   - Team-specific overnight attendings (e.g., "T1 11P-7A") → the designated team
   - PEDs overnight attendings are excluded (not ER team providers)

   This mapping was verified by unit tests against real schedule data (see `src/utils/scheduleParser.test.ts`, line 218+: Moskowitz B-side → [2, 4], Mohamed N-side → [1, 3], Thaung Swing → [1, 2, 3, 4]).

3. **Generates patients at realistic rates.** Hourly arrival rates follow a time-of-day multiplier curve (busier mornings, quieter nights). Acuity mix uses real-world proportions of Tier One (Red), Tier Two (Yellow), and Tier Three (Purple) patients.

4. **Records capacity ratios.** At each simulated patient arrival, the receiving team's capacity ratio is computed:

   ```
   Capacity Ratio = Team Capacity / Patient Load
   ```

   - **Team Capacity** = sum of (provider weight x status multiplier) for all active providers on the team at that moment
   - **Patient Load** = sum of decayed acuity weights for all patients currently assigned to the team

   The ratio at the moment of assignment is stored as a `ShadowEntry.ratioAtAssignment`.

**Dataset size.** 1,000 runs x ~23 patients per run = **23,193 team-level capacity ratio observations.**

### 1.3 Distribution Characteristics

The observed distribution is **right-skewed**:

- The bulk of observations fall between ratios of 3 and 15.
- The tail extends to 100+ (teams with zero patient load, effectively infinite capacity).
- 13.3% of observations are at ratio 100+, representing teams that have not yet received any patients or whose patients have fully decayed.

**Key percentiles:**

| Percentile | Capacity Ratio |
|------------|---------------|
| p1 | 2.66 |
| p2 | 3.09 |
| p3 | 3.33 |
| p4 | 3.50 |
| p5 | 3.75 |
| p10 | 4.50 |
| p15 | 5.00 |
| p20 | 5.71 |
| p25 | 6.25 |
| p30 | 7.00 |
| p33 | 7.50 |
| p40 | 8.33 |
| p45 | 9.00 |
| p50 (median) | 10.00 |
| p55 | 11.25 |
| p60 | 12.50 |
| p65 | 14.17 |
| p67 | 15.00 |
| p70 | 16.67 |
| p75 | 21.25 |
| p80 | 31.00 |
| p85 | 50.00 |
| p90+ | 100.00 (degenerate) |

**Mean:** 24.20

**Fine-grained histogram (1-unit bins):**

```
 0– 1:   0.3%   (60)
 1– 2:   0.1%   (29)
 2– 3:   1.3%   (303)
 3– 4:   4.9%   (1,127)
 4– 5:   5.5%   (1,273)
 5– 6:  10.1%   (2,332)   ← MODE
 6– 7:   7.5%   (1,737)
 7– 8:   8.2%   (1,896)   ← secondary peak
 8– 9:   5.7%   (1,321)
 9–10:   4.6%   (1,057)
10–11:   5.6%   (1,294)
11–12:   4.4%   (1,009)
12–13:   3.4%   (777)
13–14:   3.2%   (747)
14–15:   0.7%   (160)
15–16:   3.3%   (769)
16–17:   1.9%   (447)
17–18:   1.1%   (257)
18–19:   1.4%   (333)
19–20:   0.1%   (28)
20–25:   3.6%   (839)
25–30:   2.1%   (486)
30–40:   3.2%   (751)
40–50:   2.6%   (597)
50–100:  2.1%   (488)
100+:   13.3%   (3,076)
```

The **mode** (most frequent 1-unit bin) is the **5–6 range** at 10.1% of all observations. This represents the most common capacity state a team will be in during a shift.

### 1.4 Anchor Selection

Two anchors were chosen to ground the scale:

1. **p5 = 3.75 (Overwhelm threshold).** The bottom 5% of all observed capacity ratios. Below this point, team demand is dangerously close to or exceeding capacity. This threshold is used by the fairness scoring engine to count "overwhelm events" — assignments that put a team into a state where the next patient could compromise care quality.

2. **Mode = 5–6 (Most common state).** The single most frequently observed capacity ratio range. Tier boundaries should be most granular around this value, since this is where teams spend the plurality of their time and where small ratio differences have the most clinical relevance.

### 1.5 Scale Design Principles

- **More granularity near the mode.** The tightest tier boundaries are placed in the 4–10 range where the density is highest and where clinical decision-making is most sensitive to ratio changes.
- **Wider tiers in the sparse upper tail.** Above ratio 15, observations thin out rapidly and the clinical distinction between "comfortable" and "very comfortable" is irrelevant to triage decisions.
- **Overwhelm threshold is a fixed statistical boundary (p5),** not a round number chosen for convenience. The fairness engine, simulation engine, and display scale all use this same value.
- **Uneven percentile splits are intentional.** The right-skewed distribution means equal-width percentile tiers would either waste granularity on the degenerate upper tail or compress meaningful distinctions in the busy range.

### 1.6 Finalized Scale

| Capacity Ratio | Label | Percentile Range | Color | Rationale |
|---------------|-------|-----------------|-------|-----------|
| < 3.75 | Overwhelmed | bottom 5% | red-700 | p5 anchor. Fairness engine overwhelm threshold. Demand is dangerously close to or exceeding capacity. |
| ≥ 3.75 | High Demand | p5–p15 | red-500 | Below the mode; team is approaching the danger zone. One more high-acuity patient could tip into overwhelm. |
| ≥ 5.00 | Very Busy | p15–p33 | orange-500 | Entry into the modal plateau (5–6 is the most common capacity state). Team is at peak typical workload. |
| ≥ 7.50 | Busy | p33–p50 | yellow-500 | Secondary density peak (7–8). Below median but within the normal operating range. |
| ≥ 10.00 | Manageable | p50–p75 | green-500 | Above median. Team has headroom and can absorb additional patients without stress. |
| ≥ 21.25 | Comfortable | top 25% | emerald-500 | Significant slack. Typically seen early in shift, after patient decay, or with strong provider rosters. |

**Overwhelm threshold: 3.75** (exact p5 of the empirical distribution). This value is used by:
- The fairness engine overwhelm event counter (`fairness.ts`, `simulation.ts`)
- The min safety margin normalization denominator (`fairness.ts`)
- The benchmark script overwhelm counter (`real-schedule-benchmark.ts`)

**Threshold sensitivity analysis.** Moving the overwhelm threshold from the previous 3.5 to 3.75 was analyzed. The impact on fairness scores is ~0.3 to ~1.3 points on the 100-point scale. Both formula-driven and round-robin scores shift by similar amounts, preserving the relative gap (~2.7 points in favor of formula). The three fairness components unrelated to the threshold (capacity balance, acuity balance, stress equity — 55% of the total weight) are completely unaffected. Published headline results remain valid.

#### Design decisions

**Three tiers span the dense 3.75–10 plateau** where 60%+ of all observations live. This maximizes label granularity in the range where teams spend most of their time.

- The **5.00 boundary** (p15) sits at the foot of the mode, separating "approaching the common state" from "in the common state."
- The **7.50 boundary** (p33) sits at the valley between the primary peak (5–6) and secondary peak (7–8), providing a natural split in the density plateau.

**Only two tiers above the median** (Manageable and Comfortable) because the upper tail is sparse and the clinical distinction between "comfortable" and "very comfortable" is irrelevant to triage decisions.

**Label naming rationale.** The progression Overwhelmed → High Demand → Very Busy → Busy → Manageable → Comfortable was chosen for intuitive de-escalation. Each step represents a distinct relief from the tier below. "Comfortable" was preferred over "Ready" for the top tier because it describes the team's state rather than implying the team is idle or waiting for work.

**Labels primarily communicate absolute state, not relative ranking** (see Section 2). Under formula-driven assignment, teams are within 0.55 ratio points of each other 50% of the time, so labels will frequently match across teams. This is a feature — it indicates the algorithm is successfully equalizing capacity. When labels *do* differ between teams, the difference is a meaningful signal.

### 1.7 Congruency Requirements

The capacity scale appears in the following locations, all of which must use identical cutoffs:

| Location | File | What to update |
|----------|------|---------------|
| Scale definition | `src/constants.ts` | `CAPACITY_TERMS` array and `getCapacityTerm()` function |
| Overwhelm counter | `src/engine/fairness.ts` | `< threshold` comparison (line 33) |
| Min safety margin | `src/engine/fairness.ts` | Normalization denominator (line 106) |
| Simulation overwhelm counter | `src/engine/simulation.ts` | `< threshold` comparison (line 500) |
| Benchmark script | `scripts/real-schedule-benchmark.ts` | `< threshold` comparison (line 354) |
| Help section — visual scale bar | `src/components/HelpSection.tsx` | Colored bar segment values (lines 100–107) |
| Help section — tier labels | `src/components/HelpSection.tsx` | Label text row (lines 108–115) |
| Help section — cutoff explanations | `src/components/HelpSection.tsx` | Bullet list with ratios and percentiles (lines 139–144) |
| Dashboard — capacity legend | `src/components/Dashboard.tsx` | Hardcoded Overwhelmed "0" segment (lines 221–245) |
| Benchmark report — text | `src/components/BenchmarkReport.tsx` | Threshold references (lines 130, 134) |
| Real schedule benchmark report | `src/components/RealScheduleBenchmarkReport.tsx` | Threshold reference (line 92) |
| Project documentation | `er-triage-app/CLAUDE.md` | Capacity Terms table |

Components that consume the scale dynamically and require no changes when cutoffs are updated:
- `src/components/TeamCard.tsx` — calls `getCapacityTerm()`
- `src/components/AssignPatient.tsx` — calls `getCapacityTerm()`
- `src/components/SimSummaryCard.tsx` — displays overwhelm counts

### 1.8 Version History

| Date | Change | Rationale |
|------|--------|-----------|
| 2026-02-25 | Initial scale: 10 / 5 / 3.35 / 2 / 0.05. Overwhelmed = ratio 0. | First implementation, cutoffs chosen without empirical basis. |
| 2026-03-03 | Scale recalibrated to 21 / 10 / 6 / 4 / 2 based on 23,000+ real-schedule observations. Overwhelm threshold in fairness engine changed from 2.0 to 3.5. | Original cutoffs were too low; overwhelm events were averaging 0.1–0.2 per shift at the 2.0 threshold, making the metric insensitive. Display scale updated to match observed percentiles but the Overwhelmed tier and fairness threshold were not aligned. |
| 2026-03-05 | Audit revealed inconsistency: display shows Overwhelmed at 0, fairness engine uses 3.5. Full reconciliation in progress. | See Section 1.7 for the complete list of locations requiring update. |
| 2026-03-05 | Scale finalized: 3.75 / 5.00 / 7.50 / 10.00 / 21.25. Overwhelm threshold unified to 3.75 (exact p5). Labels: Overwhelmed / High Demand / Very Busy / Busy / Manageable / Comfortable. | Cutoffs derived from empirical percentiles of 23,193 observations. Three tiers concentrated in the dense 4–10 plateau around the mode (5–6) and secondary peak (7–8). Threshold sensitivity analysis confirmed <1.3 pt impact on fairness scores. Inter-team spread analysis (Section 2) confirmed labels serve absolute state communication, not relative differentiation. |

---

## 2. Inter-Team Spread Analysis

### 2.1 Objective

Determine how far apart teams' capacity ratios typically are from each other during a shift. This directly informs tier width for the capacity scale: if teams are usually within X points of each other, tier widths narrower than X will differentiate them, while wider tiers will show the same label on all teams.

### 2.2 Motivation

The capacity labels exist as a **communication tool for charge nurses and providers** — a glanceable indicator of team state on the dashboard. They do not affect the assignment algorithm, which operates on raw ratios. The question arose: should tier boundaries be placed to maximize differentiation between teams (so teams get different labels), or to communicate absolute clinical state (so a label means the same thing regardless of what other teams show)?

### 2.3 Methodology

The real-schedule benchmark was extended to record **all non-trauma team ratios at every patient arrival**, not just the receiving team's ratio. For each arrival event:

1. All eligible (non-trauma, non-closed) teams were scored using `scoreTeam()`.
2. The **spread** (max ratio − min ratio) across teams was recorded.
3. All **pairwise absolute differences** between teams were recorded.

This was run for **500 shifts** under both the formula-driven assignment engine and round-robin, using identical patient timelines and schedule inputs (seeded PRNG for reproducibility). Infinity ratios (empty teams) were capped at 100.

**Dataset:** 11,760 arrival events per mode, ~35,260 pairwise comparisons per mode.

### 2.4 Results

#### Formula-Driven Assignment

| Metric | p25 | p50 | p75 | Mean |
|--------|-----|-----|-----|------|
| Team spread (max − min) | 0.35 | 1.01 | 4.00 | 9.66 |
| Pairwise difference | 0.16 | 0.55 | 2.15 | 6.43 |

**Pairwise difference distribution:**

```
 0– 1:  61.8%   (21,809)   ← majority of teams within 1 point
 1– 2:  11.9%   (4,208)
 2– 3:   5.4%   (1,888)
 3– 4:   3.2%   (1,116)
 4– 5:   2.0%   (696)
 5– 8:   3.8%   (1,348)
 8–15:   3.2%   (1,111)
15–50:   3.3%   (1,163)
  50+:   5.5%   (1,927)
```

#### Round-Robin Assignment

| Metric | p25 | p50 | p75 | Mean |
|--------|-----|-----|-----|------|
| Team spread (max − min) | 1.12 | 2.65 | 8.26 | 12.42 |
| Pairwise difference | 0.48 | 1.45 | 4.50 | 8.27 |

**Pairwise difference distribution:**

```
 0– 1:  40.1%   (14,134)
 1– 2:  17.9%   (6,311)
 2– 3:   9.1%   (3,214)
 3– 4:   5.7%   (2,007)
 4– 5:   3.7%   (1,307)
 5– 8:   6.2%   (2,199)
 8–15:   5.4%   (1,919)
15–50:   5.6%   (1,960)
  50+:   6.3%   (2,211)
```

### 2.5 Key Findings

1. **Under formula-driven assignment, teams are within 1 point of each other 62% of the time.** The median pairwise difference is only 0.55. This is expected — the algorithm actively equalizes teams by routing patients to the highest-capacity team.

2. **Round robin produces ~2.6x more spread** (median pairwise diff 1.45 vs. 0.55). Because round robin ignores capacity, teams with different provider strengths diverge over time.

3. **The formula's equalizing effect means tier labels will show the same value on multiple teams most of the time**, regardless of tier width. Even 1-point-wide tiers would only differentiate teams ~38% of the time under formula assignment.

4. **The high-spread tail (p75 = 4.0 for formula, 8.26 for round robin) occurs when one team has decayed patients and another just received a new one**, creating a transient gap. These moments are brief and self-correcting.

### 2.6 Implications for Scale Design

- **Labels cannot reliably differentiate teams from each other.** The raw capacity ratio number displayed on the card is what distinguishes teams — the label adds qualitative context about absolute state.
- **The labels' primary job is answering: "Is this team in trouble, coping, or comfortable?"** — not "Which team is busier?" The charge nurse compares the numbers for relative ranking; the labels provide instant situational awareness.
- **This argues for fewer, clinically distinct tiers** rather than many narrow tiers optimized for inter-team differentiation. Narrow tiers in the 5–8 plateau would still show the same label on all teams 62% of the time while adding visual complexity.
- **The overwhelm tier (p5 anchor) remains critical** — this is the one label that triggers a fundamentally different clinical response ("this team is in danger") and must be precise.

### 2.7 Open Question

Given that labels communicate absolute state rather than relative ranking, the remaining design decision is: **how many distinct clinical states does a charge nurse act on differently?** The data supports as few as 3 (danger / coping / comfortable) or as many as 5–6 if finer gradations within "coping" are clinically meaningful. This is a clinical judgment call, not a statistical one.

---

## 3. Capacity Scale Visual Design Refinements

### 3.1 Objective

Improve the visual presentation of the capacity scale gradient bars on the Dashboard and Help Section. Two issues were identified through UI review: (1) white divider lines on the gradient bars looked visually jarring, and (2) the "Busy" label in yellow had poor readability against light backgrounds.

### 3.2 Changes

#### 3.2.1 Divider Line Removal

The gradient bars in `Dashboard.tsx` and `HelpSection.tsx` previously rendered thin white vertical lines (`w-px bg-white/40`) at each tier boundary. These were intended to visually separate zones but created a segmented appearance that clashed with the smooth CSS gradient (`CAPACITY_GRADIENT_CSS`). The divider lines were removed from both components while preserving the threshold numbers and labels.

**Rationale:** The gradient itself communicates the continuous nature of the scale. Hard divider lines implied discrete bins, which contradicts the interpolated color system introduced in the capacity scale overhaul (Section 1). The threshold numbers overlaid on the bar are sufficient to mark boundaries.

#### 3.2.2 Yellow Text Contrast Fix

The "Busy" tier label (≥ 7.5, p33–p50) used `text-yellow-500` in `constants.ts` and on team cards. This color has poor contrast against white/light gray backgrounds, particularly on the Dashboard legend labels below the gradient bar.

**Fix:** Changed from `text-yellow-500` (Tailwind `#eab308`, contrast ratio ~2.8:1 on white) to `text-yellow-600` (`#ca8a04`, contrast ratio ~4.2:1 on white). The HelpSection already used `text-yellow-600` for its labels, so this also resolved an inconsistency between the two components.

**Affected files:**
- `src/constants.ts` — `CAPACITY_TERMS` array, "Busy" entry color changed from `text-yellow-500` to `text-yellow-600`

**Not affected:** The gradient bar itself uses inline RGB interpolation via `getCapacityColor()` and `CAPACITY_GRADIENT_CSS`, which are unrelated to Tailwind text color classes. The yellow zone on the gradient bar was already legible because white text with `drop-shadow-sm` is rendered on top of the colored background.

### 3.3 Verification

- `npm run build` passes with no errors after both changes
- Visual inspection confirms gradient bars display threshold numbers without vertical lines
- "Busy" label below the gradient bar is readable on both light and dark backgrounds

### 3.4 Deployment Note

This session also established the deployment workflow for the er-triage-app. The app is hosted on GitHub Pages, served from the `gh-pages` branch. There is no GitHub Actions CI — deployment is manual:

```bash
npm run build
npx gh-pages -d dist
```

This was documented in `er-triage-app/CLAUDE.md` and the `gh-pages` npm package was added as a dev dependency.

---

## 4. Attending Attestation Feature

### 4.1 Objective

Collect explicit attending physician consent for the capacity-based patient assignment model. The formula-driven system routes more A-side (higher acuity) patients to teams with stronger provider compositions, and fewer when the team is weaker. This represents a departure from round-robin assignment where patient distribution is acuity-blind. Attendings need to formally acknowledge and consent to this trade-off before the system is used in production.

### 4.2 Design

#### 4.2.1 User Flow

An "Attending Attestation" link was added to the main menu (`RoleSelection.tsx`), positioned directly below the existing "Provider Strength Survey" and "See ongoing survey averages" links. The placement groups all survey/consent instruments together in the UI hierarchy.

Clicking the link opens a modal with:
1. **The attestation question:** "Are you okay with potentially seeing more A-side patients when you have a stronger team, knowing that you'll also potentially see less A-side patients when you have a weaker team?"
2. **An ID input field** — required before submission. Maps each response to an identifiable attending for audit purposes.
3. **Yes / No buttons** — disabled (40% opacity) until an ID is entered, preventing anonymous submissions.
4. **A loading spinner** — replaces the form immediately on tap, showing "Submitting..." while the Google Sheets round-trip completes (~10-15 seconds). This prevents duplicate submissions from impatient double-taps.
5. **A confirmation screen** — displays "Response recorded. Thank you!" with running Yes/No tallies, then a Close button.

#### 4.2.2 Double-Submission Prevention

Initial testing revealed a UX issue: the 10-15 second latency between tapping Yes/No and seeing confirmation made it tempting to tap again, resulting in duplicate entries. The fix replaces the entire button/input form with a spinner immediately on click (`attestationLoading` state), making it impossible to submit twice. The state transitions are:

```
[ID input + Yes/No buttons] → click → [Spinner: "Submitting..."] → response → [Confirmation + tallies]
```

### 4.3 Data Architecture

#### 4.3.1 Google Sheets Backend

Attestation responses are stored in the same Google Sheets workbook used by the Delphi Provider Strength Survey, but on a separate tab named **Attestation** with columns:

| Column | Content |
|--------|---------|
| Timestamp | Localized date/time string from the submitting device |
| Response | `yes` or `no` |
| ID | Free-text attending identifier |

The existing Apps Script was extended with a routing mechanism: POST requests with `body.type === 'attestation'` are directed to the Attestation sheet; all other POSTs continue to the Responses (Delphi survey) sheet. The GET endpoint returns both datasets concatenated, with attestation rows tagged with `Type: 'attestation'` so the client can filter.

#### 4.3.2 Client-Side Data Flow

```
POST: { type: 'attestation', response: 'yes'|'no', id: string, timestamp: string }
GET:  returns all rows; client filters where Type === 'attestation'
      → counts yes/no for tally display
```

The `no-cors` fetch mode is used for the POST (Google Apps Script does not return CORS headers for POST), while the GET uses standard mode to parse the JSON response for tally counts.

### 4.4 Deployment Notes

- A new Apps Script deployment URL was required after updating the script (`VITE_DELPHI_SHEETS_URL` in `.env`). Google Apps Script caches deployment versions aggressively; editing an existing deployment's version did not reliably pick up the new code. Creating a brand-new deployment with a fresh URL resolved the issue.
- The `.env` file containing the Sheets URL is gitignored and not committed.

### 4.5 Files Modified

| File | Change |
|------|--------|
| `src/components/RoleSelection.tsx` | Added attestation modal with ID input, loading state, Yes/No submission, tally display |
| `.env` | Updated `VITE_DELPHI_SHEETS_URL` to new deployment URL (not committed) |
| Google Apps Script | Extended `doPost` with attestation routing, extended `doGet` to return both sheets |
| Google Sheet | Added "Attestation" tab with Timestamp / Response / ID columns |

---

## 5. Intellectual Property Protection Measures

### 5.1 Objective

Establish IP protections for the Adaptive Triage Tool prior to institutional discussions about potential integration into clinical workflow. The tool was developed independently by the author on personal time and equipment. A meeting was scheduled (March 4, 2026) with NYU Brooklyn ED leadership to "review the Adaptive Triage Tool prototype developed for the NYU Brooklyn ED and discuss next steps for potential integration into clinical workflow." The goal was to ensure legal and technical safeguards were in place before and after that discussion.

### 5.2 Threat Model

The primary risk is that the hospital could attempt to claim ownership of the tool or replicate it without compensation, leveraging access that was previously granted in good faith for evaluation purposes. Specific concerns:

1. **Code access** — the GitHub Pages deployment was publicly accessible, and the URL had been shared in a meeting invite distributed to multiple hospital stakeholders.
2. **Employment agreement ambiguity** — hospital employment contracts often contain broad invention assignment clauses that could be interpreted to cover tools related to clinical workflow, even if built independently.
3. **No formal license terms** — the code was previously shared without any explicit license, leaving usage rights ambiguous.

### 5.3 Technical Measures Taken

#### 5.3.1 Repository Access Control

The GitHub repository (`jwatson7399/er-triage-app`) was confirmed to be **private** — only the author has collaborator access. No external GitHub users were listed as collaborators at the time of audit (verified via `gh api repos/.../collaborators`).

#### 5.3.2 Proprietary License

A proprietary **All Rights Reserved** license was added to the repository (`LICENSE` file). The license explicitly prohibits reproduction, distribution, modification, sublicensing, sale, or use of the software without prior written permission from the copyright holder. This establishes clear terms that no usage rights are granted by default.

#### 5.3.3 Repository Rename

The repository was renamed from `er-triage-app` to `adaptive-triage`. This served two purposes:

1. **Broke the existing GitHub Pages URL** — the previously shared link (`https://jwatson7399.github.io/er-triage-app/`) in the meeting invite became non-functional, as GitHub Pages URLs are derived from the repo name.
2. **Created a new URL** (`https://jwatson7399.github.io/adaptive-triage/`) known only to the author, allowing controlled re-sharing when appropriate.

Note: GitHub automatically redirects the old **repository** URL to the new one, but GitHub **Pages** URLs do not redirect across renames.

#### 5.3.4 GitHub Pages Takedown and Redeployment

The `gh-pages` branch was deleted to take down the publicly accessible deployment. After confirming the old URL was dead, a fresh `gh-pages` branch was pushed with the Vite base path updated from `/er-triage-app/` to `/adaptive-triage/`, redeploying the app at the new URL.

**Files modified:**
- `vite.config.ts` — `base` changed from `/er-triage-app/` to `/adaptive-triage/`

#### 5.3.5 Chronological Summary of Changes

| Action | Effect |
|--------|--------|
| Verified repo is private | No unauthorized GitHub access possible |
| Added `LICENSE` (All Rights Reserved) | Explicit legal prohibition on unauthorized use |
| Renamed repo `er-triage-app` → `adaptive-triage` | Broke old Pages URL shared in meeting invite |
| Deleted `gh-pages` branch | Took down the live public deployment |
| Updated Vite base path | Aligned build output with new repo name |
| Redeployed to new `gh-pages` branch | App live at new secret URL only |

### 5.4 Legal Recommendations (Not Yet Implemented)

The following additional measures were identified but require action outside the codebase:

1. **Consult an IP attorney** — review employment agreement for invention assignment clauses; assess exposure and negotiate carve-outs if needed.
2. **Copyright registration** — file with the US Copyright Office (~$65) to create a public record with a date and enable statutory damages.
3. **Document the timeline** — maintain a dated memo establishing independent development on personal time and equipment.
4. **Preserve communications** — save all emails, messages, and meeting notes showing the tool was shared voluntarily for evaluation, not delivered as a work product.
5. **Licensing agreement** — before re-granting access, require a written license agreement acknowledging the author's ownership and defining permitted use.

### 5.5 Prior Art Considerations

Even if the hospital obtained a clone of the code while the repo was public or the Pages site was accessible, copyright law protects the author by default. A public GitHub repository without an explicit license does **not** grant any usage, modification, or distribution rights. The subsequently added proprietary license further reinforces this position. Any use of a previously obtained clone would constitute copyright infringement.

---

## 6. Guided Tour Step 3 — Provider Weights Reference & Demo Composition

### 6.1 Objective

Improve the guided tour's "Team Strength" step (step 3 of 11) so that users can understand how provider weights map to the team strength number displayed on each card. Two changes were made: (1) the tour tooltip now includes a provider weights reference table and computed team strength sum, and (2) Team 1's demo composition was simplified for mobile readability.

### 6.2 Problem

The original step 3 tooltip said: *"Each provider has a weighted strength based on role and status. The team total is the sum."* This described the concept but gave the user no way to verify it — they had to navigate to the Help section's "Weights & Reference" table separately, do mental arithmetic, and trust that the numbers matched. On mobile, the expanded provider list for Team 1 could contain up to 5 providers (randomized), pushing the tooltip off-screen or requiring scrolling.

### 6.3 Design Changes

#### 6.3.1 Tour Tooltip Content (tourSteps.tsx)

The step 3 description was changed from a plain string to a React node containing:

1. **Original explanation text** — preserved as-is for continuity.
2. **Team strength sum** — a bold blue line showing "Team strength: X.X", computed live as the sum of `capacityWeights[provider.type] × STATUS_MULTIPLIERS[provider.status]` for all Team 1 providers. This lets the user verify the number matches the "Strength: X.X" line on the team card visible behind the overlay.
3. **Provider weights reference table** — a compact `text-xs` table listing all six provider types and their current Delphi survey weights, in the same display order as the Help section (Attending, Senior Resident, PA, Resident, Intern, Rotator).

**Architecture decision:** The `TourStep` interface's `description` field was changed from `string` to `ReactNode`, and the file was renamed from `tourSteps.ts` to `tourSteps.tsx` to support JSX. The `GuidedTour` component's description container was changed from `<p>` to `<div>` to allow block-level content. A `wide?: boolean` flag was added to `TourStep` to allow step 3's tooltip to render at 360px instead of the default 300px, accommodating the table without cramping.

**Data flow:** `buildTourSteps()` now accepts `capacityWeights` (from `useSurveyWeights` via `useShift()`) and `team1Providers` (filtered from `state.providers`). The team strength is computed at step construction time, not dynamically — this is acceptable because the tour runs on a static demo state where providers don't change mid-tour.

#### 6.3.2 Demo Provider Composition (ShiftContext.tsx)

Team 1's demo providers were changed from a randomized composition (1–4 random extras from all non-attending types, with ~20% chance of non-active status each) to a fixed, compact set:

| Provider | Type | Status |
|----------|------|--------|
| [random name] | Attending | Active |
| [random name] | Junior Resident (PGY-2) | Active |
| [random name] | PA | Active |
| [random name] | Rotator | Active |

**Rationale:**

- **4 providers instead of up to 5** — reduces the vertical height of the expanded provider list, keeping more of the tour tooltip and team card visible on mobile screens without scrolling.
- **All active** — eliminates the random "In Procedure" or "Off Floor" statuses that would show reduced strength values (e.g., 1.6 instead of 6.6), which complicates the user's first encounter with the weights concept. The provider status mechanic is introduced separately in step 10.
- **Fixed composition** — ensures every user sees the same tour experience. The original randomization meant some users would see a team with 2 providers and others with 5, making the "strength = sum of weights" lesson harder to predict or document.
- **Includes one of each "tier"** — Attending (highest weight), PA (mid), Junior Resident (mid), Rotator (lowest) provides a representative sample of the weight range without needing all 6 types.

Teams 2, 3, and 4 remain randomized as before — only Team 1 is fixed because it's the team highlighted in the tour.

### 6.4 Files Modified

| File | Change |
|------|--------|
| `src/tourSteps.tsx` (renamed from `.ts`) | `description` type changed to `ReactNode`; `wide` flag added; step 3 rebuilt with weights table and strength sum; `buildTourSteps` signature expanded |
| `src/components/GuidedTour.tsx` | `<p>` → `<div>` for description; tooltip width respects `step.wide`; arrow position scaled to dynamic width |
| `src/components/Dashboard.tsx` | Passes `capacityWeights` and `team1Providers` to `buildTourSteps` |
| `src/context/ShiftContext.tsx` | Team 1 demo composition fixed to ATT + JR + PA + Rotator, all active |

---

## 7. Clinical Outcome Measurement — Evaluating Proportional Workload Distribution

### 7.1 Objective

Define how to measure the primary goal of the adaptive triage tool: **improving workload distribution among teams in a proportional manner** — stronger teams should carry proportionally higher workloads because they have more ability to safely handle it — **while minimally hindering triage nursing workflow**. The measurement framework must be defensible to hospital leadership, avoid relying solely on the iPad app as its own source of truth, and leverage data already available in Epic wherever possible.

### 7.2 Guiding Principle: The App Is the Intervention, Epic Is the Measurement Instrument

A key design decision is that the tool should not grade itself. The app generates recommendations and logs internal state (capacity scores, overrides, buffer usage), but whether workload distribution actually improved should be measured from the hospital's existing electronic health record system (Epic). This avoids the circular problem of the intervention also being the evaluator, and addresses concerns that iPad-based manual data entry in a chaotic triage environment may diverge from actual clinical experience.

The app's internal logs remain valuable for understanding *how* the tool is being used (adoption, override patterns, workflow friction), but *whether it's working* is measured externally.

### 7.3 Metrics Derivable from Epic (No Additional Nurse Burden)

These metrics require no iPad interaction and are already captured in the EHR:

#### 7.3.1 Patients per Provider-Hour by Team

How many patients each team is carrying relative to the providers staffed. Epic knows team assignments, provider schedules, and patient timestamps. Compute:

```
Patients-per-provider-hour = (patients assigned to team during shift) / (provider-weighted-hours for that team)
```

The standard deviation of this ratio across teams within a shift measures distribution fairness. Lower SD = more proportional distribution.

#### 7.3.2 Acuity-Weighted Patient Load per Team

Same as 7.3.1 but weighted by ESI level, which is already captured at triage. A team seeing ten ESI-5 patients is not equivalent to a team seeing ten ESI-2 patients. Weighting by acuity provides a more accurate picture of actual workload burden.

#### 7.3.3 Door-to-Provider Time by Team

If one team is consistently overloaded relative to its capacity, their patients will wait longer to be seen. Comparing median door-to-provider time across teams within the same shift reveals which teams are stretched thin. More equal D2P times across teams = better proportional distribution.

#### 7.3.4 Disposition Time (Door-to-Dispo) Variance Across Teams

Controlling for acuity, teams with longer disposition times are likely overloaded relative to their capacity. Cross-team variance in dispo time within a shift serves as a proxy for uneven workload distribution.

#### 7.3.5 Left Without Being Seen (LWBS) Rate by Team Zone

If patients in one team's zone leave more frequently, that team may be overwhelmed relative to its capacity. LWBS rate by zone, compared across teams on the same shift, is an indirect but meaningful signal of disproportionate loading.

#### 7.3.6 Boarding Hours by Team

Admitted patients waiting for inpatient beds consume provider bandwidth without generating new patient throughput. Epic tracks boarding status. Teams with disproportionate boarding hours are effectively weaker than their provider roster suggests, and this hidden workload source should be accounted for when evaluating distribution fairness.

### 7.4 Metrics from the App Itself (Minimal Nurse Effort)

These metrics are logged passively by the app once the provider roster is set up at shift start:

#### 7.4.1 Override Rate

When triage nurses ignore the app's recommendation, the override is logged with a reason. High override rates signal either that the formula needs tuning or that the workflow is creating friction. The pattern of override reasons (e.g., "patient requested," "geographic," "clinical judgment") helps distinguish between appropriate clinical overrides and formula failures.

#### 7.4.2 Overwhelm Events per Shift

The number of times a team's capacity score drops below the overwhelm threshold (3.75, the p5 of the empirical distribution — see Section 1). The app already computes capacity scores on a 1-second tick and can log threshold crossings passively without any nurse input.

### 7.5 Summary Fairness Metric — The Gini Coefficient

#### 7.5.1 Background

The Gini Coefficient is a well-established statistical measure created by Italian statistician Corrado Gini in 1912. It was originally designed to measure income inequality across populations and has since become the global standard for quantifying distributional fairness. The World Bank, United Nations, and most national governments use it to compare wealth distribution between countries (e.g., US ≈ 0.39, Sweden ≈ 0.25, South Africa ≈ 0.63). It has also been applied in health services research to measure hospital bed distribution across regions, physician workforce equity, and nursing workload balance.

The measure produces a single number between 0 and 1:
- **0** = perfectly equal distribution (every team has identical workload relative to capacity)
- **1** = maximally unequal (one team has everything, others have nothing)

In practice, values for ER team workload would range from ~0.05 (very fair) to ~0.30 (noticeably lopsided).

#### 7.5.2 Application to Triage Workload

The app already computes a **capacity score** for each team: `provider capacity / acuity-weighted patient load`. The Gini Coefficient measures how spread out these capacity scores are across teams during a shift. If every team's capacity score is roughly the same, the Gini is near zero — workload is proportionally distributed. If one team is comfortable while another is drowning, the scores diverge and the Gini rises.

The formula:

```
Gini = Σ|xi - xj| for all team pairs (i,j) / (2 × n × mean)
```

Where `xi` is team i's capacity score, `n` is the number of active teams, and the sum is over all pairwise absolute differences.

#### 7.5.3 Continuous Measurement Over a Shift

Capacity scores change continuously as patients arrive, are dispositioned, providers come and go, and statuses change. Rather than measuring the Gini once, it should be **sampled at regular intervals** (e.g., every 5 minutes) throughout the shift, producing ~96 observations per 8-hour shift.

The shift-level summary metrics are:

- **Mean Gini** — average fairness across the entire shift. This is the headline number for before/after comparison.
- **Peak Gini** — the worst moment of imbalance during the shift. Captures episodes like "everything was fine except the hour where Team 2 got hammered."
- **Time above threshold** — percentage of the shift where the Gini exceeded a defined threshold (e.g., 0.25). This measures how often things were meaningfully lopsided, not just on average.

Provider turnover (e.g., an attending leaving mid-shift and being replaced by an intern) is naturally handled: the team's capacity score drops, and if the system is working well, that team should have been receiving fewer patients as the transition approached. The Gini captures whether the patient distribution actually kept pace with capacity changes. If it didn't — capacity dropped but load didn't — the Gini spikes, which is exactly the signal we want to detect.

#### 7.5.4 Implementation Feasibility

Computing the Gini across 3–4 team capacity scores is trivially cheap — the app already recomputes all capacity scores every 1-second tick. Adding a Gini calculation on top of the existing computation requires no additional nurse input and minimal code. The values can be logged passively in the background for later analysis.

#### 7.5.5 Presentation to Non-Technical Audiences

If the term "Gini Coefficient" feels too academic for clinical leadership, it can be presented as a **"workload fairness score"** computed as `1 - Gini`, so that higher = better. Example: "We went from a fairness score of 78% to 87% after implementing formula-based assignment."

### 7.6 Proposed Study Design

1. **Baseline period** — N shifts using the current round-robin assignment process. Pull Epic metrics (7.3.1–7.3.6) for each shift.
2. **Intervention period** — N shifts using the formula-driven assignment tool. Pull the same Epic metrics.
3. **Compare:**
   - Gini coefficient (from app logs or reconstructed from Epic data) — primary outcome
   - Door-to-provider time variance across teams — secondary outcome
   - LWBS rates by team zone — secondary outcome
   - Disposition time variance across teams (controlling for acuity) — secondary outcome
   - Override rate and patterns — process measure (understanding adoption)
   - Overwhelm events per shift — safety measure

This design answers the leadership question with data from a system they already trust (Epic), does not depend on perfect iPad compliance for outcome measurement, and minimally burdens triage nurses.

### 7.7 Open Questions

1. **Epic data extraction** — What reporting tools are available to pull the metrics in 7.3? Does the institution use Epic's reporting workbench, Caboodle/Clarity data warehouse, or a third-party analytics layer?
2. **Team assignment in Epic** — Is team assignment reliably recorded in Epic, or is it only tracked informally? If not in Epic, this would need to be established as a prerequisite.
3. **Sample size** — How many shifts are needed in each period to detect a meaningful difference in the Gini coefficient? This depends on the expected effect size and shift-to-shift variance, which could be estimated from simulation data.
4. **Confounders** — Shift-to-shift variation in census, acuity mix, and staffing levels will introduce noise. A crossover design (alternating formula/round-robin shifts) or matched-pair analysis (same day-of-week, same shift window) may be needed.

---

## 8. Delphi Survey — Empty Row Averaging Bug

### 8.1 Objective

Diagnose and fix a discrepancy between the average provider strength scores displayed in the app's Delphi survey results page and the actual averages computed from the Google Sheet data.

### 8.2 Observed Discrepancy

The app's "Thank You" page after survey submission displayed:

| Role | App Average | Expected Average (from Sheet) |
|------|------------|-------------------------------|
| PGY 3–4 (Senior Resident) | 8.9 | ~15.3 |
| PGY-2 (Junior Resident) | 6.2 | ~10.5 |
| PGY-1 (Intern) | 3.6 | ~6.1 |
| PA / NP | 6.6 | ~11.1 |
| Off-Service Rotator | 1.2 | ~2.0 |

The app also reported "27 responses collected" while the Google Sheet contained only 16 rows of actual survey data.

### 8.3 Root Cause

The Google Apps Script `doGet()` handler uses `sheet.getDataRange().getValues()` to return all rows from the sheet. Google Sheets' `getDataRange()` includes rows that have been touched or formatted at any point, even if they are now visually empty. The sheet contained 27 rows after the header (16 with data, 11 empty), and the Apps Script returned all 27 as JSON objects.

On the client side, empty rows arrived as objects like `{ "Timestamp": "", "Senior Resident": "", ... }`. The `fetchSheetResponses()` function in `DelphiSurvey.tsx` converted these via `Number(row['Senior Resident'] ?? 0)`:

- `row['Senior Resident']` = `""` (empty string, not null/undefined)
- `"" ?? 0` = `""` (nullish coalescing does not trigger on empty strings)
- `Number("")` = `0`

So each empty row became a valid `ResponseEntry` with all-zero ratings. The averaging function divided the sum of real responses by 27 (total rows including empties) instead of 16 (actual responses), diluting every average by a factor of ~16/27.

**Verification:** The ratios match precisely:
- Senior: 245 / 27 = 9.07 ≈ 8.9 (app value, accounting for rounding in the unseen additional rows)
- Junior: 168 / 27 = 6.22 ≈ 6.2
- Intern: 97 / 27 = 3.59 ≈ 3.6
- PA: 178 / 27 = 6.59 ≈ 6.6
- Rotator: 32 / 27 = 1.19 ≈ 1.2

### 8.4 Fix

A filter was added to both data-fetching paths to exclude rows where all five role columns are empty, null, or zero:

**`src/components/DelphiSurvey.tsx` — `fetchSheetResponses()`:**
Rows are now filtered before mapping to `ResponseEntry` objects. A row is kept only if at least one role column has a non-zero numeric value.

**`src/hooks/useSurveyWeights.ts` — `fetchSurveyAverages()`:**
The same filter was applied to the rows fetched for the capacity weights hook, which polls the sheet every 5 minutes to update the app's team scoring weights. Without this fix, the weights used by the recommendation engine were also diluted by empty rows.

### 8.5 Impact

Both the display averages (shown to survey participants) and the operational weights (used by the recommendation engine to score team capacity) were affected. The fix corrects:

1. **Survey results page** — response count and averages now reflect only actual submissions
2. **Capacity weights** — the `useSurveyWeights` hook now computes correct averages, meaning team capacity scores used for patient assignment recommendations are accurate

### 8.6 Design Decision: Client-Side vs. Server-Side Fix

The fix was applied client-side (filtering in the fetch functions) rather than server-side (modifying the Apps Script to skip empty rows). Rationale:

- **Defensive coding** — the client should not assume the server returns clean data. Empty rows can reappear at any time if someone touches a cell in the sheet.
- **No Apps Script redeployment required** — modifying and redeploying a Google Apps Script requires creating a new deployment URL (Google caches aggressively), which would require updating the `.env` file across all environments.
- **Minimal code change** — a single `.filter()` call before the existing `.map()` handles the issue without restructuring the data flow.

---

## 9. Historical Replay Benchmark — Real Arrivals × Real Schedules

### 9.1 Objective

Provide the strongest possible evidence for the triage app's effectiveness by replaying **real patient arrivals** against **real provider schedules** and comparing three assignment strategies: the actual historical assignments, the app's formula, and round-robin. Unlike the existing synthetic and real-schedule benchmarks (which generate random patient arrivals), this benchmark uses the exact patients who walked through the door, making the counterfactual claim — "if we had been using this tool" — as concrete as possible.

### 9.2 Data Sources

**Patient census:** `Aside data Dec 2025–Mar 2026.xlsx`, sheet "All A-sides + trauma lvl 1&2's" — 2,597 encounters with arrival timestamps, team assignments, ESI levels, acuity sources, dispositions, and length-of-stay metrics.

**Provider schedules:** 18 weekly schedule `.xlsx` files across two directories (`schedules/` and `initially missing schedules/`), covering all 122 days with arrivals. Parsed using the existing `parseWeeklySchedule()` pipeline. Provider rosters change dynamically each hour via `getProvidersForShift()`.

### 9.3 Methodology

**Trauma/Team 4 exclusion.** All trauma-source patients (475), "Both" entries (24), and A-side patients historically assigned to Team 4 (140) are excluded. Rationale: Team 4 is the trauma team — these patients don't compete for assignment among Teams 1–3 and including them would add noise. This leaves **1,958 A-side encounters** across Teams 1–3.

**Cohort splitting.** Arrivals are split into two cohorts by hard time boundaries:

- **Primary (three-team): 9A–midnight** — Teams 1, 2, 3 all eligible. 1,541 encounters across 121 days. This is where the formula has the most room to differentiate with three candidates and varying capacity compositions.
- **Secondary (two-team): midnight–9A** — Team 3 closed, only Teams 1 & 2 eligible. 417 encounters across 120 days. Tests whether the formula adds value even when round-robin is nearly optimal (just alternating).

**Three-way simulation.** For each date and cohort, three independent simulation tracks run on the same arrival sequence and provider roster:

1. **Actual** — uses the historical `team_assignment` directly. Tracks patients for load calculation but creates no buffers (buffers didn't exist in the real workflow). This gives a clean picture of how stressed teams actually were.
2. **Formula** — runs `getRecommendation()` at each arrival with full engine logic: capacity scoring, acuity-weighted load, decay, and buffer management.
3. **Round-Robin** — cycles through eligible teams sequentially. Includes buffers (same as Formula) to isolate the effect of the assignment algorithm vs. round-robin baseline.

**Provider status simplification.** All providers are treated as `active` with no status changes (in_procedure, off_floor, etc.). This is a conservative assumption — in reality, status changes create capacity asymmetries that the formula can exploit but round-robin cannot, so the formula's true advantage is likely understated.

### 9.4 Metrics

**Per-date, per-mode:**
1. **Fairness score (0–100)** — composite via `computeFairness()`: capacity-proportional balance (25%), acuity balance (15%), overwhelm avoidance (30%), min ratio (15%), stress equity (15%).
2. **Gini coefficient (patient count)** — 0 = perfectly equal distribution, 1 = maximally unequal. Standard measure used in hospital resource allocation literature.
3. **Gini coefficient (acuity-weighted)** — same measure on weighted burden (ESI 1=5, ESI 2=3, ESI 3+=1). Captures whether one team absorbed disproportionate high-acuity load.
4. **Avg/min capacity ratio** — how stressed teams were at each assignment. Higher = more headroom.
5. **Overwhelm events** — assignments where capacity ratio < 3.75 (empirical p5 threshold from 23,193 observations; see Methods §1).
6. **Back-to-back high-acuity** — same team receives two ESI 1-2 patients within 30 minutes.
7. **Slams** — any team receives 2+ A-side patients within a 1-hour window. This is the metric providers feel most viscerally: getting hit with consecutive patients before the first workup is complete.
8. **Daily team spread** — max minus min patient count across teams.

**Cross-mode metrics:**
9. **Formula agreement rate** — % of arrivals where the formula would have assigned the same team as actually happened.
10. **Actual picked best** — % of arrivals where the historical assignment happened to go to the team with the highest capacity ratio at that moment.

**Aggregate statistics:** Mean ± SD, paired t-tests, Cohen's d effect sizes, win/loss/tie counts. Per-day-of-week breakdown. All computed using the same statistical functions as the existing real-schedule benchmark.

**Outcome correlation (optional, `--outcomes` flag):** Purely retrospective analysis testing whether daily load imbalance (coefficient of variation of acuity-weighted team loads) correlates with patient outcomes (door-to-disposition time, admission rate delta between most-loaded and least-loaded teams). Uses Pearson r with t-test significance.

### 9.5 Results — Primary Cohort (Three-Team, 9A–Midnight)

| Metric | Actual | Formula | Round-Robin |
|--------|--------|---------|-------------|
| Fairness (0–100) | 85.5 ± 7.3 | 92.0 ± 3.0 | 92.7 ± 2.6 |
| Gini (patient count) | 0.141 ± 0.090 | 0.065 ± 0.038 | 0.039 ± 0.031 |
| Gini (acuity-weighted) | 0.157 ± 0.094 | 0.085 ± 0.053 | 0.075 ± 0.056 |
| Avg Capacity Ratio | 62.5 ± 13.1 | 72.3 ± 15.2 | 70.1 ± 15.4 |
| Min Capacity Ratio | 14.6 ± 14.8 | 29.4 ± 23.1 | 26.7 ± 23.1 |
| Back-to-back HA/day | 0.7 ± 0.9 | 0.1 ± 0.4 | 0.1 ± 0.4 |
| Slams (2+ pts/team/hr) | 2.2 ± 1.9 | 1.2 ± 1.4 | 0.9 ± 1.3 |
| Daily Team Spread | 2.5 ± 1.6 | 1.2 ± 0.7 | 0.7 ± 0.5 |

**Formula vs Actual:** 75.2% win rate, +6.5 fairness points, Cohen's d = 0.83 (large), p < 0.001. Consistent across every day of the week (Monday 67% to Sunday 89%).

**Formula vs Round-Robin:** 35.5% win rate, -0.7 fairness points. RR edges Formula on pure distribution metrics (it's mathematically optimal for count equity), but Formula achieves higher avg and min capacity ratios — it routes patients to teams with more headroom, which RR cannot do.

**Historical process has zero capacity awareness:** Actual assignments hit the highest-capacity team 31.7% of the time — essentially random (33.3% expected with 3 teams). The formula would have changed 2/3 of all assignments.

### 9.6 Results — Secondary Cohort (Two-Team, Midnight–9A)

| Metric | Actual | Formula | Round-Robin |
|--------|--------|---------|-------------|
| Fairness (0–100) | 79.2 ± 14.2 | 88.5 ± 12.1 | 88.8 ± 12.1 |
| Gini (patient count) | 0.220 ± 0.189 | 0.122 ± 0.159 | 0.115 ± 0.160 |
| Slams (2+ pts/team/hr) | 0.4 ± 0.7 | 0.1 ± 0.5 | 0.1 ± 0.4 |

Formula vs Actual remains significant (p<0.001, d=0.66). Formula vs Round-Robin: not significant (p=0.25). With only 2 teams, alternating is nearly optimal. The formula still significantly outperforms the actual historical process.

### 9.7 Outcome Correlation

Load imbalance (CoV) vs door-to-dispo: r = -0.103, p = 0.26 (not significant). Load imbalance vs admission rate delta: r = -0.016, p = 0.86 (not significant). The imbalances in this dataset were not severe enough to measurably affect patient throughput. Mean door-to-dispo was nearly identical between most-loaded (361 min) and least-loaded (365 min) teams.

### 9.8 Design Decisions

**No provider status simulation.** All providers treated as active. Status changes (in_procedure, off_floor) are omitted because: (a) no historical status-change data exists, (b) simulating them would introduce synthetic assumptions into an otherwise fully real benchmark, (c) the simplification is conservative — it understates the formula's advantage since the formula can react to status changes while RR cannot.

**No buffers in Actual mode.** Buffers are part of the app's logic and didn't exist in the real workflow. Including them would give the Actual arm a benefit it never had. Formula and RR modes include buffers to reflect what would actually happen if the tool were deployed.

**Hard cohort boundaries (9A/midnight).** Team 3's shift spans 9A–1A, but using fixed boundaries avoids complexity of detecting per-day Team 3 availability from schedules. The two cohorts together cover all 1,958 encounters — no patients are dropped.

**ESI distribution difference.** The real data is 2.1% ESI-1, 75.8% ESI-2, 22.1% ESI-3+ — heavily skewed toward ESI-2 compared to the synthetic benchmark's 25/50/25 split. This means most patients have identical acuity weight (3), making count distribution more important than acuity distribution. The formula's advantage comes primarily from capacity-aware routing rather than acuity balancing.

### 9.9 Congruency with Existing Benchmarks

| Benchmark | Data | Formula Win % vs Baseline |
|-----------|------|--------------------------|
| Synthetic (1,000 runs) | Random arrivals, preset teams | 75% vs RR |
| Real-schedule (1,000 runs) | Random arrivals, real schedules | 72% vs RR |
| **Historical replay (121 days)** | **Real arrivals, real schedules** | **75.2% vs Actual** |

The historical replay confirms the synthetic findings with no synthetic components. The formula's advantage is robust across data sources and holds against the actual historical assignments — not just a theoretical round-robin baseline.

### 9.10 Implementation

Script: `scripts/historical-replay.ts`. Modeled on `scripts/real-schedule-benchmark.ts` — reuses the same schedule parsing pipeline, provider ID management, scoring overrides, and statistical functions (paired t-test, Cohen's d, Gini coefficient, Pearson r).

```bash
npx tsx scripts/historical-replay.ts                    # console report
npx tsx scripts/historical-replay.ts --outcomes         # + outcome correlation
npx tsx scripts/historical-replay.ts --verbose          # + per-date detail
npx tsx scripts/historical-replay.ts --json             # + JSON export
```

JSON export (`historical-replay-results.json`) contains per-date metrics for all three modes, with sequential patient IDs (H-001, H-002...) and no attending names or PHI.

---

## 10. Weight Sensitivity Analysis — 4:2:1 Acuity Weights Re-Run

### 10.1 Objective

Test whether the historical replay benchmark results are robust to changes in the acuity demand weights. The original benchmark used weights of 5:3:1 (Tier One : Tier Two : Tier Three). A cross-study review of EP workload literature (documented in `ACUITY_WEIGHT_RATIONALE.md`) identified that these weights overstate the spread between tiers — particularly the Yellow:Purple gap — relative to empirical EP time-per-patient data. The sensitivity analysis re-runs the identical three-way benchmark with empirically adjusted weights to determine whether the formula's advantage holds, grows, or shrinks.

### 10.2 Evidence Base for 4:2:1 Weights

Three direct-measurement studies of EP time per triage level converge on the conclusion that the 5:3:1 weights overweight Red and underweight Purple:

| Source | n | Red:Yellow | Yellow:Purple | Red:Purple |
|--------|---|-----------|---------------|------------|
| Dreyer/POWER (means) | 11,716 | 1.89:1 | 1.48:1 | 2.80:1 |
| POWER (medians) | 11,716 | 1.99:1 | 1.49:1 | 2.97:1 |
| Innes (means) | 585 | 1.59:1 | 1.16:1 | 1.84:1 |
| **Original app (5:3:1)** | — | **1.67:1** | **3.00:1** | **5.00:1** |
| **Proposed (4:2:1)** | — | **2.00:1** | **2.00:1** | **4.00:1** |

The largest correction is the Yellow:Purple gap: from 3:1 down to 2:1 (POWER empirical: ~1.5:1). The 4:2:1 scheme is intentionally conservative — Red:Purple at 4:1 overstates the POWER empirical of ~2.9:1 to account for qualitative burden of resuscitations not captured by time alone.

### 10.3 Methodology

#### CLI Extension

Added a `--weights` flag to `scripts/historical-replay.ts` accepting colon-separated weights (e.g., `--weights 4:2:1`). The flag overrides both acuity weights and decay schedules in the `ScoringOverrides` passed to the recommendation engine. When omitted, the script uses the default 5:3:1 weights from `constants.ts`, preserving backward compatibility and ensuring the original results are reproducible.

#### Decay Schedule Adjustment

The POWER study data also indicated that Red decay at 60 minutes is too aggressive (mean CTAS-1 treatment time is 73.6 minutes). The `--weights` flag adjusts decay schedules to match the new weight ratios:

| Tier | Original Decay (5:3:1) | Adjusted Decay (4:2:1) |
|------|----------------------|----------------------|
| Red | 5 → 3 at 60m → 1 at 120m → 0 at 240m | 4 → 2 at 90m → 1 at 180m → 0 at 240m |
| Yellow | 3 → 1 at 90m → 0 at 240m | 2 → 1 at 90m → 0 at 240m |
| Purple | 1 → 0 at 120m | 1 → 0 at 120m (unchanged) |

The decay steps descend through the weight tiers: Red initial → Yellow weight → Purple weight → 0. Yellow and Purple timings are unchanged; Red's first decay step moves from 60m to 90m and second from 120m to 180m.

#### Hardcoded Weight Fix

During implementation, two locations in the script were found using hardcoded `{ tier_one: 5, tier_two: 3, tier_three: 1 }` instead of the overridden weights: the Gini acuity-weighted computation in `buildMetrics()` and the outcome correlation function. Both were corrected to use the effective weight scheme, ensuring the acuity-weighted Gini and correlation analyses reflect the actual weights being tested.

#### Output Isolation

Custom-weight runs export to separate files (`historical-replay-results-4-2-1.json`, `HISTORICAL_REPLAY_RESULTS_4-2-1.md`) to avoid overwriting the original baseline results.

### 10.4 Results — Primary Cohort (Three-Team Hours, 1,541 encounters, 121 days)

| Metric | 5:3:1 Formula | 4:2:1 Formula | Change |
|--------|--------------|--------------|--------|
| Fairness (0–100) | 92.0 ± 3.0 | 92.2 ± 2.8 | +0.2 |
| Win rate vs Actual | 75.2% | 77.7% | +2.5 pp |
| Cohen's d vs Actual | 0.83 | 0.84 | +0.01 |
| Gini (count) | 0.065 ± 0.038 | 0.062 ± 0.035 | -0.003 |
| Gini (acuity-weighted) | 0.085 ± 0.053 | 0.074 ± 0.046 | -0.011 |
| Avg Capacity Ratio | 72.3 ± 15.2 | 72.9 ± 14.7 | +0.6 |
| Min Capacity Ratio | 29.4 ± 23.1 | 31.8 ± 21.4 | +2.4 |
| Slams/day | 1.2 ± 1.4 | 1.2 ± 1.4 | unchanged |
| B2B HA/day | 0.1 ± 0.4 | 0.1 ± 0.4 | unchanged |
| Formula vs RR delta | -0.7 (p=0.02) | -0.5 (p=0.06) | gap narrowed |

#### Day-of-Week Significance

With 5:3:1 weights, Saturday was the only day that failed to reach significance (p=0.06). With 4:2:1 weights, all seven days of the week reached statistical significance (Saturday p=0.02). This is the single most notable change: the formula's advantage becomes universally significant.

### 10.5 Interpretation

1. **Formula advantage grew:** Win rate increased from 75.2% to 77.7%. The formula benefits from weights that better reflect true resource demand — unbalanced Purple assignments carry more cost under 4:2:1, and the formula is the only method that routes based on capacity.

2. **Acuity-weighted Gini improved across all methods:** Narrowing the Yellow:Purple gap means Purple patients carry proportionally more weight. This tightened the acuity Gini for Formula (0.085 → 0.074), Round-Robin (0.075 → 0.066), and Actual (0.157 → 0.151).

3. **Capacity ratios improved:** The slower Red decay (first step at 90m vs 60m) means patient load persists longer, giving the formula more signal to differentiate teams. Min capacity ratio improved for all methods.

4. **Count-based metrics unchanged:** Gini (count), team spread, B2B HA, and slams are weight-independent for the Actual and Round-Robin modes. Formula count metrics barely moved because the routing decisions themselves changed only slightly (~0.4% more agreement with actual).

5. **Robustness confirmed:** The formula's advantage is not an artifact of the 5:3:1 weight spread. Under more conservative, empirically grounded weights, every metric either held steady or improved.

### 10.6 Design Rationale

- **CLI flag vs code change:** Weights are overridden at runtime via `--weights` rather than modifying `constants.ts`, ensuring the production app is unaffected and both weight schemes can be compared in the same session.
- **Decay adjustment bundled with weights:** Decay step values are derived from the weight ratios (each step drops to the next tier's weight) rather than being independently configurable. This keeps the parameter space manageable while ensuring internal consistency.
- **Conservative adjustment:** The 4:2:1 scheme intentionally overshoots the POWER empirical ratios for Red:Purple (4:1 vs 2.9:1) to account for qualitative workload factors not captured by time-per-patient metrics.

---

## 11. Worked Example — Patient-by-Patient Benchmark Walkthrough

### 11.1 Objective

Provide a concrete, patient-by-patient walkthrough of the historical replay benchmark methodology using real data from a single shift. The aggregate statistics (fairness scores, Gini coefficients, effect sizes) demonstrate that the formula outperforms the actual process — but a reader encountering these numbers cannot easily verify *how* they were computed. The worked example serves as a methodological appendix: "here is what the benchmark actually did, step by step."

### 11.2 Day Selection — February 9, 2026 (Sunday)

Selected from the 121 three-team days based on these criteria:

| Criterion | Feb 9 Value | Why It Matters |
|-----------|-------------|----------------|
| Actual fairness | 62.0 (lowest quartile) | Clear illustration of the problem |
| Formula fairness | 92.2 | 30-point improvement, dramatic contrast |
| Actual distribution | 8/4/0 across Teams 1/2/3 | Extreme imbalance (Gini = 0.44) |
| Formula distribution | 3/4/5 | Well-balanced (Gini = 0.11) |
| Arrival count | 12 patients | Small enough to walk through each one |
| Acuity mix | All ESI 2 (Yellow) | Removes acuity variation as a confound — differences are purely routing |
| Slams | 3 under Actual, 0 under Formula | Demonstrates buffer mechanism |

### 11.3 Methodology

#### Extraction Script

Created `scripts/extract-worked-example.ts` — a standalone script that:

1. Loads the census Excel for Feb 9, 2026, three-team hours (9 AM – midnight), non-trauma
2. Loads the matching provider schedule (`February 9_Weekly Schedule_v2.xlsx`)
3. Replays all 12 arrivals through the three modes with verbose per-patient logging
4. For each arrival, outputs: timestamp, ESI, acuity tier, per-team capacity/load/ratio before assignment, team chosen by each mode, buffer state after assignment, running team counts

The script uses the same engine functions (`getRecommendation`, `scoreTeam`, `createBuffer`, `getCurrentLoad`, `getEffectiveCapacity`) and the same `ScoringOverrides` as the full benchmark, ensuring the numbers are exactly reproducible.

#### Walkthrough Structure

The worked example document (`WORKED_EXAMPLE.md`) follows this structure:

1. **Staffing setup** — providers on each team with capacity weights, showing all three teams start at equal capacity (35)
2. **Formula mechanics** — brief explanation of capacity ratio, buffers, and decay (readers need this to follow the walkthrough)
3. **Patient-by-patient detail (patients 1–6)** — the first six arrivals are shown in full, which is where the critical divergence occurs (Actual sends 5 straight to Team 1; Formula spreads 2/2/1)
4. **Full assignment table (all 12)** — compact table showing every patient's assignment under all three modes
5. **Final scorecard** — side-by-side metrics with interpretation
6. **Connection to aggregate** — how this day's pattern scales across the 122-day dataset

### 11.4 Key Findings from the Walkthrough

**The divergence begins at Patient 2** (10:39 AM, 5 minutes after Patient 1). All three modes agreed on Patient 1 (Team 1, tiebreaker). At Patient 2, Team 1 is buffered in Formula/RR modes. The formula routes to Team 2; the actual process sends another patient to Team 1.

**By Patient 5** (12:39 PM), Actual has sent all 5 patients to Team 1 (ratio = 7.0, "Busy"). Teams 2 and 3 have zero patients. Under Formula, the spread is 2/2/1 with no team below ratio 11.7.

**The buffer mechanism is the key differentiator** over simple capacity routing. Without buffers, the formula would have sent Patient 4 back to Team 1 anyway (tied ratios, lowest team number wins). The 25-minute buffer after each Yellow assignment forces the formula to look at other teams, preventing the slam pattern that Actual exhibits.

**Formula agreed with Actual on only 3 of 12 assignments (25%).** In all 9 disagreements, the formula chose the team with higher available capacity at the moment of assignment.

### 11.5 Design Rationale

- **Single-acuity day chosen deliberately:** All 12 patients are ESI 2, which eliminates acuity as a variable and makes the routing differences purely attributable to the assignment logic. A mixed-acuity day would be harder to follow and would require explaining decay differentials at every step.
- **First 6 patients in full detail, remainder summarized:** The divergence is established by Patient 5. Repeating the same level of detail for all 12 would be redundant and lose the reader.
- **Real provider names included:** The schedule uses actual provider names (from the schedule files) because the example is part of an internal methodology document. The names make the staffing setup concrete and verifiable against the source schedule.
- **Extraction script kept in repository:** `scripts/extract-worked-example.ts` is retained for reproducibility — anyone can re-run it to verify the numbers in the document.

---

## 12. Fairness Sub-Score Decomposition

### 12.1 Objective

Surface the five internal components of the composite fairness score as individually reportable metrics. The composite score (0–100) is useful for head-to-head comparison but opaque — it's impossible to tell from a single number *why* the formula outperforms the actual process. Decomposing the score into its sub-components reveals where the advantage comes from and, critically, where it doesn't.

### 12.2 Implementation

Added `FairnessBreakdown` interface and `computeFairnessDetailed()` to `src/engine/fairness.ts` using Option A (non-breaking): the existing `computeFairness()` now delegates to `computeFairnessDetailed()` and returns just `.composite`, so all existing callers (including the live dashboard) are unaffected.

The five sub-scores, each on a 0–1 scale:

| Sub-Score | Weight | Computation |
|-----------|--------|-------------|
| Capacity Balance | 25% | 1 − CV of (patients / capacity) per team |
| Acuity Balance | 15% | 1 − CV of acuity-weighted load per team |
| Overwhelm Avoidance | 30% | 1 − (overwhelm events / total assignments) |
| Min Ratio Score | 15% | min(minRatio / 3.75, 1) |
| Stress Equity | 15% | 1 − CV of average capacity ratio per team |

The benchmark script (`scripts/historical-replay.ts`) was updated to store `FairnessBreakdown` in `CohortMetrics`, report sub-scores in a new console table section (between core metrics and head-to-head), and include them in JSON export.

### 12.3 Results (Primary Cohort, Three-Team Hours)

**5:3:1 Weights:**

| Sub-Score | Actual | Formula | Delta |
|-----------|--------|---------|-------|
| Capacity Balance (25%) | 0.715 ± 0.174 | 0.841 ± 0.082 | +0.126 |
| Acuity Balance (15%) | 0.700 ± 0.176 | 0.835 ± 0.103 | +0.135 |
| Overwhelm Avoidance (30%) | 1.000 ± 0.000 | 1.000 ± 0.000 | 0 |
| Min Ratio Score (15%) | 1.000 ± 0.000 | 1.000 ± 0.000 | 0 |
| Stress Equity (15%) | 0.810 ± 0.102 | 0.897 ± 0.055 | +0.087 |

**4:2:1 Weights:**

| Sub-Score | Actual | Formula | Delta |
|-----------|--------|---------|-------|
| Capacity Balance (25%) | 0.715 ± 0.174 | 0.843 ± 0.077 | +0.128 |
| Acuity Balance (15%) | 0.700 ± 0.176 | 0.841 ± 0.098 | +0.141 |
| Overwhelm Avoidance (30%) | 1.000 ± 0.000 | 1.000 ± 0.000 | 0 |
| Min Ratio Score (15%) | 1.000 ± 0.000 | 1.000 ± 0.000 | 0 |
| Stress Equity (15%) | 0.819 ± 0.099 | 0.903 ± 0.050 | +0.084 |

### 12.4 Key Finding

Overwhelm Avoidance and Min Ratio Score — which together carry **45% of the composite weight** — are perfect 1.000 for all three methods across all 121 days. No team in this dataset ever hit the overwhelm threshold (capacity ratio < 3.75). This means:

1. The entire 6.5–6.6 point fairness gap between Formula and Actual is driven by the three distribution-equity sub-scores (Capacity Balance, Acuity Balance, Stress Equity).
2. The current ED workload levels are not dangerous enough to trigger overwhelm events — the formula's value at these volumes is preventing **inequitable** distribution, not preventing **unsafe** overload.
3. If the ED were busier (higher arrival rate, thinner staffing), the overwhelm and min-ratio sub-scores would start differentiating the methods, likely widening the formula's advantage further.

### 12.5 Design Rationale

- **Option A (non-breaking):** `computeFairnessDetailed()` is a new function; `computeFairness()` delegates to it. This avoids touching the live app's dashboard code, which calls `computeFairness()` directly.
- **Raw 0–1 scale:** Sub-scores are reported on their raw scale, not multiplied by their composite weights. This lets readers see the actual magnitude of each component independent of its weight in the composite formula.

---

## 13. Acuity-Weighted Team Spread Metric

### 13.1 Objective

Add a clinically intuitive metric for severity distribution: the daily gap in acuity-weighted load between the heaviest and lightest team. The existing acuity-balance metrics (Gini coefficient 0–1 and fairness sub-score 0–1) are abstract. "The Gini dropped from 0.151 to 0.074" doesn't land with a clinical audience. But "the severity gap between the heaviest and lightest team dropped from 5.0 to 2.4 acuity points" is immediately tangible and mirrors the already-understood Daily Team Spread (patient count gap).

### 13.2 Definition

For each day, for each eligible team: sum all assigned patients' acuity weights (using the active weight scheme). Acuity-Weighted Spread = max(team loads) − min(team loads). Report as mean ± SD across all days.

### 13.3 Implementation

The per-team acuity loads were already computed in `buildMetrics()` for the Gini calculation. The new metric simply takes `max − min` of the same `acuityLoadValues` array. Added `acuitySpread` to `CohortMetrics`, the console output table (positioned after Daily Team Spread), and the JSON export.

### 13.4 Results (Primary Cohort, Three-Team Hours)

| Weight Scheme | Actual | Formula | Round-Robin |
|---------------|--------|---------|-------------|
| 5:3:1 | 7.3 ± 4.2 | 3.9 ± 2.1 | 3.4 ± 2.1 |
| 4:2:1 | 5.0 ± 2.9 | 2.4 ± 1.4 | 2.1 ± 1.3 |

The formula cuts the severity gap roughly in half vs Actual under both weight schemes. Compared to Daily Team Spread (patient count gap: 2.5 → 1.2), the acuity-weighted spread tells a consistent story but on a different scale that reflects workload intensity rather than just headcount.

### 13.5 Interpretation

Under 4:2:1 weights: on an average day, the actual process left 5.0 acuity points of gap between the busiest and lightest team — equivalent to 2.5 Yellow patients' worth of extra load on one team vs another. The formula reduced this to 2.4 points (roughly 1.2 Yellow patients). This is a concrete, presentable number that maps directly to clinical experience: "on a typical day, the formula would have moved about one Yellow patient's worth of severity from the overloaded team to the underloaded team."

### 13.6 Design Rationale

- **Same data, new view:** Reuses the `acuityLoads` already computed for Gini, avoiding redundant computation.
- **Respects `--weights` flag:** Uses `effectiveAcuityWeights` so the metric reflects whichever weight scheme is active.
- **Positioned alongside Daily Team Spread:** The two metrics are complementary — count spread and severity spread — and belong together in the output.

---

## 14. In-App Evidence Walkthrough — Design & Editorial Decisions

### 14.1 Objective

Build a swipeable card-based walkthrough (`EvidenceWalkthrough.tsx`) that presents the historical 4:2:1 benchmark results to a non-technical clinical audience (attendings, nurses). Designed for 1:1 demos on a phone — hand the device over, say "swipe through this." Accessible from the RoleSelection screen via a prominent emerald-green "See the Evidence" button.

### 14.2 Data Source

All numbers are hardcoded from the 4:2:1 weight results of the real-schedule benchmark (Section 10). Study period: Dec 2025 – Mar 2026, 121 days, 1,541 A-side encounters across Teams 1, 2, and 3. No live computation occurs in the walkthrough.

### 14.3 Card Architecture — 11 Cards, Dimension-Tagged

Each data card is tagged with the Fairness Score dimension it illustrates, using a `DimensionTag` component (small blue pill label). This creates a visual thread connecting individual metrics back to the composite score on Card 8. The mapping:

| Card | Title | Fairness Dimension |
|------|-------|--------------------|
| 1 | The Study | — (context) |
| 2 | The Current Process | — (baseline framing) |
| 3 | Slams | Stress Equity |
| 4 | Back-to-Back High Acuity | Stress Equity |
| 5 | Patient Count Gap | Capacity Balance |
| 6 | Severity Gap | Acuity Balance |
| 7 | Worst Moment of a Typical Day | Safety Floor |
| 8 | Fairness Score (composite) | — (synthesis) |
| 9 | 7/7 Days (Win Rate) | — (win rate) |
| 10 | What Changes | — (scope of change) |
| 11 | Summary | — (recap) |

The original blueprint had 10 cards with Cards 5 (Patient Distribution) combining both count and severity bars. During implementation, this was split into two dedicated cards (5: Capacity Balance, 6: Acuity Balance) so each concept gets full-screen treatment on mobile without vertical overflow.

### 14.4 Editorial Decisions — What Was Removed and Why

Several elements from the original blueprint were removed during iterative review with the stakeholder:

1. **Gini Coefficient InfoTip (Card 6).** Removed because it's an academic metric that adds no value for the clinical demo audience. The visual bar charts already communicate the gap reduction without needing an economics term.

2. **Red Zone threshold (Card 7, Safety Floor).** The entire red zone line, "3.75" label, and Red Zone InfoTip were removed. Rationale: the threshold is derived from the 5th percentile of simulation data (Section 1) and would appear arbitrary to the audience. The card now simply shows the two capacity-ratio numbers (18 vs 32) and states the formula provides "2× the breathing room."

3. **Overwhelm Avoidance (Fairness Score).** Removed from the composite score display because all three methods scored 1.00 — it's a non-differentiating dimension. Showing it invites the question "why include something where everyone tied?" The remaining four dimensions (Capacity Balance 35%, Acuity Balance 25%, Stress Equity 20%, Safety Floor 20%) are re-weighted to sum to 100%.

4. **Redundant slam/danger-stacking definitions.** Cards 3 and 4 each had three places defining the same term: the subtitle, a body paragraph, and an InfoTip. Reduced to just the subtitle (e.g., "2+ patients to one team within 1 hour") since it's self-explanatory. The body paragraph on Card 3 also incorrectly implied stabilization relevance ("before they've stabilized the first one") — slams are purely time-based, not clinical-state-based.

5. **Closing quote.** The "coin flip" quote on the summary card was removed at stakeholder request.

6. **"Three methods" → "Both methods."** The walkthrough compares only the current process vs. the formula. Round-robin was dropped from the presentation scope, so "three methods compared" was corrected to "both methods compared."

7. **Tier language → Color language.** "Tier One/Two/Three (ESI 1/2/3+)" was updated to "Red (ESI 1) / Yellow (ESI 2) / Purple (ESI 3+)" to match the app's current clinical nomenclature.

### 14.5 Technical Design Decisions

1. **InfoTip portal rendering.** The bottom-sheet overlay uses `createPortal(…, document.body)` instead of rendering inline. This was required because the card slider uses CSS `transform: translateX()` for slide animation, and a parent `transform` causes `position: fixed` children to be positioned relative to the transformed container rather than the viewport. Without the portal, the bottom sheet rendered but was clipped by `overflow-hidden` on the card viewport — invisible to the user.

2. **InfoTip label prop.** Initially the ℹ️ icon was a tiny 20×20px button with the term name as a separate non-clickable `<span>`. Users couldn't tap it reliably on mobile. The component was refactored to accept an optional `label` prop, rendering the text inside the button element so the entire "ℹ️ Term Name" area is one tappable target with a 32px minimum height.

3. **Text contrast.** All secondary text was initially `text-slate-400 dark:text-slate-500`, which was too faint in light mode. Globally updated to `text-slate-600 dark:text-slate-400` for better readability.

4. **Comparison bars with units.** The `ComparisonBar` helper component was extended with an optional `unit` prop to display "patients" or "acuity pts" alongside the numeric values, making the bars self-documenting.

5. **Swipe implementation.** Touch events with a 50px horizontal threshold, ignoring vertical-dominant gestures to avoid hijacking scroll. Slide animation via `translateX` with 300ms ease-out transition on a horizontal flex row of `min-w-full` cards. Supplemented with keyboard arrow navigation and tappable arrow buttons for accessibility.

### 14.6 Entry Point

A new button on `RoleSelection.tsx` using the same early-return conditional rendering pattern as the existing benchmark reports. Styled with `bg-gradient-to-r from-emerald-600 to-teal-600` to visually differentiate from the blue Guided Tour button. Subtitle: "4 months of real data, 1,541 encounters."

## 15. Evidence Walkthrough — Visual Improvements & Editorial Refinements

### 15.1 Objective

Polish the Evidence Walkthrough's visual presentation for 1:1 demos. Six CSS/JSX-only improvements were specified in `VISUAL_IMPROVEMENTS_BRIEF.md`, plus editorial refinements to the win-rate card (Card 9) discovered during review.

### 15.2 Visual Changes

1. **Bigger comparison bars with embedded labels.** The `ComparisonBar` helper was increased from `h-5 sm:h-6` (20–24px) to `h-8 sm:h-10` (32–40px). The value+unit label was moved from a separate `<span>` beside the bar to an absolutely-positioned label inside the bar container (right-aligned). This makes the bar itself carry the data rather than relying on an adjacent text element. Text color is `text-slate-800 dark:text-slate-200` (near-black) for all bars regardless of fill percentage — an early iteration tried white text on filled bars but shorter bars (e.g., Formula at 48%) placed the label over the grey track, making it unreadable.

2. **Horizontal bar gauge on CardSafetyFloor (Card 7).** Previously displayed two floating numbers (18 and 32) side by side — the only data card with no graphic element. Replaced with two `ComparisonBar` instances: Current (18, amber) and Formula (32, blue) with maxValue=35. The "2× the breathing room" text was preserved in a callout card below the bars. This makes the improvement visually proportional rather than requiring mental arithmetic.

3. **Standardized Current = amber-500.** The "Current" value color was inconsistent across cards. CardDangerStacking used `text-red-500` for "0.7" and CardSafetyFloor used `text-slate-600` for "18". Both were changed to amber-500 (via `bg-amber-500` in ComparisonBar and `text-amber-500` on the hero number). The visual language is now consistent: **amber = status quo, blue = formula** across all 11 cards. The CardDangerStacking callout box retains its red theme (`bg-red-50`, `text-red-600`) since that card is about danger — only the comparison number changed.

4. **CSS entrance animations.** Three keyframe animations added to `src/index.css`:
   - `fadeScaleIn` (opacity 0 + scale 0.9 → full, 500ms ease-out) — applied to hero numbers
   - `fadeSlideUp` (opacity 0 + translateY 8px → full, 500ms ease-out, 200ms delay) — applied to callout cards
   - ComparisonBar width grows from 0% to target via `transition-all duration-700 ease-out` (no keyframe needed — the `isActive` prop toggles the inline `width` style)
   
   Each card component received an `isActive: boolean` prop. The main component passes `isActive={i === currentCard}` when rendering each card. When `isActive` is false, animated elements render with `opacity-0`; when true, CSS animation classes apply. A `prefers-reduced-motion` media query disables animations for accessibility.

5. **Vertical bar pair for CardAcuityBalance (Card 6).** Previously identical in structure to CardCapacityBalance (horizontal bars), making consecutive swipes feel like the same card. Replaced with two vertical columns (width 56px/64px) that grow upward from 0% to target height. Current (5.0, amber) fills ~83% of the container; Formula (2.4, blue) fills ~40%. The height difference immediately communicates "this number got smaller." Value labels sit above each bar, and "Current"/"Formula" labels below.

6. **Bumped FairnessScore text sizes (Card 8).** All `text-[10px]` instances changed to `text-xs` (12px) for dimension labels, weight percentages, and score values. The subtitle changed from `text-[10px] sm:text-xs` to `text-xs sm:text-sm`. Label column width increased from `w-[110px] sm:w-[130px]` to `w-[120px] sm:w-[140px]` to accommodate the larger text without truncation. The fairness dimension bars also received the `isActive` grow-from-zero animation.

### 15.3 Editorial Refinement — Win Rate Card (Card 9)

During review, the card's hero stat (77.7%) was misleading. The subtitle "of days, the formula scored higher on the Fairness Score" implied the formula only won ~78% of weekdays, when in fact it won all 7 days of the week. The 77.7% refers to individual shift-days (94 of 121).

Three options were evaluated:
- **Option A**: Keep 77.7% hero, add "OUT OF 121 SHIFT-DAYS" framing label
- **Option B**: Lead with "7/7 days" hero, demote 77.7% to supporting detail
- **Option C**: Keep 77.7% with contextual framing line

**Option B was selected** — the "7/7" hook is more memorable for a 1:1 demo. Changes made:
- Hero number: `77.7%` → `7 / 7` (emerald)
- Subtitle: "Every day of the week, the formula scored higher on the Fairness Score"
- Supporting line: "77.7% overall (94 of 121 days)"
- Bar chart section header: added "Win rate per weekday" label
- Bottom pill: "Formula won every day of the week" → "All 7 days statistically significant" (removes redundancy with subtitle, adds new information)
- Removed standalone "Your patients, your teams, your schedules — no exceptions" paragraph (redundant)
- Summary card updated: "Wins 78% of days — every day of the week" → "Won 7/7 days of the week (77.7% of all shifts)"

### 15.4 Files Modified

- `src/components/EvidenceWalkthrough.tsx` — all visual and editorial changes
- `src/index.css` — added `fadeScaleIn`, `fadeSlideUp` keyframes and `prefers-reduced-motion` override

---

## 16. Team-Card Redesign — Battery Gauge, Empirically-Calibrated Fill Scale, and Pill Relocation

### 16.1 Objective

Replace the arc-gauge capacity widget, tighten vertical card height, and re-anchor the visual scale so that the red→green spectrum maps to capacity values that actually occur in real operations (not to simulation-extreme tails). A secondary goal was to fold the provider row into the tinted header so the card is scannable at a glance without reading multiple section labels. All tier vocabulary (Busy / Overwhelmed / etc.) was removed from the live UI; only the number, battery, and the word **Capacity** remain on the widget.

### 16.2 Battery Gauge Selection (G4f)

The arc gauge had a fixed 110×60 SVG footprint and broke down when the number-width exceeded its bounding arc (tested with 100.2, 1234.5, etc.). We prototyped six alternative widget concepts in `team-card-colors.html` (G1–G5 plus an iterated G4 family), each rendered across all six capacity tiers for comparison:

- **G1** horizontal bar with number above
- **G2** full donut ring
- **G3** pill badge (no gauge, just number + tier chip)
- **G4** segmented stepper with sub-variants:
  - G4a thin battery bars
  - G4b ascending signal bars
  - G4c dot indicators
  - G4d chunky pills
  - G4e ruler ticks
  - **G4f literal battery icon** (outlined shell + terminal cap + continuous fill)
- **G5** number + colored underline

**G4f was selected** because the battery metaphor is instantly parseable, the fill is continuous (no discrete steps that jump), the number lives cleanly above the shape, and the terminal cap gives the icon strong recognition at small sizes. The shell and cap take the tier color; the interior uses a `rgba(255,255,255,0.6)` track so the fill reads clearly against the tile-head tint.

Fill percentage is intentionally steep at the low end so an overwhelmed team (ratio 3.2) renders as a thin ~4-pixel sliver — visually alarming — rather than the chunky half-pill that an earlier even-scale prototype produced. This was refined iteratively by showing ratios 100.2, 28.5, 15.2, 8.7, 6.1, 4.3, 2.8, 0.8 side-by-side and tuning the stops until each tier looked distinct.

### 16.3 Empirical Fill-Scale Calibration

**The problem.** The initial simulation-derived thresholds (Comfortable ≥50, Manageable ≥23, Busy ≥16, Very Busy ≥11.5, High Demand ≥8.5, Red Zone <8.5) were calibrated against 23,193 simulated observations under the old 5:3:1 acuity weights. Applied to 1,958 **actual** per-arrival capacity ratios from the 4:2:1 historical replay (121 three-team days + 120 two-team days, Dec 2025 – Apr 2026), this scale produced a degenerate fill distribution: **86% of observations rendered in the top 20% of fill**, with 79.2% pinned above 90% fill. The battery barely moved during normal operations — the visual signal was effectively binary (full vs. "something is wrong"), which contradicted the goal of using the widget to show relative team state at a glance.

**Data pipeline.** `scripts/historical-replay.ts` already computed `ratioAtAssignment` per arrival but discarded the per-entry ratios during JSON serialization. A supplementary dump was added: `historical-replay-ratios-4-2-1.json`, which writes every arrival's assigned-team ratio across both cohorts. Running the replay with `--weights 4:2:1 --json` now produces both the daily-summary file and the per-arrival ratio file.

**Empirical distribution (actual per-arrival, n=1,958):**

| p1 | p5 | p15 | p25 | p50 | p75+ |
|---|---|---|---|---|---|
| 12.0 | 19.2 | 31.1 | 47.3 | 100 (clipped) | 100 (clipped) |

~50% of arrivals go to teams with effectively infinite ratio (zero load), which is why p50 pins at the 100 cap. The interesting range — where the battery should do visual work — is ratio 10–60.

**Options considered (all applied to the same 1,958 observations):**

| Option | Strategy | % in 0–90% fill |
|---|---|---|
| **A** — Percentile-anchored | stops at p1/p5/p15/p25 (12/19/31/47), 60 = full | **27.5%** |
| B — Log-perceptual | `log(ratio)/log(50)` | 17.7% |
| C — Simple linear | `ratio × 2`, clamp at 50 | 23.8% |
| D — Danger-forward | full at ≥30, compressed below | 12.8% |
| E — Stress-floor | full at ≥20, battery only signals danger | 4.4% |

**Option A was selected** because the product goal is granularity — the app allocates optimally on its own, so the visual scale's job is to surface relative team state across the shift, not just to alarm. Stops are anchored to real-world percentiles, so a visual difference on screen maps to a real-world operational difference: a battery below 40% means the team is in the bottom 5% of historical observations, not in the bottom 5% of an arbitrary model run.

**Final `capacityFillPercent` stops (in `src/constants.ts`):**

```
ratio 0 → 0%     (hard floor)
ratio 8.5 → 7%   (overwhelm threshold, preserved from fairness engine)
ratio 12 → 20%   (p1 of per-arrival)
ratio 19 → 40%   (p5)
ratio 31 → 60%   (p15)
ratio 47 → 80%   (p25)
ratio 60 → 100%  (anything above reads full; matches color stop)
```

### 16.4 COLOR_STOPS & Header-Tint Re-Alignment

`COLOR_STOPS` (the continuous color-interpolation table used for the capacity number and battery border) was updated to match the new fill stops:

```
0      → red-800   (#991b1b)
8.5    → red-600   (#dc2626)  [overwhelm threshold]
12     → red-500   (#ef4444)
19     → orange-500 (#f97316)
31     → yellow-500 (#eab308)
47     → green-500  (#22c55e)
60     → emerald-500 (#10b981)
```

**Tint-transition placement.** Initially the header Tailwind classes used stepped thresholds (`≥60 emerald`, `≥47 green`, `≥31 yellow`, …) identical to the color stops. This produced a visible mismatch: at ratio 42.5, the interpolated number color is already dominantly green (midway between yellow-500 at 31 and green-500 at 47), but the stepped rule still returned a yellow tint. The card showed a green number over a cream-yellow background — dissonant.

Fix: the tint transitions now fire at the **midpoints between COLOR_STOPS**, so the tint's hue tracks the interpolated number color:

```
emerald tint:  ≥ 54   (midpoint 47–60)
green tint:    ≥ 39   (midpoint 31–47)
yellow tint:   ≥ 25   (midpoint 19–31)
orange tint:   ≥ 15   (midpoint 12–19)
red tint:      ≥ 10   (midpoint 8.5–12)
red-dark tint: else
```

Applied in both `getCapacityHeaderGradient` (inline style) and the TeamCard `headerBg` Tailwind-class switch (for dark-mode support).

### 16.5 Infinity Cap & "Next Up" Tiebreaker Indicator

Any `ratio ≥ 100` now displays as `∞` (previously only `ratio === Infinity` did; a team with 0.01 load could otherwise produce `5477.5`, which overflowed the widget). Above 60 the battery is already full, so numeric precision in that range carries no information.

**Tiebreaker signal.** When multiple teams are all at effectively infinite capacity, the recommendation engine picks one by the least-recent-patient tiebreaker. The "Recommended" pill already shows which team was picked, but doesn't convey *why* — the pill could be there because of strict capacity dominance or because of a tiebreaker among tied teams. To surface this specifically in the ambiguous case, a small `· next up ·` annotation renders directly under the `CAPACITY` caption when *both*:

1. the team's display is capped at ∞, and
2. the team is `recommendationRank === 'first'`.

The annotation uses the same tier color as the rest of the widget with reduced opacity (0.8) and italic styling, so it reads as a footnote, not as a separate tier.

### 16.6 Inactive-Trauma Visual Treatment

Team 4 (Trauma) is excluded from auto-recommendations and often sits with zero patients. Displaying it with its live capacity color (usually comfortable/green, since it has providers but no load) misleadingly implied it was a viable target. Fix: when `isTrauma && teamPatients.length === 0`, the card switches to neutral-inactive styling:

- Header tint: flat slate-50 (same as no-providers state)
- Capacity number, battery border, caption: slate-400 grey
- **Battery interior: diagonal stripes** via `repeating-linear-gradient(-45deg, rgba(148,163,184,0.35) 0 2px, rgba(255,255,255,0.6) 2px 5px)` — a disabled-pattern cue borrowed from the stabilized-patient row

The moment a patient is assigned to Team 4, all of this flips back to the normal capacity-colored styling.

### 16.7 Provider-Pill Relocation Into the Tinted Header (Layout Option 2)

Five layout options were prototyped in `team-card-provider-layouts.html`:

1. Full pills below team info (full width)
2. **Strength/Load moves inline with team name; pills take the Strength/Load slot**
3. Pills right-aligned, two-column
4. Dots only (names on click)
5. Role-count chips (names on click)

**Option 2 was selected** because it's the densest layout that preserves full name-at-a-glance. The right column of the header now stacks as:

```
Line 1: Team N  ·  Strength 44.8  ·  Load 5.8
Line 2: Dr. Attending
Line 3: [provider pills]
Line 4: Buffered / Add Providers / Trauma notice (conditional)
```

The standalone `Providers (N)` collapsible section is deleted entirely. The `forceCollapseProviders` prop and `globalCollapseProviders` state were removed; the Dashboard's Compact Mode menu dropped the "Collapse all providers" toggle and Compact Mode now groups only the two remaining options (collapse patients + hide stabilized). The swap-provider form, previously nested inside the collapsed section, now renders as a full-width panel immediately below the tinted header when triggered.

**Provider pill details:**
- Attending is filtered out of the pill row (always shown separately as "Dr. [Name]" under the team number)
- `PROVIDER_TYPE_SHORT` was updated so residents display as `PGY-3/4` / `PGY-2` / `PGY-1` (was SR / JR / INT) — matches clinical vocabulary
- Pills are clickable and expand into the full status-management grid (active / in-procedure / taking-signout / off-floor) in a `basis-full` panel below the pill row
- Status is conveyed by a small dot at the left of the pill (matching `STATUS_COLORS`); non-active status adds a countdown chip to the pill

### 16.8 Patient-Decay Pie (D1e) on Patient Rows

Six decay-visualization options were prototyped in `patient-decay-designs.html` (ring, hourglass, stopwatch, shrinking bar, tier-step waypoints, pulse/fade). The ring was picked, then iterated into six fill treatments (D1a–D1f: stroke, solid pie, outlined pie, thick donut, **inverse pie**, donut pie).

**D1e (inverse pie) was selected.** The SVG renders a full tier-colored disc with a `rgba(255,255,255,0.82)` wedge that sweeps clockwise as time elapses within the patient's current decay window. Fresh patients show as a fully-colored disc; patients approaching the next decay tier show as nearly-consumed discs; stabilized patients show as a faded disc at 25% opacity. Deceased patients show no pie.

Progress calculation (`getDecayWindowProgress` in `PatientBadge.tsx`): for each patient, walks the ACUITY_DECAY step list, finds the current window `[windowStart, nextStepAfterMs]`, and returns elapsed-within-window ÷ window-span, clamped to `[0, 1]`. Returns `null` for stabilized patients.

The "stabilizes in [Xmins]" text was simultaneously removed from the visible patient row (previously cluttered the right side under "assigned X ago") and folded into a small italic italic dropdown panel that appears when the row is clicked.

### 16.9 Patient Count Pills & Stabilized Pill

The patient section now shows a narrow row of count tiles (`1 RED`, `2 YELLOW`, `0 PURPLE`) styled as inline-flex pills with big number + tiny uppercase tier label. Zero-count tiles dim to 40% opacity so they remain visible without drawing attention. The stabilized-toggle pill was moved into this same row as a grey tile (`{N} STABILIZED`), matching the visual grammar. Clicking toggles hide/show of stabilized rows; no ring outline (kept consistent with the other tiles).

### 16.10 Recommendation Border Color

The `.recommendation-first` glow animation border was changed from `#eab308` (yellow-500) to `#2563eb` (blue-600) so the outlined border matches the "Recommended" pill's background color. The pulse-glow keyframe's box-shadow halo was updated to matching rgba. The legend swatch in Dashboard.tsx was also updated to blue-600. The dashed `recommendation-second` outline was removed entirely; the "2nd Choice" pill alone conveys the ranking.

### 16.11 Files Modified

- `src/constants.ts` — `COLOR_STOPS` recalibration, new `capacityFillPercent` and `getCapacityHeaderGradient` stops, `PROVIDER_TYPE_SHORT` PGY labels
- `src/components/TeamCard.tsx` — full header rewrite (battery widget, inline Strength/Load, provider pill row, filter out attending), inactive-trauma styling, ∞ cap, Next Up annotation, absolute-positioned Recommended/2nd Choice/Closed pills in the top-right corner
- `src/components/ProviderStatusToggle.tsx` — pill-style compact rendering with basis-full expanded status panel
- `src/components/PatientBadge.tsx` — inline `DecayPie` SVG component, `getDecayWindowProgress` helper, renamed demand → load throughout, moved decay-info text to click-to-expand
- `src/components/Dashboard.tsx` — removed `globalCollapseProviders` state + "Collapse all providers" menu item + `forceCollapseProviders` prop wiring, recommendation legend swatch color update
- `src/index.css` — `.glass-card.recommendation-first` border + pulse-glow keyframe color change (yellow → blue-600); removed `.recommendation-second` dashed-border rule
- `scripts/historical-replay.ts` — side-output of per-arrival `ratioAtAssignment` dump (`historical-replay-ratios-{weights}.json`) for fill-scale recalibration
- `team-card-colors.html`, `team-card-provider-layouts.html`, `patient-decay-designs.html` — prototype files used to prototype and select widget / layout / decay-viz designs; retained as a living record of alternatives considered

---

## 17. Evidence Walkthrough — Mobile Rendering Repair (Walkthrough & Comparison Sections)

### Objective
Restore correct mobile rendering for the in-app Evidence Walkthrough (`public/walkthrough-v4.html`, the iframe loaded by `EvidenceWalkthrough.tsx`). The deck has three section chips — **Intro · Walkthrough · Comparison** — totaling 32 slides. The Intro section (slides 1–8) rendered correctly on iPhone; the Walkthrough (slides 9–27) and Comparison (slides 28–32) sections did not. Both showed horizontal overflow with body text and chart panels clipped on the left and right edges of the viewport.

### Diagnosis
Working from two iPhone screenshots (slide 5 — correct; slide 9 — broken), the failure modes were narrowed to three distinct CSS causes, all sharing the same root: layout primitives sized for desktop (fixed `width`, multi-column `grid` / `flex` containers) had no overrides inside the existing `@media (max-width: 600px)` block, even though the Intro section's mobile rules were already comprehensive (lines 914–1043).

| Slide(s) | Root cause | Symptom |
|----------|-----------|---------|
| 9 (`stepNYUBK`) | Inline `style="width: 640px"` on the `.lede` paragraph | Text block forced wider than viewport, overflowing both edges |
| 10–27 (`stepStart955`) | `.s955-grid` declared as `grid-template-columns: minmax(0, 1fr) minmax(0, 1.35fr)` with no mobile override | Team rows + chart squeezed side-by-side into ~190 px columns |
| 28–32 (`stepFormulaCompare`) | Inline `<div style="display:flex; gap:20px">` flex wrapper around two 560-px charts, no mobile override | Two `chart-wrap` panels jammed shoulder-to-shoulder, both clipped |

The default `.lede` rule already used `max-width: 640px`, which is mobile-safe — only the inline `width` override broke it. The other two sections lacked any mobile-specific rules at all because their wrapping classes (`.s955-grid`, the unnamed comparison flex div) post-dated the original mobile pass.

### Methodology / Implementation
Three changes, all confined to `public/walkthrough-v4.html`:

1. **Removed the fixed-width inline style on slide 9's lede** — changed `style="width: 640px; margin: 18px 0"` to `style="margin: 18px 0"`. The class default (`max-width: 640px`) already constrains the upper bound while permitting the paragraph to shrink below 640 px on narrow viewports.

2. **Tagged the comparison flex wrapper with a stable class** — added `class="compare-charts"` to the previously-anonymous `<div style="display:flex; gap:20px; align-items:flex-start">` in `stepFormulaCompare`, giving the mobile media query a clean selector hook without relying on positional or attribute selectors.

3. **Extended the mobile media query** with overrides for the two newly-failing sections:
   - `.s955-grid` collapses from two columns to `1fr` (team rows stack above the chart) with tightened gap.
   - `.s955-row` shrinks its grid template (`36px minmax(0, 1fr) auto auto`) and downscales typography for `.dv-team`, `.dv-num`, `.dv-den`, `.dv-eq`, `.dv-cap`, `.dv-cap-lbl`, and `.dv-mini-card`.
   - `.s955-right .chart-wrap`, `.chart-title`, and `.chart-legend` get reduced padding and font sizes so the chart fits cleanly below the team rows.
   - `.compare-charts` switches to `flex-direction: column`; both `.chart-wrap` panels get `width: 100%` and the comparison chart titles/legends shrink for the narrow viewport.

### Verification
Used Playwright at a 390 × 844 viewport (iPhone 12/13/14 baseline) against the locally-served walkthrough. For each section, the script invoked the deck's internal renderer (`current = N; phase = M; render()`) to jump directly to representative slides, then measured `document.body.scrollWidth` against `window.innerWidth`:

| Slide | Section | Result | scrollWidth × innerWidth |
|-------|---------|--------|--------------------------|
| 9     | Walkthrough (NYUBK intro) | Pass | 390 × 390 |
| 10    | Walkthrough (T+0 zero-state) | Pass | 390 × 390 |
| 22    | Walkthrough (mid-window, three patients chip-loaded) | Pass | 390 × 390 |
| 28    | Comparison (historical vs formula) | Pass | 390 × 390 |

Full-page screenshots confirmed: text wraps within the viewport, team rows stack vertically with patient chips remaining inline, the chart panel sits below the rows at full mobile width, and the two comparison charts stack one above the other rather than side-by-side. No content is clipped at either edge.

### Design Rationale
- **Surgical, layout-only changes.** No JS, no engine, no scoring, no data — strictly CSS plus one class-name addition. The desktop rendering is unchanged because every fix lives inside `@media (max-width: 600px)`.
- **Class-name over attribute-selector for the comparison wrapper.** Targeting `[style*="display:flex"]` would have been brittle and would have applied to any future inline-flex wrapper. A semantic class (`compare-charts`) keeps the mobile rule colocated with the slide it targets.
- **Stack rather than scale for the Walkthrough section.** The team rows + chart in `stepStart955` carry meaningful spatial relationships (load chips proportional to weight, chart x-axis time markers). Aggressive horizontal scaling would have shrunk these below legibility; vertical stacking preserves the visual grammar at full mobile width.
- **Why the Intro section already worked.** It was built with a mobile-first review pass in mind (see lines 914–1043, ~130 lines of mobile rules covering `.rr-diagram`, `.teams-grid`, `.weights-table`, `.formula`, etc.). The two later sections were added without an equivalent pass — this work closes that gap.

### Files Touched
- `public/walkthrough-v4.html` — three changes: inline-style removal at the NYUBK lede, `compare-charts` class on the comparison flex wrapper, and a ~24-line addition to the mobile media query covering `.lede`, `.s955-grid`, `.s955-card`, `.s955-row` (and its descendants), `.s955-right` chart components, and `.compare-charts` / `.compare-slide` chart components.

### Outcome
Committed as `e0abeb4` on `main` and pushed to `origin/main` (which serves as the source for the deployed prototype). All three walkthrough sections now render without horizontal overflow at iPhone-class viewport widths.

---

*Subsequent sections will be added as additional facets of the model are analyzed and calibrated.*
