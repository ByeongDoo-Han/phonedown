-- Run against the linked database with `supabase db query --remote --file tests/accountDeletion.sql`.
-- Every synthetic account is rolled back.
-- 계정 탈퇴: ① 대기 중인 교환은 취소·환급해 재고를 되돌리고 ② 개인 식별 없는 요약을 남긴 뒤
-- ③ auth.users를 지우면 public.users 이하 모든 행이 cascade로 사라진다(충돌 없음).
-- 이 테스트는 그 세 단계를 실제 삭제까지 확인한다.
begin;
do $$
declare
  v_user uuid;
  v_friend uuid;
  v_product uuid := gen_random_uuid();
  v_credit uuid := gen_random_uuid();
  v_redemption public.redemptions%rowtype;
  v_summary jsonb;
  v_deletion uuid;
  v_count integer;
  v_stock integer;
  v_open uuid;
begin
  insert into auth.users (id, email) values (gen_random_uuid(), 'bye-' || gen_random_uuid() || '@example.test')
    returning id into v_user;
  insert into auth.users (id, email) values (gen_random_uuid(), 'friend-' || gen_random_uuid() || '@example.test')
    returning id into v_friend;
  update public.users set onboarded_at = now() where id in (v_user, v_friend);

  insert into public.products (id, name, type, points, stock, active)
    values (v_product, '탈퇴 테스트 기프티콘', 'coupon', 1400, 1, true);
  insert into public.point_transactions
    (id, user_id, kind, amount, week_id, status, idempotency_key, confirmed_at)
  values (v_credit, v_user, 'adjust', 3000, public.week_id_for(clock_timestamp()),
    'confirmed', 'test:credit:' || v_credit::text, clock_timestamp());

  insert into public.sessions
    (user_id, mode, source, client_started_at, server_started_at, status)
  values (v_user, 'sleep', 'timer', now(), now(), 'open') returning id into v_open;
  v_redemption := public.redeem_product(v_user, v_product, '01098765432', gen_random_uuid()::text);
  insert into public.referrals (inviter_id, invitee_id, code)
    values (v_user, v_friend, (select referral_code from public.users where id = v_user));

  -- ① 요약: 개인 식별 정보 없이 지급·교환 수량만 담는다. 열린 기록과 대기 교환도 보인다.
  v_summary := public.collect_account_deletion_summary(v_user);
  if (v_summary->>'open_session')::uuid <> v_open then
    raise exception 'The open session is missing from the summary: %', v_summary;
  end if;
  if (v_summary->>'redemptions_requested')::integer <> 1 then
    raise exception 'The pending redemption is missing from the summary: %', v_summary;
  end if;
  if (v_summary->>'confirmed_points')::integer <> 1600 then
    raise exception 'Confirmed balance should be 1600 after redeeming, got %',
      v_summary->>'confirmed_points';
  end if;
  if v_summary ? 'email' or v_summary ? 'phone' or v_summary ? 'user_id' then
    raise exception 'The summary carries personal identifiers: %', v_summary;
  end if;

  -- ② 대기 교환 취소·환급: 재고가 돌아오고 환급 장부가 남는다.
  v_count := public.release_account_redemptions(v_user, 'bye@example.test');
  if v_count <> 1 then raise exception 'Expected one released redemption, got %', v_count; end if;
  select stock into v_stock from public.products where id = v_product;
  if v_stock <> 1 then raise exception 'Stock should be restored to 1, got %', v_stock; end if;
  select * into v_redemption from public.redemptions where id = v_redemption.id;
  if v_redemption.status <> 'failed' or v_redemption.fail_reason <> 'account_deleted' then
    raise exception 'The redemption was not released: %', to_jsonb(v_redemption);
  end if;
  if not exists (select 1 from public.point_transactions
    where redemption_id = v_redemption.id and kind = 'refund') then
    raise exception 'The released redemption was not refunded';
  end if;

  -- 요약을 보존 기록으로 옮긴 뒤 계정을 지운다.
  v_deletion := public.record_account_deletion(v_summary, true);
  if not exists (select 1 from public.account_deletions
    where id = v_deletion and status = 'completed' and completed_at is not null) then
    raise exception 'The retention row was not written';
  end if;

  delete from auth.users where id = v_user;

  select count(*) into v_count from public.users where id = v_user;
  if v_count <> 0 then raise exception 'The profile survived deletion'; end if;
  select count(*) into v_count from public.sessions where user_id = v_user;
  if v_count <> 0 then raise exception 'Sessions survived deletion: %', v_count; end if;
  select count(*) into v_count from public.point_transactions where user_id = v_user;
  if v_count <> 0 then raise exception 'Point transactions survived deletion: %', v_count; end if;
  select count(*) into v_count from public.redemptions where user_id = v_user;
  if v_count <> 0 then raise exception 'Redemptions survived deletion: %', v_count; end if;
  select count(*) into v_count from public.referrals
    where inviter_id = v_user or invitee_id = v_user;
  if v_count <> 0 then raise exception 'Referrals survived deletion: %', v_count; end if;

  -- 보존 기록은 남고, 개인 식별 정보는 그 안에 없다.
  if not exists (select 1 from public.account_deletions where id = v_deletion) then
    raise exception 'The retention row disappeared with the account';
  end if;

  -- ③ 탈퇴한 계정의 요약은 더 만들 수 없다.
  begin
    perform public.collect_account_deletion_summary(v_user);
    raise exception 'A summary was built for a deleted account';
  exception when sqlstate 'P0002' then null;
  end;

  -- ④ 일반 사용자는 보존 기록을 읽을 수 없다. RLS가 행을 숨기거나(로컬 하네스),
  --    권한 자체가 없으면(원격: authenticated에 grant하지 않음) 둘 다 통과다.
  perform set_config('request.jwt.claim.sub', v_friend::text, true);
  execute 'set local role authenticated';
  begin
    select count(*) into v_count from public.account_deletions;
    if v_count <> 0 then raise exception 'A member could read account deletions: %', v_count; end if;
  exception when insufficient_privilege or sqlstate '42501' then null;
  end;
  execute 'reset role';

  -- ⑤ 보존 기간이 지난 요약은 운영자가 정리할 수 있다.
  if public.purge_account_deletions(clock_timestamp() + interval '1 hour') < 1 then
    raise exception 'Purge did not remove the retention row';
  end if;
end $$;
rollback;
