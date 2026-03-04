# ER Triage Tool — Rebuttals & Methodology Defense

## Admin Question

> "This really comes down to the methodology and how well your objective and subjective mapping of 'overwhelm', 'strength', 'acuity' etc are true. What did you use for these criteria exactly? And what did you have in mind for integration of an app to the clinical triage setting?"

---

## How the Scoring Works

### Objective Measures

- **Strength** is calculated from provider type weights multiplied by real-time status. These reflect supervisory capacity and current availability, not subjective judgment.

| Provider Type | Weight |
|---|---|
| Attending | 17.5 |
| Senior Resident (PGY 3-4) | 15.0 |
| PA | 10.0 |
| Junior Resident (PGY 1-2) | 7.5 |
| Rotator | 1.0 |

| Status | Multiplier | Auto-Expires |
|---|---|---|
| Active | 1.0 | Never |
| Taking Signout | 0.5 | 30 min |
| In Procedure | 0.25 | 30 min |
| Off Floor | 0.0 | 15 min |

- **Demand** uses a 3-tier acuity system with time-based decay, mirroring how resource intensity decreases as patients stabilize.

| Tier | Initial Weight | Decay Step 1 | Decay Step 2 |
|---|---|---|---|
| Red | 5 | → 3 at 60 min → 1 at 120 min | → 0 at 240 min |
| Yellow | 3 | → 1 at 90 min | → 0 at 240 min |
| Purple | 1 | → 0 at 120 min | (removed) |

### The Formula

```
Capacity Ratio = Team Strength / Team Demand
```

The team with the highest ratio (most bandwidth) gets the next patient. Tiebreakers use time-since-last-assignment, then team number.

### "Overwhelm" Is Not Subjective

"Overwhelmed" triggers when a team's capacity ratio hits 0 — meaning all providers are off-floor or in-procedure. It's a calculated state, not a feeling.

### All Weights Are Configurable

Departments can calibrate weights to match their own workflows. The current defaults are a starting point, not gospel.

---

## Clinical Integration

The tool is a mobile-first PWA — runs in the browser, no install needed. The charge nurse or triage lead would use it on a tablet or phone at the triage desk. It's a decision-support tool: it recommends assignments but always allows manual override. It doesn't touch the EMR — it sits alongside existing workflow as a smarter replacement for the whiteboard/round-robin.

---

## Defending the Weights

### What Is Defensible Now

- The **rank order** is defensible. An attending objectively has more capacity than a junior resident. A Red patient objectively demands more resources than a Purple.
- The **decay model** maps to real clinical reality — a code patient doesn't consume the same resources at hour 2 as at minute 5.
- The **structure** (ratio-based, not round-robin) is the real innovation. Even with imperfect weights, it captures information that round-robin completely ignores.

### What Cannot Be Defended Yet

- Why is an attending 17.5 and not 15 or 20? Why is Red 5 and not 4 or 6? There's no evidence base for these specific numbers yet.

### The Core Argument

> "The specific weights are configurable starting points. The value isn't in the exact numbers — it's in replacing a system that uses zero information (round-robin) with one that uses imperfect-but-directionally-correct information. We plan to calibrate through piloting."

---

## Validation Pathway

### 1. Delphi Method (Weight Calibration)

A structured process to turn expert opinion into defensible numbers.

**Panel:** 8-12 people — mix of attendings, senior residents, charge nurses, PAs. People who actually manage patient flow.

**Round 1 — Independent ranking (blind survey):**

- *Provider strength:* Rate each provider type's capacity on a scale of 1-20.
- *Patient demand:* Rate how much team bandwidth each patient type consumes (1-10).
- *Decay timing:* At what point (in minutes) does each tier's resource demand drop?

No discussion between panelists. Everyone submits blind.

**Round 2 — Reveal and revise:**

Share anonymized aggregate results (mean, median, range, outlier rationale) back to the panel. Each panelist revises their ratings with this context.

**Round 3 (if needed):** Repeat once more if wide disagreement persists. Take the final median as each weight.

**Outcome:** Instead of "we picked 17.5," you say:

> "Provider weights were derived using a modified Delphi method with a panel of N clinicians over 2 rounds. Final weights represent panel median values."

**Timeline:** ~4 weeks, ~4-5 hours coordinator time, ~20 min per panelist per round.

### 2. Retrospective Validation

Run the algorithm against historical shift data and compare recommendations to what actually happened.

### 3. Prospective Pilot (Shadow Mode)

Run the tool alongside round-robin for a few weeks. Have charge nurses rate whether recommendations matched their intuition. Track agreement rate.

### 4. Sensitivity Analysis

Test how much recommendations change when weights vary by ±20%. If output is stable across reasonable ranges, the exact numbers matter less than the structure.

---

## Important Context

The Delphi method gives **consensus-based** weights, not **empirically validated** ones. This is how tools like the ESI triage scale and many clinical scoring systems started before large-scale validation studies. If pressed: "This is Step 1. Step 2 is a prospective pilot comparing outcomes."

---

## Triage-Only Trial (No Attending App Access)

### The Concern

> "If only the triage nurse has the app, who updates patient status when someone gets admitted, dies, or gets downgraded? Without attendings managing their own teams, stale patients pile up and the scores drift."

### The Short Answer: Buffer-Only Scoring

For an initial trial, **you don't need cumulative patient tracking at all.** The app can run on buffers alone — temporary cooldown timers that fire after each assignment and auto-expire without anyone maintaining them.

Here's why this works:

- **Buffers are self-cleaning.** A Tier One assignment creates a 35-minute buffer; a Tier Two creates 25 minutes; a Tier Three creates 15. When the buffer expires, it's gone. No one needs to mark a patient as admitted or discharged.
- **Buffers capture what matters most at triage:** *who just got hit with work.* The team that received a critical patient 5 minutes ago shouldn't get the next one. That's the core inequity round-robin ignores, and buffers alone fix it.
- **Stacking preserves fairness.** Three rapid assignments stack additively (~3× duration), so a team that absorbs a burst of patients gets meaningful protection even without full load tracking.

In this mode, the formula simplifies to:

```
Assignment = highest capacity ratio among non-buffered teams
```

Provider strength still matters (attending vs. intern, active vs. off-floor), but the demand side is just active buffers — not a running patient census.

### The Tradeoff

You lose **cumulative load awareness.** A team carrying 8 patients and a team carrying 2 patients look the same once their buffers expire. The app won't know that Team 1 is drowning while Team 3 is coasting.

Why that's acceptable for a first trial:

- **Round-robin has the same blind spot** — it never considers cumulative load either. Buffer-only is strictly more information than the current system.
- **The trial's goal is feasibility, not perfection.** Can a charge nurse actually use this at the triage desk? Does the recommendation feel right? Does it reduce the worst imbalances? Those questions don't require full patient lifecycle tracking.
- **It removes the biggest adoption barrier.** Asking attendings to install and maintain an app is a political and workflow hurdle. A triage-only trial sidesteps that entirely.

### Future Refinements

Once the trial proves the concept, richer demand tracking can be layered in:

- **Auto-expire by length of stay:** Patients automatically drop off after a configurable window (e.g., 4 hours), approximating disposition without manual updates.
- **Aggressive decay curves:** Extend the existing decay model so even tracked patients trend toward zero weight over time, reducing the cost of stale data.
- **Charge nurse reconciliation:** A quick "clear resolved patients" pass once per hour — lighter than real-time tracking, still captures cumulative load.
- **Full attending integration:** The eventual goal, where each team manages its own patient list and the app has true real-time demand data.

### The Core Argument

> "A triage-only trial using buffer-only scoring captures the most important signal — who just absorbed work — without requiring any workflow changes from attendings. It's strictly better than round-robin, and it lets us validate the tool's usability before asking the department to buy in on full integration."
