-- Confirm completed KST weeks. Amounts stay immutable; only transaction status changes.
create function public.confirmed_balance(p_user_id uuid) returns integer
language sql stable security definer set search_path = public as $$
  select coalesce(sum(amount), 0)::integer from public.point_transactions
    where user_id = p_user_id and status = 'confirmed';
$$;

create function public.wallet_summary() returns jsonb
language sql stable security invoker set search_path = public as $$
  select jsonb_build_object(
    'confirmed_points', coalesce(sum(amount) filter (where status = 'confirmed'), 0),
    'pending_points', coalesce(sum(amount) filter (where status = 'pending'), 0))
  from public.point_transactions where user_id = (select auth.uid());
$$;

create function public.settle_week(p_week_id text) returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_user_id uuid;
  v_changed integer;
  v_total_changed integer := 0;
  v_confirmed integer;
begin
  if p_week_id !~ '^[0-9]{4}-W(0[1-9]|[1-4][0-9]|5[0-3])$'
     or p_week_id >= public.week_id_for(clock_timestamp()) then
    raise exception 'Only a completed ISO week can be settled' using errcode = '22023';
  end if;

  for v_user_id in
    select distinct user_id from public.point_transactions
      where week_id = p_week_id and kind in ('earn_focus', 'earn_sleep')
        and status in ('pending', 'confirmed') order by user_id
  loop
    -- The same user-row lock serializes grants, settlement, and redemption.
    perform 1 from public.users where id = v_user_id for update;
    update public.point_transactions set status = 'confirmed', confirmed_at = clock_timestamp()
      where user_id = v_user_id and week_id = p_week_id and status = 'pending'
        and kind in ('earn_focus', 'earn_sleep');
    get diagnostics v_changed = row_count;
    v_total_changed := v_total_changed + v_changed;
    select coalesce(sum(amount), 0)::integer into v_confirmed
      from public.point_transactions where user_id = v_user_id and week_id = p_week_id
        and status = 'confirmed' and kind in ('earn_focus', 'earn_sleep');
    insert into public.settlements (week_id, user_id, confirmed_points)
      values (p_week_id, v_user_id, v_confirmed)
      on conflict (week_id, user_id) do update
        set confirmed_points = excluded.confirmed_points;
  end loop;
  return v_total_changed;
end $$;

create function public.settle_due_weeks() returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_week_id text;
  v_total integer := 0;
begin
  for v_week_id in select distinct week_id from public.point_transactions
    where status = 'pending' and kind in ('earn_focus', 'earn_sleep')
      and week_id < public.week_id_for(clock_timestamp()) order by week_id
  loop
    v_total := v_total + public.settle_week(v_week_id);
  end loop;
  return v_total;
end $$;

revoke all on function public.confirmed_balance(uuid) from public, anon, authenticated;
revoke all on function public.wallet_summary() from public, anon;
revoke all on function public.settle_week(text) from public, anon, authenticated;
revoke all on function public.settle_due_weeks() from public, anon, authenticated;
grant execute on function public.confirmed_balance(uuid) to service_role;
grant execute on function public.wallet_summary() to authenticated;
grant execute on function public.settle_week(text) to service_role;
grant execute on function public.settle_due_weeks() to service_role;

-- The database timezone is UTC. 15:00 UTC is 00:00 KST the next day.
-- Run daily so a late grant for a completed week is confirmed on the next day.
create extension if not exists pg_cron with schema pg_catalog;
grant usage on schema cron to postgres;
grant all privileges on all tables in schema cron to postgres;
select cron.schedule('offline-time-settle-due-weeks', '0 15 * * *',
  'select public.settle_due_weeks()');
