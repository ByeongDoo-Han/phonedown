-- v0.2 최종 단가·주간 상한 분리 (2026-11-17 확정안).
-- 기본 적립을 2P/시간(10분 절사)으로 올려 30분 = 1P, 1시간 = 2P가 되게 하고,
-- 주간 상한을 기본 적립 100P + 광고 부스터 80P(합계 180P)로 나눈다.
-- 기본 한도에 닿은 뒤의 세션도 기록은 그대로 남기고 0P · note 'weekly_cap_reached'로 적립한다.
-- 교환 비율(1,000원 = 1,400P)과 하루 부스터 2회는 0005의 값을 유지한다.

-- 1) 규칙값: 단가 2P/시간, 주간 상한 분리.
update public.point_rules set value = '{"sleep_per_hour":2,"focus_per_hour":2,"floor_minutes":10}',
  updated_at = now() where key = 'earn_rate';
update public.point_rules set value = '{"base_points":100,"booster_points":80,"points":180,'
  '"after_cap_multiplier":0}', updated_at = now() where key = 'weekly_cap';
update public.point_rules set value = '{"multiplier":1.0}',
  updated_at = now() where key = 'primary_bonus';
update public.point_rules set value = '{"point_to_krw":0.714,"krw_1000_points":1400}',
  updated_at = now() where key = 'currency';
update public.point_rules set value = '{"minimum_points":1400,"step_points":100}',
  updated_at = now() where key = 'redemption';

-- 2) 기본 적립: 주간 기본 상한까지만 지급하고, 넘은 세션은 0P로 기록한다.
create or replace function public.apply_earn(p_session_id uuid)
returns public.point_transactions
language plpgsql security definer set search_path = public as $$
declare
  v_session public.sessions%rowtype;
  v_txn public.point_transactions%rowtype;
  v_primary public.primary_mode;
  v_rate numeric;
  v_floor_minutes numeric;
  v_bonus numeric;
  v_daily_limit numeric;
  v_base_cap integer;
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
  -- base_points is the guaranteed earn cap; ad bonuses have their own allowance.
  select coalesce((value->>'base_points')::integer, (value->>'points')::integer) into v_base_cap
    from public.point_rules where key = 'weekly_cap';
  if v_rate is null or v_floor_minutes is null or v_floor_minutes <= 0
     or v_bonus is null or v_daily_limit is null or v_base_cap is null then
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

  -- Only the base earn is capped here. The session still records, at 0P once the cap is met.
  if v_prior_week >= v_base_cap then
    v_award := 0;
    v_note := 'weekly_cap_reached';
  else
    v_award := least(v_boosted, v_base_cap - v_prior_week);
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

-- 3) 정산 부스터: 지급액은 세션 기본 적립만큼이되, 주간 부스터 한도(80P)의 남은 만큼까지만.
create or replace function public.claim_ad_booster(
  p_user_id uuid,
  p_session_id uuid,
  p_ssv_transaction_id text,
  p_ad_unit text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_session public.sessions%rowtype;
  v_base public.point_transactions%rowtype;
  v_claim public.ad_reward_claims%rowtype;
  v_txn public.point_transactions%rowtype;
  v_multiplier numeric;
  v_daily_max integer;
  v_booster_cap integer;
  v_daily_count integer;
  v_bonus_week integer;
  v_allowance integer;
  v_bonus integer;
begin
  if p_ssv_transaction_id is null or length(btrim(p_ssv_transaction_id)) = 0
     or length(p_ssv_transaction_id) > 200 then
    raise exception 'Invalid SSV transaction id' using errcode = '22023';
  end if;

  -- All balance-changing work for a user starts with this lock.
  perform 1 from public.users where id = p_user_id for update;
  if not found then raise exception 'User profile not found' using errcode = 'P0002'; end if;

  select * into v_claim from public.ad_reward_claims
    where ssv_transaction_id = p_ssv_transaction_id;
  if found then
    if v_claim.user_id <> p_user_id then
      raise exception 'SSV transaction belongs to another user' using errcode = '22023';
    end if;
    return jsonb_build_object('claim', to_jsonb(v_claim), 'duplicate', true,
      'granted', v_claim.bonus_points > 0, 'transaction', null);
  end if;

  select * into v_session from public.sessions
    where id = p_session_id and user_id = p_user_id for update;
  if not found then raise exception 'Session not found' using errcode = 'P0002'; end if;
  if v_session.status <> 'valid' or v_session.server_ended_at is null then
    raise exception 'Only a settled session can be boosted' using errcode = '22023';
  end if;

  select * into v_claim from public.ad_reward_claims
    where session_id = p_session_id and kind = 'settlement_booster';
  if found then
    return jsonb_build_object('claim', to_jsonb(v_claim), 'duplicate', true,
      'granted', v_claim.bonus_points > 0, 'transaction', null);
  end if;

  select * into v_base from public.point_transactions
    where idempotency_key = 'session:' || p_session_id::text || ':earn'
      and status <> 'void';
  if not found then
    raise exception 'Base points are not recorded yet' using errcode = 'P0001';
  end if;
  if v_base.amount <= 0 then
    raise exception 'Session has no base points to boost' using errcode = 'P0001';
  end if;

  select (value->>'booster_multiplier')::numeric, (value->>'daily_max')::integer
    into v_multiplier, v_daily_max from public.point_rules where key = 'ads';
  select coalesce((value->>'booster_points')::integer, (value->>'points')::integer)
    into v_booster_cap from public.point_rules where key = 'weekly_cap';
  if v_multiplier is null or v_daily_max is null or v_multiplier <= 1 or v_daily_max < 0
     or v_booster_cap is null then
    raise exception 'Ad rules are incomplete';
  end if;

  select count(*) into v_daily_count from public.ad_reward_claims
    where user_id = p_user_id and kind = 'settlement_booster' and bonus_points > 0
      and claim_day = (clock_timestamp() at time zone 'Asia/Seoul')::date;
  if v_daily_count >= v_daily_max then
    insert into public.ad_reward_claims
      (user_id, kind, session_id, ad_unit, ssv_transaction_id, bonus_points, denied_reason)
    values (p_user_id, 'settlement_booster', p_session_id, p_ad_unit, p_ssv_transaction_id,
      0, 'daily_limit')
    on conflict (ssv_transaction_id) do nothing
    returning * into v_claim;
    if v_claim.id is null then
      select * into v_claim from public.ad_reward_claims
        where ssv_transaction_id = p_ssv_transaction_id;
    end if;
    return jsonb_build_object('claim', to_jsonb(v_claim), 'duplicate', false,
      'granted', false, 'transaction', null);
  end if;

  -- The ad bonus pool is the week's 80P booster allowance minus any ad bonus already granted.
  select coalesce(sum(amount), 0) into v_bonus_week from public.point_transactions
    where user_id = p_user_id and week_id = v_base.week_id and kind = 'bonus'
      and status in ('pending', 'confirmed');
  v_allowance := v_booster_cap - v_bonus_week;
  if v_allowance <= 0 then
    insert into public.ad_reward_claims
      (user_id, kind, session_id, week_id, ad_unit, ssv_transaction_id, bonus_points,
        denied_reason)
    values (p_user_id, 'settlement_booster', p_session_id, v_base.week_id, p_ad_unit,
      p_ssv_transaction_id, 0, 'weekly_booster_cap')
    on conflict (ssv_transaction_id) do nothing
    returning * into v_claim;
    if v_claim.id is null then
      select * into v_claim from public.ad_reward_claims
        where ssv_transaction_id = p_ssv_transaction_id;
    end if;
    return jsonb_build_object('claim', to_jsonb(v_claim), 'duplicate', false,
      'granted', false, 'transaction', null);
  end if;

  v_bonus := least(floor(v_base.amount * (v_multiplier - 1))::integer, v_allowance);

  insert into public.ad_reward_claims
    (user_id, kind, session_id, week_id, ad_unit, ssv_transaction_id, bonus_points)
  values (p_user_id, 'settlement_booster', p_session_id, v_base.week_id, p_ad_unit,
    p_ssv_transaction_id, v_bonus)
  returning * into v_claim;

  insert into public.point_transactions
    (user_id, kind, amount, session_id, week_id, status, note, idempotency_key)
  values (p_user_id, 'bonus', v_bonus, p_session_id, v_base.week_id, 'pending', 'ad_booster',
    'ssv:' || p_ssv_transaction_id || ':booster')
  on conflict (idempotency_key) do nothing
  returning * into v_txn;
  if v_txn.id is null then
    select * into v_txn from public.point_transactions
      where idempotency_key = 'ssv:' || p_ssv_transaction_id || ':booster';
  end if;

  update public.ad_reward_claims set transaction_id = v_txn.id
    where id = v_claim.id returning * into v_claim;

  return jsonb_build_object('claim', to_jsonb(v_claim), 'duplicate', false,
    'granted', true, 'transaction', to_jsonb(v_txn));
end $$;

-- 4) 주간 보너스 상자: 같은 주간 부스터 한도 안에서만 지급한다.
create or replace function public.claim_weekly_box(
  p_user_id uuid,
  p_ssv_transaction_id text,
  p_ad_unit text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_week_id text;
  v_claim public.ad_reward_claims%rowtype;
  v_txn public.point_transactions%rowtype;
  v_points integer;
  v_booster_cap integer;
  v_bonus_week integer;
  v_allowance integer;
  v_current_week text;
begin
  if p_ssv_transaction_id is null or length(btrim(p_ssv_transaction_id)) = 0
     or length(p_ssv_transaction_id) > 200 then
    raise exception 'Invalid SSV transaction id' using errcode = '22023';
  end if;

  perform 1 from public.users where id = p_user_id for update;
  if not found then raise exception 'User profile not found' using errcode = 'P0002'; end if;

  select * into v_claim from public.ad_reward_claims
    where ssv_transaction_id = p_ssv_transaction_id;
  if found then
    if v_claim.user_id <> p_user_id then
      raise exception 'SSV transaction belongs to another user' using errcode = '22023';
    end if;
    return jsonb_build_object('claim', to_jsonb(v_claim), 'duplicate', true,
      'granted', v_claim.bonus_points > 0, 'transaction', null);
  end if;

  select (value->>'weekly_bonus_points')::integer into v_points
    from public.point_rules where key = 'ads';
  select coalesce((value->>'booster_points')::integer, (value->>'points')::integer)
    into v_booster_cap from public.point_rules where key = 'weekly_cap';
  if v_points is null or v_points <= 0 or v_booster_cap is null then
    raise exception 'Ad rules are incomplete';
  end if;

  select max(week_id) into v_week_id from public.settlements where user_id = p_user_id;
  if v_week_id is null then
    raise exception 'No settled week to open' using errcode = 'P0001';
  end if;

  select * into v_claim from public.ad_reward_claims
    where user_id = p_user_id and week_id = v_week_id and kind = 'weekly_box';
  if found then
    return jsonb_build_object('claim', to_jsonb(v_claim), 'duplicate', true,
      'granted', v_claim.bonus_points > 0, 'transaction', null);
  end if;

  -- The box is paid into the current week, so it spends that week's booster allowance.
  v_current_week := public.week_id_for(clock_timestamp());
  select coalesce(sum(amount), 0) into v_bonus_week from public.point_transactions
    where user_id = p_user_id and week_id = v_current_week and kind = 'bonus'
      and status in ('pending', 'confirmed');
  v_allowance := v_booster_cap - v_bonus_week;
  if v_allowance <= 0 then
    insert into public.ad_reward_claims
      (user_id, kind, week_id, ad_unit, ssv_transaction_id, bonus_points, denied_reason)
    values (p_user_id, 'weekly_box', v_week_id, p_ad_unit, p_ssv_transaction_id, 0,
      'weekly_booster_cap')
    on conflict (ssv_transaction_id) do nothing
    returning * into v_claim;
    if v_claim.id is null then
      select * into v_claim from public.ad_reward_claims
        where ssv_transaction_id = p_ssv_transaction_id;
    end if;
    return jsonb_build_object('claim', to_jsonb(v_claim), 'duplicate', false,
      'granted', false, 'transaction', null);
  end if;

  v_points := least(v_points, v_allowance);

  insert into public.ad_reward_claims
    (user_id, kind, week_id, ad_unit, ssv_transaction_id, bonus_points)
  values (p_user_id, 'weekly_box', v_week_id, p_ad_unit, p_ssv_transaction_id, v_points)
  returning * into v_claim;

  insert into public.point_transactions
    (user_id, kind, amount, week_id, status, note, idempotency_key)
  values (p_user_id, 'bonus', v_points, v_current_week, 'pending', 'weekly_box:' || v_week_id,
    'weekly:' || v_week_id || ':box')
  on conflict (idempotency_key) do nothing
  returning * into v_txn;
  if v_txn.id is null then
    select * into v_txn from public.point_transactions
      where idempotency_key = 'weekly:' || v_week_id || ':box';
  end if;

  update public.ad_reward_claims set transaction_id = v_txn.id
    where id = v_claim.id returning * into v_claim;

  return jsonb_build_object('claim', to_jsonb(v_claim), 'duplicate', false,
    'granted', true, 'transaction', to_jsonb(v_txn));
end $$;

-- 5) 소액 교환 라인업 씨앗: 1,400P = 1,000원 기준으로 가격을 맞춘 상품.
--    실제 발송 수단이 준비되기 전까지는 active = false로 두어 교환소에 노출하지 않는다.
insert into public.products (name, type, points, stock, active, sort_order)
select v.name, v.type, v.points, null, false, v.sort_order
from (values
  ('네이버페이 포인트 1,000원', 'naverpay', 1400, 10),
  ('메가커피 아메리카노', 'coupon', 2800, 20),
  ('컬처랜드 상품권 5,000원', 'coupon', 7000, 30)
) as v(name, type, points, sort_order)
where not exists (select 1 from public.products p where p.name = v.name);

revoke all on function public.claim_ad_booster(uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function public.claim_weekly_box(uuid, text, text) from public, anon, authenticated;
grant execute on function public.claim_ad_booster(uuid, uuid, text, text) to service_role;
grant execute on function public.claim_weekly_box(uuid, text, text) to service_role;
