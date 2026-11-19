-- 3·4단계: 발송(이행) 처리 · 관리자 대기 목록 · 계정 탈퇴 기록.
--
-- 실제 상품 발송은 앱이 아니라 운영자(또는 외부 기프티콘 공급자)가 한다. 이 마이그레이션은
--   * 교환 신청(redemptions)·스폰서 쿠폰(sponsor_coupons)에 발송 시도/결과를 남길 열,
--   * 누가·언제·무엇을 했는지 남기는 append-only 감사 로그(fulfillment_events),
--   * 발송을 시작·완료·실패 처리하는 RPC(begin/fulfill/fail, 쿠폰 resolve),
--   * 관리자 화면이 읽는 대기 목록(pending_fulfillment),
--   * 탈퇴 뒤 회계 목적으로만 남기는 개인 식별 없는 요약(account_deletions)
-- 을 더한다.
--
-- 지켜야 하는 기존 원칙은 그대로다:
--   * 포인트를 만드는 경로는 서버(security definer · service_role)뿐이다. 앱은 만들 수 없다.
--   * point_transactions는 append-only이고, 발송 완료는 resolve_redemption을 그대로 통과한다.
--   * 실패 환급은 resolve_redemption(id, false, reason)이 한 번만 원장·재고를 되돌린다.
-- 이 마이그레이션은 그 함수를 고치지 않고 감싼다(기존 SQL 테스트가 보는 동작을 바꾸지 않는다).

-- 1) 발송 추적 열 -------------------------------------------------------------------
-- 'requested' 상태에 머문 채로 processing_started_at이 있으면 "지금 발송 중"이다.
-- redemptions.status 열거형에 값을 더하지 않은 이유: 새 enum 값은 같은 트랜잭션에서 쓸 수 없고,
-- 여기서 필요한 것은 상태 전이가 아니라 "누가 언제 잡았는지"뿐이다.
alter table public.redemptions
  add column if not exists provider text not null default 'manual',
  add column if not exists provider_ref text,
  add column if not exists last_error text,
  add column if not exists attempts integer not null default 0,
  add column if not exists processing_started_at timestamptz,
  add column if not exists processed_at timestamptz;

alter table public.redemptions drop constraint if exists redemptions_attempts_check;
alter table public.redemptions add constraint redemptions_attempts_check
  check (attempts >= 0) not valid;
alter table public.redemptions validate constraint redemptions_attempts_check;

comment on column public.redemptions.provider is
  '발송을 맡은 공급자. manual = 운영자가 직접 보냈다(기프티콘 API 키가 없을 때의 기본값).';
comment on column public.redemptions.provider_ref is
  '공급자가 돌려준 거래/주문 번호. 운영자가 나중에 문의할 때 쓰는 대조 키다.';
comment on column public.redemptions.attempts is
  '발송을 시도한 횟수(begin_redemption이 1씩 올린다).';
comment on column public.redemptions.processing_started_at is
  '운영자/공급자가 발송을 잡은 시각. 15분이 지나면 다른 운영자가 다시 잡을 수 있다(중복 발송 방지 락).';
comment on column public.redemptions.processed_at is
  '발송 성공·실패로 확정된 시각. issued_at은 성공에만, processed_at은 실패에도 남는다.';
comment on column public.redemptions.last_error is
  '마지막 발송 시도의 오류. 성공하면 지운다. 사용자에게 보여 주는 문구는 fail_reason이다.';

create index if not exists redemptions_pending_idx
  on public.redemptions (created_at) where status = 'requested';

alter table public.sponsor_coupons
  add column if not exists provider text not null default 'manual',
  add column if not exists provider_ref text,
  add column if not exists last_error text,
  add column if not exists attempts integer not null default 0,
  add column if not exists processing_started_at timestamptz,
  add column if not exists processed_at timestamptz;

alter table public.sponsor_coupons drop constraint if exists sponsor_coupons_attempts_check;
alter table public.sponsor_coupons add constraint sponsor_coupons_attempts_check
  check (attempts >= 0) not valid;
alter table public.sponsor_coupons validate constraint sponsor_coupons_attempts_check;

alter table public.sponsor_coupons drop constraint if exists sponsor_coupons_delivered_check;
alter table public.sponsor_coupons add constraint sponsor_coupons_delivered_check
  check (delivered_at is null or delivery_status = 'sent') not valid;
alter table public.sponsor_coupons validate constraint sponsor_coupons_delivered_check;

comment on table public.sponsor_coupons is
  '브랜드 쿠폰 발급 기록. 포인트 원장과 분리되어 있고, 실제 발송은 브랜드/운영자가 처리한다. '
  '앱은 코드를 보여 주고, 발송 상태(sent/failed)와 마지막 오류를 함께 읽는다.';

create index if not exists sponsor_coupons_pending_idx
  on public.sponsor_coupons (issued_at) where delivery_status <> 'sent';

-- 2) 감사 로그 ----------------------------------------------------------------------
-- 개인 정보는 남기지 않는다: 대상 id, 행위, 공급자, 거래 번호, 사람이 적은 메모만.
create table if not exists public.fulfillment_events (
  id uuid primary key default gen_random_uuid(),
  target_kind text not null check (target_kind in ('redemption', 'coupon')),
  target_id uuid not null,
  action text not null check (action in ('begin', 'issued', 'sent', 'failed', 'error')),
  provider text,
  actor text,
  external_id text,
  detail jsonb,
  created_at timestamptz not null default now()
);
create index if not exists fulfillment_events_target_idx
  on public.fulfillment_events (target_kind, target_id, created_at desc);

alter table public.fulfillment_events enable row level security;
revoke all on table public.fulfillment_events from public, anon, authenticated;

create or replace function public.forbid_fulfillment_event_change() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  raise exception 'fulfillment_events is append-only' using errcode = '42501';
end $$;

drop trigger if exists fulfillment_events_append_only on public.fulfillment_events;
create trigger fulfillment_events_append_only
  before update or delete on public.fulfillment_events
  for each row execute function public.forbid_fulfillment_event_change();

create or replace function public.log_fulfillment_event(
  p_kind text, p_target_id uuid, p_action text, p_provider text default null,
  p_actor text default null, p_external_id text default null, p_detail jsonb default null
) returns void
language sql security definer set search_path = public as $$
  insert into public.fulfillment_events
    (target_kind, target_id, action, provider, actor, external_id, detail)
  values (p_kind, p_target_id, p_action, nullif(btrim(coalesce(p_provider, '')), ''),
    nullif(btrim(coalesce(p_actor, '')), ''), nullif(btrim(coalesce(p_external_id, '')), ''),
    p_detail);
$$;

-- 3) 교환 발송 처리 ------------------------------------------------------------------
-- 발송 시작: 같은 신청을 두 운영자가 동시에 보내지 않도록 15분짜리 락을 잡는다.
-- 이미 처리된(issued/failed) 신청은 그대로 돌려준다 — 두 번 눌러도 오류가 아니다.
create or replace function public.begin_redemption(
  p_redemption_id uuid, p_provider text default null, p_actor text default null
) returns public.redemptions
language plpgsql security definer set search_path = public as $$
declare
  v_redemption public.redemptions%rowtype;
  v_provider text;
begin
  v_provider := nullif(btrim(coalesce(p_provider, '')), '');
  select * into v_redemption from public.redemptions
    where id = p_redemption_id for update;
  if not found then raise exception 'Redemption not found' using errcode = 'P0002'; end if;
  if v_redemption.status <> 'requested' then return v_redemption; end if;
  if v_redemption.processing_started_at is not null
     and v_redemption.processing_started_at > clock_timestamp() - interval '15 minutes' then
    raise exception 'Redemption is already being processed' using errcode = 'P0001';
  end if;

  update public.redemptions set
    attempts = attempts + 1,
    processing_started_at = clock_timestamp(),
    provider = coalesce(v_provider, provider),
    last_error = null
  where id = p_redemption_id returning * into v_redemption;

  perform public.log_fulfillment_event('redemption', v_redemption.id, 'begin',
    v_redemption.provider, p_actor, null,
    jsonb_build_object('attempts', v_redemption.attempts, 'points', v_redemption.points,
      'product_id', v_redemption.product_id));
  return v_redemption;
end $$;

-- 발송 완료: 메타데이터를 남긴 뒤 resolve_redemption(id, true)로 장부를 마감한다.
-- resolve_redemption이 실제 상태 전이·issued_at을 책임지므로 0004의 규칙이 그대로 유지된다.
create or replace function public.fulfill_redemption(
  p_redemption_id uuid, p_provider text default null, p_external_id text default null,
  p_memo text default null, p_actor text default null
) returns public.redemptions
language plpgsql security definer set search_path = public as $$
declare
  v_redemption public.redemptions%rowtype;
  v_provider text;
  v_external text;
begin
  v_provider := nullif(btrim(coalesce(p_provider, '')), '');
  v_external := nullif(btrim(coalesce(p_external_id, '')), '');
  select * into v_redemption from public.redemptions
    where id = p_redemption_id for update;
  if not found then raise exception 'Redemption not found' using errcode = 'P0002'; end if;
  if v_redemption.status = 'issued' then return v_redemption; end if;
  if v_redemption.status = 'failed' then
    -- 실패한 신청은 이미 환급·재고 복원이 끝났다. 뒤늦게 "발송 완료"로 뒤집으면 장부가 어긋난다.
    raise exception 'A failed redemption is already refunded' using errcode = 'P0001';
  end if;

  update public.redemptions set
    provider = coalesce(v_provider, provider),
    provider_ref = coalesce(v_external, provider_ref),
    processed_at = clock_timestamp(),
    last_error = null
  where id = p_redemption_id;

  v_redemption := public.resolve_redemption(p_redemption_id, true, null);

  perform public.log_fulfillment_event('redemption', v_redemption.id, 'issued',
    v_redemption.provider, p_actor, v_redemption.provider_ref,
    jsonb_build_object('memo', nullif(btrim(coalesce(p_memo, '')), ''),
      'attempts', v_redemption.attempts));
  return v_redemption;
end $$;

-- 발송 실패: 이유를 남기고 resolve_redemption(id, false, reason)으로 환급한다.
-- 환급은 한 번만 일어난다(0004의 refund 멱등키). 두 번째 호출은 현재 행을 그대로 돌려준다.
create or replace function public.fail_redemption(
  p_redemption_id uuid, p_reason text, p_provider text default null,
  p_actor text default null
) returns public.redemptions
language plpgsql security definer set search_path = public as $$
declare
  v_redemption public.redemptions%rowtype;
  v_reason text;
  v_provider text;
begin
  v_reason := nullif(btrim(coalesce(p_reason, '')), '');
  if v_reason is null then
    raise exception 'Failure reason is required' using errcode = '22023';
  end if;
  v_provider := nullif(btrim(coalesce(p_provider, '')), '');
  select * into v_redemption from public.redemptions
    where id = p_redemption_id for update;
  if not found then raise exception 'Redemption not found' using errcode = 'P0002'; end if;
  if v_redemption.status = 'failed' then return v_redemption; end if;
  if v_redemption.status = 'issued' then
    raise exception 'An issued redemption cannot be refunded' using errcode = 'P0001';
  end if;

  update public.redemptions set
    provider = coalesce(v_provider, provider),
    processed_at = clock_timestamp(),
    last_error = v_reason
  where id = p_redemption_id;

  v_redemption := public.resolve_redemption(p_redemption_id, false, v_reason);

  perform public.log_fulfillment_event('redemption', v_redemption.id, 'failed',
    v_redemption.provider, p_actor, null,
    jsonb_build_object('reason', v_reason, 'attempts', v_redemption.attempts,
      'points', v_redemption.points));
  return v_redemption;
end $$;

-- 공급자 호출이 오류로 끝났지만 아직 포기하지 않은 경우(재시도 가능). 환급하지 않는다.
create or replace function public.record_fulfillment_error(
  p_kind text, p_target_id uuid, p_error text, p_provider text default null,
  p_actor text default null
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_error text;
begin
  v_error := nullif(btrim(coalesce(p_error, '')), '');
  if v_error is null then raise exception 'Error text is required' using errcode = '22023'; end if;
  if p_kind = 'redemption' then
    update public.redemptions set last_error = v_error,
      provider = coalesce(nullif(btrim(coalesce(p_provider, '')), ''), provider)
    where id = p_target_id and status = 'requested';
  elsif p_kind = 'coupon' then
    update public.sponsor_coupons set last_error = v_error,
      provider = coalesce(nullif(btrim(coalesce(p_provider, '')), ''), provider)
    where id = p_target_id and delivery_status <> 'sent';
  else
    raise exception 'Unknown fulfillment kind' using errcode = '22023';
  end if;
  perform public.log_fulfillment_event(p_kind, p_target_id, 'error',
    nullif(btrim(coalesce(p_provider, '')), ''), p_actor, null,
    jsonb_build_object('error', v_error));
end $$;

-- 4) 스폰서 쿠폰 발송 처리 -----------------------------------------------------------
-- 쿠폰은 포인트가 아니므로 환급이 없다. 상태만 옮기고, 실패 이유를 남긴다.
create or replace function public.begin_sponsor_coupon(
  p_coupon_id uuid, p_provider text default null, p_actor text default null
) returns public.sponsor_coupons
language plpgsql security definer set search_path = public as $$
declare
  v_coupon public.sponsor_coupons%rowtype;
  v_provider text;
begin
  v_provider := nullif(btrim(coalesce(p_provider, '')), '');
  select * into v_coupon from public.sponsor_coupons
    where id = p_coupon_id for update;
  if not found then raise exception 'Coupon not found' using errcode = 'P0002'; end if;
  if v_coupon.delivery_status = 'sent' then return v_coupon; end if;
  if v_coupon.processing_started_at is not null
     and v_coupon.processing_started_at > clock_timestamp() - interval '15 minutes' then
    raise exception 'Coupon is already being processed' using errcode = 'P0001';
  end if;

  -- failed에서 다시 잡으면 재시도다: 상태를 pending으로 되돌리고 횟수를 올린다.
  update public.sponsor_coupons set
    delivery_status = 'pending',
    attempts = attempts + 1,
    processing_started_at = clock_timestamp(),
    provider = coalesce(v_provider, provider)
  where id = p_coupon_id returning * into v_coupon;

  perform public.log_fulfillment_event('coupon', v_coupon.id, 'begin',
    v_coupon.provider, p_actor, null,
    jsonb_build_object('attempts', v_coupon.attempts, 'code', v_coupon.code));
  return v_coupon;
end $$;

create or replace function public.resolve_sponsor_coupon(
  p_coupon_id uuid, p_sent boolean, p_fail_reason text default null,
  p_provider text default null, p_external_id text default null,
  p_actor text default null
) returns public.sponsor_coupons
language plpgsql security definer set search_path = public as $$
declare
  v_coupon public.sponsor_coupons%rowtype;
  v_provider text;
  v_external text;
  v_reason text;
begin
  if p_sent is null then raise exception 'Resolution is required' using errcode = '22023'; end if;
  v_provider := nullif(btrim(coalesce(p_provider, '')), '');
  v_external := nullif(btrim(coalesce(p_external_id, '')), '');
  select * into v_coupon from public.sponsor_coupons
    where id = p_coupon_id for update;
  if not found then raise exception 'Coupon not found' using errcode = 'P0002'; end if;
  if v_coupon.delivery_status = 'sent' then return v_coupon; end if;

  if p_sent then
    update public.sponsor_coupons set
      delivery_status = 'sent',
      delivered_at = coalesce(delivered_at, clock_timestamp()),
      processed_at = clock_timestamp(),
      provider = coalesce(v_provider, provider),
      provider_ref = coalesce(v_external, provider_ref),
      last_error = null
    where id = p_coupon_id returning * into v_coupon;
    perform public.log_fulfillment_event('coupon', v_coupon.id, 'sent',
      v_coupon.provider, p_actor, v_coupon.provider_ref,
      jsonb_build_object('code', v_coupon.code, 'attempts', v_coupon.attempts));
    return v_coupon;
  end if;

  v_reason := nullif(btrim(coalesce(p_fail_reason, '')), '');
  if v_reason is null then
    raise exception 'Failure reason is required' using errcode = '22023';
  end if;
  update public.sponsor_coupons set
    delivery_status = 'failed',
    processed_at = clock_timestamp(),
    provider = coalesce(v_provider, provider),
    last_error = v_reason
  where id = p_coupon_id returning * into v_coupon;
  perform public.log_fulfillment_event('coupon', v_coupon.id, 'failed',
    v_coupon.provider, p_actor, null,
    jsonb_build_object('reason', v_reason, 'code', v_coupon.code));
  return v_coupon;
end $$;

-- 5) 관리자 대기 목록 ----------------------------------------------------------------
-- 앱의 운영자 화면이 한 번에 읽는다. 사람이 알아볼 수 있게 상품명·회원 이메일을 붙인다.
-- 반환에는 개인 정보(전화번호·이메일)가 들어가므로 service_role 전용이다.
create or replace function public.pending_fulfillment(
  p_limit integer default 50, p_include_resolved boolean default false
) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 200);
  v_redemptions jsonb;
  v_coupons jsonb;
begin
  select coalesce(jsonb_agg(row_to_json(t) order by t.created_at), '[]'::jsonb)
    into v_redemptions
  from (
    select r.id, r.user_id, u.email as user_email, r.product_id, p.name as product_name,
      p.type as product_type, r.points, r.phone, r.status, r.provider, r.provider_ref,
      r.attempts, r.processing_started_at, r.processed_at, r.fail_reason, r.last_error,
      r.created_at, r.issued_at,
      (select e.detail->>'memo' from public.fulfillment_events e
        where e.target_kind = 'redemption' and e.target_id = r.id and e.action = 'issued'
        order by e.created_at desc limit 1) as memo
    from public.redemptions r
      left join public.products p on p.id = r.product_id
      left join auth.users u on u.id = r.user_id
    where p_include_resolved or r.status = 'requested'
    order by r.created_at asc
    limit v_limit
  ) t;

  select coalesce(jsonb_agg(row_to_json(t) order by t.issued_at), '[]'::jsonb)
    into v_coupons
  from (
    select c.id, c.user_id, u.email as user_email, c.challenge_id, ch.title as challenge_title,
      c.code, c.reward_title, c.value_krw, c.delivery_status, c.provider, c.provider_ref,
      c.attempts, c.processing_started_at, c.processed_at, c.last_error, c.issued_at,
      c.delivered_at
    from public.sponsor_coupons c
      left join public.sponsor_challenges ch on ch.id = c.challenge_id
      left join auth.users u on u.id = c.user_id
    where p_include_resolved or c.delivery_status <> 'sent'
    order by c.issued_at asc
    limit v_limit
  ) t;

  return jsonb_build_object('redemptions', v_redemptions, 'coupons', v_coupons);
end $$;

-- 6) 계정 탈퇴 ----------------------------------------------------------------------
-- 이용자가 탈퇴하면 Edge Function이 auth.admin.deleteUser를 부른다. public.users의 FK가 모두
-- on delete cascade라서 세션·원장·교환·쿠폰·초대·정산·기기 행이 함께 사라진다(충돌 없음).
-- 다만 포인트를 실제로 지급·교환한 수량은 회계 목적으로 남겨야 하므로, 삭제 전에 개인 식별
-- 정보가 없는 요약만 이 표에 옮긴다. 이메일·전화번호·user_id는 저장하지 않는다.
create table if not exists public.account_deletions (
  id uuid primary key default gen_random_uuid(),
  requested_at timestamptz not null default now(),
  completed_at timestamptz,
  status text not null default 'requested' check (status in ('requested', 'completed')),
  summary jsonb not null default '{}'::jsonb
);
comment on table public.account_deletions is
  '탈퇴 기록(개인 식별 정보 없음). 지급·교환 수량만 회계 보존용으로 남기고, 계정 행은 삭제한다.';

alter table public.account_deletions enable row level security;
revoke all on table public.account_deletions from public, anon, authenticated;

-- 탈퇴 직전 정리: 아직 발송되지 않은 교환 신청은 취소·환급한다. 사용자가 사라지면 운영자가
-- 보낼 곳도 없고, 재고만 줄어 있으면 안 된다. 실패 사유는 fail_reason = 'account_deleted'로
-- 남겨 운영 기록과 사용자 안내가 같은 문구를 쓴다.
create or replace function public.release_account_redemptions(
  p_user_id uuid, p_actor text default null
) returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_released integer := 0;
begin
  if not exists (select 1 from public.users where id = p_user_id) then
    raise exception 'User profile not found' using errcode = 'P0002';
  end if;
  for v_id in
    select id from public.redemptions
    where user_id = p_user_id and status = 'requested' order by created_at
  loop
    perform public.fail_redemption(v_id, 'account_deleted', 'manual', p_actor);
    v_released := v_released + 1;
  end loop;
  return v_released;
end $$;

create or replace function public.collect_account_deletion_summary(p_user_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_summary jsonb;
begin
  if not exists (select 1 from public.users where id = p_user_id) then
    raise exception 'User profile not found' using errcode = 'P0002';
  end if;
  select jsonb_build_object(
    'member_since', (select created_at from public.users where id = p_user_id),
    'onboarded', (select onboarded_at is not null from public.users where id = p_user_id),
    'sessions_total', (select count(*) from public.sessions where user_id = p_user_id),
    'sessions_valid', (select count(*) from public.sessions
      where user_id = p_user_id and status = 'valid'),
    'confirmed_points', public.confirmed_balance(p_user_id),
    'pending_points', (select coalesce(sum(amount), 0) from public.point_transactions
      where user_id = p_user_id and status = 'pending'),
    'earned_points', (select coalesce(sum(amount), 0) from public.point_transactions
      where user_id = p_user_id and amount > 0 and status <> 'void'),
    'open_session', (select id from public.sessions
      where user_id = p_user_id and status = 'open'),
    'redemptions_requested', (select count(*) from public.redemptions
      where user_id = p_user_id and status = 'requested'),
    'redemptions_issued', (select count(*) from public.redemptions
      where user_id = p_user_id and status = 'issued'),
    'coupons_issued', (select count(*) from public.sponsor_coupons where user_id = p_user_id),
    'referrals_sent', (select count(*) from public.referrals where inviter_id = p_user_id)
  ) into v_summary;
  return v_summary;
end $$;

create or replace function public.record_account_deletion(
  p_summary jsonb default null, p_completed boolean default true
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  insert into public.account_deletions (summary, completed_at, status)
  values (coalesce(p_summary, '{}'::jsonb),
    case when coalesce(p_completed, true) then clock_timestamp() end,
    case when coalesce(p_completed, true) then 'completed' else 'requested' end)
  returning id into v_id;
  return v_id;
end $$;

-- 회계 보존 기간이 끝난 요약을 지우는 운영용 정리. 개인 식별 정보가 없어도 무기한 둘 필요는 없다.
create or replace function public.purge_account_deletions(p_before timestamptz)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_deleted integer;
begin
  if p_before is null then raise exception 'Cutoff is required' using errcode = '22023'; end if;
  delete from public.account_deletions where requested_at < p_before;
  get diagnostics v_deleted = row_count;
  return v_deleted;
end $$;

-- 7) 권한 ----------------------------------------------------------------------------
-- 발송·탈퇴 기록은 운영자(service_role)만 만진다. 사용자는 자기 교환·쿠폰 행만 읽는다(기존 RLS).
revoke all on function public.log_fulfillment_event(text, uuid, text, text, text, text, jsonb)
  from public, anon, authenticated;
revoke all on function public.begin_redemption(uuid, text, text) from public, anon, authenticated;
revoke all on function public.fulfill_redemption(uuid, text, text, text, text)
  from public, anon, authenticated;
revoke all on function public.fail_redemption(uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.record_fulfillment_error(text, uuid, text, text, text)
  from public, anon, authenticated;
revoke all on function public.begin_sponsor_coupon(uuid, text, text) from public, anon, authenticated;
revoke all on function public.resolve_sponsor_coupon(uuid, boolean, text, text, text, text)
  from public, anon, authenticated;
revoke all on function public.pending_fulfillment(integer, boolean) from public, anon, authenticated;
revoke all on function public.release_account_redemptions(uuid, text) from public, anon, authenticated;
revoke all on function public.collect_account_deletion_summary(uuid) from public, anon, authenticated;
revoke all on function public.record_account_deletion(jsonb, boolean) from public, anon, authenticated;
revoke all on function public.purge_account_deletions(timestamptz) from public, anon, authenticated;

grant execute on function public.log_fulfillment_event(text, uuid, text, text, text, text, jsonb)
  to service_role;
grant execute on function public.begin_redemption(uuid, text, text) to service_role;
grant execute on function public.fulfill_redemption(uuid, text, text, text, text) to service_role;
grant execute on function public.fail_redemption(uuid, text, text, text) to service_role;
grant execute on function public.record_fulfillment_error(text, uuid, text, text, text) to service_role;
grant execute on function public.begin_sponsor_coupon(uuid, text, text) to service_role;
grant execute on function public.resolve_sponsor_coupon(uuid, boolean, text, text, text, text)
  to service_role;
grant execute on function public.pending_fulfillment(integer, boolean) to service_role;
grant execute on function public.release_account_redemptions(uuid, text) to service_role;
grant execute on function public.collect_account_deletion_summary(uuid) to service_role;
grant execute on function public.record_account_deletion(jsonb, boolean) to service_role;
grant execute on function public.purge_account_deletions(timestamptz) to service_role;

-- 8) 규칙값: 발송 수단이 정해지기 전에는 manual. 공급자를 붙이면 여기 값만 바꾼다.
insert into public.point_rules (key, value) values
  ('fulfillment', '{"provider":"manual","lock_minutes":15,"auto_send":false}')
on conflict (key) do nothing;
