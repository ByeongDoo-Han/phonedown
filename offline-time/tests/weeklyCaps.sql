-- v0.2 split weekly cap: 100P base earn + 80P ad booster.
-- Every synthetic session, transaction, and claim is rolled back.
begin;
do $$
declare
  v_user uuid;
  v_other uuid;
  v_week text;
  v_anchor timestamptz := timestamp '2021-03-10 12:00:00' at time zone 'Asia/Seoul';
  v_session uuid;
  v_txn public.point_transactions%rowtype;
  v_result jsonb;
  v_third uuid;
  v_fourth uuid;
begin
  select id into v_user from public.users order by created_at limit 1;
  if v_user is null then raise exception 'No user available for weekly cap test'; end if;
  v_week := public.week_id_for(v_anchor);

  -- 30 minutes = 1P, 60 minutes = 2P.
  v_session := gen_random_uuid();
  insert into public.sessions (id, user_id, mode, source, client_started_at,
    client_ended_at, server_started_at, server_ended_at, status)
  values (v_session, v_user, 'focus', 'timer', v_anchor - interval '1 hour',
    v_anchor - interval '30 minutes', v_anchor - interval '1 hour',
    v_anchor - interval '30 minutes', 'valid');
  v_txn := public.apply_earn(v_session);
  if v_txn.amount <> 1 then raise exception '30 minutes earned %', v_txn.amount; end if;

  v_session := gen_random_uuid();
  insert into public.sessions (id, user_id, mode, source, client_started_at,
    client_ended_at, server_started_at, server_ended_at, status)
  values (v_session, v_user, 'focus', 'timer', v_anchor - interval '2 hours 30 minutes',
    v_anchor - interval '1 hour 30 minutes', v_anchor - interval '2 hours 30 minutes',
    v_anchor - interval '1 hour 30 minutes', 'valid');
  v_txn := public.apply_earn(v_session);
  if v_txn.amount <> 2 then raise exception '60 minutes earned %', v_txn.amount; end if;

  -- Bring the week to 98P so the next session is cut at the 100P base cap.
  insert into public.point_transactions (user_id, kind, amount, week_id, status, idempotency_key)
  values (v_user, 'earn_sleep', 95, v_week, 'pending', 'test:cap-fill:' || gen_random_uuid()::text);

  v_third := gen_random_uuid();
  insert into public.sessions (id, user_id, mode, source, client_started_at,
    client_ended_at, server_started_at, server_ended_at, status)
  values (v_third, v_user, 'sleep', 'charge', v_anchor - interval '4 hours',
    v_anchor - interval '3 hours', v_anchor - interval '4 hours',
    v_anchor - interval '3 hours', 'valid');
  v_txn := public.apply_earn(v_third);
  if v_txn.amount <> 2 or v_txn.note <> 'weekly_cap_reached' then
    raise exception 'Crossing the base cap gave %, %', v_txn.amount, v_txn.note;
  end if;

  -- Past the cap the session still records, at 0P with the reason on the row.
  v_fourth := gen_random_uuid();
  insert into public.sessions (id, user_id, mode, source, client_started_at,
    client_ended_at, server_started_at, server_ended_at, status)
  values (v_fourth, v_user, 'sleep', 'charge', v_anchor - interval '6 hours',
    v_anchor - interval '5 hours', v_anchor - interval '6 hours',
    v_anchor - interval '5 hours', 'valid');
  v_txn := public.apply_earn(v_fourth);
  if v_txn.amount <> 0 or v_txn.note <> 'weekly_cap_reached' then
    raise exception 'A capped session gave %, %', v_txn.amount, v_txn.note;
  end if;
  if (select status from public.sessions where id = v_fourth) <> 'valid' then
    raise exception 'A capped session was not kept as a valid record';
  end if;

  -- The 100P base cap is separate from the 80P ad booster pool.
  v_result := public.claim_ad_booster(v_user, v_third, 'ssv-cap-a');
  if (v_result->>'granted')::boolean is not true
     or (v_result->'claim'->>'bonus_points')::integer <> 2 then
    raise exception 'Booster above the base cap was not granted: %', v_result;
  end if;

  insert into public.point_transactions
    (user_id, kind, amount, week_id, status, idempotency_key, bonus_pool)
  values (v_user, 'bonus', 78, v_week, 'pending', 'test:booster-fill:' || gen_random_uuid()::text,
    'ad');

  select id into v_other from public.users where id <> v_user limit 1;
  if v_other is not null then
    -- A second user fills the booster pool to 79P: the next booster is cut to 1P.
    v_session := gen_random_uuid();
    insert into public.sessions (id, user_id, mode, source, client_started_at,
      client_ended_at, server_started_at, server_ended_at, status)
    values (v_session, v_other, 'focus', 'timer', v_anchor - interval '1 hour',
      v_anchor, v_anchor - interval '1 hour', v_anchor, 'valid');
    v_txn := public.apply_earn(v_session);
    if v_txn.amount <> 2 then raise exception 'Other user base earn is %', v_txn.amount; end if;
    insert into public.point_transactions
      (user_id, kind, amount, week_id, status, idempotency_key, bonus_pool)
    values (v_other, 'bonus', 79, v_week, 'pending',
      'test:other-booster-fill:' || gen_random_uuid()::text, 'ad');

    v_result := public.claim_ad_booster(v_other, v_session, 'ssv-cap-d');
    if (v_result->>'granted')::boolean is not true
       or (v_result->'claim'->>'bonus_points')::integer <> 1
       or (v_result->'transaction'->>'amount')::integer <> 1 then
      raise exception 'A booster past the pool was not cut to the remainder: %', v_result;
    end if;
    v_result := public.claim_ad_booster(v_other, v_session, 'ssv-cap-e');
    if (v_result->>'duplicate')::boolean is not true then
      raise exception 'The same session was boosted twice';
    end if;

    insert into public.settlements (week_id, user_id, confirmed_points)
      values (v_week, v_other, 0) on conflict (week_id, user_id) do nothing;
    -- The box pays into the current week, so a full current-week pool also blocks it.
    insert into public.point_transactions
      (user_id, kind, amount, week_id, status, idempotency_key, bonus_pool)
    values (v_other, 'bonus', 80, public.week_id_for(clock_timestamp()), 'pending',
      'test:current-pool:' || gen_random_uuid()::text, 'ad');
    v_result := public.claim_weekly_box(v_other, 'ssv-cap-box');
    if (v_result->>'granted')::boolean is not false
       or v_result->'claim'->>'denied_reason' <> 'weekly_booster_cap' then
      raise exception 'The weekly box ignored the booster pool: %', v_result;
    end if;
  end if;

  -- Total week: base earn never passes 100P, ad bonus never passes 80P.
  if (select coalesce(sum(amount), 0) from public.point_transactions
      where user_id = v_user and week_id = v_week
        and kind in ('earn_sleep', 'earn_focus') and status in ('pending', 'confirmed')) > 100 then
    raise exception 'Base earn passed the 100P weekly cap';
  end if;
  if (select coalesce(sum(amount), 0) from public.point_transactions
      where user_id = v_user and week_id = v_week and kind = 'bonus'
        and status in ('pending', 'confirmed')) > 80 then
    raise exception 'Ad booster passed the 80P weekly cap';
  end if;
end $$;
rollback;

-- A 0P booster claim is recorded with its reason once the pool is spent.
begin;
do $$
declare
  v_user uuid;
  v_week text;
  v_anchor timestamptz := timestamp '2021-04-14 12:00:00' at time zone 'Asia/Seoul';
  v_session uuid := gen_random_uuid();
  v_txn public.point_transactions%rowtype;
  v_result jsonb;
begin
  select id into v_user from public.users order by created_at limit 1;
  if v_user is null then raise exception 'No user available for booster cap test'; end if;
  v_week := public.week_id_for(v_anchor);

  insert into public.sessions (id, user_id, mode, source, client_started_at,
    client_ended_at, server_started_at, server_ended_at, status)
  values (v_session, v_user, 'sleep', 'charge', v_anchor - interval '8 hours',
    v_anchor, v_anchor - interval '8 hours', v_anchor, 'valid');
  v_txn := public.apply_earn(v_session);
  if v_txn.amount <> 16 then raise exception 'Eight hours earned %', v_txn.amount; end if;

  insert into public.point_transactions
    (user_id, kind, amount, week_id, status, idempotency_key, bonus_pool)
  values (v_user, 'bonus', 80, v_week, 'pending', 'test:pool-full:' || gen_random_uuid()::text,
    'ad');

  v_result := public.claim_ad_booster(v_user, v_session, 'ssv-pool-full');
  if (v_result->>'granted')::boolean is not false
     or v_result->'claim'->>'denied_reason' <> 'weekly_booster_cap' then
    raise exception 'A full booster pool still paid: %', v_result;
  end if;
  if (select count(*) from public.point_transactions
      where user_id = v_user and week_id = v_week and kind = 'bonus'
        and status in ('pending', 'confirmed')) <> 1 then
    raise exception 'A denied booster wrote a bonus row';
  end if;
end $$;
rollback;
