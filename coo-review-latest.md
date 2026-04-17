# Latest COO Review — ER Triage Assignment Tool

## Review Metadata

| Field | Value |
|-------|-------|
| **Review Date** | 2026-02-26 |
| **Reviewer Role** | ED Chief of Operations (simulated) |
| **App Version** | Pre-backend prototype (client-side only, React 19 + Vite + Tailwind v4) |
| **Deployment** | GitHub Pages static SPA at `/er-triage-app/` |
| **Review Scope** | Guided tour, 1000-run benchmark, simulator, all toggles, help section, full codebase |

---

## Agent Deployment Guide

### Persona
**Emergency Department Chief of Operations** — a senior administrator with clinical background (typically an experienced attending or nurse executive) responsible for operational efficiency, patient safety, staffing optimization, and quality metrics across the department. Evaluates tools through six lenses: value add, ease of use, necessity, efficacy, safety concerns, and evidentiary support.

### Evaluation Methodology
1. **Guided Tour**: Walk through all 11 steps of the interactive tour, assessing onboarding quality and first-impression clarity
2. **1000-Run Benchmark**: Review the statistical comparison (formula vs round-robin) across all 5 presets, assess methodology rigor
3. **Simulator**: Run simulations across presets, experiment with speed controls, rewind/snapshot, compare formula vs round-robin shadow mode
4. **Toggles & Settings**: Exercise all configurable options (compact mode, dark mode, provider/patient collapse, hide stabilized, color legend)
5. **Help Section**: Read all collapsible sections, assess completeness, redundancy, accessibility for different audiences
6. **Codebase Review**: Examine scoring engine, state management, type system, constants, simulation framework, fairness metrics

### Re-Deployment Instructions
To re-run this evaluation after app changes:
- Prompt: *"You are the emergency department chief of operations, reviewing this tool. You are evaluating for value add, ease of use, necessity, efficacy, safety concerns, evidentiary support. Start with the guided tour, review the 1000 run review, experiment with the simulator, toy with the various toggles, examine the help section. Report your findings, suggest improvements, tweaks, or considerations. Compare against the prior review in `coo-review-latest.md` — note what improved, what regressed, and what's new."*
- The agent should read this file first to establish the comparison baseline
- Each numbered section below maps 1:1 to an app feature for delta tracking

---

## Executive Summary

This is a well-conceived clinical decision-support tool that replaces round-robin patient assignment with capacity-weighted scoring. **High value-add potential, good usability for the target user, with specific improvements needed before clinical deployment.**

The 1000-run benchmark demonstrates 75% formula superiority (p < 0.001) with strongest advantage under high acuity (84%) and typical staffing (88%). The tool's greatest strength — that it's advisory, not prescriptive — is also what makes it safe to deploy experimentally. Persistent state and shift templates are non-negotiable prerequisites before clinical use.

---

## Section-by-Section App Inventory & Assessment

### 1. Role Selection & Onboarding

**Current State:** Landing screen offers two roles (Charge/Triage Nurse with full control; Attending with view-only + acuity management). Additional buttons for guided tour, quick demo, simulation setup, and benchmark report. Dark/light mode toggle present.

**Assessment:**
- Role distinction is appropriate — attendings don't need assignment controls
- Demo button is well-placed for first-time exploration
- Missing: no "last shift" resume capability; every session starts fresh
- Missing: no brief tagline explaining what the tool does before role selection — a first-time user sees buttons with no context

**Score: 7/10**

---

### 2. Shift Setup / Roster Building

**Current State:** Charge nurses manually add providers to Teams 1-4 via expandable sections. Each provider needs name + type (Attending, Senior Resident, Junior Resident, PA, Rotator). Nurse roles auto-skip this step (shift starts immediately with empty rosters, providers added via dashboard).

**Assessment:**
- Functional but tedious — building 4 teams with 3-5 providers each takes 2-3 minutes
- No saved presets, templates, or schedule import
- No drag-and-drop between teams
- Touch targets (44px) appropriate for mobile
- This is the **#1 adoption barrier** — charge nurses won't rebuild rosters every shift

**Score: 4/10** — Needs shift templates or schedule integration

---

### 3. Dashboard & Team Cards

**Current State:** Main working view with sticky header (title, role badge, compact menu, dark mode, legend, help). 4 team cards in responsive grid (1-col mobile, 2-col tablet+). Each card shows: team name, attending name, capacity ratio (large number), capacity label + color, strength/demand subtotals, buffer bars, collapsible provider list, collapsible patient list.

**Assessment:**
- Information hierarchy is correct — capacity ratio is the dominant visual element
- Color coding (emerald → dark red) provides instant gestalt reading across all 4 teams
- "Recommended" yellow border and "2nd Choice" dashed blue border are visually distinct
- Buffer bars (colored, shrinking, with countdown timer) communicate cooldown state effectively
- Sticky header keeps controls accessible during scroll
- Compact mode effectively reduces noise for experienced users

**Score: 8/10** — Well-designed primary interface

---

### 4. Scoring Engine & Recommendation Algorithm

**Current State:** Pure-function engine (`recommendation.ts`, 138 lines). Formula: `Capacity Ratio = Team Capacity / Patient Load`. Team Capacity = sum of (Provider Weight x Status Multiplier). Patient Load = sum of decayed acuity weights. Recommendation: exclude Trauma (Team 4) + closed teams → unbuffered first → highest ratio → least recent → lowest team ID. Special case: all teams buffered → recency-first (force alternation).

**Assessment:**
- Ratio (not difference) is the right choice — it normalizes across team sizes. A team of 2 providers with 1 patient is proportionally equivalent to 4 providers with 2 patients.
- Provider weights (Attending 17.5 → Rotator 1.0) have face validity but lack published calibration. ACEP workload studies could ground these.
- Status multipliers are reasonable: In Procedure at 25% (not 0%) reflects that the provider is returning soon and available for brief consultation. This will be debated — some attendings will argue 0%.
- The all-buffered recency fallback is clever and prevents deadlock.
- `ScoringOverrides` interface allows parameter tuning — good extensibility.

**Score: 8/10** — Sound algorithm; needs external calibration references

---

### 5. Patient Assignment Flow

**Current State:** Tap FAB ("+New Patient") → modal slides up → select acuity (Red/Yellow/Purple with clinical examples) → select source (Critical/Floor Upgrade) → select team (recommended highlighted, 2nd choice dashed, Trauma marked as excluded, closed teams disabled). Non-recommended selection triggers OverrideModal. Toast confirms assignment.

**Assessment:**
- 3 taps for the common case (FAB → color → recommended team) is excellent
- Clinical examples on acuity buttons reduce ambiguity (e.g., Red: "ACLS, intubation, anaphylaxis")
- Team buttons show capacity ratio with color coding — informed selection even for overrides
- Missing: no undo for accidental assignment (must use Reassign, which requires a reason)
- Missing: no confirmation step before assignment — one accidental tap assigns the patient

**Score: 7/10** — Fast and intuitive; needs quick-undo and optional confirmation

---

### 6. Override System

**Current State:** Selecting a non-recommended team triggers OverrideModal. Preset reasons: "Attending request", "Charge nurse decision", "Triage nurse decision", "Other" (free text). Override logged with: patientId, recommendedTeamId, assignedTeamId, reason, timestamp. Stored in `state.overrides` array.

**Assessment:**
- Override design is excellent — preserves clinical autonomy while creating accountability
- Reason categories cover the realistic scenarios
- Logging is comprehensive enough for shift review
- Missing: no way to review accumulated overrides during the shift (only in state, not surfaced in UI)
- Missing: no end-of-shift override summary or export

**Score: 8/10** — Well-designed; needs in-shift visibility and export

---

### 7. Buffer Mechanics

**Current State:** After assignment, receiving team gets a time-limited buffer (Red: 35 min, Yellow: 25 min, Purple: 15 min). Buffered teams are deprioritized in recommendations. Buffers stack additively (3 rapid assignments ≈ 3x duration). Merged buffers show combined count with rainbow pulsing bar. Deceased patients trigger 30-min debrief buffer.

**Assessment:**
- Additive stacking is the right choice — prevents rapid-fire assignments to one team
- Visual buffer bars (colored, shrinking, with MM:SS countdown) are immediately readable
- Deceased debrief buffer is a thoughtful safety feature
- Buffer durations are heuristic (not evidence-based) — 35 min for Red *feels* right but should be validated against actual stabilization timelines
- Rainbow merged buffer is visually distinctive but could be distracting — monitor user feedback

**Score: 7/10** — Mechanically sound; durations need empirical validation

---

### 8. Provider Status Management

**Current State:** Each provider has 4 statuses: Active (100%), Taking Signout (50%), In Procedure (25%), Off Floor (0%). Status set via tap → 2x2 grid selection. Auto-expires: off_floor at 15 min, procedure/signout at 30 min. Countdown timer shown in orange badge. Swap provider feature for shift changes.

**Assessment:**
- Auto-expiry is a critical safety feature — prevents forgotten status from silently degrading the model
- 15 min off-floor expiry may be too short (bathroom + coffee run) or too long (model gives wrong recommendations for 15 minutes)
- Manual toggle is the weakest link in the system — requires active maintenance that competes with clinical duties
- No integration with tracking board or badge location systems
- Swap feature handles shift changes cleanly

**Score: 6/10** — Functional but manual status is the biggest reliability risk

---

### 9. Acuity Decay Model

**Current State:** Step-function decay (not gradual). Red: 5 → 3 at 60 min → 1 at 120 min. Yellow: 3 → 1 at 90 min. Purple: 1 → 0 at 120 min. Decay triggers from assignment time (or upgrade time if escalated). Patient badges show countdown to next decay step and current weight.

**Assessment:**
- Step function is an appropriate clinical simplification — resource demands don't decrease linearly
- Thresholds (60/90/120 min) align roughly with ED stabilization timelines
- Upgrade resets decay clock — correct behavior (escalated patient restarts high-resource phase)
- Stabilized patients (weight = 0) can be hidden via compact mode — reduces clutter
- Missing: no downward acuity adjustment (a Yellow that improves to Purple-level demand)
- The help section (per MD/PhD review) should clarify that decay is stepped, not gradual

**Score: 7/10** — Clinically reasonable; could benefit from bidirectional acuity adjustment

---

### 10. Guided Tour

**Current State:** 11-step interactive walkthrough with element highlighting (semi-transparent overlay with cutout), floating tooltips, auto-scroll, and state manipulation (opens help, expands provider lists). Accessible via RoleSelection or `?tour` URL parameter. Steps: Welcome → Why Not Round-Robin → Team Strength → Patient Demand → Formula → Buffer → Recommended → Assign → Patient Actions → Provider Status → Wrap-up.

**Assessment:**
- Excellent onboarding mechanism — better than documentation alone
- Element highlighting with overlay cutout is the right UX pattern
- State manipulation (auto-opening sections) prevents "can't find it" confusion
- 11 steps is appropriate length — not too long, covers all key concepts
- Tour loads a curated demo state so all features are visible
- Missing: no way to replay individual steps or jump to a specific topic

**Score: 9/10** — Best-in-class onboarding for this type of tool

---

### 11. Help Section

**Current State:** Collapsible inline documentation with always-visible quick-start (4 key points) and 5 expandable sections: Reading the Dashboard, Acuity Colors & Decay, Buffers & Recommendations, Actions & Controls, Weights & Reference. Includes link to benchmark report. Triggered via header "?" button.

**Assessment:**
- Quick-start summary is effective ("big number = more room, tap recommended team, override anytime")
- Five sections are appropriately consolidated (per prior nurse-manager review recommendations)
- Clinical examples in acuity section ground the abstract in reality
- Benchmark link provides evidence for skeptics
- Per MD/PhD review: needs weight calibration notes, ratio justification, step-function clarity
- Per admin review: needs concrete scenario, benchmark evidence earlier, transition reassurance
- Header button could be more discoverable (labeled "Help" rather than just "?")

**Score: 7/10** — Comprehensive but could better serve different audiences (nurse, physician, admin)

---

### 12. Simulator

**Current State:** Full shift simulation engine with seeded PRNG (Mulberry32). 5 presets: Typical Day, Sporadic Staffing, Mid-Shift Chaos, Night Shift, High Acuity Day. Configurable: shift duration (2-12h), arrival rate (2-8/hr), acuity distribution, random seed. Controls: play/pause, speed (1x-200x), skip-to-next, snapshot rewind (max 500 snapshots). Shadow simulation runs parallel round-robin for comparison. End-of-sim summary card shows per-team stats.

**Assessment:**
- Simulation framework is impressively complete for a prototype
- 5 presets cover the realistic staffing scenarios an ED experiences
- Seeded PRNG enables reproducible demonstrations — critical for training and persuasion
- Snapshot rewind allows reviewing specific moments ("show me what happened at the 3-hour mark")
- Speed control (up to 200x) makes 8-hour shifts reviewable in minutes
- Shadow comparison is the killer feature — seeing formula vs round-robin on identical patient streams is persuasive
- Missing: no ability to save/share a specific simulation run
- Missing: no export of simulation results for presentation to stakeholders

**Score: 9/10** — Powerful demonstration and validation tool

---

### 13. 1000-Run Benchmark

**Current State:** 1000 paired simulations (200 per preset x 5 presets). Fairness scoring: 5 weighted components (Overwhelm Avoidance 30%, Balanced Workload 25%, Acuity Balance 15%, Min Safety Margin 15%, Stress Equity 15%). Results: 75% formula win rate, formula avg fairness 82.0 vs round-robin 79.3. Per-preset breakdown from 52% (Night Shift) to 88% (Typical Day). Methodology: p < 0.001 statistical significance.

**Assessment:**
- Methodologically rigorous for a prototype — paired comparisons eliminate confounds
- 5-component fairness scoring captures the dimensions that matter clinically
- 30% weight on overwhelm avoidance reflects clinical priority correctly
- Per-preset breakdown prevents the average from masking scenario-specific weakness
- Night Shift parity (52%) is honest — the tool doesn't overclaim
- Min safety margin metric (42% vs 28%) is the most clinically compelling finding
- Missing: confidence intervals on per-preset results
- Missing: sensitivity analysis on parameter changes (what if attending weight is 15 instead of 17.5?)

**Score: 9/10** — Compelling quantitative evidence; needs sensitivity analysis

---

### 14. Compact Mode & View Toggles

**Current State:** Three toggles in dashboard header menu: collapse all providers, collapse all patients, hide stabilized patients. All three active = "Compact Mode" badge. Color legend toggle shows/hides acuity + capacity reference. Per-card collapsible sections for providers and patients.

**Assessment:**
- Compact mode is essential for experienced users — reduces dashboard to capacity ratios + buffers
- Progressive disclosure (collapsed by default, expand on demand) is the right pattern
- Hiding stabilized patients removes visual noise without losing data
- Missing: no per-team collapse (all-or-nothing global toggle)
- Missing: no saved preference (resets on refresh, compounded by lack of persistence)

**Score: 7/10** — Appropriate feature set; needs persistence

---

### 15. Dark Mode

**Current State:** Toggle in header (sun/moon emoji). Persisted to localStorage. Tailwind dark mode classes throughout. Semi-transparent glass card overlays adapt to dark background.

**Assessment:**
- Essential for night shift use — bright screens in dim ED are a real problem
- Correct implementation (localStorage persistence, system-wide application)
- Glass card transparency maintains visual hierarchy in both modes
- Color contrast appears maintained (dark text on light, light text on dark)

**Score: 8/10** — Well-implemented; consider auto-detection from system preference

---

### 16. Data Persistence & Architecture

**Current State:** All state in React `useReducer` + Context. No backend. No database. No service worker. Browser refresh = complete data loss. 1-second global TICK interval. Pure-function recommendation engine. Client-side only. Deployed as static SPA to GitHub Pages.

**Assessment:**
- Architecture is clean — pure functions, immutable state updates, centralized reducer
- **Data loss on refresh is a deployment blocker.** Cannot use this in a real ED where a phone dies, browser crashes, or someone accidentally swipes away the tab.
- No multi-device sync — charge nurse and triage nurse can't share the same shift state
- CLAUDE.md correctly identifies real-time backend as the critical next step
- Recommendation engine is portable (pure functions, no DOM dependency) — can run server-side unchanged
- State shape (`ShiftState`) is already well-defined for backend serialization

**Score: 3/10** — Architecturally sound but unusable in production without persistence and sync

---

## Scoring Summary

| Section | Score | Status |
|---------|-------|--------|
| 1. Role Selection & Onboarding | 7/10 | Good — needs tagline and resume |
| 2. Shift Setup / Roster Building | 4/10 | Adoption blocker — needs templates |
| 3. Dashboard & Team Cards | 8/10 | Strong |
| 4. Scoring Engine & Algorithm | 8/10 | Sound — needs calibration references |
| 5. Patient Assignment Flow | 7/10 | Fast — needs undo and confirmation |
| 6. Override System | 8/10 | Well-designed — needs UI visibility |
| 7. Buffer Mechanics | 7/10 | Sound — needs empirical validation |
| 8. Provider Status Management | 6/10 | Weakest operational link |
| 9. Acuity Decay Model | 7/10 | Clinically reasonable |
| 10. Guided Tour | 9/10 | Excellent |
| 11. Help Section | 7/10 | Comprehensive — needs audience tuning |
| 12. Simulator | 9/10 | Powerful |
| 13. 1000-Run Benchmark | 9/10 | Compelling evidence |
| 14. Compact Mode & Toggles | 7/10 | Appropriate |
| 15. Dark Mode | 8/10 | Well-implemented |
| 16. Data Persistence & Architecture | 3/10 | Production blocker |
| **Overall** | **7.1/10** | **Promising prototype; 2 blockers before clinical use** |

---

## Prioritized Improvements

### Tier 1 — Production Blockers
1. **Real-time backend with persistent state** (WebSocket/Firebase + conflict resolution)
2. **Shift templates / roster presets** (save team compositions, quick-load)

### Tier 2 — Before Pilot
3. **Department capacity alert** (threshold-based diversion warning)
4. **Quick-undo for misassignment** (30-second grace period, no reason required)
5. **Shift summary / analytics export** (PDF/email with override log, distribution stats)
6. **Pilot study protocol** (define metrics, 2-week A/B, alternating shifts)

### Tier 3 — Before Wider Rollout
7. **Provider status integration** (tracking board / badge location auto-detect)
8. **Literature-grounded weight calibration** (ACEP studies, time-motion references)
9. **Override visibility in-shift** (viewable log in dashboard)
10. **Help section audience tuning** (per nurse-manager, MD/PhD, admin reviews)

### Tier 4 — Polish
11. **Accessibility audit** (ARIA roles, live regions, reduced motion)
12. **Configurable weights UI** (expose ScoringOverrides to department leadership)
13. **Auto dark mode** (system preference detection)
14. **Simulation export** (save/share specific runs for training)

---

## Comparison Baseline

*This section records quantitative baselines for future delta tracking.*

| Metric | Baseline (2026-02-26) |
|--------|----------------------|
| Component count | 16 components, ~3,125 lines |
| Engine size | recommendation.ts: 138 lines, simulation.ts: 355 lines, fairness.ts: 131 lines |
| State management | ShiftContext.tsx: 790 lines, 22 action types |
| Constants | constants.ts: 128 lines |
| Type definitions | types.ts: 176 lines |
| Test coverage | 0% (no test files) |
| Dependencies | React 19.2, Vite 7.3, Tailwind 4.2, TypeScript 5.9 |
| Backend | None (client-side only) |
| Benchmark result | 75% formula win rate, 1000 runs, 5 presets |
| Formula avg fairness | 82.0 / 100 |
| Round-robin avg fairness | 79.3 / 100 |
| Avg min safety margin | Formula 42% vs RR 28% |
| Avg overwhelm events/shift | Formula 2.8 vs RR 3.4 |
| Provider weight range | 1.0 (Rotator) — 17.5 (Attending) |
| Acuity tiers | 3 (Red/Yellow/Purple) |
| Buffer durations | 15/25/35 min |
| Guided tour steps | 11 |
| Help sections | 5 collapsible + quick-start |
| Simulation presets | 5 |
| Dark mode | Yes (localStorage) |
| PWA | No (no service worker/manifest) |
| Multi-device sync | No |
| Persistence | None (in-memory only) |
