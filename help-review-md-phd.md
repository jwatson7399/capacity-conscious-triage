# Help Section Review: MD/PhD Attending Perspective

## Context
Reading as a scientifically-minded attending who's worked this ER for years and wants to understand the value proposition, the mechanism, and whether the model is sound.

## Problems identified

1. **The intro tells me things I already know.** Three bullets about round-robin's flaws — I lived it. Skip the sales pitch and give me the model. The intro should establish the mechanism in one sentence ("Replaces round-robin with a capacity-based scoring model") and move on.

2. **The formula is presented without justification.** Why Capacity = Strength / Demand (a ratio) rather than Strength - Demand (a difference)? The ratio means a team with Strength 35 and Demand 7 scores the same as Strength 5 and Demand 1 — is that intentional? A brief note on why the ratio was chosen would satisfy a scientific reader.

3. **Provider weights feel arbitrary without calibration notes.** Attending = 17.5, Senior Resident = 15.0, PA = 10.0, Junior = 7.5, Rotator = 1.0. These are plausible but an MD/PhD immediately asks: how were these derived? Expert consensus? Empirical tuning? Even one sentence ("weights reflect estimated supervisory capacity based on departmental input") would help.

4. **Status multiplier rationale is missing.** "In Procedure = 25%" — most attendings would argue someone mid-procedure is effectively 0%. Why 25%? A parenthetical explaining the reasoning (e.g., "still available for brief consultations, returning soon") would preempt pushback.

5. **Decay is a step function but presented ambiguously.** "→ 3 at 60m → 1 at 120m" could be misread as gradual. Clarify: "drops instantly to 3 after 60 minutes" or note explicitly that decay is stepped, not continuous.

6. **The "What the numbers mean" callout is the most useful content but buried** inside a collapsible section. The capacity number and its interpretation are what this person will reference daily — surface it higher.

7. **Buffer mechanism mixes model with UI description.** "The colored bar shrinks as time passes" — that's visual, not mechanism. The mechanism is: "team receives a time-limited immunity from recommendation after each assignment." Separate the two.

8. **Recommendation priority hierarchy lacks rationale.** The 5-step algorithm is clear (exclude Trauma → check buffers → compare capacity → recency tiebreak → team ID tiebreak), but *why* this ordering? Why do buffers override capacity entirely? A sentence per step explaining the clinical rationale would help: "Buffers override capacity because back-to-back assignments overwhelm teams regardless of theoretical headroom."

9. **"All teams buffered" edge case is excellent.** This is the kind of mechanism detail a scientifically-minded reader appreciates. Keep it.

10. **The benchmark link is buried at the bottom.** This is the #1 thing an MD/PhD wants to see — quantitative evidence that the formula outperforms round-robin. It should be much more prominent, possibly in the intro area.

11. **No mention of auditability.** Can I review *why* Team 2 was recommended at a specific time? Are override reasons logged anywhere reviewable? An MD/PhD involved in QA will ask this immediately.

12. **Redundancy still applies here:**
    - Trauma exclusion mentioned 3 times (intro, recommendations, overrides)
    - Buffer behavior explained in two different sections
    - Override logging mentioned twice

## What this audience wants that's currently missing
- **Weight calibration methodology** — even one sentence
- **Why ratio, not difference** — brief mathematical note
- **Step function clarity** for decay
- **Priority hierarchy rationale** — why buffers > capacity > recency
- **Audit trail mention** — where to review recommendations and overrides
- **Benchmark evidence prominently placed** — not hidden at the bottom
