-- © 2026 New York University. All rights reserved.
-- Advisor fixes after trial_backend: fixed search_path on the two helper functions, and
-- RLS policies read auth.uid() once per query instead of once per row.
-- Left as designed (advisor notes): enrollment has RLS and no policy (read only through
-- create_shift / set_enrollment_code); the security definer RPCs are the intended write path.

alter function public.new_shift_code() set search_path = public;
alter function public.forbid_event_change() set search_path = public;

drop policy members_read on public.shift_members;
create policy members_read on public.shift_members for select to authenticated
  using (user_id = (select auth.uid()) or public.is_admin());

drop policy admins_read_self on public.admins;
create policy admins_read_self on public.admins for select to authenticated
  using (user_id = (select auth.uid()));
