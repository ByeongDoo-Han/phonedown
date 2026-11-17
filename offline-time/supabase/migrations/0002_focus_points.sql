-- Point grants are made only by service-role calls. All calculations use server timestamps.
create function public.week_id_for(p_time timestamptz) returns text
language sql stable security definer set search_path = public as $$
  select to_char(p_time at time zone 'Asia/Seoul', 'IYYY-"W"IW');
$$;

create function public.apply_earn(p_session_id uuid) returns public.point_transactions
language plpgsql security definer set search_path = public as $$
declare
  v_session public.sessions%rowtype;
  v_txn public.point_transactions%rowtype;
  v_primary public.primary_mode;
  v_rate numeric;
  v_floor_minutes numeric;
  v_bonus numeric;
  v_daily_limit numeric;
  v_weekly_cap integer;
  v_week_id text;
  v_day timestamp;
  v_day_start timestamptz;
  v_day_end timestamptz;
  v_prior_minutes numeric;
  v_current_minutes numeric;
  v_eligible_minutes numeric := 0;
  v_steps numeric;
  v_base integer;
  v_boosted integer;
  v_prior_week integer;
  v_award integer;
  v_note text;
begin
  select * into v_session from public.sessions where id = p_session_id for update;
  if not found or v_session.status <> 'valid' or v_session.server_ended_at is null then
    return null;
  end if;

  -- Serializes all grants for a user, including grants for different sessions.
  select primary_mode into v_primary from public.users where id = v_session.user_id for update;
  if not found then raise exception 'User profile not found'; end if;
  select * into v_txn from public.point_transactions
    where idempotency_key = 'session:' || p_session_id::text || ':earn';
  if found then return v_txn; end if;

  select (value->>case when v_session.mode = 'focus' then 'focus_per_hour' else 'sleep_per_hour' end)::numeric,
         (value->>'floor_minutes')::numeric
    into v_rate, v_floor_minutes from public.point_rules where key = 'earn_rate';
  select (value->>'multiplier')::numeric into v_bonus
    from public.point_rules where key = 'primary_bonus';
  select (value->>v_session.mode::text)::numeric into v_daily_limit
    from public.point_rules where key = 'daily_cap_minutes';
  select (value->>'points')::integer into v_weekly_cap
    from public.point_rules where key = 'weekly_cap';
  if v_rate is null or v_floor_minutes is null or v_floor_minutes <= 0
     or v_bonus is null or v_daily_limit is null or v_weekly_cap is null then
    raise exception 'Point rules are incomplete';
  end if;

  -- Divide a session at KST midnight so the daily limit applies to each day.
  for v_day in select generate_series(
    date_trunc('day', v_session.server_started_at at time zone 'Asia/Seoul'),
    date_trunc('day', v_session.server_ended_at at time zone 'Asia/Seoul'),
    interval '1 day') loop
    v_day_start := v_day at time zone 'Asia/Seoul';
    v_day_end := (v_day + interval '1 day') at time zone 'Asia/Seoul';
    select coalesce(sum(extract(epoch from
      least(s.server_ended_at, v_day_end) - greatest(s.server_started_at, v_day_start)) / 60), 0)
      into v_prior_minutes from public.sessions s
      where s.user_id = v_session.user_id and s.mode = v_session.mode
        and s.status = 'valid' and s.id <> p_session_id
        and s.server_started_at < v_session.server_started_at
        and s.server_started_at < v_day_end and s.server_ended_at > v_day_start;
    v_current_minutes := greatest(0, extract(epoch from
      least(v_session.server_ended_at, v_day_end)
      - greatest(v_session.server_started_at, v_day_start)) / 60);
    v_eligible_minutes := v_eligible_minutes
      + least(v_current_minutes, greatest(0, v_daily_limit - v_prior_minutes));
  end loop;

  v_steps := floor(v_eligible_minutes / v_floor_minutes);
  v_base := floor(v_steps * v_floor_minutes * v_rate / 60);
  v_boosted := case when v_primary = 'both' or v_primary::text = v_session.mode::text
    then floor(v_steps * v_floor_minutes * v_rate * v_bonus / 60)
    else v_base end;
  v_week_id := public.week_id_for(v_session.server_ended_at);
  select coalesce(sum(amount), 0) into v_prior_week from public.point_transactions
    where user_id = v_session.user_id and week_id = v_week_id
      and kind in ('earn_focus', 'earn_sleep') and status in ('pending', 'confirmed');

  -- The crossing session stops at 180P. Later sessions accrue at the base rate.
  if v_prior_week >= v_weekly_cap then
    v_award := v_base;
    v_note := 'weekly_bonus_cap_reached';
  else
    v_award := least(v_boosted, v_weekly_cap - v_prior_week);
    if v_award < v_boosted then v_note := 'weekly_cap_reached'; end if;
  end if;
  if v_eligible_minutes <= 0 then v_note := 'daily_cap_reached'; end if;

  insert into public.point_transactions
    (user_id, kind, amount, session_id, week_id, status, note, idempotency_key)
  values (v_session.user_id,
    case when v_session.mode = 'focus' then 'earn_focus'::public.txn_kind else 'earn_sleep'::public.txn_kind end,
    v_award, p_session_id, v_week_id, 'pending', v_note,
    'session:' || p_session_id::text || ':earn')
  on conflict (idempotency_key) do nothing returning * into v_txn;
  if v_txn.id is null then
    select * into v_txn from public.point_transactions
      where idempotency_key = 'session:' || p_session_id::text || ':earn';
  end if;
  return v_txn;
end $$;

create function public.finish_focus_session(
  p_session_id uuid, p_user_id uuid, p_client_ended_at timestamptz
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_session public.sessions%rowtype;
  v_txn public.point_transactions%rowtype;
  v_now timestamptz;
  v_min_minutes integer;
  v_max_minutes integer;
begin
  select * into v_session from public.sessions
    where id = p_session_id and user_id = p_user_id and mode = 'focus' for update;
  if not found then raise exception 'Focus session not found' using errcode = 'P0002'; end if;

  if v_session.status = 'open' then
    v_now := clock_timestamp();
    select (value->>'focus')::integer into v_min_minutes
      from public.point_rules where key = 'session_min_minutes';
    select (value->>'focus')::integer into v_max_minutes
      from public.point_rules where key = 'session_max_minutes';
    if v_min_minutes is null or v_max_minutes is null then
      raise exception 'Session rules are incomplete';
    end if;
    update public.sessions set
      client_ended_at = coalesce(p_client_ended_at, v_now),
      server_ended_at = greatest(server_started_at,
        least(v_now, server_started_at + make_interval(mins => v_max_minutes))),
      status = case
        when p_client_ended_at is null
          or abs(extract(epoch from p_client_ended_at - v_now)) > 120 then 'invalid'::public.session_status
        when v_now - server_started_at < make_interval(mins => v_min_minutes) then 'invalid'::public.session_status
        else 'valid'::public.session_status end,
      invalid_reason = case
        when p_client_ended_at is null
          or abs(extract(epoch from p_client_ended_at - v_now)) > 120 then 'clock_skew'
        when v_now - server_started_at < make_interval(mins => v_min_minutes) then 'too_short'
        else null end
      where id = p_session_id returning * into v_session;
  end if;
  if v_session.status = 'valid' then v_txn := public.apply_earn(p_session_id); end if;
  return jsonb_build_object('session', to_jsonb(v_session),
    'transaction', case when v_txn.id is null then null else to_jsonb(v_txn) end);
end $$;

revoke all on function public.week_id_for(timestamptz) from public, anon, authenticated;
revoke all on function public.apply_earn(uuid) from public, anon, authenticated;
revoke all on function public.finish_focus_session(uuid, uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.week_id_for(timestamptz) to service_role;
grant execute on function public.apply_earn(uuid) to service_role;
grant execute on function public.finish_focus_session(uuid, uuid, timestamptz) to service_role;
