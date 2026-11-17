-- Synthetic credit, product, request, and refund are rolled back together.
begin;
do $$
declare
  v_user uuid;
  v_product uuid := gen_random_uuid();
  v_credit uuid := gen_random_uuid();
  v_expensive uuid := gen_random_uuid();
  v_key text := gen_random_uuid()::text;
  v_redemption public.redemptions%rowtype;
  v_again public.redemptions%rowtype;
  v_initial integer;
  v_stock integer;
  v_refunds integer;
begin
  select id into v_user from public.users order by created_at limit 1;
  if v_user is null then raise exception 'No user available for redemption test'; end if;
  v_initial := public.confirmed_balance(v_user);
  insert into public.products (id, name, type, points, active)
    values (v_expensive, '잔액 부족 테스트', 'coupon',
      greatest(1000, ((v_initial / 1000) + 1) * 1000), true);
  begin
    perform public.redeem_product(v_user, v_expensive, '01012345678', gen_random_uuid()::text);
    raise exception 'Unconfirmed or insufficient points were spent';
  exception when sqlstate 'P0001' then null;
  end;
  insert into public.point_transactions
    (id, user_id, kind, amount, week_id, status, idempotency_key, confirmed_at)
  values (v_credit, v_user, 'adjust', 1000, public.week_id_for(clock_timestamp()),
    'confirmed', 'test:credit:' || v_credit::text, clock_timestamp());
  insert into public.products (id, name, type, points, stock, active)
    values (v_product, '테스트 상품', 'coupon', 1000, 1, true);

  v_redemption := public.redeem_product(v_user, v_product, '010-1234-5678', v_key);
  v_again := public.redeem_product(v_user, v_product, '010-1234-5678', v_key);
  select stock into v_stock from public.products where id = v_product;
  if v_redemption.id <> v_again.id or v_redemption.status <> 'requested'
     or v_redemption.phone <> '01012345678' or v_stock <> 0
     or public.confirmed_balance(v_user) <> v_initial then
    raise exception 'Redemption is not atomic or idempotent';
  end if;
  if (select count(*) from public.point_transactions
      where redemption_id = v_redemption.id and kind = 'redeem') <> 1 then
    raise exception 'Redemption debited more than once';
  end if;

  v_redemption := public.resolve_redemption(v_redemption.id, false, '발송 실패 테스트');
  v_again := public.resolve_redemption(v_redemption.id, false, '발송 실패 테스트');
  select stock into v_stock from public.products where id = v_product;
  select count(*) into v_refunds from public.point_transactions
    where redemption_id = v_redemption.id and kind = 'refund';
  if v_redemption.status <> 'failed' or v_again.id <> v_redemption.id
     or v_refunds <> 1 or v_stock <> 1
     or public.confirmed_balance(v_user) <> v_initial + 1000 then
    raise exception 'Failed issuance did not refund exactly once';
  end if;

  v_redemption := public.redeem_product(v_user, v_product, '01012345678', gen_random_uuid()::text);
  v_redemption := public.resolve_redemption(v_redemption.id, true);
  if v_redemption.status <> 'issued' or v_redemption.issued_at is null
     or public.confirmed_balance(v_user) <> v_initial then
    raise exception 'Manual issuance did not preserve the debit';
  end if;
end $$;
rollback;
