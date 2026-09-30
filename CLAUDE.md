# Capacity Conscious Triage (er-triage-app)

**Read `AGENTS.md` first.** It is the shared rule file for every agent (any vendor): log a START
entry in `AGENT_LOG.md` (main repo folder) before changing anything and a DONE entry when finished;
update the Roundtable and METHODS as you go; draft Legal Dossier items for Julian's go.

@AGENTS.md

A mobile-first React + TypeScript app that recommends which ED team should take the next patient. It
replaces round-robin assignment with a capacity ratio: team provider strength divided by acuity-weighted,
time-decaying patient load. Advisory only (never auto-assigns), no PHI, no EMR integration. Built with
Vite, Tailwind CSS v4, React 19.

Copyright holder is **New York University** (NYU TOV ref WAT01-01). Notice lives in `LICENSE`,
`src/main.tsx`, and the footers of the Carbon screens (`src/app/`: Home, Board, SetupScreen, TeamDetail,
Help and the menu). Keep it on anything new that users see or print.

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
npx vitest run           # unit tests (parser, session, simulator reducer, fairness, survey)
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
  file with real layout and shift structure but pseudonymous names. The demo's "Change Teams"
  button and the setup screen's "Use sample scheduled shift" (`src/ui/samples.ts`) fetch it.
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
  "fix" them without asking. Since 2026-09-28 the app scores with the `constants.ts` weights only
  (frozen for the study); the survey and endpoint remain for research under `?lab`.
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

Carbon rebuild (branch `carbon-rebuild`, 2026-09-28): a new interface on the unchanged engine.

- `src/types.ts`: all TypeScript types (`Provider`, `Patient`, `Buffer`, `TeamScore`, `Recommendation`, `ShiftState`, `ShiftAction`)
- `src/constants.ts`: tuning parameters (see below)
- `src/engine/recommendation.ts`: pure-function scoring engine
- `src/engine/simulation.ts`, `src/engine/fairness.ts`: simulator and fairness metrics used by benchmarks
  (see "Research metrics" below)
- `src/context/ShiftContext.tsx`: the core `useReducer` shift reducer and `ShiftProvider`. The provider
  scores with frozen `CAPACITY_WEIGHTS` (no Delphi polling) and exposes the activity list. Shift rules
  changed 2026-09-28 (Roundtable, Carbon Rebuild Audit, Decisions 12 to 14; scoring untouched):
  closed teams stay closed until reopened (no 60-minute auto-transfer or auto-reopen; sign-out keeps
  the team closed); `REASSIGN_PATIENT` keeps the patient's timer; `UPGRADE_PATIENT` takes an optional
  `toTier` (any higher color, default Red) and restarts at that color's full weight.
- `src/context/session.ts`: session layer around the core reducer. Records the shift activity events
  (`src/activity.ts`, JSON-safe, append-only; undo is its own event) and adds interface-only actions:
  `HYDRATE` (load a sample shift), `REMOVE_PROVIDER`, `REOPEN_TEAM`, `DEMO_ARRIVALS`, `UNDO_ASSIGN`,
  `ASSIGN_TO_FLOAT` (Decision 36: the Assign panel's Float button lists the arrival on the recommended team at
  float primary, logged as `float_arrival`), `ADD_FLOOR_UPGRADE` (Decision 35: a floor upgrade goes on the patient's own team, never through the
  recommendation, and is logged as `floor_upgrade`, not `assign`; the lab simulator still routes them, open item 25).
  Undo is bound to the assignment's event id and ends at any later action on that patient or a new sample.
  Later corrections: `UNDO_EVENT` reverses one logged action (placement, floor upgrade, float arrival, reassign,
  sign-out, float change, `CORRECT_COLOR`) for the whole shift while `undoBlocked()` finds no later, not-undone
  change to that patient; the Shift activity drawer shows Undo or "Open patient". `CORRECT_COLOR` keeps the placed time.
- `src/ui/model.ts`: display helpers (infinity rule, gauge scale, timers). `src/ui/samples.ts`: demo and
  tour sample shifts (made-up names) and the synthetic schedule loader. `src/ui/carbon.css`: Carbon tokens
  and styles (light default since 2026-09-28, dark optional); Tailwind v4 theme values in `src/index.css` point at them.
- `src/app/`: the Carbon interface. `CarbonApp` (screens), `Home` (with `HomeArt`: the CCT gauge mark and
  the animated capacity skyline, decorative only), `SetupScreen`, `Board` (`Gauge`,
  `Ledger`, `Assign`, `ActivityDrawer`), `TeamDetail`, `Demo`, `Tour`, `Help`/`HowItWorks`, `Sheet`.
  The live shift's `ShiftProvider` stays mounted, so Home never wipes a shift; demo and tour mount their
  own providers and cannot reach it.
- `src/lab/`: hidden `?lab` route (lazy-loaded): simulation lab, benchmark reports, Delphi survey and
  admin, attestation. Simulations still run on the pre-Carbon `components/Dashboard.tsx` (research only).
- `src/App.tsx`: routes `?lab` to the lab, everything else to `CarbonApp`. `?tour` opens the tour.
- `src/components/`: pre-Carbon components, now used only by the lab.
- `archive/`: files moved out of the build (`MethodologyDeepDive`, old `HelpSection`,
  `EvidenceWalkthrough`). Never imported or shipped.
- `public/walkthrough-v4.html`: the slide walkthrough, opened from How it works ("Walk through the
  method", `src/app/WalkthroughFrame.tsx`; `?walkthrough` opens it directly). Every number on it comes
  from `public/walkthrough-model.js` (one weights table, the December 29 rosters and arrivals, the
  engine's ranking). `src/walkthrough/walkthroughModel.test.ts` fails if that file drifts from
  `constants.ts` or the engine, or if a slide goes back to typed-in numbers or em dashes. If the weights
  change, update the model file and review the slide text the test pins.
- `src/utils/scheduleParser.ts`: layout-sensitive parser for departmental schedule workbooks.
  `parseWeeklySchedule(data)` with no options is the **legacy reading** the benchmark and replay scripts
  use; it must not change (hashes pinned in `src/schedule/realWeeks.test.ts`). The app passes
  `{ live: true }` (Roundtable Decisions 41 and 42): bracket levels in name cells ("[2]", "[IM]",
  "[DENTAL]"), any PGY key header ("Residents", "Resident Name", "Name"), times without a colon
  ("830A"), dental residents `countsZero`, unknown levels flagged `unknownLevel` (never guessed),
  A-side resident coverage of Teams 1 to 3, overnight side and day swing `coverTeams` plus
  `coverSource` provenance, placeholders ("OPEN") skipped, and `isoDate`.
- `src/schedule/`: the weekly schedule the live board follows (Decisions 40 to 42). `week.ts` (pure):
  timed slots, `rosterAt(t)` (a shift runs start to end exactly, so 3 AM uses the previous evening's
  crew), `openTeams(t)` (Team 3 takes no new patients 11 PM to 7 AM, Team 4 12 AM to 7 AM; people stay
  on the board to their shift end), cover split (half on each open covered team, full on Team 1 or 2
  once the other closes; overnight "Swing" splits over every open team). `follow.ts`:
  `syncToSchedule`, run by the session on each live TICK: adds and removes scheduled providers
  (`Provider.scheduleKey`, `share`, `endsAt`, `note`), closes and reopens teams, sets floats, logs
  `auto` events. Hand edits win: a removed or swapped-out slot stays off until its shift ends; a
  swap-in leaves at the slot's end; hand-added providers stay; a hand close is never reopened; a hand
  reopen holds until the schedule opens that team itself. Past the uploaded week the board holds.
  `storage.ts`: the parsed week, original workbook bytes, parser version and role picks in
  localStorage (`cct-week-schedule-v1`, never leaves the device). Older versions re-read retained
  originals automatically; missing or unreadable originals require upload. A resend replaces
  the same dates, including original-file ownership, so migration cannot revive replaced days.
  `start.ts` and `app/ScheduleStart.tsx`: current-roster readiness and direct start from Home.
  Unknown roles and outdated or stale weeks cannot start following. The ready screen builds
  providers with the same helper as scheduled joins and rechecks the clock on Start shift.
- `src/utils/delphiResponses.ts`: the survey missing-value policy (see "Delphi survey: missing values")
- `src/components/benchmarkResults.ts`: numbers for the lab benchmark page, generated from
  `npx tsx scripts/benchmark.ts --json <file outside data/>`; regenerate, never hand-edit
- `docs/reviews/2026-06-11/`: screenshots and plan from the superseded June UI work (history only)
- `scripts/`: Node-only benchmark, replay, de-identification and guard scripts (read from `data/`)

## Scoring Formula

```
Capacity Ratio = Team Capacity / Patient Load
Team Capacity  = sum(provider weight x status multiplier x share)
Patient Load   = sum(decayed acuity weight x patient float modifier)
```

Teams are ranked on their **current** ratio. The incoming patient's acuity does not change the pick, so
the recommended team is known before the patient's tier is chosen. `getRecommendation()` has an optional
`incomingTier` argument ("post-assign" mode: capacity / (load + incoming weight)) that nothing in the
app or simulator passes; it was tested and rejected in April (see Roundtable, Session September 27,
2026). Do not turn it on without Julian. Highest ratio among eligible teams is recommended. Team 4 (Trauma) and closed teams are excluded from
auto-recommendations; a closed team stays out until someone reopens it. Tiebreakers: highest ratio, then least recent assignment, then lowest team ID.
(The not-buffered-first rule is actually the first sort key, not a tiebreaker. Ordinary buffers are
zero, so it only acts during the 30-minute deceased buffer, which ranks that team last unless every
eligible team is buffered.)

**Deceased patients** (Roundtable 2026-09-28, Decision 17): a patient marked deceased adds zero load
at once (`getCurrentLoad` filters them; `src/ui/model.ts` `contribution()` and `timerRunning()` agree)
and shows as "Not counted (deceased)". The 30-minute deceased buffer carries the effect. The patient
stays in the record and still counts for "least recently assigned". The 30 minutes is a judgment, not a
measured value; no benchmark generates deaths, so the session tests are the check.

### Provider weights

Frozen for the whole study at the `constants.ts` values, the Delphi Round 1 means (n=19)
(Roundtable 2026-09-28, Decision 7). The app no longer reads the Delphi sheet for scoring;
`useSurveyWeights` is unused. Round 2 collection is in progress (`CURRENT_ROUND = 2`); any switch to
Round 2 values needs a benchmark rerun first.

| Provider                     | Weight |
|------------------------------|-----------------|
| Attending                    | 20 (fixed reference) |
| Senior Resident (PGY 3-4)    | 15.2 |
| PA                           | 11.4 |
| Junior Resident (PGY-2)      | 10.8 |
| Intern (PGY-1)               | 6.6 |
| Rotator                      | 2.4 |

Provider statuses are hidden in the Carbon interface (Decision 6): nothing on screen sets one, so every
provider scores as active. The code and multipliers below remain in the model.

| Status          | Multiplier | Auto-expires |
|-----------------|------------|--------------|
| Active          | 1.0        | no |
| Taking Signout  | 0.5        | 30 min |
| In Procedure    | 0.25       | 30 min |
| Off Floor       | 0.0        | 15 min |

Float modifiers (applied to the patient's load, per `getCurrentLoad`): none 1.0, float supervising 0.65, float primary 0.0.
Float primary is the same for stroke and non-stroke A-side patients (Decision 36). Float supervising is hidden in the
Carbon interface until attendings can enter it after triage (Decision 37); the code and multiplier remain.

### Acuity weights and decay (4:2:1, D6 linear)

| Tier               | Label  | Initial weight | Decay |
|--------------------|--------|----------------|-------|
| Tier One           | Red    | 4 | linear to 0 at 180 min |
| Tier Two           | Yellow | 2 | linear to 0 at 180 min |
| Tier Three         | Purple | 1 | linear to 0 at 90 min |

### Buffers

Removed. `BUFFER_DURATIONS_MS` is all zeros per the Methods paper: a new assignment raises the team's
load and lowers its ratio, which provides the protection buffers used to add.

### Capacity terms (pre-Carbon cards; lab only)

The Carbon board shows the number only, no tier words or capacity colors. Display rule for large ratios
(Decision 3): 100 or more shows as infinity unless two or more A-side teams are at 100 or more, then
those show whole numbers; zero load is always infinity (`src/ui/model.ts`).


| Ratio   | Label       |
|---------|-------------|
| >= 50   | Comfortable |
| >= 23   | Manageable  |
| >= 16   | Busy        |
| >= 11.5 | Very Busy   |
| >= 8.5  | High Demand |
| < 8.5   | Red Zone    |

`RED_ZONE_THRESHOLD` = 8.5 (p5 of the empirical distribution under the recommended config; formerly
`OVERWHELM_THRESHOLD`, renamed 2026-09-28). A placement onto a team below it is a "red-zone event"
(`ModeStats.redZoneEvents`, `ShadowResult.redZoneEvents`). The scripts' JSON keeps the old field names
`overwhelms` and `overwhelmAvoidance` so older result files stay readable. Card
color and battery fill are anchored to per-arrival percentiles of the 4:2:1 historical replay
(1,958 arrivals, 121 shift-days). See `METHODS.md` for derivations.

## Research metrics (lab and scripts only)

- **Composite fairness score is versioned** (METHODS.md section 9). v1 (`computeFairnessV1`,
  `computeFairnessDetailedV1`) weights acuity balance 5:3:1 and reproduces every composite figure
  recorded before 2026-09-28. v2 (`computeFairness`, `computeFairnessDetailed`, the scripts' default)
  uses `ACUITY_WEIGHTS` (4:2:1) as one fixed scale for every condition; passing other `acuityWeights`
  answers a different question and must be labeled. Only acuity balance (15%) differs.
- **No composite or win tally on screen.** The lab simulation summary and the benchmark page show each
  measure on its own (Decision 18). Do not reintroduce an overall winner or a count of wins across
  metrics: which metrics are counted changes it (81% on four chosen metrics, 59% on all ten).
- Individual helpers (`countBackToBackHA`, `countSlams`, `countSpread`, `acuitySpread`) expect entries
  in arrival order, use inclusive 30 and 60 minute windows, and measure acuity at 4:2:1 with no decay.
  All "ratio" metrics are the receiving team's ratio just before placement, not a shift minimum.
- Real Week Backtest stays under `?lab`, labeled as a dated March 2026 report on composite v1
  (Decision 19). Its numbers are not current.

## Delphi survey: missing values

`src/utils/delphiResponses.ts`, used by `useSurveyWeights`, `DelphiAdminPanel` and `DelphiSurvey`: a
blank, missing or non-numeric cell is a non-response for that role (left out of its mean, quartiles and
n); 0 is a valid rating (scale 0 to 20); off-scale values are missing. Decide missingness on the raw cell,
never after `Number()` (which turns blanks into 0). A row of all zeros is a response. Research only:
scoring never reads the survey.

## Landmines

- **Census times are zone-independent** (METHODS.md section 10). Scripts that read the census use
  `scripts/lib/census-time.ts`: Excel serials become wall-clock time held as UTC milliseconds and are read
  only with UTC getters, so any machine gives the workbook reading (1,540 / 418). Never use
  `new Date(y, m, d)`, `getHours()` or `new Date('YYYY-MM-DD').getDay()` on census data. Records made
  before 2026-09-28 on the Mac (1,541 / 417) read arrivals from 2026-03-08 onward one hour late.
- The lab reducer's TICK applies a tick's scheduled status changes before expiring earlier ones;
  skip-ahead is chronological. The shared simulation and replay status ordering is an open item.
- Scripts that write results (historical replay) write into `data/`; for comparison runs use a scratch
  copy with its own copy of `data/provider-schedules/`, not a symlink.

## Known inaccuracies still in the app

- None known in the Carbon interface. The old `HelpSection.tsx`, which quoted "+55%" and "+249%"
  (cross-benchmark stitches, never quote them), is archived; `src/app/Help.tsx` was written from scratch
  and quotes no figures.
- The walkthrough (`public/walkthrough-v4.html`) still loads Google Fonts (EB Garamond, Inter), by
  Julian's choice (2026-09-28). The rest of the app makes no Google Fonts request.
- Pre-Carbon lab screens still show some em dashes (simulation setup, lab Dashboard, lab TeamCard).

## Key Design Decisions

- **All state is client-side** (`useReducer` + React context). No backend yet.
- **Team 4 (Trauma)** is visible but excluded from auto-recommendations; assignment only via manual override.
- **One role, one shared device.** No role picker. Phone portrait and tablet landscape are both first-class.
- **Demo** is one sample shift with a permanent "Demo · Sample data" badge and a clock toolbar (pause, 1x,
  60x, 240x, optional arrivals placed through the engine with next/last arrival steps, reset, Change Teams:
  a random day's 10:00 teams from the synthetic schedule).
- **Tour** is six steps on its own sample shift with the clock held still.
- **Weekly schedule upload** (Home, "Upload this week's schedule" or "Start shift from schedule";
  also in manual setup): the .xlsx is read on the device,
  residents with no level must get a role before the week is saved, and the shift follows the
  schedule automatically. `Provider.share` is missing (1) everywhere outside this path, so all earlier
  scoring and every benchmark are unchanged. ShiftAdmin API access is deferred until after the trial
  (Decision 39).
- **Shift activity** is in memory only and is lost on reload or End shift. The trial still needs a
  durable override record (open item).
- **Override reasons:** Continuity / bounce-back; Team or attending request; Other (note required).
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

## Shared-provider bounded check (September 30, 2026)

The live parser now includes A-side residents, split equally through `rosterAt` across their open
covered teams. Legacy parsing remains unchanged. Setup and team detail show the exact cover rule;
scoring uses the unrounded share. Unknown levels still need a role pick. Swing covers all teams;
[PM] is not a level (PGY key first, otherwise role pick). The scheduled-close redistribution remains
as in Decision 42. Saved schedules with older parser versions automatically re-read their original
workbooks to include A-side rows and retain role picks. Only a missing or unreadable original
requires re-upload (upload-and-go follow-up).
The rule is provisional pending Julian's final trial freeze review.

`node --import tsx scripts/shared-provider-check.ts` runs only in an isolated checkout with copied
private schedules and writes new aggregate outputs under `data/shared-provider-check/`. It compares
sharing rules with corrected rosters, excludes unresolved/ambiguous full windows, and never writes
old benchmarks. See METHODS section 12 for cohort limitations and same-run results.
