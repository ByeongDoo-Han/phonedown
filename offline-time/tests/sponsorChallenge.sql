-- Run against the linked database with `supabase db query --remote --file tests/sponsorChallenge.sql`.
-- Every synthetic account, session, participation, and coupon is rolled back.
-- 4단계 브랜드 스폰서 챌린지: 비활성 챌린지는 참여할 수 없고, 참여 시점부터 창이 열리며,
-- 달성하면 브랜드 쿠폰을 참여 1건당 1장만 발급한다. 쿠폰은 포인트 원장과 분리되어 있다.
begin;
do $$
declare
  v_user uuid;
  v_other uuid;
  v_viewer uuid;
  v_day date := public.kst_today();
  v_challenge uuid;
  v_spread uuid;
  v_part uuid;
  v_result jsonb;
  v_days integer;
  v_coupons integer;
  v_code text;
  v_visible integer;
  v_status text;
  v_joined integer;
begin
  select id into v_challenge from public.sponsor_challenges where title = '7시간 수면 5일';
  select id into v_spread from public.sponsor_challenges where title = '주말 집중 2일';
  if v_challenge is null or v_spread is null then
    raise exception 'The seeded challenges are missing';
  end if;

  insert into auth.users (id) values (gen_random_uuid()) returning id into v_user;
  insert into auth.users (id) values (gen_random_uuid()) returning id into v_other;
  insert into auth.users (id) values (gen_random_uuid()) returning id into v_viewer;
  update public.users set onboarded_at = now()
    where id in (v_user, v_other, v_viewer);

  -- 1) 씨앗은 비활성이다. 계약 전에는 참여할 수 없고, 목록에도 보이지 않는다.
  perform set_config('request.jwt.claim.sub', v_user::text, true);
  v_result := public.join_challenge(v_challenge);
  if v_result->>'reason' <> 'inactive' then
    raise exception 'An inactive challenge was joinable: %', v_result;
  end if;
  perform set_config('request.jwt.claim.sub', v_viewer::text, true);
  execute 'set local role authenticated';
  select count(*) into v_visible from public.sponsor_challenges;
  if v_visible <> 0 then
    raise exception 'Inactive challenges are visible to members: %', v_visible;
  end if;
  execute 'reset role';

  -- 2) 계약이 끝나 활성화하면 목록에 보이고 참여할 수 있다.
  update public.sponsor_challenges set active = true where id in (v_challenge, v_spread);
  perform set_config('request.jwt.claim.sub', v_viewer::text, true);
  execute 'set local role authenticated';
  select count(*) into v_visible from public.sponsor_challenges;
  if v_visible <> 2 then
    raise exception 'Active challenges should be 2, visible %', v_visible;
  end if;
  execute 'reset role';

  perform set_config('request.jwt.claim.sub', v_user::text, true);
  v_result := public.join_challenge(v_challenge);
  if (v_result->>'ok')::boolean is not true then
    raise exception 'Join was rejected: %', v_result;
  end if;
  v_part := (v_result->>'participation_id')::uuid;
  -- 같은 챌린지에 두 번 참여해도 행은 하나다(기간·진행은 새로 열린다).
  v_result := public.join_challenge(v_challenge);
  if (v_result->>'rejoined')::boolean is not true
     or (v_result->>'participation_id')::uuid <> v_part then
    raise exception 'A second join was not a rejoin: %', v_result;
  end if;
  select count(*) into v_visible from public.challenge_participations
    where challenge_id = v_challenge and user_id = v_user;
  if v_visible <> 1 then raise exception 'Duplicate participation rows'; end if;
  select joined_count into v_joined from public.sponsor_challenges where id = v_challenge;
  if v_joined < 1 then raise exception 'Joined count was not recorded'; end if;

  -- 3) 시간이 흐른 상황을 만든다: 6일 전에 참여해 7일 창이 오늘을 포함한다.
  update public.challenge_participations
    set window_start = ((v_day - 6) + time '00:00') at time zone 'Asia/Seoul'
    where id = v_part;

  -- 4) 7시간 수면 5일 연속 → 달성. 쿠폰 1장이 발급되고 포인트는 생기지 않는다.
  insert into public.sessions (user_id, mode, source, client_started_at, client_ended_at,
    server_started_at, server_ended_at, status)
  select v_user, 'sleep', 'charge',
    ((v_day - d - 1) + time '23:00') at time zone 'Asia/Seoul',
    ((v_day - d) + time '07:00') at time zone 'Asia/Seoul',
    ((v_day - d - 1) + time '23:00') at time zone 'Asia/Seoul',
    ((v_day - d) + time '07:00') at time zone 'Asia/Seoul', 'valid'
  from generate_series(0, 4) as d;

  v_result := public.refresh_challenge_progress(v_user);
  select progress_days, status into v_days, v_status
    from public.challenge_participations where id = v_part;
  if v_days <> 5 or v_status <> 'completed' then
    raise exception 'Challenge progress mismatch: % days / %', v_days, v_status;
  end if;
  select count(*) into v_coupons from public.sponsor_coupons where participation_id = v_part;
  if v_coupons <> 1 then raise exception 'Expected one coupon, got %', v_coupons; end if;
  select code into v_code from public.sponsor_coupons where participation_id = v_part;
  if v_code !~ '^SP-[0-9A-F]{10}$' then raise exception 'Coupon code format: %', v_code; end if;
  perform 1 from public.sponsor_coupons where participation_id = v_part
    and delivery_status = 'pending' and value_krw = 3000;
  if not found then raise exception 'Coupon delivery state was not recorded'; end if;
  select count(*) into v_coupons from public.point_transactions where user_id = v_user;
  if v_coupons <> 0 then
    raise exception 'A sponsor coupon must not touch the point ledger (% rows)', v_coupons;
  end if;

  -- 5) 다시 불러도 쿠폰은 한 장이고 진행은 그대로다.
  v_result := public.refresh_challenge_progress(v_user);
  select count(*) into v_coupons from public.sponsor_coupons where participation_id = v_part;
  if v_coupons <> 1 then raise exception 'Coupon was issued twice'; end if;

  -- 6) 5일을 채웠어도 연속이 아니면(가장 긴 구간 3일) 달성하지 않는다.
  perform set_config('request.jwt.claim.sub', v_other::text, true);
  v_result := public.join_challenge(v_challenge);
  v_part := (v_result->>'participation_id')::uuid;
  update public.challenge_participations
    set window_start = ((v_day - 6) + time '00:00') at time zone 'Asia/Seoul'
    where id = v_part;
  insert into public.sessions (user_id, mode, source, client_started_at, client_ended_at,
    server_started_at, server_ended_at, status)
  select v_other, 'sleep', 'charge',
    ((v_day - d - 1) + time '23:00') at time zone 'Asia/Seoul',
    ((v_day - d) + time '07:00') at time zone 'Asia/Seoul',
    ((v_day - d - 1) + time '23:00') at time zone 'Asia/Seoul',
    ((v_day - d) + time '07:00') at time zone 'Asia/Seoul', 'valid'
  from (values (0), (1), (2), (4), (5)) as g(d);
  v_result := public.refresh_challenge_progress(v_other);
  select progress_days, status into v_days, v_status
    from public.challenge_participations where id = v_part;
  if v_days <> 3 or v_status <> 'joined' then
    raise exception 'Broken run should stay at 3 days, got % / %', v_days, v_status;
  end if;

  -- 7) 연속 조건이 없는 챌린지는 떨어진 날짜 2일로도 달성한다(집중 2시간 x 2일).
  v_result := public.join_challenge(v_spread);
  if (v_result->>'ok')::boolean is not true then
    raise exception 'Spread challenge join was rejected: %', v_result;
  end if;
  v_part := (v_result->>'participation_id')::uuid;
  update public.challenge_participations
    set window_start = ((v_day - 6) + time '00:00') at time zone 'Asia/Seoul'
    where id = v_part;
  insert into public.sessions (user_id, mode, source, client_started_at, client_ended_at,
    server_started_at, server_ended_at, status)
  select v_other, 'focus', 'timer',
    ((v_day - d) + time '13:00') at time zone 'Asia/Seoul',
    ((v_day - d) + time '15:00') at time zone 'Asia/Seoul',
    ((v_day - d) + time '13:00') at time zone 'Asia/Seoul',
    ((v_day - d) + time '15:00') at time zone 'Asia/Seoul', 'valid'
  from (values (1), (5)) as g(d);
  v_result := public.refresh_challenge_progress(v_other);
  select status into v_status from public.challenge_participations where id = v_part;
  if v_status <> 'completed' then
    raise exception 'Non-consecutive challenge did not complete: %', v_status;
  end if;

  -- 8) 기간이 지나고 달성하지 못한 참여는 expired로 끝난다.
  perform set_config('request.jwt.claim.sub', v_viewer::text, true);
  v_result := public.join_challenge(v_challenge);
  v_part := (v_result->>'participation_id')::uuid;
  update public.challenge_participations
    set window_start = ((v_day - 20) + time '00:00') at time zone 'Asia/Seoul'
    where id = v_part;
  v_result := public.refresh_challenge_progress(v_viewer);
  select status into v_status from public.challenge_participations where id = v_part;
  if v_status <> 'expired' then
    raise exception 'An old participation should expire: %', v_status;
  end if;

  -- 9) 다른 사람의 참여·쿠폰은 보이지 않는다.
  perform set_config('request.jwt.claim.sub', v_viewer::text, true);
  execute 'set local role authenticated';
  select count(*) into v_visible from public.challenge_participations where user_id = v_user;
  if v_visible <> 0 then raise exception 'Another user can read participations'; end if;
  select count(*) into v_visible from public.sponsor_coupons where user_id = v_user;
  if v_visible <> 0 then raise exception 'Another user can read coupons'; end if;
  execute 'reset role';

  -- 10) 포기하면 참여 인원이 줄어든다(아직 달성하지 못한 참여만 포기할 수 있다).
  perform set_config('request.jwt.claim.sub', v_other::text, true);
  select joined_count into v_joined from public.sponsor_challenges where id = v_challenge;
  v_result := public.leave_challenge(v_challenge);
  if (v_result->>'ok')::boolean is not true then
    raise exception 'Leave failed: %', v_result;
  end if;
  select status into v_status from public.challenge_participations
    where challenge_id = v_challenge and user_id = v_other;
  if v_status <> 'abandoned' then raise exception 'Leave did not abandon: %', v_status; end if;
  perform 1 from public.sponsor_challenges
    where id = v_challenge and joined_count = v_joined - 1;
  if not found then raise exception 'Joined count was not decremented'; end if;
  -- 이미 완료한 참여는 포기할 수 없다.
  v_result := public.leave_challenge(v_spread);
  if v_result->>'reason' <> 'not_joined' then
    raise exception 'A completed participation was abandoned: %', v_result;
  end if;
end $$;
rollback;
