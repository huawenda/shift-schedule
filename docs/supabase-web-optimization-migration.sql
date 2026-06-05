-- Web + Supabase optimization migration.
-- Run once on an existing Supabase project after backing up data.

create schema if not exists private;

revoke all on schema private from anon, authenticated;

create or replace function private.is_current_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_accounts
    where auth_user_id = auth.uid()
      and enabled = true
      and role = 'admin'
  );
$$;

create or replace function private.has_active_account()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_accounts
    where auth_user_id = auth.uid()
      and enabled = true
  );
$$;

create or replace function private.can_write_person(target_person_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_accounts
    where auth_user_id = auth.uid()
      and enabled = true
      and (role = 'admin' or person_name = target_person_name)
  );
$$;

create or replace function private.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
declare
  requested_username text;
  requested_person_name text;
  requested_invite_code text;
  configured_user_code text;
  configured_admin_code text;
  configured_admin_name text;
  resolved_role text := 'user';
  now_ms bigint := public.current_ms();
  now_text text := public.beijing_time_text(now());
  created_account_id bigint;
begin
  requested_username := lower(trim(new.raw_user_meta_data ->> 'username'));
  requested_person_name := trim(new.raw_user_meta_data ->> 'person_name');
  requested_invite_code := coalesce(new.raw_user_meta_data ->> 'invite_code', '');

  select user_invite_code, admin_invite_code, admin_person_name
  into configured_user_code, configured_admin_code, configured_admin_name
  from private.registration_settings
  where id = 1;

  if requested_username is null or length(requested_username) < 3 then
    raise exception 'username_invalid';
  end if;

  if requested_person_name is null or requested_person_name = '' then
    raise exception 'person_name_required';
  end if;

  if requested_person_name = configured_admin_name and requested_invite_code = configured_admin_code then
    resolved_role := 'admin';
  elsif requested_person_name <> configured_admin_name and requested_invite_code = configured_user_code then
    resolved_role := 'user';
  else
    raise exception 'registration_invite_invalid';
  end if;

  insert into public.user_accounts (
    auth_user_id,
    username,
    person_name,
    role
  )
  values (
    new.id,
    requested_username,
    requested_person_name,
    resolved_role
  )
  returning id into created_account_id;

  insert into public.user_profiles (
    openid,
    person_name,
    role,
    enabled,
    bound_at,
    bound_at_text,
    updated_at,
    updated_at_text
  )
  values (
    'web-account:' || created_account_id,
    requested_person_name,
    resolved_role,
    true,
    now_ms,
    now_text,
    now_ms,
    now_text
  )
  on conflict (person_name) do update set
    openid = excluded.openid,
    role = excluded.role,
    enabled = true,
    updated_at = excluded.updated_at,
    updated_at_text = excluded.updated_at_text;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created_shift_schedule on auth.users;
create trigger on_auth_user_created_shift_schedule
after insert on auth.users
for each row execute function private.handle_new_auth_user();

drop function if exists public.is_current_admin();
drop function if exists public.has_active_account();
drop function if exists public.can_write_person(text);
drop function if exists public.handle_new_auth_user();

create table if not exists public.day_shift_overrides (
  id bigserial primary key,
  auth_user_id uuid references auth.users(id) on delete set null,
  person_name text not null,
  record_date text not null,
  shift_override text not null check (shift_override in ('白班', '夜班', '休息', '白特', '夜特', '事假')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_at_ms bigint not null default public.current_ms(),
  updated_at_ms bigint not null default public.current_ms(),
  created_at_text text not null default public.beijing_time_text(now()),
  updated_at_text text not null default public.beijing_time_text(now()),
  unique (person_name, record_date)
);

create table if not exists public.day_private_records (
  id bigserial primary key,
  auth_user_id uuid references auth.users(id) on delete set null,
  person_name text not null,
  record_date text not null,
  overtime_hours numeric not null default 0,
  is_legal_overtime boolean not null default false,
  leave_duration text check (leave_duration is null or leave_duration in ('半天', '一天')),
  updated_at timestamptz not null default now(),
  updated_at_ms bigint not null default public.current_ms(),
  updated_at_text text not null default public.beijing_time_text(now()),
  unique (person_name, record_date)
);

insert into public.day_shift_overrides (
  auth_user_id,
  person_name,
  record_date,
  shift_override,
  created_at,
  updated_at,
  created_at_ms,
  updated_at_ms,
  created_at_text,
  updated_at_text
)
select
  auth_user_id,
  person_name,
  record_date,
  shift_override,
  created_at,
  updated_at,
  created_at_ms,
  updated_at_ms,
  created_at_text,
  updated_at_text
from public.day_records
where shift_override is not null
on conflict (person_name, record_date) do update set
  auth_user_id = excluded.auth_user_id,
  shift_override = excluded.shift_override,
  updated_at = excluded.updated_at,
  updated_at_ms = excluded.updated_at_ms,
  updated_at_text = excluded.updated_at_text;

insert into public.day_private_records (
  auth_user_id,
  person_name,
  record_date,
  overtime_hours,
  is_legal_overtime,
  leave_duration,
  updated_at,
  updated_at_ms,
  updated_at_text
)
select
  auth_user_id,
  person_name,
  record_date,
  overtime_hours,
  is_legal_overtime,
  leave_duration,
  updated_at,
  updated_at_ms,
  updated_at_text
from public.day_records
where overtime_hours > 0
   or is_legal_overtime = true
   or leave_duration is not null
on conflict (person_name, record_date) do update set
  auth_user_id = excluded.auth_user_id,
  overtime_hours = excluded.overtime_hours,
  is_legal_overtime = excluded.is_legal_overtime,
  leave_duration = excluded.leave_duration,
  updated_at = excluded.updated_at,
  updated_at_ms = excluded.updated_at_ms,
  updated_at_text = excluded.updated_at_text;

drop trigger if exists touch_day_shift_overrides_updated_at on public.day_shift_overrides;
create trigger touch_day_shift_overrides_updated_at
before update on public.day_shift_overrides
for each row execute function public.touch_updated_at();

drop trigger if exists set_day_shift_overrides_owner on public.day_shift_overrides;
create trigger set_day_shift_overrides_owner
before insert on public.day_shift_overrides
for each row execute function public.set_row_owner();

drop trigger if exists touch_day_private_records_updated_at on public.day_private_records;
create trigger touch_day_private_records_updated_at
before update on public.day_private_records
for each row execute function public.touch_updated_at();

drop trigger if exists set_day_private_records_owner on public.day_private_records;
create trigger set_day_private_records_owner
before insert on public.day_private_records
for each row execute function public.set_row_owner();

alter table public.day_shift_overrides enable row level security;
alter table public.day_private_records enable row level security;

drop policy if exists user_accounts_select on public.user_accounts;
create policy user_accounts_select on public.user_accounts
for select to authenticated
using (auth_user_id = (select auth.uid()) or (select private.is_current_admin()));

drop policy if exists user_accounts_admin_update on public.user_accounts;
create policy user_accounts_admin_update on public.user_accounts
for update to authenticated
using (private.is_current_admin())
with check (private.is_current_admin());

drop policy if exists user_profiles_select on public.user_profiles;
create policy user_profiles_select on public.user_profiles
for select to authenticated
using (private.has_active_account());

drop policy if exists day_shift_overrides_select on public.day_shift_overrides;
create policy day_shift_overrides_select on public.day_shift_overrides
for select to authenticated
using ((select private.has_active_account()));

drop policy if exists day_shift_overrides_insert on public.day_shift_overrides;
create policy day_shift_overrides_insert on public.day_shift_overrides
for insert to authenticated
with check (private.can_write_person(person_name));

drop policy if exists day_shift_overrides_update on public.day_shift_overrides;
create policy day_shift_overrides_update on public.day_shift_overrides
for update to authenticated
using (private.can_write_person(person_name))
with check (private.can_write_person(person_name));

drop policy if exists day_shift_overrides_delete on public.day_shift_overrides;
create policy day_shift_overrides_delete on public.day_shift_overrides
for delete to authenticated
using (private.can_write_person(person_name));

drop policy if exists day_private_records_select on public.day_private_records;
create policy day_private_records_select on public.day_private_records
for select to authenticated
using (private.can_write_person(person_name));

drop policy if exists day_private_records_insert on public.day_private_records;
create policy day_private_records_insert on public.day_private_records
for insert to authenticated
with check (private.can_write_person(person_name));

drop policy if exists day_private_records_update on public.day_private_records;
create policy day_private_records_update on public.day_private_records
for update to authenticated
using (private.can_write_person(person_name))
with check (private.can_write_person(person_name));

drop policy if exists day_private_records_delete on public.day_private_records;
create policy day_private_records_delete on public.day_private_records
for delete to authenticated
using (private.can_write_person(person_name));

drop policy if exists salary_inputs_select on public.salary_inputs;
create policy salary_inputs_select on public.salary_inputs
for select to authenticated
using (private.can_write_person(person_name));

drop policy if exists salary_inputs_insert on public.salary_inputs;
create policy salary_inputs_insert on public.salary_inputs
for insert to authenticated
with check (private.can_write_person(person_name));

drop policy if exists salary_inputs_update on public.salary_inputs;
create policy salary_inputs_update on public.salary_inputs
for update to authenticated
using (private.can_write_person(person_name))
with check (private.can_write_person(person_name));

drop policy if exists login_sessions_select on public.login_sessions;
create policy login_sessions_select on public.login_sessions
for select to authenticated
using (auth_user_id = (select auth.uid()) or (select private.is_current_admin()));

drop policy if exists day_records_select on public.day_records;
drop policy if exists day_records_insert on public.day_records;
drop policy if exists day_records_update on public.day_records;
drop policy if exists day_records_delete on public.day_records;
revoke all on public.day_records from anon, authenticated;

alter table if exists public.day_records set schema private;
alter table if exists private.day_records rename to day_records_legacy;
alter table if exists private.day_records_legacy disable row level security;
revoke all on private.day_records_legacy from anon, authenticated;

create index if not exists day_shift_overrides_auth_user_id_idx on public.day_shift_overrides(auth_user_id);
create index if not exists day_private_records_auth_user_id_idx on public.day_private_records(auth_user_id);
create index if not exists salary_inputs_auth_user_id_idx on public.salary_inputs(auth_user_id);
create index if not exists login_sessions_auth_user_id_idx on public.login_sessions(auth_user_id);
create index if not exists day_records_legacy_auth_user_id_idx on private.day_records_legacy(auth_user_id);

create or replace function public.current_ms()
returns bigint
language sql
stable
set search_path = pg_catalog
as $$
  select floor(extract(epoch from now()) * 1000)::bigint;
$$;

create or replace function public.beijing_time_text(value timestamptz)
returns text
language sql
stable
set search_path = pg_catalog
as $$
  select to_char(value at time zone 'Asia/Shanghai', 'YYYY-MM-DD HH24:MI:SS');
$$;

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_catalog
as $$
begin
  new.updated_at = now();
  new.updated_at_ms = public.current_ms();
  new.updated_at_text = public.beijing_time_text(new.updated_at);
  return new;
end;
$$;

create or replace function public.set_row_owner()
returns trigger
language plpgsql
set search_path = public, pg_catalog
as $$
begin
  if new.auth_user_id is null then
    new.auth_user_id = auth.uid();
  end if;
  return new;
end;
$$;

grant usage on schema private to authenticated;
grant execute on function private.is_current_admin() to authenticated;
grant execute on function private.has_active_account() to authenticated;
grant execute on function private.can_write_person(text) to authenticated;

grant select, insert, update, delete on public.day_shift_overrides to authenticated;
grant select, insert, update, delete on public.day_private_records to authenticated;
grant usage, select on all sequences in schema public to authenticated;
