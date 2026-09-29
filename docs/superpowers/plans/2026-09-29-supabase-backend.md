# Supabase Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the live shift a durable Supabase record (append-only activity log with score snapshots, plus a versioned state snapshot) so a reload resumes the shift, with a passcode-gated start, an offline outbox, and a `?lab` admin screen with CSV export.

**Architecture:** The engine, weights and reducers stay client-side and unchanged. A `SyncController` (plain TypeScript, unit-tested in Node) watches the session, queues event rows and debounced state saves into a localStorage outbox, and uploads them through a small `BackendApi` interface backed by Supabase RPC functions. Only the live `ShiftProvider` gets `persist`; demo and tour never write.

**Tech Stack:** React 19, TypeScript 5.9, Vite 7, Vitest 4, `@supabase/supabase-js` v2, Postgres 17 (Supabase) with RLS and `pgcrypto`.

**Spec:** `docs/superpowers/specs/2026-09-29-supabase-backend-design.md` (commit `442349d`). Read it before starting.

## Global Constraints

- Repo rules in `AGENTS.md` and `CLAUDE.md` apply: START/DONE entries in `AGENT_LOG.md` (main repo folder); stage files by name, never `git add .`/`-A`; never `--no-verify`; never rebase, amend or force-push; never commit `.env`, `ER Triage App/`, `AGENT_LOG.md`, `CCT Legal Dossier.md`.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- No em dashes in any file, comment or user-facing text.
- Every new source file starts with `// © 2026 New York University. All rights reserved.`; every new user-facing screen shows `<Copyright />` (Carbon) or the lab's existing notice.
- Scoring, weights (`CAPACITY_WEIGHTS` values), `recommendation.ts` and the core `shiftReducer` must not change.
- Demo and tour providers never write to the backend.
- Backend off when `VITE_SUPABASE_URL` or `VITE_SUPABASE_ANON_KEY` is unset: the app behaves exactly as today. Tests run with it off.
- `WEIGHTS_ID = 'delphi-r1-n19'`. Shift codes: 6 characters from `ABCDEFGHJKMNPQRSTUVWXYZ23456789`.
- Events are never updated or deleted on the server.
- No deploy (`npm run deploy`) without Julian's explicit go. No Supabase project creation before Julian confirms the cost.
- Run tests with `npx vitest run src scripts` (the repo root also picks up `.worktrees/`).

## Review Focus

1. **Admin sign-in on the triage device** must not replace the device's anonymous session (that would drop it from its live shift). Admin uses a separate client with its own `storageKey`; the triage client has `detectSessionInUrl: false`. Test in Task 3.
2. **End shift, then RESET** must not upload an empty session over the ended shift. The controller goes inactive before RESET is dispatched. Test in Task 4.
3. **Starting a shift with no connection or a wrong passcode**: the shift does not start silently unrecorded. Wrong passcode shows "Passcode not recognized"; no connection offers Retry or "Start without saving" (explicit, logged locally). Test in Task 4.
4. **Reload mid-shift restores the activity log** (not a fresh `shift_start` like `HYDRATE`), so undo from the log still works and `seq` continues. Test in Task 2 and Task 4.
5. **A server outage longer than one save** coalesces saves (only the latest state is sent) but never drops or reorders events, and a retried event batch never duplicates. Test in Task 3.

---

## File Structure

| File | Responsibility |
|---|---|
| `supabase/migrations/20260929120000_trial_backend.sql` | Tables, functions, RLS, append-only trigger |
| `supabase/tests/trial_backend.sql` | Database assertions, run inside a rolled-back transaction |
| `src/constants.ts` (modify) | `WEIGHTS_ID` |
| `vite.config.ts` (modify) | `__APP_COMMIT__` define |
| `src/globals.d.ts` (new) | `declare const __APP_COMMIT__: string` |
| `src/context/session.ts` (modify) | `RESTORE` session action |
| `src/backend/serialize.ts` | Session to saved JSON and back (pure) |
| `src/backend/api.ts` | `BackendApi` interface and the Supabase implementation |
| `src/backend/client.ts` | Supabase clients (triage, admin), `backendEnabled` |
| `src/backend/outbox.ts` | Persistent ordered upload queue with retry |
| `src/backend/controller.ts` | `SyncController`: begin, restore, watch session, end |
| `src/backend/SyncContext.tsx` | React glue: `useSync()`, bridge inside `ShiftProvider` |
| `src/backend/testing.ts` | `FakeApi`, `MemoryStorage` for tests |
| `src/context/ShiftContext.tsx` (modify) | `persist` prop mounts the bridge |
| `src/app/CarbonApp.tsx`, `src/app/PasscodeSheet.tsx`, `src/app/SyncStatus.tsx`, `src/app/Board.tsx` (modify/new) | Start with passcode, status, shift code, End shift |
| `src/lab/trial/*` | Admin sign-in, shift list, detail, CSV, passcode form |

---

### Task 1: Database schema, functions, RLS (after Julian confirms cost)

**Files:**
- Create: `supabase/migrations/20260929120000_trial_backend.sql`
- Create: `supabase/tests/trial_backend.sql`

**Interfaces:**
- Produces (Postgres RPC, all `security definer`, `set search_path = public, extensions`, executable by `authenticated` only):
  - `create_shift(p_enroll_code text, p_app_commit text, p_weights_id text) returns table(id uuid, code text)`
  - `join_shift(p_code text) returns uuid`
  - `save_state(p_shift_id uuid, p_expected_version int, p_state jsonb) returns table(ok boolean, version int)`
  - `append_events(p_shift_id uuid, p_events jsonb) returns int` (array of `{id, seq, kind, at, recordedAt, ...}`; returns rows inserted; duplicates ignored)
  - `end_shift(p_shift_id uuid) returns void`
  - `set_enrollment_code(p_code text) returns void`
  - `is_admin() returns boolean`
- Note (deviation from spec, recorded in METHODS): `create_shift` takes no state (the first `save_state` at version 1 fills it), and events go through `append_events` instead of a direct insert policy, so membership, `device_id` and dedupe are enforced in one place.

- [ ] **Step 1: Cost check and creation (needs Julian)**

Use Supabase MCP `get_cost` with `type: "project"`, `organization_id: "rwavhschtvrbdtnaifzh"`. Tell Julian the amount and wait for a yes. Then `confirm_cost` and `create_project` with name `capacity-conscious-triage`, region `us-east-1`. Record the project ref.

- [ ] **Step 2: Write the migration**

```sql
-- © 2026 New York University. All rights reserved.
-- Trial backend: durable shift record (append-only events + versioned state snapshot).
-- Spec: docs/superpowers/specs/2026-09-29-supabase-backend-design.md

create extension if not exists pgcrypto with schema extensions;

create table public.shifts (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  created_by uuid not null,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  app_commit text not null,
  weights_id text not null,
  state jsonb not null default '{}'::jsonb,
  version int not null default 1,
  updated_at timestamptz not null default now()
);

create table public.shift_members (
  shift_id uuid not null references public.shifts(id),
  user_id uuid not null,
  joined_at timestamptz not null default now(),
  primary key (shift_id, user_id)
);

create table public.shift_events (
  shift_id uuid not null references public.shifts(id),
  id text not null,
  seq int not null,
  kind text not null,
  at bigint not null,
  recorded_at bigint not null,
  device_id uuid not null,
  body jsonb not null,
  inserted_at timestamptz not null default now(),
  primary key (shift_id, id)
);
create index shift_events_shift_seq on public.shift_events (shift_id, seq);

create table public.admins (user_id uuid primary key);
create table public.enrollment (
  singleton boolean primary key default true check (singleton),
  code_hash text not null,
  updated_at timestamptz not null default now()
);

alter table public.shifts enable row level security;
alter table public.shift_members enable row level security;
alter table public.shift_events enable row level security;
alter table public.admins enable row level security;
alter table public.enrollment enable row level security;

-- Append-only guard behind RLS.
create function public.forbid_event_change() returns trigger language plpgsql as $$
begin
  raise exception 'shift_events is append-only';
end $$;
create trigger shift_events_append_only before update or delete on public.shift_events
  for each row execute function public.forbid_event_change();

create function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((auth.jwt() ->> 'is_anonymous')::boolean, true) = false
     and exists (select 1 from public.admins a where a.user_id = auth.uid());
$$;

create function public.is_member(p_shift_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.shift_members m where m.shift_id = p_shift_id and m.user_id = auth.uid());
$$;

create policy shifts_read on public.shifts for select to authenticated
  using (public.is_member(id) or public.is_admin());
create policy events_read on public.shift_events for select to authenticated
  using (public.is_member(shift_id) or public.is_admin());
create policy members_read on public.shift_members for select to authenticated
  using (user_id = auth.uid() or public.is_admin());
create policy admins_read_self on public.admins for select to authenticated
  using (user_id = auth.uid());

create function public.new_shift_code() returns text language plpgsql as $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  c text;
begin
  loop
    c := '';
    for i in 1..6 loop
      c := c || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from public.shifts s where s.code = c);
  end loop;
  return c;
end $$;

create function public.create_shift(p_enroll_code text, p_app_commit text, p_weights_id text)
returns table(id uuid, code text)
language plpgsql security definer set search_path = public, extensions as $$
declare
  h text;
  new_id uuid;
  new_code text;
begin
  if auth.uid() is null then raise exception 'not_signed_in'; end if;
  select e.code_hash into h from public.enrollment e where e.singleton;
  if h is null or crypt(p_enroll_code, h) <> h then raise exception 'invalid_enrollment'; end if;
  new_code := public.new_shift_code();
  insert into public.shifts (code, created_by, app_commit, weights_id)
    values (new_code, auth.uid(), p_app_commit, p_weights_id) returning shifts.id into new_id;
  insert into public.shift_members (shift_id, user_id) values (new_id, auth.uid());
  return query select new_id, new_code;
end $$;

create function public.join_shift(p_code text) returns uuid
language plpgsql security definer set search_path = public as $$
declare sid uuid;
begin
  if auth.uid() is null then raise exception 'not_signed_in'; end if;
  select s.id into sid from public.shifts s where s.code = upper(p_code) and s.ended_at is null;
  if sid is null then raise exception 'no_open_shift'; end if;
  insert into public.shift_members (shift_id, user_id) values (sid, auth.uid()) on conflict do nothing;
  return sid;
end $$;

create function public.save_state(p_shift_id uuid, p_expected_version int, p_state jsonb)
returns table(ok boolean, version int)
language plpgsql security definer set search_path = public as $$
declare cur int; ended timestamptz;
begin
  if not public.is_member(p_shift_id) then raise exception 'not_member'; end if;
  select s.version, s.ended_at into cur, ended from public.shifts s where s.id = p_shift_id for update;
  if ended is not null then raise exception 'shift_ended'; end if;
  if cur <> p_expected_version then return query select false, cur; return; end if;
  update public.shifts s set state = p_state, version = cur + 1, updated_at = now() where s.id = p_shift_id;
  return query select true, cur + 1;
end $$;

create function public.append_events(p_shift_id uuid, p_events jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not public.is_member(p_shift_id) then raise exception 'not_member'; end if;
  if exists (select 1 from public.shifts s where s.id = p_shift_id and s.ended_at is not null) then
    raise exception 'shift_ended';
  end if;
  insert into public.shift_events (shift_id, id, seq, kind, at, recorded_at, device_id, body)
  select p_shift_id, e->>'id', (e->>'seq')::int, e->>'kind', (e->>'at')::bigint, (e->>'recordedAt')::bigint, auth.uid(), e
  from jsonb_array_elements(p_events) e
  on conflict (shift_id, id) do nothing;
  get diagnostics n = row_count;
  return n;
end $$;

create function public.end_shift(p_shift_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_member(p_shift_id) then raise exception 'not_member'; end if;
  update public.shifts s set ended_at = now() where s.id = p_shift_id and s.ended_at is null;
end $$;

create function public.set_enrollment_code(p_code text) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  if not public.is_admin() then raise exception 'not_admin'; end if;
  if length(coalesce(p_code, '')) < 6 then raise exception 'code_too_short'; end if;
  insert into public.enrollment (singleton, code_hash, updated_at) values (true, crypt(p_code, gen_salt('bf')), now())
  on conflict (singleton) do update set code_hash = excluded.code_hash, updated_at = now();
end $$;

revoke all on function public.create_shift, public.join_shift, public.save_state, public.append_events,
  public.end_shift, public.set_enrollment_code, public.is_admin, public.is_member, public.new_shift_code,
  public.forbid_event_change from public, anon;
grant execute on function public.create_shift, public.join_shift, public.save_state, public.append_events,
  public.end_shift, public.set_enrollment_code, public.is_admin, public.is_member to authenticated;
```

- [ ] **Step 3: Apply it**

Supabase MCP `apply_migration` with name `trial_backend` and the file body. Then `list_tables` (schemas `["public"]`, verbose true): expect `shifts`, `shift_members`, `shift_events`, `admins`, `enrollment`, all with RLS enabled.

- [ ] **Step 4: Write the database test script**

`supabase/tests/trial_backend.sql`. It runs in one transaction and ends with `rollback`, so it leaves nothing behind. Two fake users are simulated with `request.jwt.claims`.

```sql
-- © 2026 New York University. All rights reserved.
-- Database checks for the trial backend. Runs inside a transaction and rolls back.
begin;
insert into public.enrollment (singleton, code_hash) values (true, extensions.crypt('test-pass-1', extensions.gen_salt('bf')))
  on conflict (singleton) do update set code_hash = excluded.code_hash;

create temp table t_ids (k text primary key, v uuid);
grant all on t_ids to authenticated;

-- Device A creates a shift.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated","is_anonymous":true}', true);
insert into t_ids select 'shift', id from public.create_shift('test-pass-1', 'abc1234', 'delphi-r1-n19');

do $$
declare sid uuid := (select v from t_ids where k = 'shift'); r record; n int;
begin
  -- Wrong passcode fails.
  begin perform public.create_shift('wrong', 'x', 'y'); raise exception 'FAIL wrong passcode accepted';
  exception when others then if sqlerrm not like '%invalid_enrollment%' then raise; end if; end;
  -- Save at version 1 succeeds, stale version fails.
  select * into r from public.save_state(sid, 1, '{"a":1}'); if not r.ok or r.version <> 2 then raise exception 'FAIL save v1'; end if;
  select * into r from public.save_state(sid, 1, '{"a":2}'); if r.ok or r.version <> 2 then raise exception 'FAIL stale save accepted'; end if;
  -- Events insert once; retry is ignored.
  n := public.append_events(sid, '[{"id":"ev-1","seq":1,"kind":"shift_start","at":1,"recordedAt":1}]');
  if n <> 1 then raise exception 'FAIL first insert %', n; end if;
  n := public.append_events(sid, '[{"id":"ev-1","seq":1,"kind":"shift_start","at":1,"recordedAt":1}]');
  if n <> 0 then raise exception 'FAIL duplicate inserted'; end if;
  -- Update and delete fail.
  begin update public.shift_events set kind = 'x' where shift_id = sid; raise exception 'FAIL update allowed';
  exception when others then if sqlerrm like 'FAIL%' then raise; end if; end;
  begin delete from public.shift_events where shift_id = sid; raise exception 'FAIL delete allowed';
  exception when others then if sqlerrm like 'FAIL%' then raise; end if; end;
end $$;

-- Device B cannot see or write A's shift.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated","is_anonymous":true}', true);
do $$
declare sid uuid := (select v from t_ids where k = 'shift');
begin
  if exists (select 1 from public.shifts where id = sid) then raise exception 'FAIL B reads A shift'; end if;
  if exists (select 1 from public.shift_events where shift_id = sid) then raise exception 'FAIL B reads A events'; end if;
  begin perform public.save_state(sid, 2, '{}'); raise exception 'FAIL B saved';
  exception when others then if sqlerrm like 'FAIL%' then raise; end if; end;
  begin perform public.append_events(sid, '[]'); raise exception 'FAIL B appended';
  exception when others then if sqlerrm like 'FAIL%' then raise; end if; end;
  begin perform public.set_enrollment_code('newcode1'); raise exception 'FAIL non-admin set code';
  exception when others then if sqlerrm like 'FAIL%' then raise; end if; end;
end $$;

-- A ends the shift; saves and events then fail.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated","is_anonymous":true}', true);
do $$
declare sid uuid := (select v from t_ids where k = 'shift');
begin
  perform public.end_shift(sid);
  begin perform public.save_state(sid, 2, '{}'); raise exception 'FAIL save after end';
  exception when others then if sqlerrm like 'FAIL%' then raise; end if; end;
  begin perform public.append_events(sid, '[{"id":"ev-2","seq":2,"kind":"x","at":1,"recordedAt":1}]'); raise exception 'FAIL event after end';
  exception when others then if sqlerrm like 'FAIL%' then raise; end if; end;
end $$;

-- An anonymous user listed in admins is still not an admin.
reset role;
insert into public.admins values ('00000000-0000-0000-0000-00000000000b');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated","is_anonymous":true}', true);
do $$ begin if public.is_admin() then raise exception 'FAIL anonymous admin'; end if; end $$;
-- A real admin reads across shifts.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated","is_anonymous":false}', true);
do $$ begin
  if not public.is_admin() then raise exception 'FAIL real admin'; end if;
  if not exists (select 1 from public.shifts where id = (select v from t_ids where k = 'shift')) then raise exception 'FAIL admin read'; end if;
end $$;

select 'ALL PASS' as result;
rollback;
```

- [ ] **Step 5: Run it**

Supabase MCP `execute_sql` with the file body. Expected: `ALL PASS`. Any `FAIL …` error means a policy or function is wrong: fix the migration with a new migration file (never edit an applied one), re-apply, rerun.

- [ ] **Step 6: Advisors and auth settings**

Supabase MCP `get_advisors` for `security` and `performance`. Fix anything flagged with a follow-up migration. Then ask Julian to do three things in the dashboard (the tools cannot set them):
1. Authentication > Sign In / Providers: turn on **Allow anonymous sign-ins**.
2. Authentication > URL Configuration: Site URL `https://jwatson7399.github.io/capacity-conscious-triage/`; Redirect URLs add `https://jwatson7399.github.io/capacity-conscious-triage/**` and `http://localhost:5173/**`.
3. Optional: Attack Protection > enable CAPTCHA later if drive-by sign-ups appear.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/20260929120000_trial_backend.sql supabase/tests/trial_backend.sql
git commit -m "Trial backend schema: shifts, append-only events, RLS, passcode"
```

---

### Task 2: Build values, `RESTORE` action and serialization

**Files:**
- Modify: `src/constants.ts` (next to `CAPACITY_WEIGHTS`, line 4)
- Modify: `vite.config.ts`
- Create: `src/globals.d.ts`
- Modify: `src/context/session.ts` (`SessionOnlyAction` union and the reducer switch)
- Create: `src/backend/serialize.ts`
- Test: `src/backend/serialize.test.ts`

**Interfaces:**
- Produces:
  - `WEIGHTS_ID: string` from `src/constants.ts`
  - global `__APP_COMMIT__: string`
  - session action `{ type: 'RESTORE'; session: SessionState }`: replaces the whole session, clears `undoable` and `demoRewind`, logs nothing
  - `interface SavedSession { v: 1; shift: ShiftState; activity: ActivityEvent[]; seq: number }`
  - `toSaved(s: SessionState): SavedSession`
  - `fromSaved(saved: SavedSession, now: number): SessionState`
  - `stateKey(saved: SavedSession): string` (JSON with `shift.now` zeroed; equal keys mean nothing worth saving changed)

- [ ] **Step 1: Write the failing tests**

```ts
// © 2026 New York University. All rights reserved.
import { describe, expect, it } from 'vitest';
import type { Provider, ShiftState } from '../types';
import { initialState, scoringFor, shiftReducer } from '../context/ShiftContext';
import { emptySession, makeSessionReducer, type SessionState } from '../context/session';
import { fromSaved, stateKey, toSaved } from './serialize';

const reducer = makeSessionReducer(shiftReducer, scoringFor);
const prov = (id: string, teamId: 1 | 2 | 3 | 4): Provider =>
  ({ id, name: id, type: 'attending', status: 'active', statusExpiresAt: null, teamId });

function placed(): SessionState {
  let s = emptySession({ ...initialState, now: 1_000_000 });
  s = reducer(s, { type: 'START_SHIFT', providers: [prov('a', 1), prov('b', 2), prov('c', 3), prov('t', 4)] });
  return reducer(s, { type: 'ASSIGN_PATIENT', tier: 'tier_one', teamId: 1, source: 'critical' });
}

describe('serialize', () => {
  it('round-trips shift, activity and seq through JSON', () => {
    const s = placed();
    const back = fromSaved(JSON.parse(JSON.stringify(toSaved(s))), 5_000_000);
    expect(back.shift.patients).toEqual(s.shift.patients);
    expect(back.activity).toEqual(s.activity);
    expect(back.seq).toBe(s.seq);
    expect(back.shift.now).toBe(5_000_000);
    expect(back.undoable).toBeNull();
  });

  it('drops undo, demo rewind, simulation and the imported schedule', () => {
    const s: SessionState = { ...placed(), demoRewind: [] };
    const shift = { ...s.shift, simulation: {} as ShiftState['simulation'], scheduleData: {} as ShiftState['scheduleData'] };
    const saved = toSaved({ ...s, shift });
    expect('undoable' in saved).toBe(false);
    expect('demoRewind' in saved).toBe(false);
    expect(saved.shift.simulation).toBeUndefined();
    expect(saved.shift.scheduleData).toBeUndefined();
  });

  it('stateKey ignores the clock only', () => {
    const s = placed();
    const later = { ...s, shift: { ...s.shift, now: s.shift.now + 1000 } };
    expect(stateKey(toSaved(later))).toBe(stateKey(toSaved(s)));
    const moved = reducer(s, { type: 'ASSIGN_PATIENT', tier: 'tier_two', teamId: 2, source: 'critical' });
    expect(stateKey(toSaved(moved))).not.toBe(stateKey(toSaved(s)));
  });

  it('RESTORE brings back the log without a new shift_start', () => {
    const s = placed();
    const restored = reducer(emptySession(initialState), { type: 'RESTORE', session: fromSaved(toSaved(s), 2_000_000) });
    expect(restored.activity.map(e => e.kind)).toEqual(s.activity.map(e => e.kind));
    const next = reducer(restored, { type: 'ASSIGN_PATIENT', tier: 'tier_three', teamId: 3, source: 'critical' });
    expect(next.activity.at(-1)!.seq).toBe(s.seq + 1);
  });
});
```

- [ ] **Step 2: Run to confirm failure**

Run: `npx vitest run src/backend/serialize.test.ts`
Expected: FAIL, cannot resolve `./serialize`.

- [ ] **Step 3: Implement**

`src/constants.ts`, directly after the `CAPACITY_WEIGHTS` block:

```ts
/** Label stored on every trial shift record. Names the weights above; changes nothing in scoring. */
export const WEIGHTS_ID = 'delphi-r1-n19';
```

`vite.config.ts`:

```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { execSync } from 'node:child_process'

function commit(): string {
  try { return execSync('git rev-parse --short HEAD').toString().trim(); } catch { return 'unknown'; }
}

export default defineConfig({
  base: '/capacity-conscious-triage/',
  plugins: [react(), tailwindcss()],
  define: { __APP_COMMIT__: JSON.stringify(commit()) },
})
```

`src/globals.d.ts`:

```ts
// © 2026 New York University. All rights reserved.
/** Short git SHA of the build (vite.config.ts). */
declare const __APP_COMMIT__: string;
```

`src/context/session.ts`: add to `SessionOnlyAction`:

```ts
  /** Resume a saved live shift (src/backend): the whole session, log included. Logs nothing. */
  | { type: 'RESTORE'; session: SessionState }
```

and in the reducer switch, before `case 'HYDRATE'`:

```ts
      case 'RESTORE':
        return { ...action.session, undoable: null, demoRewind: undefined };
```

`src/backend/serialize.ts`:

```ts
// © 2026 New York University. All rights reserved.
//
// The saved form of a live shift (shifts.state). Keeps what the board and the activity log
// need to come back after a reload; drops device-only state and the imported workbook.
import type { ShiftState } from '../types';
import type { ActivityEvent } from '../activity';
import type { SessionState } from '../context/session';

export interface SavedSession {
  v: 1;
  shift: ShiftState;
  activity: ActivityEvent[];
  seq: number;
}

export function toSaved(s: SessionState): SavedSession {
  const { simulation: _sim, scheduleData: _sched, ...shift } = s.shift;
  return { v: 1, shift: shift as ShiftState, activity: s.activity, seq: s.seq };
}

export function fromSaved(saved: SavedSession, now: number): SessionState {
  return { shift: { ...saved.shift, now }, activity: saved.activity, seq: saved.seq, undoable: null };
}

/** Equal keys mean nothing worth saving changed (the clock is ignored). */
export function stateKey(saved: SavedSession): string {
  return JSON.stringify({ ...saved, shift: { ...saved.shift, now: 0 } });
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/backend/serialize.test.ts` then `npx vitest run src scripts` and `npx tsc -b`
Expected: all PASS; no type errors.

- [ ] **Step 5: Commit**

```bash
git add src/constants.ts vite.config.ts src/globals.d.ts src/context/session.ts src/backend/serialize.ts src/backend/serialize.test.ts
git commit -m "Backend prep: WEIGHTS_ID, build commit, RESTORE action, saved session format"
```

---

### Task 3: API, clients and outbox

**Files:**
- Modify: `package.json` (via `npm install @supabase/supabase-js`)
- Create: `src/backend/api.ts`, `src/backend/client.ts`, `src/backend/outbox.ts`, `src/backend/testing.ts`
- Test: `src/backend/outbox.test.ts`, `src/backend/client.test.ts`

**Interfaces:**
- Consumes: `SavedSession` (Task 2), `ActivityEvent` (`src/activity.ts`).
- Produces:

```ts
// api.ts
export class BackendError extends Error { constructor(public code: 'invalid_enrollment' | 'network' | 'conflict' | 'server', message?: string) }
export interface BackendApi {
  ensureSignedIn(): Promise<void>;
  createShift(enrollCode: string, appCommit: string, weightsId: string): Promise<{ id: string; code: string }>;
  loadShift(id: string): Promise<{ state: SavedSession | null; version: number; code: string; ended: boolean }>;
  saveState(id: string, expectedVersion: number, state: SavedSession): Promise<{ ok: boolean; version: number }>;
  appendEvents(id: string, events: ActivityEvent[]): Promise<void>;
  endShift(id: string): Promise<void>;
}
export function supabaseApi(client: SupabaseClient): BackendApi;

// client.ts
export const backendEnabled: boolean;
export function triageClient(): SupabaseClient | null;   // storageKey 'cct-device', detectSessionInUrl false
export function adminClient(): SupabaseClient | null;    // storageKey 'cct-admin', flowType 'pkce', detectSessionInUrl true

// outbox.ts
export interface KV { getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem(k: string): void }
export type OutboxItem =
  | { t: 'events'; shiftId: string; events: ActivityEvent[] }
  | { t: 'save'; shiftId: string; state: SavedSession }
  | { t: 'end'; shiftId: string };
export class Outbox {
  constructor(api: BackendApi, kv: KV, onChange?: () => void);
  setVersion(shiftId: string, version: number): void;
  push(item: OutboxItem): void;          // a 'save' replaces any waiting save for that shift (moved to the end)
  flush(): Promise<boolean>;             // one pass in order; true when empty; stops at first failure
  pending(): number;
  lastError(): string | null;
  conflict(shiftId: string): boolean;
  lastSaved(shiftId: string): SavedSession | null;   // newest state pushed, kept locally for offline resume
  forget(shiftId: string): void;          // drop local copy and version after a clean end
}
export function backoffMs(failures: number): number;  // 1000 doubling, max 60000

// testing.ts
export class MemoryKV implements KV {}
export class FakeApi implements BackendApi { online: boolean; passcode: string; shifts: Map<...>; events: Map<string, ActivityEvent[]>; calls: string[] }
```

- [ ] **Step 1: Install the client**

Run: `npm install @supabase/supabase-js@^2`
Expected: added to `dependencies`.

- [ ] **Step 2: Write `testing.ts` (fake used by this and later tasks)**

```ts
// © 2026 New York University. All rights reserved.
// Test doubles for the backend. Not imported by app code.
import type { ActivityEvent } from '../activity';
import { BackendError, type BackendApi } from './api';
import type { KV } from './outbox';
import type { SavedSession } from './serialize';

export class MemoryKV implements KV {
  m = new Map<string, string>();
  getItem(k: string) { return this.m.get(k) ?? null; }
  setItem(k: string, v: string) { this.m.set(k, v); }
  removeItem(k: string) { this.m.delete(k); }
}

export class FakeApi implements BackendApi {
  online = true;
  passcode = 'pass-1234';
  shifts = new Map<string, { code: string; state: SavedSession | null; version: number; ended: boolean }>();
  events = new Map<string, ActivityEvent[]>();
  calls: string[] = [];
  private n = 0;
  private net(name: string) { this.calls.push(name); if (!this.online) throw new BackendError('network', 'offline'); }
  async ensureSignedIn() { this.net('signIn'); }
  async createShift(code: string) {
    this.net('create');
    if (code !== this.passcode) throw new BackendError('invalid_enrollment');
    const id = `s${++this.n}`;
    this.shifts.set(id, { code: `CODE${this.n}`, state: null, version: 1, ended: false });
    this.events.set(id, []);
    return { id, code: `CODE${this.n}` };
  }
  async loadShift(id: string) {
    this.net('load');
    const s = this.shifts.get(id)!;
    return { state: s.state, version: s.version, code: s.code, ended: s.ended };
  }
  async saveState(id: string, expected: number, state: SavedSession) {
    this.net('save');
    const s = this.shifts.get(id)!;
    if (s.ended) throw new BackendError('server', 'shift_ended');
    if (s.version !== expected) return { ok: false, version: s.version };
    s.state = state; s.version += 1;
    return { ok: true, version: s.version };
  }
  async appendEvents(id: string, evs: ActivityEvent[]) {
    this.net('events');
    const list = this.events.get(id)!;
    for (const e of evs) if (!list.some(x => x.id === e.id)) list.push(e);
  }
  async endShift(id: string) { this.net('end'); this.shifts.get(id)!.ended = true; }
}
```

- [ ] **Step 3: Write the failing outbox tests**

```ts
// © 2026 New York University. All rights reserved.
import { describe, expect, it } from 'vitest';
import type { ActivityEvent } from '../activity';
import { Outbox, backoffMs } from './outbox';
import { FakeApi, MemoryKV } from './testing';
import type { SavedSession } from './serialize';

const ev = (id: string, seq: number) => ({ id, seq, kind: 'team_close', teamId: 1, at: seq, recordedAt: seq }) as ActivityEvent;
const st = (tag: number) => ({ v: 1, shift: { tag }, activity: [], seq: tag }) as unknown as SavedSession;

async function setup() {
  const api = new FakeApi(); const kv = new MemoryKV();
  const { id } = await api.createShift('pass-1234');
  const box = new Outbox(api, kv); box.setVersion(id, 1);
  return { api, kv, box, id };
}

describe('Outbox', () => {
  it('uploads events in order and saves with the version', async () => {
    const { api, box, id } = await setup();
    box.push({ t: 'events', shiftId: id, events: [ev('e1', 1)] });
    box.push({ t: 'save', shiftId: id, state: st(1) });
    box.push({ t: 'events', shiftId: id, events: [ev('e2', 2)] });
    expect(await box.flush()).toBe(true);
    expect(api.events.get(id)!.map(e => e.id)).toEqual(['e1', 'e2']);
    expect(api.shifts.get(id)!.version).toBe(2);
    expect(box.pending()).toBe(0);
  });

  it('keeps everything while offline, coalesces saves, never duplicates events', async () => {
    const { api, box, id } = await setup();
    api.online = false;
    box.push({ t: 'events', shiftId: id, events: [ev('e1', 1)] });
    box.push({ t: 'save', shiftId: id, state: st(1) });
    box.push({ t: 'events', shiftId: id, events: [ev('e2', 2)] });
    box.push({ t: 'save', shiftId: id, state: st(2) });
    expect(await box.flush()).toBe(false);
    expect(box.pending()).toBe(3);
    expect(box.lastError()).toMatch(/offline/);
    api.online = true;
    expect(await box.flush()).toBe(true);
    expect(api.events.get(id)!.map(e => e.id)).toEqual(['e1', 'e2']);
    expect((api.shifts.get(id)!.state as unknown as { seq: number }).seq).toBe(2);
    expect(api.calls.filter(c => c === 'save').length).toBe(1); // the older save never went out
  });

  it('survives a reload: queue and versions live in storage', async () => {
    const { api, kv, box, id } = await setup();
    api.online = false;
    box.push({ t: 'events', shiftId: id, events: [ev('e1', 1)] });
    box.push({ t: 'save', shiftId: id, state: st(1) });
    await box.flush();
    const again = new Outbox(api, kv);
    expect(again.pending()).toBe(2);
    expect(again.lastSaved(id)).toEqual(st(1));
    api.online = true;
    expect(await again.flush()).toBe(true);
    expect(api.shifts.get(id)!.version).toBe(2);
  });

  it('a version conflict stops saves for that shift but events still upload', async () => {
    const { api, box, id } = await setup();
    api.shifts.get(id)!.version = 7; // another writer moved it on
    box.push({ t: 'save', shiftId: id, state: st(1) });
    box.push({ t: 'events', shiftId: id, events: [ev('e1', 1)] });
    await box.flush();
    expect(box.conflict(id)).toBe(true);
    expect(api.shifts.get(id)!.state).toBeNull();
    expect(api.events.get(id)!.length).toBe(1);
    box.push({ t: 'save', shiftId: id, state: st(2) });
    await box.flush();
    expect(api.shifts.get(id)!.state).toBeNull();
  });

  it('end goes after the last save and event', async () => {
    const { api, box, id } = await setup();
    box.push({ t: 'events', shiftId: id, events: [ev('e1', 1)] });
    box.push({ t: 'save', shiftId: id, state: st(1) });
    box.push({ t: 'end', shiftId: id });
    await box.flush();
    expect(api.calls.slice(-3)).toEqual(['events', 'save', 'end']);
    expect(api.shifts.get(id)!.ended).toBe(true);
  });

  it('backoff doubles to a minute', () => {
    expect([0, 1, 2, 6, 7, 20].map(backoffMs)).toEqual([1000, 2000, 4000, 60000, 60000, 60000]);
  });
});
```

- [ ] **Step 4: Run to confirm failure**

Run: `npx vitest run src/backend/outbox.test.ts`
Expected: FAIL, cannot resolve `./outbox` / `./api`.

- [ ] **Step 5: Implement `api.ts`**

```ts
// © 2026 New York University. All rights reserved.
//
// The only code that talks to Supabase for a live shift. Everything else uses BackendApi,
// so tests run against FakeApi (testing.ts).
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ActivityEvent } from '../activity';
import type { SavedSession } from './serialize';

export type BackendErrorCode = 'invalid_enrollment' | 'network' | 'conflict' | 'server';

export class BackendError extends Error {
  code: BackendErrorCode;
  constructor(code: BackendErrorCode, message?: string) {
    super(message ?? code);
    this.code = code;
  }
}

export interface BackendApi {
  ensureSignedIn(): Promise<void>;
  createShift(enrollCode: string, appCommit: string, weightsId: string): Promise<{ id: string; code: string }>;
  loadShift(id: string): Promise<{ state: SavedSession | null; version: number; code: string; ended: boolean }>;
  saveState(id: string, expectedVersion: number, state: SavedSession): Promise<{ ok: boolean; version: number }>;
  appendEvents(id: string, events: ActivityEvent[]): Promise<void>;
  endShift(id: string): Promise<void>;
}

function fail(error: { message?: string; code?: string } | null): never {
  const msg = error?.message ?? 'unknown';
  if (msg.includes('invalid_enrollment')) throw new BackendError('invalid_enrollment', msg);
  if (/fetch|network|Failed to fetch|NetworkError/i.test(msg)) throw new BackendError('network', msg);
  throw new BackendError('server', msg);
}

async function call<T>(p: PromiseLike<{ data: T; error: { message?: string } | null }>): Promise<T> {
  let r;
  try { r = await p; } catch (e) { throw new BackendError('network', String(e)); }
  if (r.error) fail(r.error);
  return r.data;
}

export function supabaseApi(sb: SupabaseClient): BackendApi {
  return {
    async ensureSignedIn() {
      const { data } = await sb.auth.getSession();
      if (data.session) return;
      await call(sb.auth.signInAnonymously() as unknown as PromiseLike<{ data: unknown; error: { message?: string } | null }>);
    },
    async createShift(enrollCode, appCommit, weightsId) {
      const rows = await call(sb.rpc('create_shift', { p_enroll_code: enrollCode, p_app_commit: appCommit, p_weights_id: weightsId }));
      const row = (rows as { id: string; code: string }[])[0];
      return { id: row.id, code: row.code };
    },
    async loadShift(id) {
      const row = await call(sb.from('shifts').select('state, version, code, ended_at').eq('id', id).single());
      const r = row as { state: SavedSession | Record<string, never>; version: number; code: string; ended_at: string | null };
      return { state: 'v' in r.state ? (r.state as SavedSession) : null, version: r.version, code: r.code, ended: r.ended_at !== null };
    },
    async saveState(id, expectedVersion, state) {
      const rows = await call(sb.rpc('save_state', { p_shift_id: id, p_expected_version: expectedVersion, p_state: state }));
      const row = (rows as { ok: boolean; version: number }[])[0];
      return { ok: row.ok, version: row.version };
    },
    async appendEvents(id, events) {
      await call(sb.rpc('append_events', { p_shift_id: id, p_events: events }));
    },
    async endShift(id) {
      await call(sb.rpc('end_shift', { p_shift_id: id }));
    },
  };
}
```

- [ ] **Step 6: Implement `outbox.ts`**

```ts
// © 2026 New York University. All rights reserved.
//
// Ordered upload queue for the live shift record, kept in localStorage so nothing is lost on
// reload or while offline. Events are uploaded in order and never dropped; waiting state saves
// collapse to the newest one. A version conflict stops saves for that shift (never overwrite).
import type { ActivityEvent } from '../activity';
import type { BackendApi } from './api';
import type { SavedSession } from './serialize';

export interface KV { getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem(k: string): void }

export type OutboxItem =
  | { t: 'events'; shiftId: string; events: ActivityEvent[] }
  | { t: 'save'; shiftId: string; state: SavedSession }
  | { t: 'end'; shiftId: string };

interface Stored {
  items: OutboxItem[];
  versions: Record<string, number>;
  conflicts: string[];
  last: Record<string, SavedSession>;
}

const KEY = 'cct.outbox.v1';

export function backoffMs(failures: number): number {
  return Math.min(60_000, 1000 * 2 ** Math.max(0, failures));
}

export class Outbox {
  private s: Stored;
  private err: string | null = null;
  private busy = false;
  private api: BackendApi;
  private kv: KV;
  private onChange: () => void;

  constructor(api: BackendApi, kv: KV, onChange: () => void = () => {}) {
    this.api = api; this.kv = kv; this.onChange = onChange;
    let parsed: Stored | null = null;
    try { parsed = JSON.parse(kv.getItem(KEY) ?? 'null'); } catch { parsed = null; }
    this.s = parsed ?? { items: [], versions: {}, conflicts: [], last: {} };
  }

  private persist() { this.kv.setItem(KEY, JSON.stringify(this.s)); this.onChange(); }

  setVersion(shiftId: string, version: number) { this.s.versions[shiftId] = version; this.persist(); }
  pending() { return this.s.items.length; }
  lastError() { return this.err; }
  conflict(shiftId: string) { return this.s.conflicts.includes(shiftId); }
  lastSaved(shiftId: string) { return this.s.last[shiftId] ?? null; }

  push(item: OutboxItem) {
    if (item.t === 'save') {
      this.s.last[item.shiftId] = item.state;
      if (this.conflict(item.shiftId)) { this.persist(); return; }
      this.s.items = this.s.items.filter(i => !(i.t === 'save' && i.shiftId === item.shiftId));
    }
    this.s.items.push(item);
    this.persist();
  }

  forget(shiftId: string) {
    delete this.s.versions[shiftId];
    delete this.s.last[shiftId];
    this.s.conflicts = this.s.conflicts.filter(c => c !== shiftId);
    this.persist();
  }

  async flush(): Promise<boolean> {
    if (this.busy) return false;
    this.busy = true;
    try {
      while (this.s.items.length) {
        const item = this.s.items[0];
        try {
          if (item.t === 'events') {
            await this.api.appendEvents(item.shiftId, item.events);
          } else if (item.t === 'save') {
            const r = await this.api.saveState(item.shiftId, this.s.versions[item.shiftId] ?? 1, item.state);
            if (r.ok) this.s.versions[item.shiftId] = r.version;
            else if (!this.s.conflicts.includes(item.shiftId)) this.s.conflicts.push(item.shiftId);
          } else {
            await this.api.endShift(item.shiftId);
          }
        } catch (e) {
          this.err = e instanceof Error ? e.message : String(e);
          this.persist();
          return false;
        }
        this.s.items.shift();
        this.err = null;
        this.persist();
      }
      return true;
    } finally {
      this.busy = false;
    }
  }
}
```

- [ ] **Step 7: Implement `client.ts` and its test**

```ts
// © 2026 New York University. All rights reserved.
//
// Supabase clients. The triage device and the lab admin use separate auth storage, so an admin
// sign-in on the triage device never replaces the device's anonymous session (which would drop
// it from its live shift). Backend is off when either env value is missing.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const backendEnabled = Boolean(URL && KEY);

export const TRIAGE_AUTH = { storageKey: 'cct-device', detectSessionInUrl: false, persistSession: true, autoRefreshToken: true } as const;
export const ADMIN_AUTH = { storageKey: 'cct-admin', detectSessionInUrl: true, flowType: 'pkce', persistSession: true, autoRefreshToken: true } as const;

let triage: SupabaseClient | null = null;
let admin: SupabaseClient | null = null;

export function triageClient(): SupabaseClient | null {
  if (!backendEnabled) return null;
  return (triage ??= createClient(URL!, KEY!, { auth: TRIAGE_AUTH }));
}

export function adminClient(): SupabaseClient | null {
  if (!backendEnabled) return null;
  return (admin ??= createClient(URL!, KEY!, { auth: ADMIN_AUTH }));
}
```

`src/backend/client.test.ts`:

```ts
// © 2026 New York University. All rights reserved.
import { describe, expect, it } from 'vitest';
import { ADMIN_AUTH, TRIAGE_AUTH, backendEnabled, triageClient } from './client';

describe('backend clients', () => {
  it('is off in tests (no env values)', () => {
    expect(backendEnabled).toBe(false);
    expect(triageClient()).toBeNull();
  });
  it('admin and triage never share auth storage; triage ignores magic-link URLs', () => {
    expect(ADMIN_AUTH.storageKey).not.toBe(TRIAGE_AUTH.storageKey);
    expect(TRIAGE_AUTH.detectSessionInUrl).toBe(false);
  });
});
```

If `.env` with Supabase values exists locally, `backendEnabled` would be true in tests; guard by adding to the top of `vite.config.ts`'s export a `test: { env: { VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '' } }` block:

```ts
  test: { env: { VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '' } },
```

(add `/// <reference types="vitest/config" />` as the first line of `vite.config.ts` so the `test` key type-checks).

- [ ] **Step 8: Run tests**

Run: `npx vitest run src/backend` then `npx vitest run src scripts`, `npx tsc -b`, `npx eslint src`
Expected: all PASS, no errors.

- [ ] **Step 9: Commit**

```bash
git add package.json package-lock.json vite.config.ts src/backend/api.ts src/backend/client.ts src/backend/client.test.ts src/backend/outbox.ts src/backend/outbox.test.ts src/backend/testing.ts
git commit -m "Backend API, separate device/admin clients, persistent outbox"
```

---

### Task 4: SyncController and ShiftProvider wiring

**Files:**
- Create: `src/backend/controller.ts`, `src/backend/SyncContext.tsx`
- Modify: `src/context/ShiftContext.tsx:990-1011` (`ShiftProvider`)
- Test: `src/backend/controller.test.ts`

**Interfaces:**
- Consumes: `BackendApi`, `BackendError` (Task 3); `Outbox`, `KV` (Task 3); `toSaved`, `fromSaved`, `stateKey` (Task 2); `WEIGHTS_ID`, `__APP_COMMIT__` (Task 2); `SessionState`, `SessionAction` (`session.ts`).
- Produces:

```ts
// controller.ts
export type SyncStatus = { kind: 'off' } | { kind: 'idle' } | { kind: 'synced'; code: string }
  | { kind: 'saving'; code: string; pending: number } | { kind: 'offline'; code: string; pending: number }
  | { kind: 'conflict'; code: string } | { kind: 'unsaved' };   // 'unsaved' = started without a record
export type BeginResult = { ok: true } | { ok: false; reason: 'passcode' | 'network' | 'server'; message: string };
export class SyncController {
  constructor(opts: { api: BackendApi | null; kv: KV; now?: () => number; setTimer?: (fn: () => void, ms: number) => unknown; clearTimer?: (h: unknown) => void; onStatus?: (s: SyncStatus) => void });
  status(): SyncStatus;
  enrollCode(): string | null;                      // remembered passcode (kv 'cct.enroll')
  begin(passcode: string): Promise<BeginResult>;    // create_shift; remembers passcode on success; forgets it on 'passcode'
  startUnsaved(): void;                             // explicit start without a record
  restore(): Promise<SessionState | null>;          // server copy, else local copy; null if none or ended
  observe(s: SessionState): void;                   // queue new events now; queue save 1 s after last change
  end(): Promise<void>;                             // deactivate first, queue final save + end, flush, forget
}
// SyncContext.tsx
export function useSync(): SyncController | null;   // null in demo/tour and when backend is off
export function SyncBridge(props: { session: SessionState; dispatch: (a: SessionAction) => void; controller: SyncController }): null;
export function liveController(): SyncController;   // singleton for the live shift
// ShiftContext.tsx
export function ShiftProvider(props: { children: ReactNode; persist?: boolean }): JSX.Element;
```

Local keys: `cct.enroll` (passcode), `cct.live` (`{ id, code }` of the open shift).

- [ ] **Step 1: Write the failing controller tests**

```ts
// © 2026 New York University. All rights reserved.
import { describe, expect, it } from 'vitest';
import type { Provider } from '../types';
import { initialState, scoringFor, shiftReducer } from '../context/ShiftContext';
import { emptySession, makeSessionReducer, type SessionState } from '../context/session';
import { SyncController } from './controller';
import { FakeApi, MemoryKV } from './testing';

const reducer = makeSessionReducer(shiftReducer, scoringFor);
const prov = (id: string, teamId: 1 | 2 | 3 | 4): Provider =>
  ({ id, name: id, type: 'attending', status: 'active', statusExpiresAt: null, teamId });

function harness() {
  const api = new FakeApi(); const kv = new MemoryKV();
  const timers: (() => void)[] = [];
  const make = () => new SyncController({ api, kv, now: () => 9_000_000,
    setTimer: fn => { timers.push(fn); return timers.length; }, clearTimer: () => {} });
  const runTimers = async () => { while (timers.length) timers.shift()!(); await new Promise(r => setTimeout(r, 0)); };
  return { api, kv, make, runTimers };
}

function started(): SessionState {
  const s = emptySession({ ...initialState, now: 1_000_000 });
  return reducer(s, { type: 'START_SHIFT', providers: [prov('a', 1), prov('b', 2), prov('c', 3), prov('t', 4)] });
}

describe('SyncController', () => {
  it('wrong passcode does not start and forgets the stored code', async () => {
    const h = harness(); const c = h.make();
    h.kv.setItem('cct.enroll', 'old');
    expect(await c.begin('nope')).toEqual({ ok: false, reason: 'passcode', message: expect.any(String) });
    expect(c.enrollCode()).toBeNull();
    expect(c.status().kind).toBe('idle');
  });

  it('offline at start reports network and starts nothing', async () => {
    const h = harness(); const c = h.make(); h.api.online = false;
    expect((await c.begin('pass-1234') as { reason: string }).reason).toBe('network');
    expect(h.kv.getItem('cct.live')).toBeNull();
  });

  it('uploads each event once and saves only when something besides the clock changed', async () => {
    const h = harness(); const c = h.make();
    await c.begin('pass-1234');
    let s = started(); c.observe(s);
    s = reducer(s, { type: 'ASSIGN_PATIENT', tier: 'tier_one', teamId: 1, source: 'critical' }); c.observe(s);
    s = reducer(s, { type: 'TICK' }); c.observe(s);
    await h.runTimers();
    const id = [...h.api.shifts.keys()][0];
    expect(h.api.events.get(id)!.map(e => e.kind)).toEqual(['shift_start', 'assign']);
    const saves = h.api.calls.filter(x => x === 'save').length;
    c.observe({ ...s, shift: { ...s.shift, now: s.shift.now + 5000 } });
    await h.runTimers();
    expect(h.api.calls.filter(x => x === 'save').length).toBe(saves);
    expect(c.status()).toEqual({ kind: 'synced', code: 'CODE1' });
  });

  it('reload restores the log from the server; a new controller continues the same shift', async () => {
    const h = harness(); const c = h.make();
    await c.begin('pass-1234');
    let s = started(); s = reducer(s, { type: 'ASSIGN_PATIENT', tier: 'tier_one', teamId: 1, source: 'critical' });
    c.observe(s); await h.runTimers();
    const c2 = h.make();
    const back = await c2.restore();
    expect(back!.activity.map(e => e.id)).toEqual(s.activity.map(e => e.id));
    expect(back!.shift.now).toBe(9_000_000);
    const next = reducer(reducer(emptySession(initialState), { type: 'RESTORE', session: back! }), { type: 'ASSIGN_PATIENT', tier: 'tier_two', teamId: 2, source: 'critical' });
    c2.observe(back!); c2.observe(next); await h.runTimers();
    const id = [...h.api.shifts.keys()][0];
    expect(h.api.events.get(id)!.map(e => e.seq)).toEqual([1, 2, 3]);
  });

  it('reload while offline restores from the local copy', async () => {
    const h = harness(); const c = h.make();
    await c.begin('pass-1234');
    const s = started(); c.observe(s); await h.runTimers();
    h.api.online = false;
    const back = await h.make().restore();
    expect(back!.activity.length).toBe(s.activity.length);
  });

  it('end: nothing after it is saved, even the RESET that follows', async () => {
    const h = harness(); const c = h.make();
    await c.begin('pass-1234');
    const s = started(); c.observe(s);
    await c.end();
    c.observe(emptySession(initialState));
    await h.runTimers();
    const id = [...h.api.shifts.keys()][0];
    const saved = h.api.shifts.get(id)!;
    expect(saved.ended).toBe(true);
    expect(saved.state!.activity.length).toBe(1);
    expect(h.kv.getItem('cct.live')).toBeNull();
    expect(await h.make().restore()).toBeNull();
  });

  it('ended on the server: restore returns null and clears the local shift', async () => {
    const h = harness(); const c = h.make();
    await c.begin('pass-1234'); c.observe(started()); await h.runTimers();
    h.api.shifts.forEach(x => { x.ended = true; });
    expect(await h.make().restore()).toBeNull();
    expect(h.kv.getItem('cct.live')).toBeNull();
  });

  it('offline mid-shift shows the unsaved count, then recovers', async () => {
    const h = harness(); const c = h.make();
    await c.begin('pass-1234');
    h.api.online = false;
    c.observe(started()); await h.runTimers();
    expect(c.status().kind).toBe('offline');
    h.api.online = true;
    await h.runTimers();
    expect(c.status().kind).toBe('synced');
  });

  it('no api (backend off) is inert', async () => {
    const c = new SyncController({ api: null, kv: new MemoryKV() });
    expect(c.status().kind).toBe('off');
    c.observe(started());
    expect(await c.restore()).toBeNull();
  });
});
```

- [ ] **Step 2: Run to confirm failure**

Run: `npx vitest run src/backend/controller.test.ts`
Expected: FAIL, cannot resolve `./controller`.

- [ ] **Step 3: Implement `controller.ts`**

```ts
// © 2026 New York University. All rights reserved.
//
// Keeps the live shift's server record. Watches the session: new activity events are queued at
// once; the saved state is queued 1 s after the last change that is not just the clock. All
// uploads go through the Outbox, so triage never waits on the network.
import type { SessionState } from '../context/session';
import { WEIGHTS_ID } from '../constants';
import { BackendError, type BackendApi } from './api';
import { Outbox, backoffMs, type KV } from './outbox';
import { fromSaved, stateKey, toSaved } from './serialize';

export type SyncStatus =
  | { kind: 'off' } | { kind: 'idle' } | { kind: 'unsaved' }
  | { kind: 'synced'; code: string }
  | { kind: 'saving'; code: string; pending: number }
  | { kind: 'offline'; code: string; pending: number }
  | { kind: 'conflict'; code: string };

export type BeginResult = { ok: true } | { ok: false; reason: 'passcode' | 'network' | 'server'; message: string };

interface Live { id: string; code: string }
const ENROLL = 'cct.enroll';
const LIVE = 'cct.live';
const SAVE_DELAY_MS = 1000;

export class SyncController {
  private api: BackendApi | null;
  private kv: KV;
  private now: () => number;
  private setTimer: (fn: () => void, ms: number) => unknown;
  private clearTimer: (h: unknown) => void;
  private onStatus: (s: SyncStatus) => void;
  private box: Outbox | null;
  private live: Live | null = null;
  private unsaved = false;
  private sentSeq = 0;
  private lastKey = '';
  private saveTimer: unknown = null;
  private retryTimer: unknown = null;
  private failures = 0;
  private pendingSession: SessionState | null = null;

  constructor(opts: {
    api: BackendApi | null; kv: KV; now?: () => number;
    setTimer?: (fn: () => void, ms: number) => unknown; clearTimer?: (h: unknown) => void;
    onStatus?: (s: SyncStatus) => void;
  }) {
    this.api = opts.api; this.kv = opts.kv;
    this.now = opts.now ?? Date.now;
    this.setTimer = opts.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
    this.clearTimer = opts.clearTimer ?? (h => clearTimeout(h as ReturnType<typeof setTimeout>));
    this.onStatus = opts.onStatus ?? (() => {});
    this.box = this.api ? new Outbox(this.api, this.kv, () => this.emit()) : null;
    try { this.live = JSON.parse(this.kv.getItem(LIVE) ?? 'null'); } catch { this.live = null; }
    if (this.box && this.box.pending()) this.kick(0);
  }

  setStatusListener(fn: (s: SyncStatus) => void) { this.onStatus = fn; this.emit(); }

  status(): SyncStatus {
    if (!this.api || !this.box) return { kind: 'off' };
    if (this.unsaved) return { kind: 'unsaved' };
    if (!this.live) return { kind: 'idle' };
    const code = this.live.code;
    if (this.box.conflict(this.live.id)) return { kind: 'conflict', code };
    const pending = this.box.pending();
    if (pending === 0) return { kind: 'synced', code };
    return this.box.lastError() ? { kind: 'offline', code, pending } : { kind: 'saving', code, pending };
  }

  private emit() { this.onStatus(this.status()); }

  enrollCode(): string | null { return this.kv.getItem(ENROLL); }

  async begin(passcode: string): Promise<BeginResult> {
    if (!this.api || !this.box) return { ok: true };
    try {
      await this.api.ensureSignedIn();
      const { id, code } = await this.api.createShift(passcode, __APP_COMMIT__, WEIGHTS_ID);
      this.kv.setItem(ENROLL, passcode);
      this.live = { id, code };
      this.kv.setItem(LIVE, JSON.stringify(this.live));
      this.box.setVersion(id, 1);
      this.unsaved = false; this.sentSeq = 0; this.lastKey = '';
      this.emit();
      return { ok: true };
    } catch (e) {
      const code = e instanceof BackendError ? e.code : 'server';
      if (code === 'invalid_enrollment') {
        this.kv.removeItem(ENROLL);
        return { ok: false, reason: 'passcode', message: 'Passcode not recognized' };
      }
      return { ok: false, reason: code === 'network' ? 'network' : 'server', message: e instanceof Error ? e.message : String(e) };
    }
  }

  startUnsaved() { this.unsaved = true; this.live = null; this.emit(); }

  async restore(): Promise<SessionState | null> {
    if (!this.api || !this.box || !this.live) return null;
    const { id } = this.live;
    let saved = this.box.lastSaved(id);
    try {
      await this.api.ensureSignedIn();
      const r = await this.api.loadShift(id);
      if (r.ended) { this.clearLive(); return null; }
      if (r.state && (!saved || r.state.seq >= saved.seq)) { saved = r.state; this.box.setVersion(id, r.version); }
    } catch { /* offline: use the local copy */ }
    if (!saved) return null;
    const session = fromSaved(saved, this.now());
    this.sentSeq = session.seq;
    this.lastKey = stateKey(saved);
    this.emit();
    return session;
  }

  observe(s: SessionState) {
    if (!this.box || !this.live) return;
    const fresh = s.activity.filter(e => e.seq > this.sentSeq);
    if (fresh.length) {
      this.box.push({ t: 'events', shiftId: this.live.id, events: fresh });
      this.sentSeq = fresh[fresh.length - 1].seq;
      this.kick(0);
    }
    const saved = toSaved(s);
    const key = stateKey(saved);
    if (key === this.lastKey) return;
    this.pendingSession = s;
    if (this.saveTimer) this.clearTimer(this.saveTimer);
    this.saveTimer = this.setTimer(() => this.queueSave(), SAVE_DELAY_MS);
  }

  private queueSave() {
    this.saveTimer = null;
    if (!this.box || !this.live || !this.pendingSession) return;
    const saved = toSaved(this.pendingSession);
    this.pendingSession = null;
    this.lastKey = stateKey(saved);
    this.box.push({ t: 'save', shiftId: this.live.id, state: saved });
    this.kick(0);
  }

  private kick(delay: number) {
    if (!this.box) return;
    if (this.retryTimer) { this.clearTimer(this.retryTimer); this.retryTimer = null; }
    this.retryTimer = this.setTimer(async () => {
      this.retryTimer = null;
      const done = await this.box!.flush();
      this.emit();
      if (done) { this.failures = 0; return; }
      this.kick(backoffMs(this.failures++));
    }, delay);
  }

  async end() {
    if (!this.box) return;
    if (!this.live) { this.unsaved = false; this.emit(); return; }
    const { id } = this.live;
    if (this.saveTimer) { this.clearTimer(this.saveTimer); this.saveTimer = null; }
    if (this.pendingSession) {
      this.box.push({ t: 'save', shiftId: id, state: toSaved(this.pendingSession) });
      this.pendingSession = null;
    }
    this.clearLive();
    this.box.push({ t: 'end', shiftId: id });
    if (await this.box.flush()) this.box.forget(id);
    else this.kick(0);
    this.emit();
  }

  private clearLive() {
    this.live = null;
    this.kv.removeItem(LIVE);
  }
}
```

Note on the "reload restores" test: after `restore()`, `observe(back)` must not re-send events already sent (`sentSeq` is set from the restored `seq`) and must not re-save an unchanged state (`lastKey` set).

- [ ] **Step 4: Run controller tests**

Run: `npx vitest run src/backend/controller.test.ts`
Expected: PASS. If the offline-recovery test flakes on timer order, the harness's `runTimers` must loop until no timers remain (it does); do not add real sleeps.

- [ ] **Step 5: Implement `SyncContext.tsx`**

```tsx
// © 2026 New York University. All rights reserved.
//
// React glue for the live shift's server record. Only the live ShiftProvider (persist) mounts
// a bridge; demo and tour have no controller and cannot write.
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { SessionAction, SessionState } from '../context/session';
import { supabaseApi } from './api';
import { triageClient } from './client';
import { SyncController, type SyncStatus } from './controller';

let live: SyncController | null = null;

export function liveController(): SyncController {
  if (!live) {
    const sb = triageClient();
    live = new SyncController({ api: sb ? supabaseApi(sb) : null, kv: window.localStorage });
  }
  return live;
}

const Ctx = createContext<SyncController | null>(null);

export function SyncProvider({ controller, children }: { controller: SyncController | null; children: ReactNode }) {
  return <Ctx.Provider value={controller}>{children}</Ctx.Provider>;
}

export function useSync(): SyncController | null {
  return useContext(Ctx);
}

export function useSyncStatus(): SyncStatus {
  const c = useSync();
  const [s, set] = useState<SyncStatus>(() => c?.status() ?? { kind: 'off' });
  useEffect(() => { c?.setStatusListener(set); }, [c]);
  return s;
}

/** Restores an open shift once, then reports every session change to the controller. */
export function SyncBridge({ session, dispatch, controller }: {
  session: SessionState; dispatch: (a: SessionAction) => void; controller: SyncController;
}) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let gone = false;
    controller.restore().then(s => {
      if (gone) return;
      if (s) dispatch({ type: 'RESTORE', session: s });
      setReady(true);
    });
    return () => { gone = true; };
  }, [controller, dispatch]);
  useEffect(() => { if (ready) controller.observe(session); }, [ready, session, controller]);
  return null;
}
```

- [ ] **Step 6: Wire `ShiftProvider`**

In `src/context/ShiftContext.tsx`, add imports:

```ts
import { SyncBridge, SyncProvider, liveController } from '../backend/SyncContext';
```

Change the provider signature and return:

```tsx
export function ShiftProvider({ children, persist = false }: { children: ReactNode; persist?: boolean }) {
  const [session, dispatch] = useReducer(sessionReducer, initialSession);
  const controller = persist ? liveController() : null;
  // ...existing body unchanged...
  return (
    <SyncProvider controller={controller}>
      <ShiftContext.Provider value={value}>
        {controller && <SyncBridge session={session} dispatch={dispatch} controller={controller} />}
        {children}
      </ShiftContext.Provider>
    </SyncProvider>
  );
}
```

Update the doc comment above it: "The live shift's provider (persist) keeps a server record through src/backend; demo and tour never do."

- [ ] **Step 7: Run everything**

Run: `npx vitest run src scripts`, `npx tsc -b`, `npx eslint src`
Expected: all PASS (existing session tests unchanged).

- [ ] **Step 8: Commit**

```bash
git add src/backend/controller.ts src/backend/controller.test.ts src/backend/SyncContext.tsx src/context/ShiftContext.tsx
git commit -m "SyncController: live shift record, resume on reload, offline outbox"
```

---

### Task 5: Start with passcode, status, shift code, End shift

**Files:**
- Create: `src/app/PasscodeSheet.tsx`, `src/app/SyncStatus.tsx`
- Modify: `src/app/CarbonApp.tsx` (`CarbonApp`, `start`, `endShift`), `src/app/Board.tsx` (header after `<HeaderClock …/>` line 188; menu sheet lines 236-248; End shift confirm body line 252), `src/ui/carbon.css`
- Modify: `src/app/Help.tsx` (one short paragraph on the shift record)

**Interfaces:**
- Consumes: `useSync()`, `useSyncStatus()` (Task 4), `SyncController.begin/startUnsaved/end/enrollCode`, `BeginResult`.
- Produces: `PasscodeSheet({ onCancel, onDone })` where `onDone()` is called after a successful `begin` or an explicit start without saving; `SyncStatusChip()`.

- [ ] **Step 1: Mount the live provider with persist**

In `CarbonApp()` change `<ShiftProvider>` (the outer, live one) to `<ShiftProvider persist>`. Leave the demo and tour `<ShiftProvider>`s untouched.

- [ ] **Step 2: `PasscodeSheet.tsx`**

```tsx
// © 2026 New York University. All rights reserved.
//
// Starting a live shift opens its server record. The department passcode is asked once per
// device and remembered. Without a connection the nurse can retry or start without saving.
import { useState } from 'react';
import Sheet, { Copyright, SheetHeader } from './Sheet';
import type { SyncController } from '../backend/controller';

export default function PasscodeSheet({ sync, onCancel, onDone }: { sync: SyncController; onCancel: () => void; onDone: () => void }) {
  const [code, setCode] = useState(sync.enrollCode() ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ reason: 'passcode' | 'network' | 'server'; message: string } | null>(null);

  const go = async () => {
    setBusy(true); setError(null);
    const r = await sync.begin(code.trim());
    setBusy(false);
    if (r.ok) onDone(); else setError(r);
  };

  return (
    <Sheet label="Start shift record" onClose={onCancel}>
      <SheetHeader title="Start shift record" sub="The shift is saved so a reload does not lose it." onClose={onCancel} />
      <label className="field">
        <span>Department passcode</span>
        <input type="password" autoComplete="off" value={code} onChange={e => setCode(e.target.value)} autoFocus
          onKeyDown={e => { if (e.key === 'Enter' && code.trim()) go(); }} />
      </label>
      {error?.reason === 'passcode' && <p className="field-error" role="alert">Passcode not recognized.</p>}
      {error && error.reason !== 'passcode' && (
        <p className="field-error" role="alert">Cannot reach the shift record. Check the connection and retry, or start without saving (nothing from this shift will be kept).</p>
      )}
      <div className="sheet-actions">
        {error && error.reason !== 'passcode' && (
          <button className="btn" onClick={() => { sync.startUnsaved(); onDone(); }}>Start without saving</button>
        )}
        <button className="btn primary" disabled={busy || !code.trim()} onClick={go}>{busy ? 'Starting…' : error ? 'Retry' : 'Start shift'}</button>
      </div>
      <Copyright />
    </Sheet>
  );
}
```

- [ ] **Step 3: Route Start and End through the controller in `CarbonApp.tsx`**

```tsx
import { useSync } from '../backend/SyncContext';
import PasscodeSheet from './PasscodeSheet';
// inside Screens():
  const sync = useSync();
  const [pendingStart, setPendingStart] = useState<{ providers: Provider[]; floats: string[] } | null>(null);

  const reallyStart = (providers: Provider[], floats: string[]) => {
    dispatch({ type: 'START_SHIFT', providers });
    dispatch({ type: 'SET_FLOAT_ATTENDINGS', names: floats });
    clearDraft();
    go('board');
  };
  const start = (providers: Provider[], floats: string[]) => {
    if (sync && sync.status().kind !== 'off') setPendingStart({ providers, floats });
    else reallyStart(providers, floats);
  };
  const endShift = async () => {
    await sync?.end();          // deactivates before RESET, so RESET is never saved
    dispatch({ type: 'RESET' });
    go('home');
  };
// in the JSX, after the overlays:
    {pendingStart && sync && (
      <PasscodeSheet sync={sync} onCancel={() => setPendingStart(null)}
        onDone={() => { const p = pendingStart; setPendingStart(null); reallyStart(p.providers, p.floats); }} />
    )}
```

- [ ] **Step 4: `SyncStatus.tsx` chip and Board changes**

```tsx
// © 2026 New York University. All rights reserved.
import { useSyncStatus } from '../backend/SyncContext';

/** Small record status next to the clock. Nothing while everything is saved. */
export default function SyncStatusChip() {
  const s = useSyncStatus();
  if (s.kind === 'saving') return <span className="sync-chip" role="status">Saving…</span>;
  if (s.kind === 'offline') return <span className="sync-chip warn" role="status">Offline, {s.pending} unsaved</span>;
  if (s.kind === 'conflict') return <span className="sync-chip warn" role="alert">Record out of date. Reload</span>;
  if (s.kind === 'unsaved') return <span className="sync-chip warn" role="status">Not saved</span>;
  return null;
}
```

In `Board.tsx`: import `SyncStatusChip` and `useSyncStatus`; render `{mode === 'live' && <SyncStatusChip />}` right after `<HeaderClock ms={state.now} />`. In the menu `opts`, above End shift, when `mode === 'live'` and status has a `code`:

```tsx
{mode === 'live' && 'code' in syncStatus && (
  <div className="opt static"><span><b>Shift code</b><small className="num">{syncStatus.code}</small></span></div>
)}
```

Change the End shift confirm body to depend on status:

```tsx
body={<p>{syncStatus.kind === 'off' || syncStatus.kind === 'unsaved'
  ? 'This clears the board, the rosters and the shift activity from this device. The activity is not saved anywhere else.'
  : 'This closes the shift record and clears the board from this device. The record is kept.'}</p>}
```

`src/ui/carbon.css`: add

```css
.sync-chip { font-size: 12px; padding: 2px 8px; border-radius: 999px; background: var(--chip); color: var(--tx2); white-space: nowrap; }
.sync-chip.warn { background: var(--yellow-fill); color: var(--on-yellow-fill); }
.field-error { color: var(--danger); margin: 8px 0 0; }
```

These tokens (`--chip`, `--tx2`, `--yellow-fill`, `--on-yellow-fill`, `--danger`) are defined in `src/ui/carbon.css` for light and dark. There is no `.field` class: give the passcode input the same classes as the name inputs in `SetupScreen.tsx`.

- [ ] **Step 5: Help text**

In `src/app/Help.tsx`, add under the shift section (plain language, no em dashes):
"The live shift is saved as you go. If the page reloads, the board and the shift activity come back. If the connection drops, keep working: the header shows how many changes are waiting, and they upload when the connection returns. Ending the shift closes its record."

- [ ] **Step 6: Verify**

Run: `npx vitest run src scripts`, `npx tsc -b`, `npx eslint src`, `npm run build`.
Expected: all pass. With no `.env` Supabase values, `npm run dev`: start a shift goes straight to the board (no passcode sheet), and the board looks as before.

- [ ] **Step 7: Commit**

```bash
git add src/app/PasscodeSheet.tsx src/app/SyncStatus.tsx src/app/CarbonApp.tsx src/app/Board.tsx src/app/Help.tsx src/ui/carbon.css
git commit -m "Live shift: passcode start, record status, shift code, End shift closes record"
```

---

### Task 6: Lab admin screen and CSV export

**Files:**
- Create: `src/lab/trial/csv.ts`, `src/lab/trial/csv.test.ts`, `src/lab/trial/TrialData.tsx`
- Modify: `src/lab/LabHome.tsx` (import and a toggle button next to `<DelphiAdminPanel />`, line 202)

**Interfaces:**
- Consumes: `adminClient()` (Task 3), `ActivityEvent`, `AssignEvent`, `TeamSnapshot` (`src/activity.ts`), `undoneAssignIds`.
- Produces:

```ts
export interface ShiftRow { id: string; code: string; started_at: string; ended_at: string | null; app_commit: string; weights_id: string }
export interface EventRow { shift_id: string; id: string; seq: number; kind: string; at: number; recorded_at: number; body: ActivityEvent }
export function shiftsCsv(rows: ShiftRow[], events: EventRow[]): string;  // + event_count, override_count
export function eventsCsv(shifts: ShiftRow[], events: EventRow[]): string;
export function csvCell(v: unknown): string;
```

- [ ] **Step 1: Failing CSV tests**

```ts
// © 2026 New York University. All rights reserved.
import { describe, expect, it } from 'vitest';
import type { ActivityEvent } from '../../activity';
import { csvCell, eventsCsv, shiftsCsv, type EventRow, type ShiftRow } from './csv';

const shift: ShiftRow = { id: 's1', code: 'ABC234', started_at: '2026-10-01T12:00:00Z', ended_at: null, app_commit: 'abc1234', weights_id: 'delphi-r1-n19' };
const snap = [1, 2, 3, 4].map(t => ({ teamId: t, capacity: 20, load: t === 4 ? 0 : 2, ratio: t === 4 ? 'infinity' : 10, closed: t === 4, buffered: false }));
const assign = { id: 'ev-2', seq: 2, at: 1, recordedAt: 1, kind: 'assign', patientId: 'C-001', acuity: 'tier_one', source: 'critical',
  recommendedTeamId: 1, nextRankedTeamId: 2, chosenTeamId: 3, followed: false,
  override: { reasonCode: 'other', reasonLabel: 'Other', note: 'said "no", then left' }, snapshot: snap, auto: false } as unknown as ActivityEvent;
const undo = { id: 'ev-3', seq: 3, at: 2, recordedAt: 2, kind: 'undo', patientId: 'C-001', undoesEventId: 'ev-2' } as ActivityEvent;
const row = (e: ActivityEvent): EventRow => ({ shift_id: 's1', id: e.id, seq: e.seq, kind: e.kind, at: e.at, recorded_at: e.recordedAt, body: e });

describe('trial CSV', () => {
  it('quotes commas, quotes and newlines', () => {
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('x\ny')).toBe('"x\ny"');
    expect(csvCell(null)).toBe('');
  });
  it('one row per event with the snapshot flattened and undone marked', () => {
    const lines = eventsCsv([shift], [row(assign), row(undo)]).trim().split('\n');
    const head = lines[0].split(',');
    expect(head).toContain('t1_ratio');
    expect(head).toContain('t4_closed');
    const cells = lines[1];
    expect(cells).toContain('ABC234');
    expect(cells).toContain('"said ""no"", then left"');
    expect(cells).toContain('infinity');
    const undoneCol = head.indexOf('undone');
    expect(lines[1].split(',')[undoneCol]).toBe('true');
    expect(lines.length).toBe(3);
  });
  it('shift rows count events and overrides', () => {
    const lines = shiftsCsv([shift], [row(assign), row(undo)]).trim().split('\n');
    expect(lines[0]).toBe('shift_id,code,started_at,ended_at,app_commit,weights_id,event_count,override_count');
    expect(lines[1].endsWith(',2,1')).toBe(true);
  });
});
```

(Columns before `undone` never contain commas; the override note comes after it, so a plain split finds `undone`.)

- [ ] **Step 2: Run to confirm failure**

Run: `npx vitest run src/lab/trial/csv.test.ts`
Expected: FAIL, cannot resolve `./csv`.

- [ ] **Step 3: Implement `csv.ts`**

```ts
// © 2026 New York University. All rights reserved.
//
// Trial data export. One row per logged event; each team's score snapshot at an assignment
// is flattened into t1_… t4_ columns. Counts only; no rates or combined scores (Decision 18).
import type { ActivityEvent, TeamSnapshot } from '../../activity';
import { undoneAssignIds } from '../../activity';
import { ALL_TEAMS } from '../../ui/model';

export interface ShiftRow { id: string; code: string; started_at: string; ended_at: string | null; app_commit: string; weights_id: string }
export interface EventRow { shift_id: string; id: string; seq: number; kind: string; at: number; recorded_at: number; body: ActivityEvent }

export function csvCell(v: unknown): string {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const line = (cells: unknown[]) => cells.map(csvCell).join(',');
const TEAMS = ALL_TEAMS;
const SNAP_FIELDS = ['capacity', 'load', 'ratio', 'closed', 'buffered'] as const;

export function shiftsCsv(rows: ShiftRow[], events: EventRow[]): string {
  const out = [line(['shift_id', 'code', 'started_at', 'ended_at', 'app_commit', 'weights_id', 'event_count', 'override_count'])];
  for (const r of rows) {
    const evs = events.filter(e => e.shift_id === r.id);
    const overrides = evs.filter(e => e.body.kind === 'assign' && !e.body.followed).length;
    out.push(line([r.id, r.code, r.started_at, r.ended_at, r.app_commit, r.weights_id, evs.length, overrides]));
  }
  return out.join('\n') + '\n';
}

export function eventsCsv(shifts: ShiftRow[], events: EventRow[]): string {
  const code = new Map(shifts.map(s => [s.id, s.code]));
  const snapHead = TEAMS.flatMap(t => SNAP_FIELDS.map(f => `t${t}_${f}`));
  const out = [line(['shift_code', 'seq', 'event_id', 'kind', 'at_iso', 'recorded_at_iso', 'undone', 'patient', 'acuity', 'to_acuity',
    'team', 'to_team', 'recommended_team', 'next_ranked_team', 'chosen_team', 'followed', 'auto', 'reason_code', 'reason', 'note', 'undoes_event',
    ...snapHead])];
  const byShift = new Map<string, EventRow[]>();
  for (const e of events) byShift.set(e.shift_id, [...(byShift.get(e.shift_id) ?? []), e]);
  for (const [sid, evs] of byShift) {
    const sorted = [...evs].sort((a, b) => a.seq - b.seq);
    const undone = undoneAssignIds(sorted.map(e => e.body));
    for (const r of sorted) {
      const b = r.body as ActivityEvent & Record<string, unknown>;
      const snap = (b.kind === 'assign' ? b.snapshot : []) as TeamSnapshot[];
      const snapCells = TEAMS.flatMap(t => {
        const s = snap.find(x => x.teamId === t);
        return SNAP_FIELDS.map(f => (s ? s[f] : ''));
      });
      const ov = b.kind === 'assign' ? b.override : null;
      out.push(line([code.get(sid) ?? sid, r.seq, r.id, r.kind, new Date(r.at).toISOString(), new Date(r.recorded_at).toISOString(),
        undone.has(r.id), b.patientId, b.acuity, b.toAcuity, b.teamId, b.toTeamId, b.recommendedTeamId, b.nextRankedTeamId,
        b.chosenTeamId, b.followed, b.auto, ov?.reasonCode, ov?.reasonLabel, ov?.note, b.undoesEventId, ...snapCells]));
    }
  }
  return out.join('\n') + '\n';
}
```

- [ ] **Step 4: Run CSV tests**

Run: `npx vitest run src/lab/trial/csv.test.ts`
Expected: PASS.

- [ ] **Step 5: `TrialData.tsx`**

A lab card (Tailwind classes, matching `DelphiAdminPanel`'s look) with:
- Not configured: `backendEnabled` false renders "Backend not configured."
- Signed out: email input, "Send sign-in link" calls `adminClient().auth.signInWithOtp({ email, options: { emailRedirectTo: window.location.href } })`, then "Check your email."
- Signed in, `rpc('is_admin')` false: "Not authorized." plus Sign out.
- Admin:
  - Shift list from `from('shifts').select('id, code, started_at, ended_at, app_commit, weights_id').order('started_at', { ascending: false })` plus events fetched per selected shift (`from('shift_events').select('shift_id, id, seq, kind, at, recorded_at, body').eq('shift_id', id).order('seq')`); list rows show date, code, start, end, commit, weights id, event and override counts (counts from a second query `select('shift_id, kind, body->followed')` over all events, or computed after loading all events for up to the last 60 shifts).
  - Detail table: seq, time (`hourMinute` from `src/ui/model.ts`), kind, patient, color, recommended, chosen, followed/override, reason, note, undone (struck-through row). Clicking an assign row expands its snapshot table (team, capacity, load, ratio, closed, buffered).
  - Export: date range inputs (default last 30 days), buttons "shifts.csv" and "events.csv" build a Blob from `shiftsCsv` / `eventsCsv` and download via an `<a download>`.
  - Passcode: input (min 6 chars) and "Set passcode" calls `rpc('set_enrollment_code', { p_code })`; shows "Passcode updated." or the error.
  - Sign out: `auth.signOut()` on the admin client only.
- Footer: the lab's existing NYU notice.

Load it lazily in `LabHome.tsx`:

```tsx
import { lazy, Suspense } from 'react';
const TrialData = lazy(() => import('./trial/TrialData'));
// state
const [showTrial, setShowTrial] = useState(false);
// after <DelphiAdminPanel />
<button onClick={() => setShowTrial(v => !v)} className="w-full text-sm underline">Trial data</button>
{showTrial && <Suspense fallback={<p className="text-sm">Loading…</p>}><TrialData /></Suspense>}
```

- [ ] **Step 6: Verify**

Run: `npx vitest run src scripts`, `npx tsc -b`, `npx eslint src`, `npm run build`.
Expected: all pass. `grep -rnP "\x{2014}" src/lab/trial src/backend src/app/PasscodeSheet.tsx src/app/SyncStatus.tsx` returns nothing.

- [ ] **Step 7: Commit**

```bash
git add src/lab/trial/csv.ts src/lab/trial/csv.test.ts src/lab/trial/TrialData.tsx src/lab/LabHome.tsx
git commit -m "Lab: trial data admin (magic link), event table with snapshots, CSV export, passcode"
```

---

### Task 7: End-to-end check, records, docs

**Files:**
- Modify: `.env` (local only, never committed): `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` from Supabase MCP `get_project_url` and `get_publishable_keys`
- Modify: `CLAUDE.md` (replace "Next Step: Real-Time Backend" with a "Backend (Supabase)" section; add `src/backend/` and `src/lab/trial/` to Architecture)
- Modify: `METHODS.md` (new section above "# Historical Methodology Record")
- Modify (not committed): `ER Triage App/Cowork Roundtable.md`, `ER Triage App/dossier-pending.md` (run `node scripts/backup-records.mjs` first)

- [ ] **Step 1: Test passcode and admin**

Ask Julian to (a) open `http://localhost:5173/capacity-conscious-triage/?lab`, Trial data, sign in by magic link, then run `select id, email from auth.users where is_anonymous = false` via `execute_sql` and insert his id into `public.admins`; (b) set a department passcode from the lab card. Julian keeps the passcode; do not write it in chat or files.

- [ ] **Step 2: End to end in the browser preview**

`preview_start` the dev server. Then, checking each against the database with `execute_sql` (`select kind, seq from shift_events where shift_id = … order by seq`; `select version, jsonb_array_length(state->'activity') from shifts …`):
1. Start a shift: passcode sheet appears; wrong passcode shows "Passcode not recognized"; Julian types the real one (the agent never enters it).
2. Place three patients, one with an override ("Other" + note). Rows appear in order, with the snapshot in `body`.
3. Reload. Board, patients and Shift activity come back; undo one placement from the log; the undo row uploads.
4. Offline: `javascript_tool` cannot cut the network, so block requests with the preview's offline emulation if available, otherwise set `window.fetch` to reject for the Supabase host; place a patient; header shows "Offline, N unsaved"; restore; rows upload, count returns to nothing.
5. End shift: `ended_at` set; board cleared; a reload does not resume it.
6. Lab: the shift shows with counts; detail table and snapshot expand; both CSVs download and open with the expected columns.
7. Demo and tour: run a few demo arrivals; `select count(*) from shifts` unchanged.
Screenshot the board with the status chip and the lab detail table.

- [ ] **Step 3: Advisors again**

`get_advisors` security and performance. Expected: no new issues.

- [ ] **Step 4: Records**

- METHODS: `## N. Trial data capture (Supabase)` with Objective, Data (tables, what each event row holds, snapshot fields, `app_commit`, `weights_id`), Design rationale (snapshot plus append-only events; RPC-only writes; passcode; separate admin client), Implementation notes (files, commit SHAs, migration name, `supabase/tests/trial_backend.sql` result, advisors), marked `_(unreviewed, written by Claude Opus (Claude Code))_`. Record the two deviations from the spec (`create_shift` without state; `append_events` RPC instead of an insert policy).
- Roundtable: new session "September 29, 2026 -- Trial backend", decision numbered after the last one of the day: amends Decision 9 (backend for a durable record and resume; still one device; sync-ready), resolves open item 6; unreviewed.
- Dossier draft in `ER Triage App/dossier-pending.md`: real trial data in Julian's personal Supabase org (project ref, region); new endpoint and publishable key in the Pages bundle; anonymous sign-in with a department passcode; events never deleted; material deploy pending Julian's go.
- CLAUDE.md backend section: env values, `supabase/` folder, how to run the database test, admin setup, that `.env` builds ship the Supabase URL and publishable key, the no-deploy rule.

- [ ] **Step 5: Final checks and commit**

Run: `npx vitest run src scripts`, `npx eslint src`, `npm run build`, `npm run check:schedules`.

```bash
git add CLAUDE.md METHODS.md
git commit -m "Docs: trial backend in CLAUDE.md and METHODS"
```

Do not deploy. Report to Julian: what was verified, the Dossier draft waiting for his go, and that deploy needs his explicit go.
