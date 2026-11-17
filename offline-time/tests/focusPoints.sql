-- Run against the linked database with `supabase db query --remote --file tests/focusPoints.sql`.
-- Every synthetic session and transaction is rolled back.
-- v0.2: base earn is 2P per hour (10-minute steps, so 30 minutes is 1P), the primary-mode
-- multiplier is 1.0, the weekly base cap is 100P, and the ad booster adds the session's base
-- points again through claim_ad_booster.
begin;
do $$
declare
  v_user uuid;
  v_anchor timestamptz;
  v_session uuid;
  v_first public.point_transactions%rowtype;
  v_again public.point_transactions%rowtype;
  v_txn public.point_transactions%rowtype;
  v_week text;
  v_expected integer;
  v_index integer;
  v_result jsonb;
  v_other_user uuid;
  v_start timestamptz;
begin
  select id into v_user from public.users order by created_at limit 1;
  if v_user is null then raise exception 'No user available for ledger test'; end if;
  v_anchor := timestamp '2020-01-14 14:00:00' at time zone 'Asia/Seoul';
  v_week := public.week_id_for(v_anchor);
  -- 120 minutes at 2P/hour in 10-minute steps: 12 steps x 10 minutes = 4P.
  v_expected := 4;

  for v_index in 1..4 loop
    v_session := gen_random_uuid();
    insert into public.sessions (id, user_id, mode, source, client_started_at,
      client_ended_at, server_started_at, server_ended_at, status)
    values (v_session, v_user, 'focus', 'timer',
      v_anchor - make_interval(hours => (4 - v_index) * 2 + 2),
      v_anchor - make_interval(hours => (4 - v_index) * 2),
      v_anchor - make_interval(hours => (4 - v_index) * 2 + 2),
      v_anchor - make_interval(hours => (4 - v_index) * 2), 'valid');

    if v_index = 2 then
      -- Fill the week up to 98P so the next 4P session stops at the 100P base cap.
      insert into public.point_transactions
        (user_id, kind, amount, week_id, status, idempotency_key)
      values (v_user, 'earn_focus', 98 - v_first.amount, v_week,
        'pending', 'test:weekly-cap:' || gen_random_uuid()::text);
    end if;
    v_txn := public.apply_earn(v_session);
    if v_index = 1 then
      v_first := v_txn;
      if v_txn.amount <> v_expected then raise exception 'Base/bonus grant mismatch: %', v_txn.amount; end if;
      v_again := public.apply_earn(v_session);
      if v_again.id <> v_first.id then raise exception 'Duplicate grant created'; end if;
      v_result := public.finish_focus_session(v_session, v_user, null);
      if (v_result->'transaction'->>'id')::uuid <> v_first.id then
        raise exception 'Repeated session completion changed the grant';
      end if;
    elsif v_index = 2 then
      if v_txn.amount <> 2 or v_txn.note <> 'weekly_cap_reached' then
        raise exception 'Crossing weekly cap mismatch: %, %', v_txn.amount, v_txn.note;
      end if;
    elsif v_index = 3 then
      -- At the 100P base cap the session still records, at 0P with the reason on the ledger.
      if v_txn.amount <> 0 or v_txn.note <> 'weekly_cap_reached' then raise exception 'Weekly cap mismatch: %, %', v_txn.amount, v_txn.note;
      end if;
      if not exists (select 1 from public.sessions where id = v_session and status = 'valid') then
        raise exception 'A capped session stopped recording';
      end if;
      if (select public.week_id_for(server_ended_at) from public.sessions where id = v_session) <> v_week then
        raise exception 'Capped session left its week';
      end if;
    else
      if v_txn.amount <> 0 or v_txn.note <> 'daily_cap_reached' then
        raise exception 'Daily cap mismatch: %, %', v_txn.amount, v_txn.note;
      end if;
    end if;
  end loop;

  -- 30 minutes is exactly 1P, so the 30-minute preset is no longer worth zero.
  v_session := gen_random_uuid();
  insert into public.sessions (id, user_id, mode, source, client_started_at,
    client_ended_at, server_started_at, server_ended_at, status)
  values (v_session, v_user, 'focus', 'timer',
    v_anchor - interval '7 days 7 hours 30 minutes', v_anchor - interval '7 days 7 hours',
    v_anchor - interval '7 days 7 hours 30 minutes', v_anchor - interval '7 days 7 hours',
    'valid');
  v_txn := public.apply_earn(v_session);
  if v_txn.amount <> 1 then raise exception 'A 30-minute session earned %', v_txn.amount; end if;

  -- 125 minutes floors to 120 minutes and earns 4P in the previous week.
  v_session := gen_random_uuid();
  insert into public.sessions (id, user_id, mode, source, client_started_at,
    client_ended_at, server_started_at, server_ended_at, status)
  values (v_session, v_user, 'focus', 'timer',
    v_anchor - interval '7 days 2 hours 5 minutes', v_anchor - interval '7 days',
    v_anchor - interval '7 days 2 hours 5 minutes', v_anchor - interval '7 days', 'valid');
  v_txn := public.apply_earn(v_session);
  if v_txn.amount <> v_expected then
    raise exception '10-minute flooring mismatch: %', v_txn.amount;
  end if;

  v_session := gen_random_uuid();
  insert into public.sessions (id, user_id, mode, source, client_started_at,
    client_ended_at, server_started_at, server_ended_at, status, invalid_reason)
  values (v_session, v_user, 'focus', 'timer', v_anchor - interval '1 hour', v_anchor,
    v_anchor - interval '1 hour', v_anchor, 'invalid', 'clock_skew');
  v_txn := public.apply_earn(v_session);
  if v_txn.id is not null then raise exception 'Invalid session earned points'; end if;

  -- 70 minutes earns 2P: one point per 30 minutes, floored to 10-minute steps.
  select u.id into v_other_user from public.users u
    where not exists (select 1 from public.sessions s
      where s.user_id = u.id and s.status = 'open') limit 1;
  if v_other_user is not null then
    v_session := gen_random_uuid();
    v_start := clock_timestamp() - interval '70 minutes';
    insert into public.sessions (id, user_id, mode, source, client_started_at, server_started_at, status)
    values (v_session, v_other_user, 'focus', 'timer', v_start, v_start, 'open');
    v_result := public.finish_focus_session(v_session, v_other_user, clock_timestamp());
    if v_result->'session'->>'status' <> 'valid'
       or (v_result->'transaction'->>'amount')::integer <> 2 then
      raise exception 'Finishing an open session did not grant two points per hour';
    end if;
    v_first.id := (v_result->'transaction'->>'id')::uuid;
    v_result := public.finish_focus_session(v_session, v_other_user, clock_timestamp());
    if (v_result->'transaction'->>'id')::uuid <> v_first.id then
      raise exception 'Repeated finish created another grant';
    end if;
  end if;
end $$;
rollback;
