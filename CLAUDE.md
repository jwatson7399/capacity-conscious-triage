# er-triage-app

A mobile-first React + TypeScript app for ER patient triage assignment. Replaces round-robin team rotation with formula-driven scoring that considers provider capacity, patient acuity/load, and decay over time. Built with Vite, Tailwind CSS v4, React 19. The app lives at the **repo root** (no subdirectory).

Parameter choices (weights, decay, buffers, thresholds) were validated against 1,541 real A-side encounters across 121 days — see `METHODS.md` for the full derivation. Keep this file, `METHODS.md`, and `src/constants.ts` in sync when parameters change.

## Setup

```bash
npm install
npm run dev              # dev server (Vite)
npm run build            # type-check + production build → dist/
npx vitest run           # unit tests (schedule parser)
```

## Deploy = GitHub Pages (gh-pages branch)

When the user says "deploy", build and push to the `gh-pages` branch. There is no GitHub Actions workflow — deployment is manual.

```bash
npm run build
npx gh-pages -d dist
```

This publishes to: https://jwatson7399.github.io/er-triage-app/

## Delphi Survey — Google Sheets Backend

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

- `src/types.ts` — all TypeScript types: `Provider`, `Patient`, `Buffer`, `TeamScore`, `Recommendation`, `ShiftState`, `ShiftAction`, simulation types
- `src/constants.ts` — tuning parameters (see below)
- `src/engine/recommendation.ts` — pure-function scoring engine
- `src/engine/simulation.ts` — seeded arrival/status timelines, shadow sims (formula vs round-robin), replay
- `src/engine/fairness.ts` — per-mode stats + individual comparison metrics (B2B high-acuity, slams, red-zone events, spreads). No composite in the UI — the sim panels compare metrics one by one; the legacy composite (`computeFairness`) is retained only for the benchmark scripts
- `src/context/ShiftContext.tsx` — `useReducer`-based state management
- `src/hooks/useSurveyWeights.ts` — polls the Delphi sheet every 5 min; falls back to `CAPACITY_WEIGHTS`
- `src/utils/scheduleParser.ts` — parses real weekly `.xlsx` provider schedules (unit-tested)
- `src/App.tsx` — root: role selection → dashboard; 1s TICK interval
- `src/components/`
  - `Dashboard.tsx` — main view: sticky header, help toggle (?), team cards grid, FAB
  - `TeamCard.tsx` — battery capacity widget, strength/load, collapsible patients, patient badges
  - `AssignPatient.tsx` — modal: tier selection with clinical examples, team selection, override flow
  - `HelpSection.tsx` — collapsible guide (formula, capacity scale, decay, overrides, nomenclature)
  - `EvidenceWalkthrough.tsx` / `MethodologyDeepDive.tsx` / `BenchmarkReport.tsx` / `RealScheduleBenchmarkReport.tsx` — evidence & methods views
  - `ShiftSetup.tsx`, `RoleSelection.tsx`, `ScheduleImport.tsx` — setup flows
  - `SimulationSetup.tsx`, `SimulationControls.tsx`, `SimulationParams.tsx`, `SimSummaryCard.tsx`, `TimelineSlider.tsx` — simulation mode
  - `DelphiSurvey.tsx` / `DelphiAdminPanel.tsx` — provider-weight survey
  - `PatientBadge.tsx`, `ProviderStatusToggle.tsx`, `OverrideModal.tsx`, `GuidedTour.tsx`, `Toast.tsx`
- `scripts/` — benchmark CLIs (historical replay, decay/buffer/weight sensitivity, real-schedule)

## Scoring Formula

```
Capacity Ratio = Team Capacity / Patient Load
```

Highest ratio = recommended. Team 4 (Trauma) excluded from auto-recommendations.

**Tiebreakers:** not-buffered first → highest ratio → least recent assignment → lowest team ID.

### Capacity Weights (provider type × status multiplier)

Weights are fetched live from the Delphi survey sheet (polled every 5 min via `useSurveyWeights`). The fallback defaults in `constants.ts` are the Delphi round-one means (n=19, attending fixed at 20 as reference).

| Provider                | Fallback (= Delphi R1 mean) |
|-------------------------|-----------------------------|
| Attending               | 20 (fixed reference)        |
| Senior Resident         | 15.2                        |
| PA                      | 11.4                        |
| Junior Resident (PGY-2) | 10.8                        |
| Intern (PGY-1)          | 6.6                         |
| Rotator                 | 2.4                         |

| Status          | Multiplier |
|-----------------|------------|
| Active          | 1.0        |
| Taking Signout  | 0.5        |
| In Procedure    | 0.25       |
| Off Floor       | 0.0        |

### Acuity Weights & Decay (4:2:1, D6 linear)

Recommended config per `METHODS.md`: weights 4:2:1 with linear decay to zero (no steps).

| Tier                | Initial | Decay                        |
|---------------------|---------|------------------------------|
| Tier One (Red)      | 4       | linear → 0 over 180 min      |
| Tier Two (Yellow)   | 2       | linear → 0 over 180 min      |
| Tier Three (Purple) | 1       | linear → 0 over 90 min       |

`getDecayedAcuityWeight` interpolates piecewise-linearly across the points in `ACUITY_DECAY`; the production config uses a single endpoint per tier (pure linear). Benchmark scripts may pass multi-step schedules via `ScoringOverrides`.

Float coverage modifiers scale a patient's load contribution: `float_supervising` ×0.65, `float_primary` ×0.0.

### Buffers: removed from the live config

`BUFFER_DURATIONS_MS` is all zeros — buffer-duration sensitivity testing showed the decaying load model already provides the cooling-off effect, so assignment buffers are inert by design. The buffer machinery remains in the engine for two reasons:

- **Deceased-patient cooldown** (`DECEASED_BUFFER_MS` = 30 min): marking a patient deceased buffers the team for 30 minutes (deceased patients are excluded from load).
- **Simulation overrides**: the sim panel can re-enable buffer durations for what-if runs.

### Capacity Terms (displayed on cards)

Recalibrated under the recommended config (4:2:1 + linear decay + no buffers) from 1,000 simulated shifts on real schedules (23,193 team-level observations); boundaries at empirical percentiles.

| Ratio   | Label        | Percentile |
|---------|--------------|------------|
| ≥ 50    | Comfortable  | top 25%    |
| ≥ 23    | Manageable   | p50–p75    |
| ≥ 16    | Busy         | p33–p50    |
| ≥ 11.5  | Very Busy    | p15–p33    |
| ≥ 8.5   | High Demand  | p5–p15     |
| < 8.5   | Red Zone     | bottom 5%  |

`RED_ZONE_THRESHOLD` in `constants.ts` = 8.5 (empirical p5 — a descriptive rarity boundary, not a claim about subjective overwhelm). Used by the fairness engine, simulation, and benchmark scripts. See `METHODS.md` for full derivation.

## Key Design Decisions

- **All state is client-side** (`useReducer` + React context). No backend yet.
- **Provider status auto-expires** — off_floor at 15min, in_procedure/taking_signout at 30min.
- **Team 4 (Trauma)** is visible but excluded from auto-recommendations; assigning to it bypasses the override modal (manual-only by design).
- **Teams 3 & 4 can be closed**; their patients auto-transfer (3→1, 4→2) after 60 min, or immediately via "Sign Out".
- **Deceased patients** drop out of team load and counts; the team gets a 30-min cooldown buffer.
- **Demo mode** randomizes provider names, team compositions, statuses, and simulates patient arrivals chronologically through the recommendation engine.
- **Simulation mode** runs seeded arrival/status timelines at adjustable speed, with a shadow sim of the opposite assignment mode (formula vs round-robin) for live comparison.
- **Patient nomenclature**: `C-###` = critical/new arrival, `F-###` = floor upgrade; badges show live decayed load and a decay pie that fills as the patient stabilizes.

## Next Step: Real-Time Backend

The app needs a backend so multiple phones/tablets can share the same shift state. Requirements:
- Real-time sync: all connected clients see updates instantly (provider status changes, new patient assignments)
- Conflict resolution: two users assigning a patient simultaneously must not corrupt state
- Minimal infrastructure: ideally a single service (e.g. WebSocket server, or Firebase/Supabase real-time)
- The recommendation engine (`recommendation.ts`) is pure functions and can run on either client or server
- State shape is already defined in `types.ts` — `ShiftState` is the single source of truth
- Auth can be simple (shift code / room code) — no user accounts needed initially
