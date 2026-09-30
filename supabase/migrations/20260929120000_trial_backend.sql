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
  last_save_id uuid,
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
  -- Null-safe: crypt(NULL, h) is NULL, and `NULL <> h` would skip the raise (audit P1).
  if p_enroll_code is null or h is null or crypt(p_enroll_code, h) is distinct from h then
    raise exception 'invalid_enrollment';
  end if;
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
  if p_code is null then raise exception 'no_open_shift'; end if;
  select s.id into sid from public.shifts s where s.code = upper(p_code) and s.ended_at is null;
  if sid is null then raise exception 'no_open_shift'; end if;
  insert into public.shift_members (shift_id, user_id) values (sid, auth.uid()) on conflict do nothing;
  return sid;
end $$;

create function public.save_state(p_shift_id uuid, p_expected_version int, p_state jsonb, p_save_id uuid)
returns table(ok boolean, version int)
language plpgsql security definer set search_path = public as $$
declare cur int; ended timestamptz; last_id uuid;
begin
  if p_shift_id is null or p_expected_version is null or p_state is null or p_save_id is null then
    raise exception 'invalid_argument';
  end if;
  if not public.is_member(p_shift_id) then raise exception 'not_member'; end if;
  select s.version, s.ended_at, s.last_save_id into cur, ended, last_id
    from public.shifts s where s.id = p_shift_id for update;
  if cur is null then raise exception 'no_shift'; end if;
  -- Idempotent retry: this save already committed but its response was lost (audit P1).
  if last_id is not distinct from p_save_id then return query select true, cur; return; end if;
  if ended is not null then raise exception 'shift_ended'; end if;
  if cur is distinct from p_expected_version then return query select false, cur; return; end if;
  update public.shifts s set state = p_state, version = cur + 1, last_save_id = p_save_id, updated_at = now()
    where s.id = p_shift_id;
  return query select true, cur + 1;
end $$;

create function public.append_events(p_shift_id uuid, p_events jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if p_shift_id is null or p_events is null or jsonb_typeof(p_events) <> 'array' then raise exception 'invalid_argument'; end if;
  if exists (select 1 from jsonb_array_elements(p_events) e
             where e->>'id' is null or e->>'seq' is null or e->>'kind' is null or e->>'at' is null or e->>'recordedAt' is null) then
    raise exception 'invalid_event';
  end if;
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
