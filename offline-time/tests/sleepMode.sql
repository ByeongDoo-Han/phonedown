-- Run against the linked database with `supabase db query --remote --file tests/sleepMode.sql`.
-- Every synthetic session and transaction is rolled back.
-- v0.2 sleep mode: 2P/hour in 10-minute steps, a sleep record needs 40 minutes, is cut at
-- 12 hours and counts at most 10 hours a day. Sleep shares the weekly 100P base cap with
-- focus, so a night can also settle at 0P while still recording.
begin;
do $$
declare
  v_user uuid;
  v_anchor timestamptz;
  v_session uuid;
  v_result jsonb;
  v_txn public.point_transactions%rowtype;
  v_row public.sessions%rowtype;
  v_week text;
  v_goal public.users%rowtype;
begin
  select id into v_user from public.users order by created_at limit 1;
  if v_user is null then raise exception 'No user available for sleep test'; end if;
  -- A fixed 2020 KST day keeps the arithmetic away from real data. 2020-01-14 is 2020-W03.
  v_anchor := timestamp '2020-01-14 00:00:00' at time zone 'Asia/Seoul';
  v_week := public.week_id_for(v_anchor);

  -- 1) Sleep goal times are stored on the profile and read back with the profile row.
  update public.users set sleep_bedtime = '23:00', sleep_waketime = '07:00' where id = v_user;
  select * into v_goal from public.users where id = v_user;
  if v_goal.sleep_bedtime <> time '23:00' or v_goal.sleep_waketime <> time '07:00' then
    raise exception 'Sleep goal times were not stored';
  end if;

  -- 2) A 7h30m night at 2P/hour in 10-minute steps settles at 15P as an earn_sleep row.
  insert into public.sessions (id, user_id, mode, source, client_started_at, client_ended_at,
    server_started_at, server_ended_at, status, started_charging, ended_charging)
  values (gen_random_uuid(), v_user, 'sleep', 'charge',
    v_anchor + interval '1 hour', v_anchor + interval '8 hours 30 minutes',
    v_anchor + interval '1 hour', v_anchor + interval '8 hours 30 minutes', 'valid', true, true)
  returning id into v_session;
  v_txn := public.apply_earn(v_session);
  if v_txn.amount <> 15 or v_txn.kind <> 'earn_sleep' then
    raise exception 'Sleep grant mismatch: %, %', v_txn.amount, v_txn.kind;
  end if;
  if v_txn.week_id <> v_week or v_txn.status <> 'pending' then
    raise exception 'Sleep grant week or status mismatch: %, %', v_txn.week_id, v_txn.status;
  end if;

  -- 3) The sleep daily cap is 10 hours (600 minutes): a 200-minute night after 450 minutes
  --    pays only the remaining 150 minutes (5P) …
  insert into public.sessions (id, user_id, mode, source, client_started_at, client_ended_at,
    server_started_at, server_ended_at, status)
  values (gen_random_uuid(), v_user, 'sleep', 'timer',
    v_anchor + interval '9 hours', v_anchor + interval '12 hours 20 minutes',
    v_anchor + interval '9 hours', v_anchor + interval '12 hours 20 minutes', 'valid')
  returning id into v_session;
  v_txn := public.apply_earn(v_session);
  if v_txn.amount <> 5 then raise exception 'Partial daily cap mismatch: %', v_txn.amount; end if;

  --    … and a further 60-minute night records as valid but earns 0P with the reason.
  insert into public.sessions (id, user_id, mode, source, client_started_at, client_ended_at,
    server_started_at, server_ended_at, status)
  values (gen_random_uuid(), v_user, 'sleep', 'timer',
    v_anchor + interval '13 hours', v_anchor + interval '14 hours',
    v_anchor + interval '13 hours', v_anchor + interval '14 hours', 'valid')
  returning id into v_session;
  v_txn := public.apply_earn(v_session);
  if v_txn.amount <> 0 or v_txn.note <> 'daily_cap_reached' then
    raise exception 'Sleep daily cap mismatch: %, %', v_txn.amount, v_txn.note;
  end if;
  if not exists (select 1 from public.sessions where id = v_session and status = 'valid') then
    raise exception 'A sleep record stopped recording at the daily cap';
  end if;

  -- 4) The weekly 100P base cap is shared with focus: 80P of focus plus 20P of sleep fills it,
  --    and the next night (a fresh KST day, same week) records at 0P with weekly_cap_reached.
  if (select coalesce(sum(amount), 0) from public.point_transactions
      where user_id = v_user and week_id = v_week and kind = 'earn_sleep') <> 20 then
    raise exception 'Sleep rows in the test week do not add up';
  end if;
  insert into public.point_transactions (user_id, kind, amount, week_id, status, idempotency_key)
  values (v_user, 'earn_focus', 80, v_week, 'pending', 'test:sleep-weekly:' || gen_random_uuid()::text);
  insert into public.sessions (id, user_id, mode, source, client_started_at, client_ended_at,
    server_started_at, server_ended_at, status)
  values (gen_random_uuid(), v_user, 'sleep', 'charge',
    v_anchor + interval '1 day 3 hours', v_anchor + interval '1 day 4 hours',
    v_anchor + interval '1 day 3 hours', v_anchor + interval '1 day 4 hours', 'valid')
  returning id into v_session;
  v_txn := public.apply_earn(v_session);
  if v_txn.amount <> 0 or v_txn.note <> 'weekly_cap_reached' then
    raise exception 'Sleep weekly cap mismatch: %, %', v_txn.amount, v_txn.note;
  end if;

  -- 5) finish_sleep_session: under 40 minutes is invalid, 40 minutes is a valid settlement.
  insert into public.sessions (user_id, mode, source, client_started_at, server_started_at,
    status, started_charging)
  values (v_user, 'sleep', 'timer', clock_timestamp() - interval '39 minutes',
    clock_timestamp() - interval '39 minutes', 'open', false)
  returning id into v_session;
  v_result := public.finish_sleep_session(v_session, v_user, clock_timestamp(), false);
  if (v_result->'session'->>'status') <> 'invalid'
     or (v_result->'session'->>'invalid_reason') <> 'too_short' then
    raise exception 'A 39-minute night was not rejected as too short: %, %',
      v_result->'session'->>'status', v_result->'session'->>'invalid_reason';
  end if;
  if v_result->'transaction' <> 'null'::jsonb then
    raise exception 'A too-short night was paid';
  end if;

  insert into public.sessions (user_id, mode, source, client_started_at, server_started_at,
    status, started_charging)
  values (v_user, 'sleep', 'charge', clock_timestamp() - interval '45 minutes',
    clock_timestamp() - interval '45 minutes', 'open', true)
  returning id into v_session;
  v_result := public.finish_sleep_session(v_session, v_user, clock_timestamp(), true);
  if (v_result->'session'->>'status') <> 'valid' then
    raise exception 'A 45-minute night was not accepted';
  end if;
  if (v_result->'session'->>'ended_charging')::boolean is not true then
    raise exception 'The charging state was not stored on the settled night';
  end if;
  select * into v_row from public.sessions where id = v_session;
  if v_row.ended_charging is not true then raise exception 'Charging state missing on the row'; end if;

  -- 6) A night past 12 hours is cut at 12 hours and still settles once.
  insert into public.sessions (user_id, mode, source, client_started_at, server_started_at,
    status, started_charging)
  values (v_user, 'sleep', 'charge', clock_timestamp() - interval '14 hours',
    clock_timestamp() - interval '14 hours', 'open', true)
  returning id into v_session;
  v_result := public.finish_sleep_session(v_session, v_user, clock_timestamp(), true);
  if not (v_result->>'truncated')::boolean then raise exception 'A 14-hour night was not truncated'; end if;
  select * into v_row from public.sessions where id = v_session;
  if v_row.server_ended_at - v_row.server_started_at <> interval '12 hours' then
    raise exception 'The 12-hour cut did not apply: %', v_row.server_ended_at - v_row.server_started_at;
  end if;
  select * into v_txn from public.point_transactions
    where id = (v_result->'transaction'->>'id')::uuid;
  v_result := public.finish_sleep_session(v_session, v_user, clock_timestamp(), false);
  if (v_result->'transaction'->>'id')::uuid <> v_txn.id then
    raise exception 'Repeated sleep settlement created a second grant';
  end if;
  if (select count(*) from public.point_transactions
      where idempotency_key = 'session:' || v_session::text || ':earn') <> 1 then
    raise exception 'Repeated sleep settlement duplicated the ledger row';
  end if;

  -- 7) A focus record still needs only 20 minutes; the sleep rules did not tighten it.
  insert into public.sessions (user_id, mode, source, client_started_at, server_started_at, status)
  values (v_user, 'focus', 'timer', clock_timestamp() - interval '25 minutes',
    clock_timestamp() - interval '25 minutes', 'open')
  returning id into v_session;
  v_result := public.finish_focus_session(v_session, v_user, clock_timestamp());
  if (v_result->'session'->>'status') <> 'valid' then
    raise exception 'A 25-minute focus record was rejected after the sleep rules landed';
  end if;

  -- 8) Only the owner can settle a sleep record.
  begin
    perform public.finish_sleep_session(v_session, gen_random_uuid(), clock_timestamp(), false);
    raise exception 'A foreign user settled a sleep record';
  exception when sqlstate 'P0002' then null;
  end;

  raise notice 'sleepMode: all assertions passed';
end $$;
rollback;
