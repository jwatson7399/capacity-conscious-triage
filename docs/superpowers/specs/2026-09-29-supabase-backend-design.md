# Supabase Backend: Durable Trial Log and Shift Resume

_Design spec, 2026-09-29. Approved section by section in chat by Julian; written by Claude Opus (Claude Code)._

## 1. Goal and scope

Give the live shift a server record so that:

1. every recommendation and shift action (accepted or overridden, with reason codes and the
   score snapshot) is kept durably for the trial (Roundtable open item 6);
2. a reload or crash resumes the live shift exactly, including the activity log and its undo;
3. the storage shape can later carry multi-device sync without a redesign.

The trial stays on **one shared device** (Decision 9 amended, not reversed). Sync itself is out
of scope.

**Not changing:** the scoring engine, weights, core reducer and session reducer logic. The engine
stays client-side and pure. Demo and tour never write.

**Hosting (Julian's decision):** a new project in Julian's Supabase org "Watson's", used for real
trial data. A Legal Dossier draft records this (section 9). Project creation waits on a cost check
and Julian's confirmation.

**No PHI.** Patients are `C-###` / `F-###` with a color. The only names are providers' names from
the roster.

## 2. Approach

Chosen: **state snapshot plus append-only event rows.**

- `shifts.state` holds the latest serialized session (JSON) with a `version` counter.
- `shift_events` holds one row per activity event, never updated or deleted.

Rejected: action-log replay (would need a deterministic reducer: injected clock and ids, a
replay mismatch would show a wrong board mid-trial); log-only with local resume (resume tied to
one browser, no path to sync).

Why snapshot works: the activity events are an audit record, not a replay script
(`shift_start` has only a provider count; the reducer uses `Date.now()` and random ids).

## 3. Database schema (all `public`, RLS on every table)

### `shifts`
| Column | Type | Notes |
|---|---|---|
| `id` | uuid pk, default `gen_random_uuid()` | |
| `code` | text unique not null | 6 chars from `ABCDEFGHJKMNPQRSTUVWXYZ23456789` (no 0/O/1/I/L) |
| `created_by` | uuid not null | `auth.uid()` of the creating device |
| `started_at` | timestamptz not null default now() | |
| `ended_at` | timestamptz null | set once by `end_shift`; shift is read-only after |
| `app_commit` | text not null | git SHA injected at build |
| `weights_id` | text not null | e.g. `delphi-r1-n19` |
| `state` | jsonb not null | serialized session (section 4) |
| `version` | int not null default 1 | bumped by every successful save |
| `updated_at` | timestamptz not null default now() | |

### `shift_members`
`(shift_id uuid references shifts, user_id uuid, joined_at timestamptz default now())`, pk
`(shift_id, user_id)`. One row today; sync adds rows.

### `shift_events`
| Column | Type | Notes |
|---|---|---|
| `shift_id` | uuid references shifts | |
| `id` | text | the event's own `ev-…` id |
| `seq` | int not null | |
| `kind` | text not null | |
| `at` | bigint not null | model clock ms |
| `recorded_at` | bigint not null | device wall clock ms |
| `device_id` | uuid not null | `auth.uid()` |
| `body` | jsonb not null | the full event, including the assign snapshot |
| `inserted_at` | timestamptz default now() | server receive time |

Primary key `(shift_id, id)`: a retried upload cannot duplicate. Index on `(shift_id, seq)`.
A trigger raises on `UPDATE` or `DELETE` (second guard behind RLS).

### `admins`
`(user_id uuid pk)`. Julian's user id, added by hand after his first magic-link sign-in.

### `enrollment`
Single row: `code_hash text` (bcrypt via `pgcrypto` `crypt()`), `updated_at`.

## 4. Security and access

- **Device identity:** Supabase anonymous sign-in. The anonymous session persists in the
  browser, so a reload keeps the same `auth.uid()`.
- **Functions** (`security definer`, `search_path` pinned, `execute` granted to `authenticated`):
  - `create_shift(enroll_code, app_commit, weights_id, state) -> (id, code)`: checks the code
    against `enrollment.code_hash`; creates the shift with a unique code; adds the caller to
    `shift_members`. Wrong code raises `invalid_enrollment`.
  - `join_shift(code) -> id`: adds the caller as a member of an open shift. (Unused by the UI
    today; kept for sync.)
  - `save_state(shift_id, expected_version, state) -> (ok, version)`: caller must be a member
    and the shift open; writes only when `version = expected_version`, then `version + 1`.
    Mismatch returns `ok = false` with the current version and writes nothing.
  - `end_shift(shift_id)`: member only; sets `ended_at` if null.
  - `set_enrollment_code(code)`: admin only (non-anonymous and in `admins`); stores the hash.
- **RLS policies:**
  - `shifts`, `shift_events`: `select` for members of that shift, or admins. No direct
    `insert/update/delete` on `shifts` (functions only).
  - `shift_events`: `insert` for members of an open shift with `device_id = auth.uid()`. No
    update or delete policy.
  - `shift_members`: `select` own rows; writes via functions only.
  - `admins`, `enrollment`: no client access except admins may `select admins` to check
    themselves.
- **Admin check:** `auth.uid() in admins` **and** the JWT `is_anonymous` claim is false.
- **Why the passcode:** the anon key ships in the public Pages bundle and anonymous sign-in is
  open. The department passcode (entered once per device) stops drive-by writes. It is a
  speed bump, not strong security.
- After migration: run Supabase security and performance advisors; fix anything they flag.

## 5. Client architecture

`ShiftProvider` gains an optional `persist` prop. Only the live shift (`CarbonApp.tsx`, the
provider around the live board) passes it. Demo and tour providers do not, so they cannot write.

New units in `src/backend/`:

- **`client.ts`**: builds the Supabase client from `VITE_SUPABASE_URL` and
  `VITE_SUPABASE_ANON_KEY`. Either missing: backend off, app behaves exactly as today. Tests run
  with it off.
- **`serialize.ts`** (pure): session to JSON and back. Keeps `shift`, `activity`, `seq`. Drops
  `undoable`, `demoRewind`, `shift.simulation`, `shift.scheduleData` (roster already in
  `providers`; the imported workbook is not stored). On restore, `now` = wall clock.
- **`outbox.ts`**: localStorage queue. Items: `event` rows (in seq order) and one pending
  `save` (a newer save replaces an older one waiting). Uploads in order; exponential backoff
  (1 s doubling to 60 s) on network or server error; remembers sent event ids. Exposes
  `pending` count and `lastError`. Keeps the last serialized state locally for offline resume.
- **`shiftSync.ts`**: hook used inside a persisting `ShiftProvider`. On every growth of
  `activity`, queues the new events. On any session change not caused by `TICK`, queues a save
  (debounced about 1 s). On a version mismatch, surfaces an error and stops saving until
  reloaded; never overwrites.
- **Build values:** `vite.config.ts` defines `__APP_COMMIT__` from `git rev-parse --short HEAD`.
  `constants.ts` gets `WEIGHTS_ID = 'delphi-r1-n19'` next to `CAPACITY_WEIGHTS` (label only;
  values unchanged).

New dependency: `@supabase/supabase-js`.

## 6. Flows

- **Start shift:** Setup screen asks for the department passcode the first time on a device
  (remembered in localStorage afterwards; re-asked if rejected). Calls `create_shift`. The
  6-character shift code shows in the board menu.
- **Reload or crash:** device finds its open shift id in localStorage; loads `shifts.state`;
  restores with `HYDRATE` plus the activity log. Server unreachable: restore from the outbox's
  local copy.
- **End shift:** flush the outbox, call `end_shift`, clear the local shift id. Offline: the end
  is queued like any other item.
- **Header status** next to the clock: nothing when synced; "Saving…" while uploading;
  "Offline, N unsaved" when items are waiting.

## 7. Admin screen (`?lab`)

New "Trial data" card in `src/lab/LabHome.tsx`, lazy-loaded from `src/lab/trial/`.

- **Sign-in:** magic link to Julian's email. Non-admins (including anonymous devices) see
  "Not authorized"; RLS returns nothing regardless.
- **Shift list:** date, code, start, end, commit, weights id, event count, override count;
  newest first; open shifts included.
- **Shift detail:** events in seq order: time, kind, patient, color, recommended team, chosen
  team, followed or override, reason, note, undone. A row expands to its score snapshot (each
  team's capacity, load, ratio, closed, buffered). Undone events stay visible, marked.
- **Export:** `shifts.csv` and `events.csv` (one row per event; snapshot flattened to
  `t1_capacity … t5_buffered` columns), for one shift or a date range.
- **Figures:** counts only (arrivals, overrides per shift). No rates, adherence percent or
  composite (spirit of Decision 18).
- **Passcode:** form to set or rotate the department passcode via `set_enrollment_code`.
  Rotating does not affect devices already in a shift.
- Carries "© 2026 New York University" like other lab screens.

## 8. Error handling

| Failure | Behavior |
|---|---|
| Offline or server error | Items stay queued, retried with backoff; header shows "Offline, N unsaved"; triage never blocks |
| Wrong passcode | "Passcode not recognized"; shift does not start |
| Backend not configured | App runs in memory as today; lab card says "Backend not configured" |
| Save version mismatch | Visible error; server copy never overwritten; events keep uploading |
| Reload while offline | Board restored from local copy; outbox uploads later |
| Browser storage cleared before upload | Unsent items lost; the only gap; header count makes it visible |

## 9. Testing and verification

- **Unit (Vitest, fake Supabase client):** `serialize` round-trip and dropped fields; outbox
  order, save coalescing, event dedupe, retry and backoff; `shiftSync` never saves on `TICK` and
  queues each event exactly once; demo and tour providers never write.
- **Database (SQL against the project):** anonymous device cannot read another's shift; event
  update and delete fail; wrong passcode fails; stale-version save fails; non-admin cannot read
  across shifts; ended shift rejects saves and events. Advisors clean.
- **End to end (browser preview, test passcode):** start shift, place patients including an
  override, reload (board and log back, undo from log still works), go offline and keep working,
  reconnect (rows upload), end shift, check in the admin screen and CSV.
- Existing suite, lint, build and `check:schedules` pass.

## 10. Records

- **Roundtable** (backed up first, unreviewed): decision amending Decision 9 (backend for the
  durable record and resume, one device, sync-ready); resolves open item 6.
- **METHODS** (unreviewed): trial data capture: what is stored, schema, commit and weights id per
  shift, export format.
- **Legal Dossier draft** in `ER Triage App/dossier-pending.md`, for Julian's go: real trial data
  in Julian's personal Supabase org; a new endpoint and public anon key in the Pages bundle;
  anonymous sign-in with a department passcode; data retention (events never deleted).
- **CLAUDE.md:** a Backend section replaces "Next Step: Real-Time Backend".
- **Env:** `.env` gains `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (never committed).

## 11. Deploy

Material deploy (new endpoint, new data collection). No `npm run deploy` without Julian's
explicit go, and the Dossier draft comes first.

## 12. Order of work

1. Cost check; Julian confirms; create the Supabase project.
2. Migration (schema, functions, RLS, trigger); enable anonymous sign-in; database tests;
   advisors.
3. `src/backend/` units with unit tests.
4. Wire into `ShiftProvider`, Setup (passcode), board (code, status), End shift.
5. Admin screen and export.
6. End-to-end check; records; CLAUDE.md.

## 13. Revision 2026-09-29 (after external audit)

The design is unchanged in shape: Supabase, separate admin and device auth, RPC-only writes,
snapshot plus append-only events. The persistence protocol is tightened:

- The server rejects null passcodes, versions and arguments, and compares them null-safely.
- Each state save carries a save id. Repeating the last committed id succeeds without writing, so
  a save whose reply was lost is not a conflict.
- Upload queue entries have stable ids and are removed only when acknowledged. A save that has
  been sent is never replaced.
- The newest board is stored on the device at every change; only the upload waits (at most 1 s,
  never pushed back by clock ticks).
- A conflict is resolved on reload or from the status chip by comparing boards: the newer board
  wins and unsent events always upload.
- One browser tab records the shift (Web Locks). Other tabs are blocked with a notice.
- Admin reads page through every row and fail rather than export a partial record.

- Every page load drains the upload queue, even with no open shift, so a shift ended offline
  still closes on the server after a reload.
- A board not yet queued for upload is flagged on the device, so an offline reload queues it.
- Adopting another device's board cancels any save scheduled from the old one.
- The newest board is always the one queued, even if an older save is waiting.
- Ending a shift during a conflict waits until the newer board is saved; the local board is kept
  until then.

Details and tests are in the plan's "Revision 2026-09-29" note.
