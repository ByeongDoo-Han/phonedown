-- Run against the linked database with `supabase db query --remote --file tests/referral.sql`.
-- Every synthetic account, session, and transaction is rolled back.
-- 4단계 친구 초대: 새 계정만 코드를 넣을 수 있고, 3일 연속 오프 라인 정산이 끝나야 양쪽 +300P,
-- 초대한 사람은 달마다 5회까지. 보상은 bonus_pool = 'referral'로 광고 부스터 풀(주 80P)과 분리된다.
begin;
do $$
declare
  v_inviter uuid;
  v_invitee uuid;
  v_other uuid;
  v_code text;
  v_code2 text;
  v_result jsonb;
  v_referral public.referrals%rowtype;
  v_day date := public.kst_today();
  v_attempt integer;
  v_sessions integer;
  v_points integer;
  v_amount integer;
  v_session uuid;
  v_base public.point_transactions%rowtype;
  v_boost jsonb;
begin
  -- 1) 새 계정은 가입과 동시에 초대 코드를 받고, 코드는 서버만 바꾼다.
  insert into auth.users (id) values (gen_random_uuid()) returning id into v_inviter;
  insert into auth.users (id) values (gen_random_uuid()) returning id into v_invitee;
  update public.users set onboarded_at = now(), primary_mode = 'both'
    where id in (v_inviter, v_invitee);
  perform set_config('request.jwt.claim.sub', v_inviter::text, true);
  v_code := public.ensure_referral_code();
  if v_code !~ '^[0-9A-F]{8}$' then
    raise exception 'Referral code format mismatch: %', v_code;
  end if;
  if public.ensure_referral_code() <> v_code then
    raise exception 'ensure_referral_code returned a different code';
  end if;
  begin
    update public.users set referral_code = 'DEADBEEF' where id = v_inviter;
    raise exception 'The referral code was changed by the user';
  exception when insufficient_privilege then null;
  end;

  -- 2) 자기 코드는 쓸 수 없다.
  v_result := public.enter_referral_code(v_code);
  if v_result->>'reason' <> 'own_code' then
    raise exception 'Own code was accepted: %', v_result;
  end if;

  -- 3) 없는 코드는 거절한다.
  v_result := public.enter_referral_code('ZZZZZZZZ');
  if v_result->>'reason' <> 'bad_format' then
    raise exception 'Bad format was not rejected: %', v_result;
  end if;
  v_result := public.enter_referral_code('0000ABCD');
  if v_result->>'reason' <> 'unknown_code' then
    raise exception 'Unknown code was not rejected: %', v_result;
  end if;

  -- 4) 초대받는 쪽은 기록이 없는 새 계정이어야 한다.
  perform set_config('request.jwt.claim.sub', v_invitee::text, true);
  insert into public.point_transactions
    (user_id, kind, amount, week_id, status, idempotency_key)
  values (v_invitee, 'adjust', 0, public.week_id_for(now()), 'void', 'test:not-new:' || v_invitee);
  v_result := public.enter_referral_code(v_code);
  if v_result->>'reason' <> 'not_new' then
    raise exception 'An earning account was invited: %', v_result;
  end if;
  delete from public.point_transactions where idempotency_key = 'test:not-new:' || v_invitee;

  -- 5) 코드 입력은 성공하지만 포인트는 아직 없다.
  v_result := public.enter_referral_code(lower(v_code));
  if (v_result->>'ok')::boolean is not true then
    raise exception 'Referral code was not accepted: %', v_result;
  end if;
  select * into v_referral from public.referrals where invitee_id = v_invitee;
  if v_referral.status <> 'pending' or v_referral.inviter_id <> v_inviter then
    raise exception 'Referral row mismatch: % / %', v_referral.status, v_referral.inviter_id;
  end if;
  select count(*) into v_points from public.point_transactions
    where user_id in (v_inviter, v_invitee) and bonus_pool = 'referral';
  if v_points <> 0 then raise exception 'Points were granted before the three days'; end if;

  -- 6) 한 계정은 한 번만 초대받는다.
  perform set_config('request.jwt.claim.sub', v_invitee::text, true);
  v_result := public.enter_referral_code(v_code);
  if v_result->>'reason' <> 'already_invited' then
    raise exception 'A second invitation was accepted: %', v_result;
  end if;

  -- 7) 2일 연속으로는 모자란다(오늘·그제만 있으면 연속 1일).
  insert into public.sessions (user_id, mode, source, client_started_at, client_ended_at,
    server_started_at, server_ended_at, status)
  values (v_invitee, 'focus', 'timer',
    ((v_day - 2) + time '10:00') at time zone 'Asia/Seoul',
    ((v_day - 2) + time '11:00') at time zone 'Asia/Seoul',
    ((v_day - 2) + time '10:00') at time zone 'Asia/Seoul',
    ((v_day - 2) + time '11:00') at time zone 'Asia/Seoul', 'valid'),
  (v_invitee, 'focus', 'timer',
    (v_day + time '10:00') at time zone 'Asia/Seoul',
    (v_day + time '11:00') at time zone 'Asia/Seoul',
    (v_day + time '10:00') at time zone 'Asia/Seoul',
    (v_day + time '11:00') at time zone 'Asia/Seoul', 'valid');
  if public.session_day_streak(v_invitee) <> 1 then
    raise exception 'Streak with a gap should be 1, got %', public.session_day_streak(v_invitee);
  end if;
  v_result := public.refresh_referral_progress(v_invitee);
  if (v_result->>'completed')::boolean is true then
    raise exception 'Referral completed on a broken streak';
  end if;

  -- 8) 어제를 채우면 3일 연속이 되고 양쪽에 300P가 들어간다.
  --    밤 수면은 끝난 날(일어난 아침)에 귀속되므로 어제 아침 7시에 끝나는 밤으로 넣는다.
  insert into public.sessions (user_id, mode, source, client_started_at, client_ended_at,
    server_started_at, server_ended_at, status)
  values (v_invitee, 'sleep', 'charge',
    ((v_day - 2) + time '23:00') at time zone 'Asia/Seoul',
    ((v_day - 1) + time '07:00') at time zone 'Asia/Seoul',
    ((v_day - 2) + time '23:00') at time zone 'Asia/Seoul',
    ((v_day - 1) + time '07:00') at time zone 'Asia/Seoul', 'valid');
  if public.session_day_streak(v_invitee) <> 3 then
    raise exception 'Three-day streak expected, got %', public.session_day_streak(v_invitee);
  end if;
  v_result := public.refresh_referral_progress(v_invitee);
  if (v_result->>'completed')::boolean is not true then
    raise exception 'Referral did not complete: %', v_result;
  end if;
  select * into v_referral from public.referrals where invitee_id = v_invitee;
  if v_referral.status <> 'completed' or v_referral.inviter_points <> 300
     or v_referral.invitee_points <> 300 or v_referral.reward_month
       <> public.kst_month(now()) then
    raise exception 'Referral reward mismatch: % / % / % / %', v_referral.status,
      v_referral.inviter_points, v_referral.invitee_points, v_referral.reward_month;
  end if;
  select count(*), coalesce(sum(amount), 0) into v_sessions, v_points
    from public.point_transactions where idempotency_key like 'referral:' || v_referral.id || ':%';
  if v_sessions <> 2 or v_points <> 600 then
    raise exception 'Expected two 300P rows, got % rows / %P', v_sessions, v_points;
  end if;
  select count(*) into v_points from public.point_transactions
    where idempotency_key like 'referral:' || v_referral.id || ':%' and bonus_pool = 'referral';
  if v_points <> 2 then raise exception 'Referral bonus pool was not recorded'; end if;

  -- 9) 다시 불러도 두 번 지급하지 않는다.
  v_result := public.refresh_referral_progress(v_invitee);
  select count(*) into v_sessions from public.point_transactions
    where idempotency_key like 'referral:' || v_referral.id || ':%';
  if v_sessions <> 2 then raise exception 'Referral was paid twice'; end if;

  -- 10) 초대한 사람은 달마다 5회까지. 6번째 친구는 친구 몫만 받는다.
  for v_attempt in 1..5 loop
    insert into auth.users (id) values (gen_random_uuid()) returning id into v_other;
    perform set_config('request.jwt.claim.sub', v_other::text, true);
    v_result := public.enter_referral_code(v_code);
    if (v_result->>'ok')::boolean is not true then
      raise exception 'Invite % was rejected: %', v_attempt, v_result;
    end if;
    insert into public.sessions (user_id, mode, source, client_started_at, client_ended_at,
      server_started_at, server_ended_at, status)
    select v_other, 'focus', 'timer',
      ((v_day - d) + time '10:00') at time zone 'Asia/Seoul',
      ((v_day - d) + time '11:00') at time zone 'Asia/Seoul',
      ((v_day - d) + time '10:00') at time zone 'Asia/Seoul',
      ((v_day - d) + time '11:00') at time zone 'Asia/Seoul', 'valid'
    from generate_series(0, 2) as d;
    v_result := public.refresh_referral_progress(v_other);
    if (v_result->>'completed')::boolean is not true then
      raise exception 'Invite % did not complete: %', v_attempt, v_result;
    end if;
    if v_attempt < 5 and (v_result->>'inviter_points')::integer <> 300 then
      raise exception 'Invite % should pay the inviter: %', v_attempt, v_result;
    end if;
    if v_attempt = 5 then
      -- 1 + 5 = 6번째 완료라 이번 달 한도(5회)에 걸린다.
      if (v_result->>'inviter_points')::integer <> 0
         or v_result->>'denied_reason' <> 'monthly_limit' then
        raise exception 'Monthly cap was not applied: %', v_result;
      end if;
      if (v_result->>'invitee_points')::integer <> 300 then
        raise exception 'The invitee lost their reward at the inviter cap: %', v_result;
      end if;
    end if;
  end loop;
  select coalesce(sum(inviter_points), 0) into v_points from public.referrals
    where inviter_id = v_inviter and status = 'completed';
  if v_points <> 1500 then
    raise exception 'Monthly referral points should be 1,500, got %', v_points;
  end if;

  -- 11) 초대 보너스는 광고 부스터 풀을 잠식하지 않는다.
  --     이번 주 광고 풀은 아직 0P이고, 초대 보너스만 1,500P 넘게 쌓여 있다.
  insert into public.sessions (id, user_id, mode, source, client_started_at, client_ended_at,
    server_started_at, server_ended_at, status)
  values (gen_random_uuid(), v_inviter, 'focus', 'timer',
    now() - interval '60 minutes', now(), now() - interval '60 minutes', now(), 'valid')
  returning id into v_session;
  v_base := public.apply_earn(v_session);
  if v_base.amount <> 2 then
    raise exception 'Base earn for 60 focus minutes should be 2P, got %', v_base.amount;
  end if;
  v_boost := public.claim_ad_booster(v_inviter, v_session, 'test-ssv-referral-pool', 'test-unit');
  if (v_boost->>'granted')::boolean is not true then
    raise exception 'Ad booster was blocked by referral bonuses: %', v_boost;
  end if;
  select (c.claim->>'bonus_points')::integer into v_amount from (select v_boost as claim) c;
  if v_amount <> 2 then
    raise exception 'Ad booster bonus should be 2P, got %', v_amount;
  end if;
  select coalesce(sum(amount), 0) into v_points from public.point_transactions
    where user_id = v_inviter and bonus_pool = 'ad' and week_id = public.week_id_for(now());
  if v_points <> 2 then
    raise exception 'Ad pool total should be 2P only, got %', v_points;
  end if;

  -- 12) 서로 초대하는 고리는 막는다(A가 B를 초대했으면 B는 A를 초대할 수 없다).
  insert into auth.users (id) values (gen_random_uuid()) returning id into v_other;
  update public.users set onboarded_at = now() where id = v_other;
  perform set_config('request.jwt.claim.sub', v_other::text, true);
  v_result := public.enter_referral_code(v_code);
  if (v_result->>'ok')::boolean is not true then
    raise exception 'The recruit for the circular test was rejected: %', v_result;
  end if;
  v_code2 := public.ensure_referral_code();
  perform set_config('request.jwt.claim.sub', v_inviter::text, true);
  v_result := public.enter_referral_code(v_code2);
  if v_result->>'reason' <> 'circular' then
    raise exception 'A circular invitation was accepted: %', v_result;
  end if;
end $$;
rollback;
