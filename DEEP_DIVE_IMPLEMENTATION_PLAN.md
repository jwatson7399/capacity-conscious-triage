# Implementation Plan: Deep Dive Methodology Page + Visual Improvements

Two tasks in one pass: (1) update the Worked Example into a comprehensive methodology deep dive accessible from the evidence walkthrough, and (2) implement the visual improvements from `VISUAL_IMPROVEMENTS_BRIEF.md`.

---

## Part 1: Updated Worked Example → In-App Methodology Deep Dive

### What exists

`WORKED_EXAMPLE.md` is a patient-by-patient walkthrough of Feb 9, 2026 — one real shift showing how Actual, Formula, and Round-Robin diverge. It's strong on mechanics but missing several sections needed for a complete "show your work" document.

### Sections to add

The content for all of these already exists in project files. Pull from the referenced sources — don't invent new claims.

#### 1. Data Source (new section, add before Step 1)

**Source:** Epic EMR at NYU Langone Brooklyn. Describe:
- Patient arrival times: extracted from ED tracking board timestamps in Epic
- Team assignments: the actual team each patient was assigned to in the real workflow
- Provider schedules: weekly `.xlsx` schedule files (18 files covering Dec 2025–Mar 2026) parsed by `src/utils/scheduleParser.ts`
- Scope: 2,597 total A-side encounters. 639 Trauma/Team 4 excluded → 1,958 A-side across Teams 1-3. Primary cohort is three-team hours (9AM–midnight): **1,541 encounters across 121 days**.

**Reference:** `HISTORICAL_REPLAY_RESULTS_4-2-1.md` lines 1-16, `METHODS.md` lines 15-27.

#### 2. Where the Provider Weights Come From (expand existing table in Step 1)

Add a paragraph explaining the Delphi survey methodology:
- 6 ER providers (mix of attendings, residents, PAs) independently rated each provider type's capacity relative to an attending (fixed at 20)
- Results polled every 5 minutes from a Google Sheet via `useSurveyWeights` hook
- Fallback defaults in `constants.ts` used when sheet unavailable
- Survey averages closely matched the fallback defaults (e.g., Senior Resident: 15.2 survey vs 15.0 fallback)

**Reference:** `CLAUDE.md` — "Capacity Weights" section and "Delphi Survey" section.

#### 3. Where the Acuity Weights Come From (new section, after provider weights)

Explain the 4:2:1 derivation:
- Six studies reviewed: POWER (n=11,716, 11 EDs, direct EP time observation), Innes (n=585, stopwatch), Levin (n=5,516), Traub (n=55,508), Hocker/NHAMCS (n=133M), Wrede (n=202)
- Cross-study synthesis: Red:Yellow ratios clustered 1.89–1.99:1, Yellow:Purple 1.48–1.49:1
- 4:2:1 is the simplest integer ratio fitting the evidence
- Original weights were 5:3:1; the biggest correction was Yellow:Purple (3:1 → 2:1)
- Sensitivity tested: formula wins 75.2% with 5:3:1, 77.7% with 4:2:1, all 7 days significant with 4:2:1

**Reference:** `ACUITY_WEIGHT_RATIONALE.md` (full document — especially the POWER study data on lines 26-38 and the cross-study synthesis). `HISTORICAL_REPLAY_RESULTS_4-2-1.md` lines 131-165 (comparison table).

#### 4. How the Fairness Score Is Calculated (new section, after Step 4 scorecard)

Show the composite formula with sub-scores computed for Feb 9 specifically:

```
Fairness = (Capacity Balance × 0.35) + (Acuity Balance × 0.25)
         + (Stress Equity × 0.20) + (Safety Floor × 0.20)
```

Note: The evidence walkthrough displays weights as 35/25/20/20. The underlying `fairness.ts` uses 25/15/30/15/15 with five components (Overwhelm Avoidance and Min Ratio Score are both 1.000 for all methods and are folded into the display weights). For the worked example, show the four displayed dimensions and their Feb 9 values for Actual vs Formula.

**Reference:** `HISTORICAL_REPLAY_RESULTS_4-2-1.md` lines 38-48 (sub-score table). `src/engine/fairness.ts` for the actual computation. The evidence walkthrough `FAIRNESS_ROWS` array for the display weights.

**Important:** You'll need to either compute Feb 9's sub-scores from the replay data, or note that Feb 9's Fairness of 62.0 (Actual) vs 92.2 (Formula) can be decomposed. If the exact sub-scores aren't readily available for that specific day, state the 121-day averages and note Feb 9 was a particularly bad day.

#### 5. Statistical Methods (new section, after Fairness Score explanation)

Describe:
- Test: paired comparison of daily fairness scores (Formula vs Actual, same day = same patients, same schedules)
- Win rate: percentage of days where Formula fairness > Actual fairness
- Effect size: Cohen's d = (mean difference) / (pooled SD) — 0.84 is "large" by conventional thresholds
- p-values: significance threshold p < 0.05, all 7 days individually significant
- Day-of-week stratification: tested separately to confirm the formula doesn't just win on easy days

**Reference:** `HISTORICAL_REPLAY_RESULTS_4-2-1.md` lines 52-72 (head-to-head and day-of-week tables).

#### 6. Buffer Ablation Finding (new section, after statistical methods)

Summarize the decomposition from Decision 13 in the Cowork Roundtable:
- Added a fourth arm: Formula with zero-duration buffers (capacity routing only, no cooldowns)
- Result: capacity-aware routing delivers ~95% of every improvement
- Buffers contribute ~5% (7 extra slams prevented, 7 extra B2B HA prevented over 121 days)
- Buffer effect is not statistically significant (p = 0.44 fairness, p = 0.09 slams)
- Implication: the improvement is real and comes from the math, not a fragile cooldown timer

**Reference:** `Cowork Roundtable.md` — Decision 13 (lines 254-291).

#### 7. Fix data discrepancy

The document opens with "1,958 real patient arrivals across 122 days" but the evidence walkthrough uses 1,541/121. Update the intro to clearly state:
- Total dataset: 1,958 A-side encounters across 122 days
- Primary cohort (three-team hours, 9AM–midnight): 1,541 encounters across 121 days — this is what the evidence walkthrough presents
- The worked example day (Feb 9) falls within the primary cohort

### Implementation: In-App Rendering

Add a "How We Ran the Numbers" deep dive accessible from the evidence walkthrough:

1. **Add a secondary CTA to CardSummary (slide 11)** — below the "Back to App" button, add a text link: "How we ran the numbers →" styled as a subtle link (not a primary button).

2. **Create a new component: `MethodologyDeepDive.tsx`** — a full-screen scrollable page that renders the updated worked example as styled HTML. Match the app's existing aesthetic (dashboard-bg, glass-card panels, Tailwind typography). Use the same Back button and header pattern as the evidence walkthrough.

3. **State management** — add a state flag in the evidence walkthrough (e.g., `showMethodology`) that toggles between the card carousel and the deep dive view. The deep dive's Back button returns to the carousel (at slide 11).

4. **Content structure** — render as scrollable sections with clear headers, styled tables (matching the app's glass-card look), and code blocks for formulas. This is a reading document, not a swipeable card deck. Aim for clean typography at readable sizes (16px body, 14px tables minimum).

5. **The updated markdown content** — apply all the additions from sections 1-7 above to `WORKED_EXAMPLE.md` first, then use that as the source content for the component. The component can either import the content as structured data (preferred) or hardcode it as JSX.

---

## Part 2: Visual Improvements (from VISUAL_IMPROVEMENTS_BRIEF.md)

These are all changes to `src/components/EvidenceWalkthrough.tsx`. Full specs are in `VISUAL_IMPROVEMENTS_BRIEF.md` but here's the summary:

1. **Bigger comparison bars** on CardCapacityBalance and CardAcuityBalance — increase from h-5/h-6 to h-8+, consider embedding values inside bars
2. **Horizontal bar gauge on CardSafetyFloor** — replace raw "18 / 32" with a visual bar comparison
3. **Standardize Current = amber-500** — CardDangerStacking "0.7" from red-500 → amber-500, CardSafetyFloor from slate-600 → amber-500 (keep the B2B HA callout box red-themed)
4. **CSS entrance animations** — bars grow, hero numbers fade in, tied to current slide visibility
5. **Differentiate CardAcuityBalance visually** from CardCapacityBalance — use a different chart type (diverging bar, vertical bar pair, etc.) so they don't look like clones
6. **Bump text size on CardFairnessScore** — text-[10px] → text-[11px] or text-xs

---

## Execution Order

1. Visual improvements first (Part 2) — these are self-contained CSS/JSX changes to one file
2. Update `WORKED_EXAMPLE.md` with the new sections (Part 1, sections 1-7)
3. Build `MethodologyDeepDive.tsx` component
4. Wire the CTA into CardSummary and add state management
5. Run `npx tsc --noEmit` to verify no type errors
6. Run `npm run build` to verify production build (may fail on dist/ permissions in sandbox — that's fine, tsc passing is sufficient)

---

## Files to Read

Before starting, read these files for source content:
- `VISUAL_IMPROVEMENTS_BRIEF.md` — full specs for Part 2
- `WORKED_EXAMPLE.md` — current worked example to update
- `ACUITY_WEIGHT_RATIONALE.md` — acuity weight derivation (6 studies)
- `METHODS.md` — capacity scale calibration methodology
- `HISTORICAL_REPLAY_RESULTS_4-2-1.md` — all benchmark results
- `Cowork Roundtable.md` — Decision 13 (buffer ablation), Decision 1 (acuity weights)
- `CLAUDE.md` — Delphi survey setup, provider weights, scoring formula
- `src/components/EvidenceWalkthrough.tsx` — current implementation
- `src/engine/fairness.ts` — fairness score computation
