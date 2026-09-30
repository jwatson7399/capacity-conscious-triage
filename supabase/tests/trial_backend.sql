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
  -- Wrong and null passcodes fail.
  begin perform public.create_shift('wrong', 'x', 'y'); raise exception 'FAIL wrong passcode accepted';
  exception when others then if sqlerrm not like '%invalid_enrollment%' then raise; end if; end;
  begin perform public.create_shift(null, 'x', 'y'); raise exception 'FAIL null passcode accepted';
  exception when others then if sqlerrm not like '%invalid_enrollment%' then raise; end if; end;
  -- Save at version 1 succeeds, stale version fails, null version fails.
  select * into r from public.save_state(sid, 1, '{"a":1}', '10000000-0000-0000-0000-000000000001');
  if not r.ok or r.version <> 2 then raise exception 'FAIL save v1'; end if;
  -- Same save id again (lost response, retried with the old version): accepted, no new write.
  select * into r from public.save_state(sid, 1, '{"a":1}', '10000000-0000-0000-0000-000000000001');
  if not r.ok or r.version <> 2 then raise exception 'FAIL idempotent retry'; end if;
  select * into r from public.save_state(sid, 1, '{"a":2}', '10000000-0000-0000-0000-000000000002');
  if r.ok or r.version <> 2 then raise exception 'FAIL stale save accepted'; end if;
  begin perform public.save_state(sid, null, '{"a":3}', '10000000-0000-0000-0000-000000000003'); raise exception 'FAIL null version accepted';
  exception when others then if sqlerrm not like '%invalid_argument%' then raise; end if; end;
  if (select state from public.shifts where id = sid) <> '{"a":1}'::jsonb then raise exception 'FAIL state changed'; end if;
  -- Events insert once; retry is ignored.
  n := public.append_events(sid, '[{"id":"ev-1","seq":1,"kind":"shift_start","at":1,"recordedAt":1}]');
  if n <> 1 then raise exception 'FAIL first insert %', n; end if;
  n := public.append_events(sid, '[{"id":"ev-1","seq":1,"kind":"shift_start","at":1,"recordedAt":1}]');
  if n <> 0 then raise exception 'FAIL duplicate inserted'; end if;
  -- Update and delete by the client role change nothing. RLS has no update/delete policy, so
  -- they may affect zero rows instead of raising; either outcome is fine, so assert contents.
  begin update public.shift_events set kind = 'x' where shift_id = sid; exception when others then null; end;
  begin delete from public.shift_events where shift_id = sid; exception when others then null; end;
  if (select count(*) from public.shift_events where shift_id = sid and id = 'ev-1' and kind = 'shift_start') <> 1 then
    raise exception 'FAIL event changed or deleted';
  end if;
end $$;

-- The trigger itself, tested as the table owner (RLS bypassed), must raise.
reset role;
do $$
declare sid uuid := (select v from t_ids where k = 'shift');
begin
  begin update public.shift_events set kind = 'x' where shift_id = sid; raise exception 'FAIL trigger allowed update';
  exception when others then if sqlerrm not like '%append-only%' then raise; end if; end;
  begin delete from public.shift_events where shift_id = sid; raise exception 'FAIL trigger allowed delete';
  exception when others then if sqlerrm not like '%append-only%' then raise; end if; end;
end $$;
set local role authenticated;

-- Device B cannot see or write A's shift.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated","is_anonymous":true}', true);
do $$
declare sid uuid := (select v from t_ids where k = 'shift');
begin
  if exists (select 1 from public.shifts where id = sid) then raise exception 'FAIL B reads A shift'; end if;
  if exists (select 1 from public.shift_events where shift_id = sid) then raise exception 'FAIL B reads A events'; end if;
  if exists (select 1 from public.shift_members where shift_id = sid) then raise exception 'FAIL B reads A members'; end if;
  begin perform public.save_state(sid, 2, '{}', gen_random_uuid()); raise exception 'FAIL B saved';
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
  if not exists (select 1 from public.shift_members where shift_id = sid) then raise exception 'FAIL A cannot read own membership'; end if;
  perform public.end_shift(sid);
  begin perform public.save_state(sid, 2, '{}', gen_random_uuid()); raise exception 'FAIL save after end';
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
  if not exists (select 1 from public.admins) then raise exception 'FAIL admin reads own row'; end if;
end $$;

select 'ALL PASS' as result;
rollback;
