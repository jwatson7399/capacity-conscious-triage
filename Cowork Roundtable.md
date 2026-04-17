# Cowork Roundtable

A running record of the debates, decisions, and rationale behind each development for the ER Triage App. This document captures the thought process — not just what we decided, but why, what we considered and rejected, and what changed our minds.

---

## Session: April 7, 2026 — Benchmark Presentation Strategy

### Context

We had completed a historical three-way benchmark (Actual vs Formula vs Round-Robin) on 1,958 real A-side encounters from Dec 2025–Mar 2026. The task was to present these results to hospital administrators (MDs, RNs) and everyday ER staff in the most tangible, persuasive way possible. Julian also wanted to re-run the benchmark with evidence-based acuity weights (4:2:1 instead of 5:3:1) and build the presentation directly into the app.

### Decision 1: Acuity Weights — 5:3:1 → 4:2:1

**What we debated:** The original benchmark used 5:3:1 acuity weights (Tier One : Tier Two : Tier Three). Julian asked whether the weights should be closer to empirical values. Initial suggestion was 3:1.5:1 (raw POWER study median ratios), but Julian corrected to 4:2:1.

**Why 4:2:1:** After independently reviewing all six evidentiary studies (POWER n=11,716, Innes n=585, Levin n=5,516, Traub n=55,508, Hocker/NHAMCS n=133M, Wrede n=202), the cross-study synthesis showed Red:Yellow ratios clustered around 1.89–1.99:1 and Yellow:Purple around 1.48–1.49:1. The 4:2:1 ratio was the simplest integer ratio that fit the evidence — close to the empirical 2:1 for both adjacent tiers. The biggest correction was Yellow:Purple, which moved from 3:1 to 2:1 (the original 5:3:1 had significantly overweighted Tier Two relative to Tier Three).

**Result:** 4:2:1 strengthened the formula's case — win rate rose from 75.2% to 77.7%, Saturday became significant (p=0.06 → 0.02), all 7 days reached significance, and the Formula vs Round-Robin gap narrowed to near-parity. A full rationale document was created (`ACUITY_WEIGHT_RATIONALE.md`) with citations for stakeholder discussions.

**Files created:** `WEIGHT_SENSITIVITY_PLAN.md`, `ACUITY_WEIGHT_RATIONALE.md`, `Acuity Weight Rationale - Why 4-2-1.docx`, `HISTORICAL_REPLAY_RESULTS_4-2-1.md`

---

### Decision 2: Presentation Tier Strategy

**What we debated:** How to organize ~15 metrics for an audience that ranges from MDs to administrators to frontline nurses.

**What we decided:** Three tiers:
- **Tier 1 (visceral, no explanation needed):** Slams, back-to-back HA — everyone's lived these
- **Tier 2 (one sentence of setup):** Coin flip (31.7%), daily team spread, capacity ratio, win rate
- **Tier 3 (appendix):** Cohen's d, p-values, Gini coefficient, fairness score composite

**Why:** Leading with metrics that provoke an emotional response ("who's been slammed?") builds buy-in before introducing anything statistical. Administrators don't need to understand Gini coefficients to feel the impact of 128 fewer slams.

---

### Decision 3: "Overwhelmed" → "Red Zone"

**What we debated:** The term "overwhelmed" is subjective — it describes a feeling, not a state. In a clinical audience, subjective terms invite pushback ("I've never felt overwhelmed"). We needed something objective that describes the staffing condition, not the emotional experience.

**What we decided:** Rename to "Red Zone" throughout the app and documentation. Red Zone describes an objective capacity state (ratio < 3.75, the p5 threshold from 23,193 empirical observations), not a subjective feeling.

**How we got there:** We created 9 clinical scenario examples calculated with 4:2:1 weights showing what the 3.75 threshold actually looks like in practice — e.g., a senior resident managing two ESI-2 patients and an ESI-3 hits a ratio of 3.75 exactly. These scenarios make the threshold tangible without relying on emotional language.

**Files created:** `RED_ZONE_REFRAME.md` (implementation plan), `RED_ZONE_EXAMPLES.md` (9 clinical scenarios with math)

---

### Decision 4: Stacking Slams + Back-to-Back HA

**What we debated:** Whether to present slams (2+ patients/team/hour) and back-to-back high-acuity (two ESI 1-2 within 30 min) as separate metrics or together.

**What we decided:** Stack them as a one-two punch. Slams are the volume problem everyone relates to. Back-to-back HA is the danger version — the patient safety argument. The progression goes: "this annoying thing happened 128 extra times... and this dangerous thing happened 66 extra times."

**Why:** Neither metric alone is as powerful as the combination. Slams get heads nodding, back-to-back HA gets people worried. Together they move the audience from "that's frustrating" to "that's unsafe."

**Key numbers (4:2:1):** Slams: 2.2 → 1.2/day (45% reduction, 128 fewer). Back-to-back HA: 0.7 → 0.1/day (85% reduction, 66 fewer).

---

### Decision 5: The Coin Flip Reframe (31.7%)

**What we debated:** How to present the finding that the current process picks the highest-capacity team 31.7% of the time (random chance with 3 teams = 33.3%).

**What we decided:** This is the most important rhetorical move in the presentation. It flips the burden of proof from "is the formula good enough?" to "the thing you're comparing against is literally random." Frame it as a question to the audience: "If I told you we were assigning patients by flipping a coin, would you be okay with that?"

**Why this works:** The biggest barrier isn't "is the formula good?" — it's "what we're doing now is fine." This stat proves it isn't fine. It eliminates nostalgia for the status quo.

**Rebuttal we prepared:** If someone says "we're considering things the formula can't see," the response is: if those invisible factors were systematically helping, you'd expect to beat random chance by a meaningful margin. 31.7% vs 33.3% means whatever informal logic is being applied washes out to noise in aggregate.

---

### Decision 6: Retiring the Fairness Score as a Lead Metric

**What we debated:** The 77.7% win rate and 6.6-point delta are both measured against the fairness score. Anyone who digs in would need to understand what the fairness score is made of — a weighted composite of 5 sub-scores (Capacity Balance 25%, Acuity Balance 15%, Overwhelm Avoidance 30%, Min Ratio 15%, Stress Equity 15%).

**What we decided:** Don't lead with the fairness score. Instead, present each of its component metrics individually first — using tangible versions the audience already understands. Then reveal the fairness score as "we rolled all of these into one number." Then drop the 78% win rate as the capstone.

**Why:** The audience trusts each ingredient because they've already seen it work. The composite feels earned rather than opaque. Nobody asks "what's in the fairness score?" because you just showed them. This was Julian's idea and it fundamentally restructured the presentation flow.

**Presentation order:**
1. Slams + Back-to-back HA (visceral)
2. Coin flip / 31.7% (reframes status quo)
3. Daily team spread + acuity-weighted spread (tangible distribution)
4. Gini coefficients (statistical backing)
5. Min capacity ratio / safety floor (worst case)
6. Fairness score reveal → 78% win rate (capstone)
7. Agreement rate (closing — why 2/3 change)

---

### Decision 7: Extracting Fairness Sub-Scores

**What we debated:** The fairness score sub-scores (capacity balance, acuity balance, etc.) were calculated inside `computeFairness` but never returned individually. To present them standalone, we needed them surfaced in the benchmark output.

**What we decided:** Add a non-breaking `computeFairnessDetailed()` function that returns all five sub-scores alongside the composite. The existing `computeFairness()` calls it and returns just `.composite`. This avoids changing any existing callers (the live dashboard uses `computeFairness`).

**Result:** Claude Code implemented it. Sub-scores now appear in both benchmark results files. Key finding: Overwhelm Avoidance and Min Ratio Score are both 1.000 across all methods — the entire fairness score difference is driven by Capacity Balance, Acuity Balance, and Stress Equity.

**Files created:** `FAIRNESS_SUBSCORES_PLAN.md`

---

### Decision 8: Acuity-Weighted Team Spread (New Metric)

**What we debated:** The acuity balance sub-score (0.700 → 0.841) and the Gini coefficient (0.151 → 0.074) are both abstract numbers that don't translate intuitively. Julian pushed back: "0.7 to 0.8 doesn't really intuitively translate to 'one team gets twice as many patients.'"

**What we decided:** Add a new metric: acuity-weighted team spread — `max(team acuity load) - min(team acuity load)` per day. This is the severity equivalent of daily team spread and uses the same format people already understand.

**Result:** Actual: 5.0 acuity points → Formula: 2.4 acuity points. Now you can say "the severity gap between the heaviest and lightest team dropped from 5 acuity points to 2.4 — roughly one extra ESI-2 patient's worth."

**How it pairs with Gini:** Julian wanted to keep the Gini coefficient for statistical credibility but add the acuity spread right after it to drive the point home. The Gini is the credibility, the spread is the comprehension. Both presented together with the patient count spread for continuity.

**Files created:** `ACUITY_SPREAD_PLAN.md`

---

### Decision 9: Omitting Red Zone Avoidance and Folding Stress Equity

**What we debated:** Red Zone Avoidance scored 1.000 for all three methods — no team ever hit the threshold. Stress Equity (0.819 → 0.903) is on an abstract 0-1 scale that doesn't land.

**What we decided:**
- **Red Zone Avoidance:** Omit from standalone presentation. If all methods pass, it doesn't differentiate. Keep as a one-liner if someone asks ("nobody hit the Red Zone — all methods passed").
- **Stress Equity:** Fold into the fairness score reveal rather than giving it a standalone slide. It's largely redundant with capacity balance and acuity balance — if those are good, stress equity follows.
- **Keep both in the composite:** Even though we're not presenting them standalone, they stay in the fairness score formula. Overwhelm avoidance matters for future scenarios (worse staffing, higher volume). Removing it would require redistributing weights and re-running benchmarks.

**Julian's reasoning on Red Zone Avoidance specifically:** "will probably omit the red zone avoidance entirely." Clean and correct — if it doesn't help the argument, it doesn't need a slide.

---

### Decision 10: In-App Evidence Walkthrough

**What we debated:** Whether to build a separate slide deck or integrate the presentation directly into the app.

**What Julian decided:** Build it into the app as a swipeable card-based walkthrough. Accessed from the RoleSelection screen. Every time Julian shows the app to a new attending or nurse, the evidence is right there — no separate file to open, no projector needed. Hand someone your phone and say "swipe through this."

**Design principles we agreed on:**
- Mobile-first, one concept per card, no scrolling within a card
- Visual-first: big numbers, simple bar visuals, minimal text
- Definitions via tappable info icons (bottom sheet on mobile) — keeps cards clean while giving curious people the detail
- Matches existing app style (glass-card, Tailwind, dark mode, blue gradients)
- ~10 cards, under 90 seconds to swipe through

**Card flow (10 cards):**
1. The Study (1,541 encounters — credibility)
2. The Current Process (31.7% — coin flip reframe)
3. Slams (2.2 → 1.2/day)
4. Danger Stacking (0.7 → 0.1/day)
5. Patient Distribution (count spread + acuity spread paired)
6. Safety Floor (min capacity 18 → 32 with Red Zone line)
7. The Fairness Score (reveal 5 components → 92.2/100)
8. 78% of Days (win rate + day-of-week breakdown)
9. What Changes (66.4% of assignments change)
10. Summary (all highlights + closing quote)

**Files created:** `EVIDENCE_WALKTHROUGH_BLUEPRINT.md` — full spec with exact copy, visual treatments, info tip definitions, component architecture, and technical implementation notes for Claude Code.

---

---

## Session: April 7, 2026 — Evidence Review & Buffer Ablation Study

### Context

Reviewed the newly implemented Evidence Walkthrough (10-card swipeable section in the app) from the perspective of an ER Operations Officer evaluating whether to implement the system. Also ran a buffer ablation study to answer the question: "How much of the improvement comes from capacity-aware routing vs. the buffer cooldown system?"

### Evidence Walkthrough Review (ER Ops Officer Perspective)

**What's compelling:**
- The 31.7% coin-flip reframe (Card 2) is the single strongest persuasion tool — it flips burden of proof
- Safety metrics (85% reduction in back-to-back HA, 45% slam reduction) speak the language of risk committees
- Real data (1,541 encounters, 121 days, actual NYU BK schedules) is a major credibility advantage
- 77.7% win rate with all 7 days individually significant and Cohen's d = 0.84 is methodologically sound

**What an ops officer would push back on:**
- No connection to patient outcomes (door-to-provider, LWBS, bounce-backs) — workload equity is a leading indicator but the link isn't made explicit
- No comparison to simple round-robin (only formula vs current process shown) — ops will ask "why not just enforce round-robin?"
- No cost/implementation burden discussion (training, fallback plan, IT lift)
- No discussion of failure modes (mass casualty, shift changes, the 22.3% of days formula doesn't win)
- Scope is narrow (A-side only, Teams 1-2-3, excludes Team 4/Trauma)
- No provider buy-in data shown (attestation results exist but aren't surfaced)

**Deeper dives needed:** Weight sensitivity, time-of-day breakdown, buffer contribution isolation, prospective pilot plan.

### Decision 11: Buffer Ablation Study

**What we debated:** The buffer cooldown system (15-35 min cooldowns after patient assignment) is a core differentiator from round-robin, but the evidence section never isolates its contribution. An operations officer would reasonably ask: "How much comes from smart routing vs. the cooldown timers?"

**What we did:** Added a third arm to `real-schedule-benchmark.ts` — "formula without buffers" (capacity-aware routing with buffer durations set to zero). Same 1,000 iterations, same real schedules, same patient timelines. Three-way comparison: Formula (full) vs Formula (no buffers) vs Round Robin.

**The surprise result:** Buffers *hurt* the fairness score.

| Mode | Fairness Score |
|------|---------------|
| Formula (no buffers) | 87.9 ± 2.4 |
| Formula (with buffers) | 86.7 ± 5.2 |
| Round Robin | 84.8 ± 7.2 |

Capacity-aware routing alone scores **higher** than the full formula with buffers (+3.07 pts over RR). Adding buffers actually *reduces* fairness by 1.20 points. The no-buffer formula also wins head-to-head: No-Buffer wins 54% of runs vs Formula's 38%.

**Per-metric decomposition:**
- Overwhelms: No-buffer has *fewer* overwhelm events (0.5/run vs 1.0/run). Buffers block the highest-capacity team from receiving patients, forcing them to teams with lower capacity
- Min Ratio (safety floor): No-buffer is higher (6.5 vs 5.4). Same mechanism — buffers push patients away from the best-equipped team
- Demand Spread: Similar between both

**Why this matters:** Buffers were designed to prevent "slams" (rapid-fire assignments to one team). But the fairness score doesn't directly measure slam frequency — it measures capacity balance, acuity balance, stress equity, and safety floor. Buffers achieve their slam-prevention goal but at a cost to overall capacity distribution.

**What this does NOT mean:**
- It does NOT mean buffers are useless — they serve a specific clinical purpose (preventing team overload from rapid consecutive assignments)
- The fairness score may not fully capture the value buffers provide (slam prevention is a time-clustering concern, fairness score is a distribution concern)
- The slam reduction (2.2 → 1.2/day) and back-to-back HA reduction (0.7 → 0.1/day) are likely driven primarily by buffers, not capacity routing
- We need to run the slam/back-to-back HA counters in the no-buffer arm to confirm this hypothesis

**Open questions from initial finding:**
1. ~~Should we run a fourth arm that measures slam frequency and back-to-back HA specifically for the no-buffer formula?~~ → **Done. See Decision 12 below.**
2. Should we reframe buffers as a safety mechanism (anti-slam) rather than a fairness mechanism?
3. Should the evidence walkthrough present the buffer contribution separately — "capacity routing drives fairness, buffers prevent overload clustering"?
4. Is there a middle ground — shorter buffer durations that prevent slams without degrading fairness as much?

**Files modified:** `scripts/real-schedule-benchmark.ts` (added third arm, ablation decomposition report, per-metric breakdown)

### Decision 12: Slam & Back-to-Back HA Decomposition — The Plot Thickens

**What we did:** Added `countSlams()` and `countBackToBackHA()` functions (ported from the historical replay script) to the real-schedule benchmark's three-arm comparison, measuring slam frequency (2+ patients to same team within 1 hour) and back-to-back high-acuity events (two ESI 1-2 patients to same team within 30 min) for Formula, Formula-No-Buffers, and Round Robin.

**The results overturned our hypothesis:**

| Metric | Formula | No Buffers | Round Robin |
|--------|---------|------------|-------------|
| Slams/run | 13.0 ± 7.1 | 12.2 ± 6.6 | 12.8 ± 7.4 |
| Back-to-back HA/run | 2.7 ± 2.6 | 3.0 ± 2.7 | 2.6 ± 2.6 |

**What we expected:** Buffers would dramatically reduce slams and B2B HA, confirming they're the mechanism behind the evidence walkthrough's headline numbers (45% slam reduction, 85% B2B HA reduction).

**What actually happened:** All three modes produce nearly identical slam and B2B rates in the *simulated* benchmark. The formula *with* buffers actually has slightly *more* slams (13.0) than without buffers (12.2). Back-to-back HA is also nearly flat across all three.

**Why the discrepancy with the historical replay results:** The historical replay script operates on *real patient census data* — actual arrival times, actual team assignments — and compares what *actually happened* vs what the formula *would have done*. The real-schedule benchmark script generates *synthetic* patient timelines using Poisson arrival rates. The key difference:

- **Historical replay**: The "current process" (actual) numbers reflect the real-world assignment patterns that produced 2.2 slams/day and 0.7 B2B HA/day. The formula counterfactual shows what would have happened with the same patients.
- **Real-schedule benchmark**: All three modes operate on the *same* synthetic timeline with ~23 patients per 8-hour shift. With random Poisson arrivals, 3 eligible teams, and ~23 patients, slams are largely driven by arrival clustering (which is identical across all modes), not assignment strategy.

**The implication:** Buffers' slam-prevention value is most visible when patient arrivals cluster in real-world patterns (e.g., ambulance waves, shift-change surges). Uniform Poisson arrivals distribute more evenly by default, masking the buffer mechanism. The historical replay remains the authoritative source for slam/B2B HA headline numbers.

**What this means for the evidence section:**
- The slam and B2B HA reductions (45% and 85%) from the historical replay are valid and should stay as presented
- The buffer ablation is most cleanly interpreted through the fairness score lens, where it shows buffers trade ~1.2 points of distributional fairness for time-clustering protection
- A complete decomposition would require running the buffer ablation against the *historical replay* data, not the simulated benchmark
- The evidence walkthrough's framing remains sound — it's comparing formula vs actual, not formula vs no-buffer

**Files modified:** `scripts/real-schedule-benchmark.ts` (added `countSlams()`, `countBackToBackHA()`, slams and B2B HA to `RunMetrics` and all report sections)

#### Decision 13: Definitive Buffer Ablation — Historical Replay (Real Census Data)

**Context:** Decision 12 revealed that synthetic Poisson arrivals mask buffer effects because they don't cluster like real patient arrivals. The historical replay script uses actual Dec 2025–Mar 2026 census data (1,541 three-team-hour encounters across 121 days), making it the authoritative test bed. We added a fourth simulation arm (`formulaNoBuffer`) with zero-duration buffers to isolate capacity routing from buffer cooldowns.

**Results (three-team hours, 121 days):**

| Metric | Actual | Formula | No-Buffer | Round-Robin |
|--------|--------|---------|-----------|-------------|
| Fairness (0–100) | 85.7 | 92.2 | 92.2 | 92.7 |
| Slams/day | 2.25 | 1.19 | 1.25 | 0.86 |
| B2B HA/day | 0.65 | 0.11 | 0.17 | 0.12 |
| Overwhelms/day | 0.00 | 0.00 | 0.00 | 0.00 |
| Min Ratio | 18.0 | 31.8 | 32.3 | 29.1 |

**Decomposition — what's doing the work:**

| Metric | Total Δ (vs Actual) | From Capacity | From Buffers | % Capacity | % Buffers |
|--------|---------------------|---------------|--------------|------------|-----------|
| Fairness | +6.56 pts | +6.49 | +0.07 | 98.9% | 1.1% |
| Slam reduction | 1.06/day | 1.00 | 0.06 | 94.5% | 5.5% |
| B2B HA reduction | 0.55/day | 0.49 | 0.06 | 89.4% | 10.6% |

**Statistical significance:**
- Capacity routing effect: p < 0.001 for all three metrics (highly significant)
- Buffer cooldown effect: p = 0.44 (fairness), p = 0.09 (slams), p = 0.11 (B2B HA) — none reach significance

**Totals over 121 days:**
- 128 slams prevented: 121 from capacity routing, 7 from buffers
- 66 B2B HA events prevented: 59 from capacity routing, 7 from buffers

**The takeaway:** Capacity-aware routing is the engine — it delivers ~95% of every improvement the app produces. Buffers contribute a small, non-significant margin (~7 extra slam and B2B HA events prevented over 4 months). They don't hurt fairness either (unlike the simulated benchmark where they cost 1.2 points), but their value is marginal.

**What this means for the app:**
1. The evidence walkthrough's headline numbers (45% slam reduction, 85% B2B HA reduction) remain valid — they measure formula vs actual, and the formula includes buffers
2. Buffers are "nice to have" safety padding, not load-bearing infrastructure — if a charge nurse finds them annoying, the app would perform nearly identically without them
3. The core pitch simplifies: "Route patients to the team with the most capacity. That single change explains 95% of the improvement." Buffers become a secondary talking point, not a key mechanism
4. This answers the ER operations officer's question definitively: the improvement is real, it comes from the math, and it doesn't depend on a fragile cooldown timer that nurses might override

**Files modified:** `scripts/historical-replay.ts` (added `formulaNoBuffer` arm with zero-duration buffer overrides, ablation report section with decomposition and statistical tests)

---

### Decision 14: Restructuring Evidence Walkthrough — One Slide Per Fairness Dimension

**What we debated:** The Fairness Score (slide 7 of the original 10-card flow) presented four named components — Capacity Balance, Acuity Balance, Stress Equity, Safety Floor — but the preceding slides didn't explicitly introduce these terms. Stress Equity in particular had no dedicated page. Slides 3-4 (Slams, Back-to-Back HA) showed the *symptoms* of stress inequity but never named the concept. Capacity Balance and Acuity Balance shared a single slide (Patient Distribution) despite being 60% of the composite weight. The Fairness Score felt like it appeared out of nowhere with unfamiliar terminology.

**The tension:** Decision 2 (Tier Strategy) established that visceral, no-explanation-needed metrics (slams, back-to-back HA) should lead. Decision 9 said to fold Stress Equity into the composite rather than giving it a standalone slide. But the resulting flow left a comprehension gap — the audience encounters "Stress Equity: 0.90" for the first time on the composite slide with no prior context.

**What we decided:** Restructure from 10 to 11 slides. Each Fairness Score dimension gets explicitly labeled on its build-up page(s), but the visceral-first ordering is preserved:

1. The Study (credibility)
2. The Current Process (31.7% — coin flip)
3. **Stress Equity:** Slams (visceral — no explanation needed)
4. **Stress Equity:** Back-to-Back High Acuity (visceral + danger)
5. **Capacity Balance:** Patient Count Gap (standalone, was half of old slide 5)
6. **Acuity Balance:** Severity Gap (standalone, was other half of old slide 5)
7. **Safety Floor:** Worst Moment (explicitly labeled)
8. Fairness Score composite reveal (now all 4 terms are familiar)
9. 77.7% win rate
10. What Changes
11. Summary

**Why this works:** The component order follows *persuasion* order, not weight order. Stress Equity (20% weight) leads because its metrics (slams, B2B HA) are visceral and need zero explanation — preserving Decision 2's tier strategy. Capacity Balance (35%) and Acuity Balance (25%) follow with one sentence of setup each. Safety Floor (20%) provides the safety-argument closer. By the time the audience reaches the composite on slide 8, they've seen all four dimension names and understand what each measures.

**Design detail:** A subtle `DimensionTag` pill component (small blue-tinted rounded label) appears above each card's main header. Unobtrusive enough not to steal the emotional punch, but builds term familiarity through repetition (Stress Equity appears twice on slides 3-4).

**What this reverses:** Decision 9's call to fold Stress Equity into the composite. The original reasoning was statistical (Stress Equity correlates with Capacity/Acuity Balance), but that's a correlation claim, not a presentation claim. The audience doesn't know they correlate — they need the term introduced before they see it scored.

---

### Decision 15: In-App Methodology Deep Dive ("How We Ran the Numbers")

**What we debated:** The evidence walkthrough presents headline results (45% slam reduction, 77.7% win rate, etc.) but doesn't show the underlying methodology. An attending, department chair, or operations officer evaluating the system will want to see the work — how the data was sourced, where the weights come from, what statistical tests were used, and how the Fairness Score is actually computed.

**What exists:** `WORKED_EXAMPLE.md` — a strong patient-by-patient walkthrough of Feb 9, 2026 showing exactly how the three modes (Actual, Formula, Round-Robin) diverge on real data. But it's missing several critical sections: data source provenance (Epic EMR), acuity weight derivation (the 6-study synthesis behind 4:2:1), provider weight source (Delphi survey), Fairness Score formula and sub-score breakdown, statistical test details, and the buffer ablation finding (capacity routing = 95% of improvement).

**What we decided:** Two parts:
1. **Update `WORKED_EXAMPLE.md`** with six new sections pulling from existing project files (`ACUITY_WEIGHT_RATIONALE.md`, `METHODS.md`, `HISTORICAL_REPLAY_RESULTS_4-2-1.md`, Roundtable Decision 13, `CLAUDE.md`).
2. **Build an in-app deep dive page** accessible via a "How we ran the numbers →" link on the summary slide (slide 11). Renders as a scrollable styled page (not swipeable cards), matching the app's aesthetic. The Back button returns to the evidence walkthrough.

**Why in-app:** Same reasoning as Decision 10 (building the evidence walkthrough into the app instead of a separate deck). Hand someone the phone, they swipe through the evidence, and if they want the methodology, it's one tap away.

**Key data source note:** Patient arrival times and team assignments were extracted from Epic EMR at NYU Langone Brooklyn. Provider schedules from weekly `.xlsx` files parsed programmatically.

**Also bundled with this task:** Six visual improvements to the evidence walkthrough slides (bigger comparison bars, bar gauge for Safety Floor, consistent amber/blue color language, CSS entrance animations, visual differentiation of Capacity vs Acuity Balance slides, larger text on Fairness Score card). Full specs in `VISUAL_IMPROVEMENTS_BRIEF.md`.

**Implementation plan:** `DEEP_DIVE_IMPLEMENTATION_PLAN.md`

---

### Open Items / Future Sessions

- ~~Run slam/back-to-back HA counters in the no-buffer arm to decompose safety vs fairness contributions~~ ✅ Done (Decision 13)
- Explore buffer duration sensitivity (half-length buffers as a compromise?) — *Lower priority now that buffers shown to be marginal*
- Add round-robin comparison to the evidence walkthrough (currently only shows formula vs current process)
- Surface attending attestation results in the evidence section
- Connect workload equity to patient outcome proxies (even qualitative framing helps)
- Finalize the "Red Zone" rename across all app files (plan exists in `RED_ZONE_REFRAME.md`)
- Consider prospective pilot plan design for the evidence section
- Consider simplifying the evidence narrative: "capacity routing is the mechanism" as the core message, with buffers as optional safety margin
