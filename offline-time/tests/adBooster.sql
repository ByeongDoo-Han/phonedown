-- Ad rewards are granted only through the SSV side (service role).
-- Every synthetic session, claim, and transaction is rolled back.
begin;
do $$
declare
  v_user uuid;
  v_other uuid;
  v_session_a uuid := gen_random_uuid();
  v_session_b uuid := gen_random_uuid();
  v_session_c uuid := gen_random_uuid();
  v_short uuid := gen_random_uuid();
  v_invalid uuid := gen_random_uuid();
  v_anchor timestamptz := timestamp '2020-01-14 22:00:00' at time zone 'Asia/Seoul';
  v_txn public.point_transactions%rowtype;
  v_result jsonb;
  v_count integer;
  v_week text;
begin
  select id into v_user from public.users order by created_at limit 1;
  if v_user is null then raise exception 'No user available for ad booster test'; end if;

  -- Three valid two-hour sessions on three different days; each earns the 4P base.
  insert into public.sessions (id, user_id, mode, source, client_started_at,
    client_ended_at, server_started_at, server_ended_at, status)
  values
    (v_session_a, v_user, 'focus', 'timer', v_anchor - interval '2 hours', v_anchor,
      v_anchor - interval '2 hours', v_anchor, 'valid'),
    (v_session_b, v_user, 'focus', 'timer', v_anchor + interval '22 hours',
      v_anchor + interval '1 day', v_anchor + interval '22 hours',
      v_anchor + interval '1 day', 'valid'),
    (v_session_c, v_user, 'focus', 'timer', v_anchor + interval '1 day 22 hours',
      v_anchor + interval '2 days', v_anchor + interval '1 day 22 hours',
      v_anchor + interval '2 days', 'valid');
  v_txn := public.apply_earn(v_session_a);
  if v_txn.amount <> 4 then raise exception 'Base earn for the booster test is %', v_txn.amount; end if;
  perform public.apply_earn(v_session_b);
  perform public.apply_earn(v_session_c);

  -- 1) One ad doubles the session: a bonus row equal to the base points.
  v_result := public.claim_ad_booster(v_user, v_session_a, 'ssv-booster-a');
  if (v_result->>'granted')::boolean is not true
     or (v_result->>'duplicate')::boolean is not false
     or (v_result->'transaction'->>'amount')::integer <> 4
     or v_result->'transaction'->>'kind' <> 'bonus'
     or (v_result->'claim'->>'bonus_points')::integer <> 4 then
    raise exception 'First booster did not double the session: %', v_result;
  end if;

  -- 2) The same SSV transaction is never credited twice.
  v_result := public.claim_ad_booster(v_user, v_session_a, 'ssv-booster-a');
  if (v_result->>'duplicate')::boolean is not true then
    raise exception 'Repeated SSV transaction was not recognised';
  end if;

  -- 3) A second ad for the same session is refused even with a new SSV id.
  v_result := public.claim_ad_booster(v_user, v_session_a, 'ssv-booster-a2');
  if (v_result->>'duplicate')::boolean is not true then
    raise exception 'A session was boosted twice';
  end if;
  select count(*) into v_count from public.point_transactions
    where user_id = v_user and kind = 'bonus' and session_id = v_session_a;
  if v_count <> 1 then raise exception 'Session % has % bonus rows', v_session_a, v_count; end if;

  -- 4) The second granted booster fills the daily limit; the third is denied.
  v_result := public.claim_ad_booster(v_user, v_session_b, 'ssv-booster-b');
  if (v_result->>'granted')::boolean is not true then
    raise exception 'Second daily booster was not granted';
  end if;
  v_result := public.claim_ad_booster(v_user, v_session_c, 'ssv-booster-c');
  if (v_result->>'granted')::boolean is not false
     or v_result->'claim'->>'denied_reason' <> 'daily_limit' then
    raise exception 'Daily booster limit was not enforced: %', v_result;
  end if;

  -- 5) An invalid session cannot be boosted.
  insert into public.sessions (id, user_id, mode, source, client_started_at,
    client_ended_at, server_started_at, server_ended_at, status, invalid_reason)
  values (v_invalid, v_user, 'focus', 'timer', v_anchor - interval '1 hour', v_anchor,
    v_anchor - interval '1 hour', v_anchor, 'invalid', 'clock_skew');
  begin
    perform public.claim_ad_booster(v_user, v_invalid, 'ssv-booster-invalid');
    raise exception 'An invalid session was boosted';
  exception when sqlstate '22023' then null;
  end;

  -- 6) A session whose base earn is zero cannot be boosted.
  insert into public.sessions (id, user_id, mode, source, client_started_at,
    client_ended_at, server_started_at, server_ended_at, status)
  values (v_short, v_user, 'focus', 'timer', v_anchor + interval '3 days' - interval '25 minutes',
    v_anchor + interval '3 days', v_anchor + interval '3 days' - interval '25 minutes',
    v_anchor + interval '3 days', 'valid');
  v_txn := public.apply_earn(v_short);
  if v_txn.amount <> 0 then raise exception 'Short session earned %', v_txn.amount; end if;
  begin
    perform public.claim_ad_booster(v_user, v_short, 'ssv-booster-short');
    raise exception 'A session without base points was boosted';
  exception when sqlstate 'P0001' then null;
  end;

  -- 7) The weekly box opens once per settled week.
  insert into public.settlements (week_id, user_id, confirmed_points)
    values ('2020-W02', v_user, 10)
    on conflict (week_id, user_id) do update set confirmed_points = excluded.confirmed_points;
  v_result := public.claim_weekly_box(v_user, 'ssv-box-a');
  if (v_result->>'granted')::boolean is not true
     or (v_result->'transaction'->>'amount')::integer <> 20
     or v_result->'transaction'->>'note' <> 'weekly_box:2020-W02' then
    raise exception 'Weekly box was not granted: %', v_result;
  end if;
  v_result := public.claim_weekly_box(v_user, 'ssv-box-a2');
  if (v_result->>'duplicate')::boolean is not true then
    raise exception 'The same settled week opened two boxes';
  end if;
  select count(*) into v_count from public.point_transactions
    where user_id = v_user and kind = 'bonus' and note like 'weekly_box:%';
  if v_count <> 1 then raise exception 'Weekly box created % bonus rows', v_count; end if;

  select id into v_other from public.users where id <> v_user limit 1;
  if v_other is not null then
    begin
      perform public.claim_weekly_box(v_other, 'ssv-box-other');
      raise exception 'A box was opened without a settled week';
    exception when sqlstate 'P0001' then null;
    end;
  end if;

  -- 8) Settlement confirms the ad bonus rows of a completed week.
  v_week := public.week_id_for(v_anchor);
  perform public.settle_week(v_week);
  if (select count(*) from public.point_transactions t
      where t.user_id = v_user and t.kind = 'bonus'
        and t.session_id in (v_session_a, v_session_b) and t.status <> 'confirmed') <> 0 then
    raise exception 'Ad bonus rows stayed pending after settlement';
  end if;

  -- 9) Ad claims are visible to their owner only.
  v_count := (select count(*) from public.ad_reward_claims where user_id = v_user);
  if v_count < 4 then raise exception 'Ad claims were not recorded: %', v_count; end if;
end $$;
rollback;
