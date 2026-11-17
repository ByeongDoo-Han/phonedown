-- v0.2 수익·원가 방어 구조.
-- 기본 적립을 낮추고(1시간 = 1P) 광고를 본 만큼만 부스터로 더 주며,
-- 교환 비율을 1P ≈ 0.714원(1,000원 = 1,400P)으로 조정한다.
-- 포인트를 만드는 경로는 여전히 서버(service_role)뿐이고, 광고 보상은 AdMob SSV 콜백만 인정한다.

-- 1) 교환 단가: 100P 단위, 최소 100P 상품까지 허용한다.
--    실제 교환 가능 여부는 point_rules('redemption')의 최소·단위 값으로 다시 검사한다.
alter table public.products drop constraint if exists products_points_check;
alter table public.products add constraint products_points_check
  check (points >= 100 and points % 100 = 0) not valid;
do $$
begin
  if exists (select 1 from public.products where points < 100 or points % 100 <> 0) then
    raise warning 'products with points below 100 or not in 100 steps keep the old rows; '
      'fix their points before validating products_points_check';
  else
    alter table public.products validate constraint products_points_check;
  end if;
end $$;

-- 2) 규칙값: 기본 단가 1P/시간, 주력 모드 1.5배는 광고 부스터로 대체(1.0배),
--    교환 비율 1P ≈ 0.714원, 광고 부스터·주간 상자·교환 전면 광고 슬롯을 켠다.
update public.point_rules set value = '{"sleep_per_hour":1,"focus_per_hour":1,"floor_minutes":10}',
  updated_at = now() where key = 'earn_rate';
update public.point_rules set value = '{"multiplier":1.0}',
  updated_at = now() where key = 'primary_bonus';
update public.point_rules set value = '{"point_to_krw":0.714,"krw_1000_points":1400}',
  updated_at = now() where key = 'currency';
update public.point_rules set value = '{"minimum_points":1400,"step_points":100}',
  updated_at = now() where key = 'redemption';
update public.point_rules set value = '{"morning_max":1,"focus_max":1,"on_launch":false,'
  '"settlement_booster":true,"booster_multiplier":2,"daily_max":2,'
  '"weekly_box":true,"weekly_bonus_points":20,"redeem_interstitial":true}',
  updated_at = now() where key = 'ads';

-- 3) 광고 보상 원장: SSV 거래 1건은 한 번만, 세션 1건은 부스터 1회, 정산 주 1회는 상자 1개.
create table public.ad_reward_claims (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  kind text not null check (kind in ('settlement_booster', 'weekly_box')),
  session_id uuid references public.sessions(id) on delete set null,
  week_id text,
  ad_unit text,
  ssv_transaction_id text not null,
  bonus_points integer not null default 0 check (bonus_points >= 0),
  transaction_id uuid references public.point_transactions(id) on delete set null,
  denied_reason text,
  claim_day date not null default ((now() at time zone 'Asia/Seoul')::date),
  created_at timestamptz not null default now()
);
create unique index ad_reward_claims_ssv_idx on public.ad_reward_claims (ssv_transaction_id);
create unique index ad_reward_claims_session_idx on public.ad_reward_claims (session_id)
  where kind = 'settlement_booster';
create unique index ad_reward_claims_week_idx on public.ad_reward_claims (user_id, week_id)
  where kind = 'weekly_box';
create index ad_reward_claims_user_day_idx on public.ad_reward_claims (user_id, claim_day, kind);

alter table public.ad_reward_claims enable row level security;
create policy ad_reward_claims_read_own on public.ad_reward_claims
  for select to authenticated using (user_id = (select auth.uid()));
grant select on public.ad_reward_claims to authenticated;

-- 4) 정산 부스터: 세션 기본 적립만큼 bonus 거래를 한 번 더 넣어 합계를 2배로 만든다.
create function public.claim_ad_booster(
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
  v_daily_count integer;
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
  if v_multiplier is null or v_daily_max is null or v_multiplier <= 1 or v_daily_max < 0 then
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

  v_bonus := floor(v_base.amount * (v_multiplier - 1))::integer;

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

-- 5) 주간 보너스 상자: 정산이 끝난 가장 최근 주에 대해 광고 1편으로 1회만.
create function public.claim_weekly_box(
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
  if v_points is null or v_points <= 0 then
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

  insert into public.ad_reward_claims
    (user_id, kind, week_id, ad_unit, ssv_transaction_id, bonus_points)
  values (p_user_id, 'weekly_box', v_week_id, p_ad_unit, p_ssv_transaction_id, v_points)
  returning * into v_claim;

  -- The box belongs to the current week so the next settlement confirms it.
  v_current_week := public.week_id_for(clock_timestamp());
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

-- 6) 정산은 기본 적립과 광고 보너스를 함께 확정한다.
create or replace function public.settle_week(p_week_id text) returns integer
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
      where week_id = p_week_id and kind in ('earn_focus', 'earn_sleep', 'bonus')
        and status in ('pending', 'confirmed') order by user_id
  loop
    -- The same user-row lock serializes grants, settlement, and redemption.
    perform 1 from public.users where id = v_user_id for update;
    update public.point_transactions set status = 'confirmed', confirmed_at = clock_timestamp()
      where user_id = v_user_id and week_id = p_week_id and status = 'pending'
        and kind in ('earn_focus', 'earn_sleep', 'bonus');
    get diagnostics v_changed = row_count;
    v_total_changed := v_total_changed + v_changed;
    select coalesce(sum(amount), 0)::integer into v_confirmed
      from public.point_transactions where user_id = v_user_id and week_id = p_week_id
        and status = 'confirmed' and kind in ('earn_focus', 'earn_sleep', 'bonus');
    insert into public.settlements (week_id, user_id, confirmed_points)
      values (p_week_id, v_user_id, v_confirmed)
      on conflict (week_id, user_id) do update
        set confirmed_points = excluded.confirmed_points;
  end loop;
  return v_total_changed;
end $$;

create or replace function public.settle_due_weeks() returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_week_id text;
  v_total integer := 0;
begin
  for v_week_id in select distinct week_id from public.point_transactions
    where status = 'pending' and kind in ('earn_focus', 'earn_sleep', 'bonus')
      and week_id < public.week_id_for(clock_timestamp()) order by week_id
  loop
    v_total := v_total + public.settle_week(v_week_id);
  end loop;
  return v_total;
end $$;

revoke all on function public.claim_ad_booster(uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function public.claim_weekly_box(uuid, text, text) from public, anon, authenticated;
grant execute on function public.claim_ad_booster(uuid, uuid, text, text) to service_role;
grant execute on function public.claim_weekly_box(uuid, text, text) to service_role;
