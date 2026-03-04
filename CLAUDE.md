# er-triage-app

A mobile-first React + TypeScript app for ER patient triage assignment. Replaces round-robin team rotation with formula-driven scoring that considers provider capacity, patient acuity/load, decay over time, and cooldown buffers. Built with Vite, Tailwind CSS v4, React 19.

## Setup

```bash
cd er-triage-app
npm install
npm run dev              # dev server (Vite)
npm run build            # type-check + production build → dist/
```

## Delphi Survey — Google Sheets Backend

The Delphi provider-strength survey can optionally store responses in a shared Google Sheet so all users see the same totals.

### Setup

1. Create a Google Sheet with columns: `Timestamp | Senior Resident | Junior Resident | Intern | PA | Rotator` (name the sheet tab `Responses`)
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
    body.rotator
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

- `src/types.ts` — all TypeScript types: `Provider`, `Patient`, `Buffer`, `TeamScore`, `Recommendation`, `ShiftState`, `ShiftAction`
- `src/constants.ts` — tuning parameters (see below)
- `src/engine/recommendation.ts` — pure-function scoring engine
- `src/context/ShiftContext.tsx` — `useReducer`-based state management
- `src/App.tsx` — root: role selection → shift setup (charge nurse) → dashboard; 1s TICK interval
- `src/components/`
  - `Dashboard.tsx` — main view: sticky header, help toggle (?), color legend, team cards grid, FAB
  - `TeamCard.tsx` — capacity ratio, buffer bars, collapsible providers (default collapsed), patient badges
  - `AssignPatient.tsx` — modal: tier selection with clinical examples, team selection, override flow
  - `HelpSection.tsx` — collapsible guide (intro, formula, example, capacity, decay, buffers, recommendations, overrides, nomenclature)
  - `ShiftSetup.tsx` — charge nurse team builder
  - `RoleSelection.tsx` — role picker + LOAD_DEMO button
  - `ProviderStatusToggle.tsx` — provider status cycling
  - `PatientBadge.tsx` — acuity color, decay timer, weight indicator
  - `OverrideModal.tsx` — override reason selection

## Scoring Formula

```
Capacity Ratio = Team Capacity / Patient Load
```

Highest ratio (among non-buffered teams) = recommended. Team 4 (Trauma) excluded from auto-recommendations.

**Tiebreakers:** not-buffered first → highest ratio → least recent assignment → lowest team ID.

### Capacity Weights (provider type × status multiplier)

Weights are fetched live from the Delphi survey sheet (polled every 5 min via `useSurveyWeights` hook). Fallback defaults in `constants.ts` are used when the sheet is unavailable.

| Provider             | Fallback | Survey Avg (6 responses) |
|----------------------|----------|--------------------------|
| Attending            | 20       | 20 (fixed reference)     |
| Senior Resident      | 15.0     | 15.2                     |
| PA                   | 10.0     | 10.8                     |
| Junior Resident (PGY-2) | 7.5  | 10.8                     |
| Intern (PGY-1)       | 5.0      | 5.7                      |
| Rotator              | 1.0      | 1.0                      |

| Status          | Multiplier |
|-----------------|------------|
| Active          | 1.0        |
| Taking Signout  | 0.5        |
| In Procedure    | 0.25       |
| Off Floor       | 0.0        |

### Acuity Weights & Decay

| Tier      | Initial | Decay                          |
|-----------|---------|--------------------------------|
| Tier One  | 5       | → 3 at 60m → 1 at 120m → 0 at 240m |
| Tier Two  | 3       | → 1 at 90m → 0 at 240m              |
| Tier Three| 1       | → 0 at 120m                          |

### Buffer Durations

| Spawning Tier | Duration |
|---------------|----------|
| Tier One      | 35 min   |
| Tier Two      | 25 min   |
| Tier Three    | 15 min   |

Buffer stacking is **additive** — 3 rapid assignments = ~3× duration, not max(). Merged buffers show combined count.

### Capacity Terms (displayed on cards)

| Ratio    | Label        | Color   |
|----------|--------------|---------|
| ≥ 21     | Ready        | emerald |
| ≥ 10     | Stable       | green   |
| ≥ 6      | Manageable   | yellow  |
| ≥ 4      | Very Busy    | orange  |
| ≥ 2      | High Demand  | red     |
| 0        | Overwhelmed  | dark red|

## Key Design Decisions

- **All state is client-side** (`useReducer` + React context). No backend yet.
- **Provider status auto-expires** — off_floor at 15min, in_procedure/taking_signout at 30min.
- **Team 4 (Trauma)** is visible but excluded from auto-recommendations; assignment only via manual override.
- **Demo mode** randomizes provider names, team compositions, statuses, and simulates patient arrivals chronologically through the recommendation engine for balanced distribution.
- **Buffer bar width** is computed directly from `remainingMs / (elapsed + remaining)` each render (not CSS animation) so it stays in sync with the app clock.
- **Patient nomenclature**: `C-###` = critical/new arrival, `F-###` = floor upgrade, time display = minutes until next decay, `w:N` = current decayed weight.

## Next Step: Real-Time Backend

The app needs a backend so multiple phones/tablets can share the same shift state. Requirements:
- Real-time sync: all connected clients see updates instantly (provider status changes, new patient assignments, buffer countdowns)
- Conflict resolution: two users assigning a patient simultaneously must not corrupt state
- Minimal infrastructure: ideally a single service (e.g. WebSocket server, or Firebase/Supabase real-time)
- The recommendation engine (`recommendation.ts`) is pure functions and can run on either client or server
- State shape is already defined in `types.ts` — `ShiftState` is the single source of truth
- Auth can be simple (shift code / room code) — no user accounts needed initially
