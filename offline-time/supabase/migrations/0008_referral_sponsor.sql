-- 4단계: 친구 초대(레퍼럴) + 브랜드 스폰서 챌린지/쿠폰.
-- 포인트를 만드는 경로는 그대로 서버(security definer · service_role)뿐이고, 앱은 만들 수 없다.
--   * 친구 초대: 초대받은 친구가 3일 연속 오프라인 정산을 마치면 양쪽 +300P, 초대한 사람은 월 5회까지.
--   * 스폰서 챌린지: 브랜드가 거는 달성 조건(모드·하루 최소 시간·일수)을 채우면 브랜드 쿠폰을 발급한다.
--     쿠폰은 포인트 원장과 분리해 기록하고, 실제 발급·발송은 브랜드/운영자 몫이다(자동 발송 없음).
--
-- 두 기능의 보너스는 광고 부스터 풀(주 80P)을 잠식하지 않아야 한다. 0006의 claim_ad_booster /
-- claim_weekly_box는 그 주의 bonus 합계를 광고 풀 사용량으로 보므로, bonus_pool 열로 풀을 나누고
-- 광고 함수들은 bonus_pool = 'ad'만 세도록 다시 정의한다.

-- 1) 보너스 풀 구분: 지금까지의 bonus는 모두 광고(부스터·주간 상자)에서 나온 것이다.
alter table public.point_transactions add column if not exists bonus_pool text;
update public.point_transactions set bonus_pool = 'ad'
  where kind = 'bonus' and bonus_pool is null;
alter table public.point_transactions drop constraint if exists point_txn_bonus_pool_check;
alter table public.point_transactions add constraint point_txn_bonus_pool_check
  check (bonus_pool is null or bonus_pool in ('ad', 'referral', 'sponsor_challenge')) not valid;
alter table public.point_transactions validate constraint point_txn_bonus_pool_check;
comment on column public.point_transactions.bonus_pool is
  'bonus 거래가 어느 한도에서 나왔는지(ad=주 80P 광고 풀, referral=월 5회 초대 한도, sponsor_challenge=챌린지). 광고 풀 계산은 ad만 센다.';

alter table public.point_transactions drop constraint if exists point_txn_bonus_pool_required;
alter table public.point_transactions add constraint point_txn_bonus_pool_required
  check (kind <> 'bonus' or bonus_pool is not null) not valid;
alter table public.point_transactions validate constraint point_txn_bonus_pool_required;

-- 같은 이유로 append-only 트리거가 bonus_pool도 보호해야 한다.
create or replace function public.forbid_amount_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.amount is distinct from old.amount
    or new.kind is distinct from old.kind
    or new.user_id is distinct from old.user_id
    or new.idempotency_key is distinct from old.idempotency_key
    or new.session_id is distinct from old.session_id
    or new.redemption_id is distinct from old.redemption_id
    or new.week_id is distinct from old.week_id
    or new.bonus_pool is distinct from old.bonus_pool then
    raise exception 'point_transactions is append-only';
  end if;
  return new;
end $$;

-- 2) 광고 부스터: 지급 한도는 그 주의 광고 풀(bonus_pool = 'ad') 사용량만 본다.
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

  -- The ad bonus pool is the week's 80P allowance minus the ad bonus already granted.
  -- Referral and sponsor bonuses live in their own pools and are not counted here.
  select coalesce(sum(amount), 0) into v_bonus_week from public.point_transactions
    where user_id = p_user_id and week_id = v_base.week_id and kind = 'bonus'
      and bonus_pool = 'ad' and status in ('pending', 'confirmed');
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
    (user_id, kind, amount, session_id, week_id, status, note, idempotency_key, bonus_pool)
  values (p_user_id, 'bonus', v_bonus, p_session_id, v_base.week_id, 'pending', 'ad_booster',
    'ssv:' || p_ssv_transaction_id || ':booster', 'ad')
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

-- 3) 주간 보너스 상자: 같은 광고 풀 안에서만 지급한다.
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

  -- The box is paid into the current week, so it spends that week's ad allowance.
  v_current_week := public.week_id_for(clock_timestamp());
  select coalesce(sum(amount), 0) into v_bonus_week from public.point_transactions
    where user_id = p_user_id and week_id = v_current_week and kind = 'bonus'
      and bonus_pool = 'ad' and status in ('pending', 'confirmed');
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
    (user_id, kind, amount, week_id, status, note, idempotency_key, bonus_pool)
  values (p_user_id, 'bonus', v_points, v_current_week, 'pending', 'weekly_box:' || v_week_id,
    'weekly:' || v_week_id || ':box', 'ad')
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

revoke all on function public.claim_ad_booster(uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function public.claim_weekly_box(uuid, text, text) from public, anon, authenticated;
grant execute on function public.claim_ad_booster(uuid, uuid, text, text) to service_role;
grant execute on function public.claim_weekly_box(uuid, text, text) to service_role;

-- 4) 날짜 유틸: 서버는 UTC, 규칙은 KST 벽시계 기준이다.
create or replace function public.kst_today() returns date
language sql stable as $$ select (now() at time zone 'Asia/Seoul')::date $$;

create or replace function public.kst_month(p_time timestamptz) returns text
language sql stable as $$ select to_char(p_time at time zone 'Asia/Seoul', 'YYYY-MM') $$;

-- 오늘(어제까지)로 이어지는 KST 연속 정산 일수. 유효 세션이 끝난 날을 하루로 센다.
-- 오늘·어제에 기록이 없으면 0 — 지난주에 만든 연속 기록으로 보상을 받을 수는 없다.
create or replace function public.session_day_streak(p_user_id uuid) returns integer
language sql stable security definer set search_path = public as $$
  with days as (
    select distinct (s.server_ended_at at time zone 'Asia/Seoul')::date as d
    from public.sessions s
    where s.user_id = p_user_id and s.status = 'valid' and s.server_ended_at is not null
  ), runs as (
    select d, d - (row_number() over (order by d))::integer as grp from days
  )
  select case
    when (select max(d) from days) is null then 0
    when (select max(d) from days) < public.kst_today() - 1 then 0
    else coalesce((
      select count(*)::integer from runs
      where grp = (select grp from runs order by d desc limit 1)
    ), 0)
  end;
$$;

revoke all on function public.session_day_streak(uuid) from public, anon, authenticated;
grant execute on function public.session_day_streak(uuid) to service_role;

-- 5) 친구 초대 ------------------------------------------------------------------------

-- 초대 코드는 사용자당 하나. 8자리 대문자 16진수라 0/O, 1/I처럼 헷갈리는 글자가 없다.
alter table public.users add column if not exists referral_code text;
create unique index if not exists users_referral_code_key on public.users (referral_code);
comment on column public.users.referral_code is
  '친구 초대 코드(8자리 대문자 16진수). 앱에서 만들고, 사용자가 바꿀 수 없다(트리거로 보호).';

-- 코드는 앱이 아니라 서버가 만든다. 사용자가 자기 코드를 마음대로 바꾸면 초대 관계가 흔들린다.
create or replace function public.forbid_referral_code_change() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.referral_code is not null and new.referral_code is distinct from old.referral_code then
    raise exception 'referral_code is issued by the server' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists users_referral_code_guard on public.users;
create trigger users_referral_code_guard before update on public.users
  for each row execute function public.forbid_referral_code_change();

create or replace function public.new_referral_code() returns text
language plpgsql volatile set search_path = public as $$
declare
  v_code text;
  v_try integer := 0;
begin
  loop
    v_try := v_try + 1;
    -- 8 uppercase hex characters: no 0/O or 1/I confusion when a friend types it.
    v_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
    exit when not exists (select 1 from public.users where referral_code = v_code);
    if v_try >= 10 then raise exception 'Could not allocate a referral code'; end if;
  end loop;
  return v_code;
end $$;

-- A profile row now gets a code at signup so the invite screen never waits for one.
create or replace function public.create_user_profile() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.users (id, referral_code) values (new.id, public.new_referral_code());
  return new;
end $$;

update public.users set referral_code = public.new_referral_code()
  where referral_code is null;

create table public.referrals (
  id uuid primary key default gen_random_uuid(),
  inviter_id uuid not null references public.users(id) on delete cascade,
  invitee_id uuid not null unique references public.users(id) on delete cascade,
  code text not null,
  status text not null default 'pending' check (status in ('pending', 'completed', 'void')),
  progress_days integer not null default 0 check (progress_days >= 0),
  inviter_points integer not null default 0 check (inviter_points >= 0),
  invitee_points integer not null default 0 check (invitee_points >= 0),
  denied_reason text,
  reward_month text,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  check (inviter_id <> invitee_id)
);
create index referrals_inviter_idx on public.referrals (inviter_id, created_at desc);
-- 한 사람이 한 달에 받을 수 있는 횟수(기본 5회)는 refresh_referral_progress가 센다.
-- (inviter_id, reward_month) 유니크 인덱스를 두면 한 달에 1건으로 막혀 버린다.

alter table public.referrals enable row level security;
create policy referrals_read_own on public.referrals for select to authenticated
  using (inviter_id = (select auth.uid()) or invitee_id = (select auth.uid()));
grant select on public.referrals to authenticated;

-- 내 코드를 돌려준다(없으면 만든다). 앱은 이 값을 공유 링크와 입력 화면에 쓴다.
create or replace function public.ensure_referral_code() returns text
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := (select auth.uid());
  v_code text;
begin
  if v_user is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  select referral_code into v_code from public.users where id = v_user for update;
  if v_code is null then
    v_code := public.new_referral_code();
    update public.users set referral_code = v_code where id = v_user;
  end if;
  return v_code;
end $$;

-- 초대 코드 입력. 성공해도 포인트는 바로 주지 않는다 — 3일 연속 정산이 끝나야 지급한다.
-- 새 계정만 넣을 수 있다(이미 기록이 있는 계정이 코드를 넣어 보상을 가져가는 길을 막는다).
create or replace function public.enter_referral_code(p_code text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := (select auth.uid());
  v_code text;
  v_inviter public.users%rowtype;
  v_rules jsonb;
  v_existing public.referrals%rowtype;
begin
  if v_user is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  v_code := upper(btrim(coalesce(p_code, '')));
  if v_code !~ '^[0-9A-F]{8}$' then
    return jsonb_build_object('ok', false, 'reason', 'bad_format');
  end if;

  perform 1 from public.users where id = v_user for update;
  if not found then
    raise exception 'User profile not found' using errcode = 'P0002';
  end if;

  select * into v_existing from public.referrals where invitee_id = v_user;
  if found then
    return jsonb_build_object('ok', false, 'reason', 'already_invited');
  end if;

  select * into v_inviter from public.users where referral_code = v_code;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'unknown_code');
  end if;
  if v_inviter.id = v_user then
    return jsonb_build_object('ok', false, 'reason', 'own_code');
  end if;
  if v_inviter.onboarded_at is null then
    return jsonb_build_object('ok', false, 'reason', 'inviter_not_ready');
  end if;
  -- A→B, B→A 서로 초대해 서로에게 보상을 주는 고리를 막는다.
  if exists (select 1 from public.referrals
    where inviter_id = v_user and invitee_id = v_inviter.id) then
    return jsonb_build_object('ok', false, 'reason', 'circular');
  end if;
  -- 기록이 하나라도 있는 계정은 "친구 초대" 대상이 아니다.
  if exists (select 1 from public.point_transactions where user_id = v_user)
     or exists (select 1 from public.sessions where user_id = v_user and status = 'valid') then
    return jsonb_build_object('ok', false, 'reason', 'not_new');
  end if;

  select value into v_rules from public.point_rules where key = 'referral';
  insert into public.referrals (inviter_id, invitee_id, code)
    values (v_inviter.id, v_user, v_code)
    returning * into v_existing;

  return jsonb_build_object('ok', true, 'referral', jsonb_build_object(
    'id', v_existing.id, 'status', v_existing.status,
    'required_days', coalesce((v_rules->>'required_days')::integer, 3),
    'progress_days', 0));
end $$;

-- 초대 현황: 내 코드, 이번 달 지급 횟수, 초대 목록.
create or replace function public.referral_summary() returns jsonb
language sql stable security definer set search_path = public as $$
  with me as (select (select auth.uid()) as id),
  rules as (select value from public.point_rules where key = 'referral'),
  sent as (
    select r.* from public.referrals r, me where r.inviter_id = me.id
  )
  select jsonb_build_object(
    'code', (select referral_code from public.users, me where users.id = me.id),
    'points', coalesce((select (value->>'points')::integer from rules), 300),
    'required_days', coalesce((select (value->>'required_days')::integer from rules), 3),
    'monthly_limit', coalesce((select (value->>'monthly_max')::integer from rules), 5),
    'monthly_completed', (select count(*) from sent
      where status = 'completed' and reward_month = public.kst_month(now())
      and inviter_points > 0),
    'monthly_points', (select coalesce(sum(inviter_points), 0) from sent
      where status = 'completed' and reward_month = public.kst_month(now())),
    'pending_count', (select count(*) from sent where status = 'pending'),
    'completed_count', (select count(*) from sent where status = 'completed'),
    'invites', coalesce((select jsonb_agg(jsonb_build_object(
      'id', s.id, 'status', s.status,
      'progress_days', least(s.progress_days, coalesce((select (value->>'required_days')::integer
        from rules), 3)),
      'required_days', coalesce((select (value->>'required_days')::integer from rules), 3),
      'inviter_points', s.inviter_points,
      'denied_reason', s.denied_reason,
      'created_at', s.created_at, 'completed_at', s.completed_at
    ) order by s.created_at desc) from sent s), '[]'::jsonb)
  );
$$;

-- 3일 연속 정산이 끝난 초대를 완료 처리하고 양쪽에 보너스를 넣는다.
-- 지급은 bonus_pool = 'referral'. 광고 풀(주 80P)·기본 적립(주 100P)과 별개 한도다.
create or replace function public.refresh_referral_progress(p_user_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_referral public.referrals%rowtype;
  v_rules jsonb;
  v_required integer;
  v_points integer;
  v_monthly_max integer;
  v_month text;
  v_streak integer;
  v_completed integer;
  v_inviter_points integer := 0;
  v_invitee_points integer := 0;
  v_denied text;
  v_week text;
  v_lock record;
begin
  select * into v_referral from public.referrals
    where invitee_id = p_user_id and status = 'pending' for update;
  if not found then
    return jsonb_build_object('changed', false);
  end if;

  v_streak := public.session_day_streak(p_user_id);
  update public.referrals set progress_days = v_streak where id = v_referral.id;
  if v_streak < 1 then
    return jsonb_build_object('changed', false, 'progress_days', 0);
  end if;

  select value into v_rules from public.point_rules where key = 'referral';
  v_required := coalesce((v_rules->>'required_days')::integer, 3);
  v_points := coalesce((v_rules->>'points')::integer, 300);
  v_monthly_max := coalesce((v_rules->>'monthly_max')::integer, 5);
  if v_required < 1 or v_points < 0 or v_monthly_max < 0 then
    raise exception 'Referral rules are incomplete';
  end if;
  if v_streak < v_required then
    return jsonb_build_object('changed', true, 'progress_days', v_streak);
  end if;

  -- Both balance-changing sides lock their user rows in id order.
  for v_lock in
    select id from public.users
    where id in (v_referral.inviter_id, v_referral.invitee_id) order by id for update
  loop
    null;
  end loop;

  v_month := public.kst_month(now());
  select count(*) into v_completed from public.referrals
    where inviter_id = v_referral.inviter_id and status = 'completed'
      and reward_month = v_month and inviter_points > 0;
  if v_completed >= v_monthly_max then
    v_denied := 'monthly_limit';
  else
    v_inviter_points := v_points;
  end if;
  -- The invitee keeps their reward even when the inviter's month is full:
  -- they did the three days.
  v_invitee_points := v_points;

  v_week := public.week_id_for(clock_timestamp());
  if v_inviter_points > 0 then
    insert into public.point_transactions
      (user_id, kind, amount, week_id, status, note, idempotency_key, bonus_pool)
    values (v_referral.inviter_id, 'bonus', v_inviter_points, v_week, 'pending',
      'referral_inviter:' || v_referral.id::text,
      'referral:' || v_referral.id::text || ':inviter', 'referral')
    on conflict (idempotency_key) do nothing;
  end if;
  if v_invitee_points > 0 then
    insert into public.point_transactions
      (user_id, kind, amount, week_id, status, note, idempotency_key, bonus_pool)
    values (v_referral.invitee_id, 'bonus', v_invitee_points, v_week, 'pending',
      'referral_invitee:' || v_referral.id::text,
      'referral:' || v_referral.id::text || ':invitee', 'referral')
    on conflict (idempotency_key) do nothing;
  end if;

  update public.referrals set
    status = 'completed', completed_at = clock_timestamp(), reward_month = v_month,
    progress_days = v_streak, inviter_points = v_inviter_points,
    invitee_points = v_invitee_points, denied_reason = v_denied
    where id = v_referral.id returning * into v_referral;

  return jsonb_build_object('changed', true, 'completed', true,
    'progress_days', v_streak, 'inviter_points', v_inviter_points,
    'invitee_points', v_invitee_points, 'denied_reason', v_denied);
end $$;

revoke all on function public.ensure_referral_code() from public, anon;
revoke all on function public.enter_referral_code(text) from public, anon;
revoke all on function public.referral_summary() from public, anon;
revoke all on function public.refresh_referral_progress(uuid) from public, anon, authenticated;
revoke all on function public.new_referral_code() from public, anon, authenticated;
grant execute on function public.ensure_referral_code() to authenticated;
grant execute on function public.enter_referral_code(text) to authenticated;
grant execute on function public.referral_summary() to authenticated;
grant execute on function public.refresh_referral_progress(uuid) to service_role;
grant execute on function public.new_referral_code() to service_role;

-- 6) 브랜드 스폰서 챌린지 -------------------------------------------------------------

create table public.sponsors (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  segment text not null check (segment in ('sleep_recovery', 'focus_growth', 'both')),
  contact text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
comment on table public.sponsors is
  '스폰서 챌린지를 거는 브랜드. segment는 온보딩 주력 모드와 맞춰 노출 순서를 정한다.';

create table public.sponsor_challenges (
  id uuid primary key default gen_random_uuid(),
  sponsor_id uuid not null references public.sponsors(id) on delete cascade,
  title text not null,
  description text,
  segment text not null check (segment in ('sleep_recovery', 'focus_growth', 'both')),
  mode public.session_mode not null,
  target_days integer not null check (target_days between 1 and 31),
  min_minutes_per_day integer not null check (min_minutes_per_day between 1 and 1440),
  window_days integer not null check (window_days between 1 and 60),
  consecutive boolean not null default true,
  reward_title text not null,
  reward_value_krw integer not null default 0 check (reward_value_krw >= 0),
  capacity integer check (capacity is null or capacity > 0),
  joined_count integer not null default 0 check (joined_count >= 0),
  active boolean not null default false,
  starts_at timestamptz,
  ends_at timestamptz,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  check (window_days >= target_days)
);
create index sponsor_challenges_active_idx on public.sponsor_challenges (active, sort_order);

create table public.challenge_participations (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references public.sponsor_challenges(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  status text not null default 'joined'
    check (status in ('joined', 'completed', 'abandoned', 'expired')),
  window_start timestamptz not null default now(),
  progress_days integer not null default 0 check (progress_days >= 0),
  joined_at timestamptz not null default now(),
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (challenge_id, user_id)
);
create index challenge_participations_user_idx
  on public.challenge_participations (user_id, status);

create table public.sponsor_coupons (
  id uuid primary key default gen_random_uuid(),
  participation_id uuid not null unique
    references public.challenge_participations(id) on delete cascade,
  challenge_id uuid not null references public.sponsor_challenges(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  code text not null unique,
  reward_title text not null,
  value_krw integer not null default 0 check (value_krw >= 0),
  delivery_status text not null default 'pending'
    check (delivery_status in ('pending', 'sent', 'failed')),
  issued_at timestamptz not null default now(),
  delivered_at timestamptz
);
comment on table public.sponsor_coupons is
  '브랜드 쿠폰 발급 기록. 포인트 원장과 분리되어 있고, 실제 발송은 브랜드/운영자가 처리한다.';

alter table public.sponsors enable row level security;
alter table public.sponsor_challenges enable row level security;
alter table public.challenge_participations enable row level security;
alter table public.sponsor_coupons enable row level security;

create policy sponsors_read on public.sponsors for select to authenticated using (active = true);
create policy sponsor_challenges_read on public.sponsor_challenges for select to authenticated
  using (active = true or exists (
    select 1 from public.challenge_participations p
    where p.challenge_id = sponsor_challenges.id and p.user_id = (select auth.uid())));
create policy challenge_participations_read_own on public.challenge_participations
  for select to authenticated using (user_id = (select auth.uid()));
create policy sponsor_coupons_read_own on public.sponsor_coupons
  for select to authenticated using (user_id = (select auth.uid()));

grant select on public.sponsors to authenticated;
grant select on public.sponsor_challenges to authenticated;
grant select on public.challenge_participations to authenticated;
grant select on public.sponsor_coupons to authenticated;

-- 챌린지 진행: 창(window) 안에서 그 모드 유효 세션이 min_minutes_per_day 이상인 KST 날짜 수.
-- 연속 조건이면 그중 가장 긴 연속 구간을 센다. 한 세션은 끝난 날에 귀속된다(밤 수면은 일어난 날).
create or replace function public.challenge_progress_days(
  p_user_id uuid, p_mode public.session_mode, p_min_minutes integer,
  p_from timestamptz, p_to timestamptz, p_consecutive boolean
) returns integer
language sql stable security definer set search_path = public as $$
  with per_day as (
    select (s.server_ended_at at time zone 'Asia/Seoul')::date as d,
           sum(extract(epoch from (s.server_ended_at - s.server_started_at)) / 60) as minutes
    from public.sessions s
    where s.user_id = p_user_id and s.status = 'valid' and s.server_ended_at is not null
      and s.mode = p_mode
      and s.server_ended_at >= p_from and s.server_ended_at < p_to
    group by 1
  ), qualified as (
    select d from per_day where minutes >= p_min_minutes
  ), runs as (
    select d, d - (row_number() over (order by d))::integer as grp from qualified
  )
  select coalesce(case when p_consecutive
    then (select max(cnt) from (select count(*) as cnt from runs group by grp) r)
    else (select count(*) from qualified) end, 0)::integer;
$$;

revoke all on function public.challenge_progress_days(uuid, public.session_mode, integer,
  timestamptz, timestamptz, boolean) from public, anon, authenticated;
grant execute on function public.challenge_progress_days(uuid, public.session_mode, integer,
  timestamptz, timestamptz, boolean) to service_role;

-- 챌린지 참여. 참여 시점부터 창이 열린다(참여 전 기록으로 소급 달성되지 않는다).
create or replace function public.join_challenge(p_challenge_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := (select auth.uid());
  v_challenge public.sponsor_challenges%rowtype;
  v_part public.challenge_participations%rowtype;
  v_joined boolean;
begin
  if v_user is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  perform 1 from public.users where id = v_user for update;
  if not found then raise exception 'User profile not found' using errcode = 'P0002'; end if;

  select * into v_challenge from public.sponsor_challenges
    where id = p_challenge_id for update;
  if not found then
    raise exception 'Challenge not found' using errcode = 'P0002';
  end if;

  select * into v_part from public.challenge_participations
    where challenge_id = p_challenge_id and user_id = v_user for update;
  v_joined := found;
  if v_joined and v_part.status = 'completed' then
    return jsonb_build_object('ok', false, 'reason', 'already_completed',
      'participation_id', v_part.id);
  end if;

  if not v_challenge.active then
    return jsonb_build_object('ok', false, 'reason', 'inactive');
  end if;
  if v_challenge.starts_at is not null and v_challenge.starts_at > now() then
    return jsonb_build_object('ok', false, 'reason', 'not_started');
  end if;
  if v_challenge.ends_at is not null and v_challenge.ends_at <= now() then
    return jsonb_build_object('ok', false, 'reason', 'ended');
  end if;

  if v_joined then
    -- 포기했거나 기간이 끝난 챌린지에 다시 참여하면 창을 새로 연다.
    update public.challenge_participations set status = 'joined', progress_days = 0,
      window_start = now(), joined_at = now(), completed_at = null, updated_at = now()
      where id = v_part.id returning * into v_part;
    update public.sponsor_challenges set joined_count = joined_count + 1
      where id = p_challenge_id;
    return jsonb_build_object('ok', true, 'participation_id', v_part.id, 'rejoined', true);
  end if;

  if v_challenge.capacity is not null and v_challenge.joined_count >= v_challenge.capacity then
    return jsonb_build_object('ok', false, 'reason', 'capacity');
  end if;

  insert into public.challenge_participations (challenge_id, user_id, window_start)
    values (p_challenge_id, v_user, now()) returning * into v_part;
  update public.sponsor_challenges set joined_count = joined_count + 1
    where id = p_challenge_id;

  return jsonb_build_object('ok', true, 'participation_id', v_part.id);
end $$;

create or replace function public.leave_challenge(p_challenge_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := (select auth.uid());
  v_part public.challenge_participations%rowtype;
begin
  if v_user is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  select * into v_part from public.challenge_participations
    where challenge_id = p_challenge_id and user_id = v_user for update;
  if not found or v_part.status <> 'joined' then
    return jsonb_build_object('ok', false, 'reason', 'not_joined');
  end if;
  update public.challenge_participations set status = 'abandoned', updated_at = now()
    where id = v_part.id;
  update public.sponsor_challenges set joined_count = greatest(0, joined_count - 1)
    where id = p_challenge_id;
  return jsonb_build_object('ok', true);
end $$;

-- 달성 판정과 쿠폰 발급. 참여 1건당 쿠폰 1장(participation_id 유니크)이라 여러 번 실행해도 한 장이다.
create or replace function public.refresh_challenge_progress(p_user_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_part public.challenge_participations%rowtype;
  v_challenge public.sponsor_challenges%rowtype;
  v_window_end timestamptz;
  v_days integer;
  v_completed integer := 0;
  v_changed boolean := false;
  v_coupon public.sponsor_coupons%rowtype;
begin
  for v_part in
    select * from public.challenge_participations
    where user_id = p_user_id and status = 'joined' order by joined_at for update
  loop
    select * into v_challenge from public.sponsor_challenges where id = v_part.challenge_id;
    if not found then continue; end if;
    v_window_end := v_part.window_start + make_interval(days => v_challenge.window_days);
    if v_challenge.ends_at is not null and v_challenge.ends_at < v_window_end then
      v_window_end := v_challenge.ends_at;
    end if;

    v_days := public.challenge_progress_days(p_user_id, v_challenge.mode,
      v_challenge.min_minutes_per_day, v_part.window_start, v_window_end,
      v_challenge.consecutive);

    if v_days <> v_part.progress_days then
      update public.challenge_participations set progress_days = v_days, updated_at = now()
        where id = v_part.id;
      v_changed := true;
    end if;

    if v_days < v_challenge.target_days and now() >= v_window_end then
      -- 기간이 끝났는데 달성하지 못했으면 더 이상 진행하지 않는다.
      update public.challenge_participations set status = 'expired', updated_at = now()
        where id = v_part.id;
      v_changed := true;
      continue;
    end if;

    if v_days >= v_challenge.target_days then
      update public.challenge_participations set status = 'completed',
        completed_at = coalesce(completed_at, now()), updated_at = now()
        where id = v_part.id;
      insert into public.sponsor_coupons
        (participation_id, challenge_id, user_id, code, reward_title, value_krw)
      values (v_part.id, v_challenge.id, p_user_id,
        'SP-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10)),
        v_challenge.reward_title, v_challenge.reward_value_krw)
      on conflict (participation_id) do nothing
      returning * into v_coupon;
      v_completed := v_completed + 1;
      v_changed := true;
    end if;
  end loop;
  return jsonb_build_object('changed', v_changed, 'completed', v_completed);
end $$;

-- 세션 정산 직후 한 번 부르는 통합 갱신: 초대 진행 + 챌린지 진행.
-- session-end Edge Function이 유효 세션을 정산한 뒤 호출한다(실패해도 기록은 남는다).
create or replace function public.refresh_growth_progress(p_user_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  return jsonb_build_object(
    'referral', public.refresh_referral_progress(p_user_id),
    'challenge', public.refresh_challenge_progress(p_user_id));
end $$;

revoke all on function public.join_challenge(uuid) from public, anon;
revoke all on function public.leave_challenge(uuid) from public, anon;
revoke all on function public.refresh_challenge_progress(uuid) from public, anon, authenticated;
revoke all on function public.refresh_growth_progress(uuid) from public, anon, authenticated;
grant execute on function public.join_challenge(uuid) to authenticated;
grant execute on function public.leave_challenge(uuid) to authenticated;
grant execute on function public.refresh_challenge_progress(uuid) to service_role;
grant execute on function public.refresh_growth_progress(uuid) to service_role;

-- 7) 규칙값
insert into public.point_rules (key, value) values
  ('referral', '{"points":300,"required_days":3,"monthly_max":5,"state":"active"}'),
  ('sponsor', '{"coupon_delivery":"manual","max_joined_per_user":3}')
on conflict (key) do update set value = excluded.value, updated_at = now();

-- 8) 씨앗: 브랜드 계약과 쿠폰 발송 수단이 없으므로 챌린지는 active = false로만 넣는다.
--    실제 계약 뒤에 active를 켠다. 테스트로 열려면:
--      update public.sponsor_challenges set active = true where title = '7시간 수면 5일';
insert into public.sponsors (id, name, segment, active)
select '00000000-0000-4000-8000-000000000001'::uuid, '오프라인 타임 제휴 준비', 'both', false
where not exists (select 1 from public.sponsors where name = '오프라인 타임 제휴 준비');

insert into public.sponsor_challenges
  (sponsor_id, title, description, segment, mode, target_days, min_minutes_per_day,
   window_days, consecutive, reward_title, reward_value_krw, active, sort_order)
select v.sponsor_id, v.title, v.description, v.segment, v.mode::public.session_mode, v.target_days,
  v.min_minutes_per_day, v.window_days, v.consecutive, v.reward_title, v.reward_value_krw,
  false, v.sort_order
from (values
  ('00000000-0000-4000-8000-000000000001'::uuid,
   '7시간 수면 5일', '5일 동안 하루 7시간 이상 수면을 기록하면 브랜드 쿠폰을 드려요.',
   'sleep_recovery', 'sleep', 5, 420, 7, true, '수면용품 브랜드 쿠폰', 3000, 10),
  ('00000000-0000-4000-8000-000000000001'::uuid,
   '1시간 집중 5일', '5일 연속 하루 1시간 이상 집중을 기록하면 카페 쿠폰을 드려요.',
   'focus_growth', 'focus', 5, 60, 7, true, '카페 브랜드 쿠폰', 3000, 20),
  ('00000000-0000-4000-8000-000000000001'::uuid,
   '주말 집중 2일', '주말 이틀에 하루 2시간 이상 집중하면 문구 쿠폰을 드려요.',
   'focus_growth', 'focus', 2, 120, 7, false, '문구 브랜드 쿠폰', 2000, 30)
) as v(sponsor_id, title, description, segment, mode, target_days, min_minutes_per_day,
  window_days, consecutive, reward_title, reward_value_krw, sort_order)
where not exists (select 1 from public.sponsor_challenges c where c.title = v.title);
