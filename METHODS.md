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

*Subsequent sections will be added as additional facets of the model are analyzed and calibrated.*
