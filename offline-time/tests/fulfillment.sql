-- Run against the linked database with `supabase db query --remote --file tests/fulfillment.sql`.
-- Every synthetic account, product, redemption, and coupon is rolled back.
-- 3단계 발송 처리: 운영자가 발송을 잡고(begin), 완료(fulfill)하거나 실패(fail)로 환급한다.
--   * 같은 신청을 두 번 잡을 수 없다(15분 락). 이미 처리된 신청은 다시 호출해도 그대로다.
--   * 발송 완료는 resolve_redemption(id, true)을, 실패는 resolve_redemption(id, false, reason)을
--     그대로 통과한다 — 원장·재고 규칙은 0004 그대로다.
--   * 쿠폰은 포인트가 아니므로 환급 없이 상태만 옮기고, 실패 후 재시도할 수 있다.
--   * 모든 시도는 append-only 감사 로그에 남고, 일반 사용자는 그 로그를 읽을 수 없다.
begin;
do $$
declare
  v_user uuid;
  v_product uuid := gen_random_uuid();
  v_credit uuid := gen_random_uuid();
  v_first public.redemptions%rowtype;
  v_second public.redemptions%rowtype;
  v_failed public.redemptions%rowtype;
  v_stock integer;
  v_refunds integer;
  v_events integer;
  v_event uuid;
  v_list jsonb;
  v_challenge uuid;
  v_challenge2 uuid;
  v_part uuid;
  v_coupon uuid;
  v_coupon2 uuid;
  v_coupon_row public.sponsor_coupons%rowtype;
  v_denied boolean;
begin
  insert into auth.users (id, email) values (gen_random_uuid(), 'ops-' || gen_random_uuid() || '@example.test')
    returning id into v_user;
  update public.users set onboarded_at = now() where id = v_user;

  insert into public.point_transactions
    (id, user_id, kind, amount, week_id, status, idempotency_key, confirmed_at)
  values (v_credit, v_user, 'adjust', 5000, public.week_id_for(clock_timestamp()),
    'confirmed', 'test:credit:' || v_credit::text, clock_timestamp());

  insert into public.products (id, name, type, points, stock, active)
    values (v_product, '발송 테스트 기프티콘', 'coupon', 1400, 3, true);

  -- 1) 두 건을 신청한다. 재고는 3 -> 1.
  v_first := public.redeem_product(v_user, v_product, '01012345678', gen_random_uuid()::text);
  v_second := public.redeem_product(v_user, v_product, '01012345678', gen_random_uuid()::text);
  select stock into v_stock from public.products where id = v_product;
  if v_stock <> 1 then raise exception 'Stock after two requests should be 1, got %', v_stock; end if;

  -- 2) 잡기: 시도 횟수·시각이 남고, 같은 신청을 곧바로 다시 잡으면 거절된다.
  v_first := public.begin_redemption(v_first.id, 'manual', 'ops@example.test');
  if v_first.attempts <> 1 or v_first.processing_started_at is null then
    raise exception 'begin_redemption did not stamp the attempt: %', to_jsonb(v_first);
  end if;
  begin
    perform public.begin_redemption(v_first.id, 'manual', 'other@example.test');
    raise exception 'A second operator grabbed the same redemption';
  exception when sqlstate 'P0001' then null;
  end;

  -- 3) 발송 완료: 장부는 issued, 거래 번호와 처리 시각이 남는다. 다시 호출해도 한 번만 기록된다.
  v_first := public.fulfill_redemption(v_first.id, 'manual', 'ORD-1001', '운영자 직접 발송',
    'ops@example.test');
  if v_first.status <> 'issued' or v_first.issued_at is null or v_first.processed_at is null then
    raise exception 'fulfill_redemption did not issue the redemption: %', to_jsonb(v_first);
  end if;
  if v_first.provider_ref <> 'ORD-1001' or v_first.provider <> 'manual' then
    raise exception 'Fulfillment metadata was not stored: %', to_jsonb(v_first);
  end if;
  v_first := public.fulfill_redemption(v_first.id, 'manual', 'ORD-1001', null, 'ops@example.test');
  if v_first.status <> 'issued' then raise exception 'A second fulfill changed the row'; end if;

  -- 4) 실패 환급: 포인트와 재고가 되돌아가고, 두 번 호출해도 환급은 한 번이다.
  v_failed := public.fail_redemption(v_second.id, '재고 소진', 'manual', 'ops@example.test');
  if v_failed.status <> 'failed' or v_failed.fail_reason <> '재고 소진' then
    raise exception 'fail_redemption did not fail the row: %', to_jsonb(v_failed);
  end if;
  select count(*) into v_refunds from public.point_transactions
    where redemption_id = v_second.id and kind = 'refund';
  if v_refunds <> 1 then raise exception 'Expected one refund, got %', v_refunds; end if;
  select stock into v_stock from public.products where id = v_product;
  if v_stock <> 2 then raise exception 'Stock after refund should be 2, got %', v_stock; end if;
  v_failed := public.fail_redemption(v_second.id, '재고 소진', 'manual', 'ops@example.test');
  if v_failed.status <> 'failed' then raise exception 'A second fail changed the row'; end if;
  select count(*) into v_refunds from public.point_transactions
    where redemption_id = v_second.id and kind = 'refund';
  if v_refunds <> 1 then raise exception 'Refund was applied twice: %', v_refunds; end if;

  -- 5) 이미 환급한 신청을 뒤늦게 "발송 완료"로 뒤집을 수는 없다(장부가 어긋난다).
  begin
    perform public.fulfill_redemption(v_second.id, 'manual', 'ORD-1002', null, 'ops@example.test');
    raise exception 'A refunded redemption was issued';
  exception when sqlstate 'P0001' then null;
  end;

  -- 6) 공급자 오류는 환급하지 않고 기록만 남긴다(재시도 여지).
  perform public.record_fulfillment_error('redemption', v_first.id, '공급자 타임아웃', 'giftishow',
    'ops@example.test');
  select count(*) into v_events from public.fulfillment_events
    where target_kind = 'redemption' and target_id = v_first.id and action = 'error';
  if v_events <> 1 then raise exception 'The provider error was not logged'; end if;

  -- 7) 감사 로그: begin 2 + issued 2 + failed 2 가 첫 번째 신청에 남아 있다.
  select count(*) into v_events from public.fulfillment_events
    where target_kind = 'redemption' and target_id = v_first.id;
  if v_events < 3 then raise exception 'Too few fulfillment events: %', v_events; end if;
  select id into v_event from public.fulfillment_events
    where target_kind = 'redemption' and target_id = v_first.id limit 1;
  begin
    update public.fulfillment_events set action = 'issued' where id = v_event;
    raise exception 'fulfillment_events was updatable';
  exception when sqlstate '42501' then null;
  end;

  -- 8) 관리자 대기 목록: 실패한 신청만 남고, 상품명·회원 이메일이 함께 온다.
  v_list := public.pending_fulfillment(50);
  if jsonb_array_length(v_list->'redemptions') <> 0 then
    raise exception 'A resolved redemption is still pending: %', v_list->'redemptions';
  end if;
  v_list := public.pending_fulfillment(50, true);
  if not exists (
    select 1 from jsonb_array_elements(v_list->'redemptions') item
    where (item->>'id')::uuid = v_second.id and item->>'status' = 'failed'
      and item->>'product_name' = '발송 테스트 기프티콘'
      and item->>'fail_reason' = '재고 소진'
      and item->>'user_email' like 'ops-%@example.test'
  ) then
    raise exception 'Resolved list is missing the failed redemption: %', v_list->'redemptions';
  end if;

  -- 9) 쿠폰: 발급 -> 실패 -> 재시도 -> 발송 완료. 포인트 원장에는 아무 행도 생기지 않는다.
  select id into v_challenge from public.sponsor_challenges where title = '7시간 수면 5일';
  if v_challenge is null then raise exception 'The seeded challenge is missing'; end if;
  update public.sponsor_challenges set active = true where id = v_challenge;
  insert into public.challenge_participations (challenge_id, user_id, status)
    values (v_challenge, v_user, 'completed') returning id into v_part;
  insert into public.sponsor_coupons
    (participation_id, challenge_id, user_id, code, reward_title, value_krw)
  values (v_part, v_challenge, v_user, 'SP-TEST000001', '수면용품 브랜드 쿠폰', 3000)
    returning id into v_coupon;

  v_coupon_row := public.resolve_sponsor_coupon(v_coupon, false, '브랜드 재고 없음', 'manual', null,
    'ops@example.test');
  if v_coupon_row.delivery_status <> 'failed' or v_coupon_row.last_error <> '브랜드 재고 없음' then
    raise exception 'Coupon failure was not recorded: %', to_jsonb(v_coupon_row);
  end if;

  v_coupon_row := public.begin_sponsor_coupon(v_coupon, 'manual', 'ops@example.test');
  if v_coupon_row.delivery_status <> 'pending' or v_coupon_row.attempts <> 1 then
    raise exception 'Coupon retry did not reopen the coupon: %', to_jsonb(v_coupon_row);
  end if;
  v_coupon_row := public.resolve_sponsor_coupon(v_coupon, true, null, 'manual', 'SP-ORDER-9',
    'ops@example.test');
  if v_coupon_row.delivery_status <> 'sent' or v_coupon_row.delivered_at is null then
    raise exception 'Coupon was not marked sent: %', to_jsonb(v_coupon_row);
  end if;
  -- 발송 완료 뒤 다시 실패로 돌리려 해도 상태가 흔들리지 않는다.
  v_coupon_row := public.resolve_sponsor_coupon(v_coupon, false, '뒤늦은 실패', 'manual', null,
    'ops@example.test');
  if v_coupon_row.delivery_status <> 'sent' then
    raise exception 'A sent coupon was flipped to failed';
  end if;

  -- 두 번째 쿠폰은 대기 목록에 남는다. 참여는 (챌린지, 사용자)당 하나이므로 다른 챌린지를 쓴다.
  select id into v_challenge2 from public.sponsor_challenges where title = '주말 집중 2일';
  if v_challenge2 is null then raise exception 'The second seeded challenge is missing'; end if;
  insert into public.challenge_participations (challenge_id, user_id, status)
    values (v_challenge2, v_user, 'completed') returning id into v_part;
  insert into public.sponsor_coupons
    (participation_id, challenge_id, user_id, code, reward_title, value_krw)
  values (v_part, v_challenge2, v_user, 'SP-TEST000002', '문구 브랜드 쿠폰', 2000)
    returning id into v_coupon2;
  v_list := public.pending_fulfillment(50);
  if not exists (
    select 1 from jsonb_array_elements(v_list->'coupons') item
    where (item->>'id')::uuid = v_coupon2
  ) then
    raise exception 'The pending coupon is missing from the list: %', v_list->'coupons';
  end if;

  -- 10) 쿠폰 발송은 포인트를 만들지 않는다(원장과 분리).
  select count(*) into v_refunds from public.point_transactions
    where user_id = v_user and kind = 'bonus';
  if v_refunds <> 0 then
    raise exception 'A coupon created point transactions: %', v_refunds;
  end if;

  -- 11) 일반 사용자는 발송 로그·대기 목록을 읽을 수 없다.
  perform set_config('request.jwt.claim.sub', v_user::text, true);
  execute 'set local role authenticated';
  begin
    select count(*) into v_events from public.fulfillment_events;
    if v_events <> 0 then raise exception 'A member could read fulfillment events: %', v_events; end if;
  exception when insufficient_privilege or sqlstate '42501' then null;
  end;
  v_denied := false;
  begin
    perform public.pending_fulfillment(10);
  exception when insufficient_privilege then v_denied := true; when sqlstate '42501' then v_denied := true;
  end;
  execute 'reset role';
  if not v_denied then raise exception 'A member could call pending_fulfillment'; end if;

  -- 사용자는 자기 교환 행에서 발송 상태를 읽는다(RLS 그대로).
  perform set_config('request.jwt.claim.sub', v_user::text, true);
  execute 'set local role authenticated';
  declare
    v_own integer;
  begin
    select count(*) into v_own from public.redemptions where id = v_first.id;
    if v_own <> 1 then raise exception 'The owner cannot read their own redemption'; end if;
  end;
  execute 'reset role';
end $$;
rollback;
