# Capacity Conscious Triage (er-triage-app)

A mobile-first React + TypeScript app that recommends which ED team should take the next patient. It
replaces round-robin assignment with a capacity ratio: team provider strength divided by acuity-weighted,
time-decaying patient load. Advisory only (never auto-assigns), no PHI, no EMR integration. Built with
Vite, Tailwind CSS v4, React 19.

Copyright holder is **New York University** (NYU TOV ref WAT01-01). Notice lives in `LICENSE`,
`src/main.tsx`, and the footer of `RoleSelection.tsx`. Keep it on anything new that users see or print.

**Source of truth for formula values is the code** (`src/constants.ts`, `src/engine/recommendation.ts`).
If this file and the code disagree, the code wins and this file should be fixed.

## Related project documents

- `METHODS.md` (this repo): numbered methodology log. New sections go above the
  "# Historical Methodology Record" divider. `/methods` skill appends one.
- `CCT Legal Dossier.md` (this repo, untracked on purpose): IP, TOV and counsel record.
- `ER Triage App/` (subfolder, gitignored): advisory workspace moved here 2026-09-27 from
  `/Users/julian/Claude CoWork/`. Holds `Cowork Roundtable.md` (the decision log for product and
  strategy decisions), paper versions, TOV correspondence and meeting prep. Never commit it.
- `.rounds/CCTrounds.md`: cross-agent deliberation log, see "Agent rounds" below.

## Setup

```bash
npm install
npm run dev              # dev server (Vite)
npm run build            # type-check + production build -> dist/
```

## Deploy = GitHub Pages (gh-pages branch)

**Status as of 2026-09-27: the Pages site is LIVE**, serving the 2026-08-03 build (commit `610b6f5`
on `gh-pages`). Real schedules are no longer served (404). The live bundle still contains the Delphi
fallback weights and the Delphi Apps Script URL. Whether it stays up is Julian's decision. **Never
deploy without explicit confirmation from Julian.**

Facts learned the hard way (see METHODS.md section 5):

- The repo is private, but a Pages site serves publicly regardless of repo visibility.
- The API cannot unpublish this site (`DELETE /pages` returns 422). Only the Settings > Pages
  "Unpublish site" button works.
- `gh api /repos/.../pages` reports `"status":"built"` even when unpublished. Never use it to check
  exposure. Load the URL instead.
- Any `gh-pages` push republishes the site with no settings change.
- Vite inlines `VITE_*` variables at build time, so a build made with `.env` present ships the Delphi
  endpoint URL.

Deployment is manual; there is no GitHub Actions workflow.

```bash
npm run deploy   # runs predeploy: build + check:schedules, then pushes dist/
```

`predeploy` runs `scripts/check-no-real-schedules.ts`, which opens every shipped `.xlsx` and fails if
any real provider name is present. Never bypass it by calling `npx gh-pages -d dist` directly.

Publishes to: https://jwatson7399.github.io/capacity-conscious-triage/

### Schedule data policy

Vite copies `public/` verbatim into `dist/`, and `dist/` is what gets published. So:

- **Real schedules live in `data/provider-schedules/`, never under `public/`.** This includes
  `demo-schedule.xlsx`, which despite its name contains 120 real provider names.
- The only workbook allowed under `public/` is `public/schedules/demo-week-schedule.xlsx`, a synthetic
  file with real layout and shift structure but pseudonymous names. The "Real Schedule" demo button in
  `RoleSelection.tsx` fetches it.
- To regenerate it from a real schedule:

```bash
npx tsx scripts/deidentify-schedule.ts "data/provider-schedules/schedules/<file>.xlsx" public/schedules/demo-week-schedule.xlsx
npx tsx scripts/verify-deidentified-schedule.ts "data/provider-schedules/schedules/<file>.xlsx" public/schedules/demo-week-schedule.xlsx
```

The verifier asserts the synthetic file is parse-equivalent to the real one (same days, provider counts,
types, teams and shift windows) and that no real name survives.

## Repo hygiene rules

- **Never rebase, squash, amend, force-push, or delete branches.** Project history is part of the
  legal record. Real schedules remain in history on `main` and `gh-pages`; acceptable only while the
  repo is private.
- **Never `git add .` or `git add -A`.** `.gitignore` now excludes `ER Triage App/`, the legal files and
  `data/provider-schedules/`, but stage files by name anyway. Legal and counsel files sit in the repo root
  (`CCT Legal Dossier.md`, `Counsel Memo - CCT*`, `IP Policy Excerpts*`, `Outside Counsel Briefing
  Packet*`, the Informatics thread PDFs) and must not be committed. Stage files by name.
- The unauthenticated Delphi Apps Script endpoint and the hardcoded fallback weights in
  `constants.ts` were left in place by Julian's explicit decision (weights are NYU-specific). Do not
  "fix" them without asking.
- No em dashes in any document or user-facing text.

## Delphi Survey: Google Sheets Backend

The Delphi provider-strength survey can optionally store responses in a shared Google Sheet so all users see the same totals.

### Setup

1. Create a Google Sheet with columns: `Timestamp | Senior Resident | Junior Resident | Intern | PA | Rotator | Round` (name the sheet tab `Responses`). The `Round` column stores `1` or `2`; rows without a value are treated as Round 1.
2. Open **Extensions → Apps Script** and paste:

```javascript
const SHEET_NAME = 'Responses';

function doGet() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const rows = data.slice(1).map(row => {
    const obj = {};
    headers.forEach((h, i) => obj[h] = row[i]);
    return obj;
  });
  return ContentService.createTextOutput(JSON.stringify(rows))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  const body = JSON.parse(e.postData.contents);
  sheet.appendRow([
    body.timestamp,
    body.senior_resident,
    body.junior_resident,
    body.intern,
    body.pa,
    body.rotator,
    body.round || 1
  ]);
  return ContentService.createTextOutput(JSON.stringify({ status: 'ok' }))
    .setMimeType(ContentService.MimeType.JSON);
}
```

3. **Deploy → New deployment → Web app** → set access to "Anyone" → copy the URL
4. Paste the URL into `.env`:

```
VITE_DELPHI_SHEETS_URL=https://script.google.com/macros/s/XXXXX/exec
```

If the env var is unset, the survey falls back to localStorage-only mode.

## Architecture

- `src/types.ts`: all TypeScript types (`Provider`, `Patient`, `Buffer`, `TeamScore`, `Recommendation`, `ShiftState`, `ShiftAction`)
- `src/constants.ts`: tuning parameters (see below)
- `src/engine/recommendation.ts`: pure-function scoring engine
- `src/engine/simulation.ts`, `src/engine/fairness.ts`: simulator and fairness metrics used by benchmarks
- `src/context/ShiftContext.tsx`: `useReducer`-based state management
- `src/hooks/useSurveyWeights.ts`: polls the Delphi sheet for live provider weights
- `src/utils/scheduleParser.ts`: layout-sensitive parser for departmental schedule workbooks
- `src/App.tsx`: root: role selection -> shift setup (charge nurse) -> dashboard; 1s TICK interval
- `src/components/`: `Dashboard`, `TeamCard` (battery capacity gauge), `AssignPatient`, `OverrideModal`,
  `HelpSection`, `ShiftSetup`, `RoleSelection` (splash, demos, survey entry, copyright footer),
  `GuidedTour`, `EvidenceWalkthrough` (iframes `public/walkthrough-v4.html`), `MethodologyDeepDive`,
  `BenchmarkReport`, `RealScheduleBenchmarkReport`, `DelphiSurvey`, `DelphiAdminPanel`,
  `ScheduleImport`, simulation components, `PatientBadge`, `ProviderStatusToggle`, `Toast`
- `scripts/`: Node-only benchmark, replay, de-identification and guard scripts (read from `data/`)

## Scoring Formula

```
Capacity Ratio = Team Capacity / Patient Load
Team Capacity  = sum(provider weight x status multiplier x float modifier)
Patient Load   = sum(decayed acuity weight)
```

Teams are ranked on their **current** ratio. The incoming patient's acuity does not change the pick, so
the recommended team is known before the patient's tier is chosen. `getRecommendation()` has an optional
`incomingTier` argument ("post-assign" mode: capacity / (load + incoming weight)) that nothing in the
app or simulator passes; it was tested and rejected in April (see Roundtable, Session September 27,
2026). Do not turn it on without Julian. Highest ratio among eligible teams is recommended. Team 4 (Trauma) and closed teams are excluded from
auto-recommendations. Tiebreakers: highest ratio, then least recent assignment, then lowest team ID.
(The not-buffered-first tiebreaker still exists in code but is inert because buffers are zero.)

### Provider weights

Fetched live from the Delphi sheet (`useSurveyWeights`, polled every 5 min). Fallbacks in
`constants.ts` are the Delphi Round 1 means (n=19). Round 2 collection is in progress
(`CURRENT_ROUND = 2`; the admin panel sets the active round).

| Provider                     | Fallback weight |
|------------------------------|-----------------|
| Attending                    | 20 (fixed reference) |
| Senior Resident (PGY 3-4)    | 15.2 |
| PA                           | 11.4 |
| Junior Resident (PGY-2)      | 10.8 |
| Intern (PGY-1)               | 6.6 |
| Rotator                      | 2.4 |

| Status          | Multiplier | Auto-expires |
|-----------------|------------|--------------|
| Active          | 1.0        | no |
| Taking Signout  | 0.5        | 30 min |
| In Procedure    | 0.25       | 30 min |
| Off Floor       | 0.0        | 15 min |

Float modifiers: none 1.0, float supervising 0.65, float primary 0.0.

### Acuity weights and decay (4:2:1, D6 linear)

| Tier               | Label  | Initial weight | Decay |
|--------------------|--------|----------------|-------|
| Tier One           | Red    | 4 | linear to 0 at 180 min |
| Tier Two           | Yellow | 2 | linear to 0 at 180 min |
| Tier Three         | Purple | 1 | linear to 0 at 90 min |

### Buffers

Removed. `BUFFER_DURATIONS_MS` is all zeros per the Methods paper: a new assignment raises the team's
load and lowers its ratio, which provides the protection buffers used to add.

### Capacity terms (displayed on cards)

| Ratio   | Label       |
|---------|-------------|
| >= 50   | Comfortable |
| >= 23   | Manageable  |
| >= 16   | Busy        |
| >= 11.5 | Very Busy   |
| >= 8.5  | High Demand |
| < 8.5   | Red Zone    |

`OVERWHELM_THRESHOLD` = 8.5 (p5 of the empirical distribution under the recommended config). Card
color and battery fill are anchored to per-arrival percentiles of the 4:2:1 historical replay
(1,958 arrivals, 121 shift-days). See `METHODS.md` for derivations.

## Known inaccuracies still in the app

- `src/components/HelpSection.tsx` (around line 51) quotes "+55%" and "+249%". These are cross-benchmark
  stitches and must not be quoted anywhere. Same-run figures put the minimum-ratio gain versus actual
  practice at roughly +77% to +118% ("the worst-case floor roughly doubles"). Fix pending Julian's
  wording.

## Key Design Decisions

- **All state is client-side** (`useReducer` + React context). No backend yet.
- **Team 4 (Trauma)** is visible but excluded from auto-recommendations; assignment only via manual override.
- **Demo mode** randomizes provider names, team compositions, statuses, and simulates patient arrivals through the recommendation engine.
- **Patient nomenclature**: `C-###` = critical/new arrival, `F-###` = floor upgrade, time display = minutes until next decay, `w:N` = current decayed weight.

## Agent rounds

Cross-agent deliberation log: `.rounds/CCTrounds.md`. Run `/rounds` to read recent entries and append
your own. **When creating a non-trivial plan or facing a substantive design decision, read rounds first
and consider posting if peer input from a parallel agent would help.** Don't post for trivial work or
pure execution tasks.

## Next Step: Real-Time Backend

The app needs a backend so multiple phones/tablets can share the same shift state. It is also the only
real protection for the weights, since a client-side engine must ship them to the browser. Requirements:
- Real-time sync: all connected clients see updates instantly
- Conflict resolution: two users assigning a patient simultaneously must not corrupt state
- Minimal infrastructure: ideally a single service (WebSocket server, or Firebase/Supabase real-time)
- The recommendation engine is pure functions and can run on client or server
- `ShiftState` in `types.ts` is the single source of truth
- Auth can be simple (shift code / room code)
- Planned trial requirement: an override log (every recommendation, accepted or overridden, with
  structured reason codes plus free text) must exist before day one of the trial
