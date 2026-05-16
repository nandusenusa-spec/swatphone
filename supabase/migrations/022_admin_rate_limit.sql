alter table public.admin_credentials
  add column if not exists failed_attempts int not null default 0,
  add column if not exists blocked_until timestamptz,
  add column if not exists last_failed_at timestamptz;

create or replace function public.check_admin_rate_limit(p_username text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.admin_credentials%rowtype;
  v_max int := 5;
begin
  select * into v_row
  from public.admin_credentials
  where lower(trim(username)) = lower(trim(coalesce(p_username, '')))
    and is_active = true
  limit 1;
  if not found then
    return jsonb_build_object('blocked', false);
  end if;
  if v_row.blocked_until is not null and v_row.blocked_until > now() then
    return jsonb_build_object('blocked', true, 'blocked_until', v_row.blocked_until);
  end if;
  if v_row.blocked_until is not null and v_row.blocked_until <= now() then
    update public.admin_credentials
    set failed_attempts = 0, blocked_until = null, updated_at = now()
    where id = v_row.id;
  end if;
  return jsonb_build_object('blocked', false);
end;
$$;

create or replace function public.register_admin_failed_login(p_username text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.admin_credentials%rowtype;
  v_max int := 5;
  v_block interval := interval '15 minutes';
  v_window interval := interval '10 minutes';
  v_new_count int;
  v_blocked_until timestamptz;
begin
  select * into v_row
  from public.admin_credentials
  where lower(trim(username)) = lower(trim(coalesce(p_username, '')))
    and is_active = true
  limit 1;
  if not found then
    return jsonb_build_object('blocked', false);
  end if;
  if v_row.last_failed_at is null or v_row.last_failed_at < now() - v_window then
    v_new_count := 1;
  else
    v_new_count := coalesce(v_row.failed_attempts, 0) + 1;
  end if;
  v_blocked_until := case when v_new_count >= v_max then now() + v_block else null end;
  update public.admin_credentials
  set
    failed_attempts = v_new_count,
    blocked_until = v_blocked_until,
    last_failed_at = now(),
    updated_at = now()
  where id = v_row.id;
  return jsonb_build_object(
    'blocked', v_blocked_until is not null,
    'blocked_until', v_blocked_until,
    'failed_attempts', v_new_count
  );
end;
$$;

create or replace function public.clear_admin_login_attempts(p_username text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.admin_credentials
  set failed_attempts = 0, blocked_until = null, last_failed_at = null, updated_at = now()
  where lower(trim(username)) = lower(trim(coalesce(p_username, '')))
    and is_active = true;
end;
$$;

revoke all on function public.check_admin_rate_limit(text) from public;
grant execute on function public.check_admin_rate_limit(text) to anon, authenticated, service_role;
revoke all on function public.register_admin_failed_login(text) from public;
grant execute on function public.register_admin_failed_login(text) to anon, authenticated, service_role;
revoke all on function public.clear_admin_login_attempts(text) from public;
grant execute on function public.clear_admin_login_attempts(text) to service_role;
