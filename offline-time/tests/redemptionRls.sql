-- Verify that a second signed-in user cannot read the first user's ledger or requests.
begin;
do $$
declare
  v_owner uuid;
  v_viewer uuid;
  v_product uuid := gen_random_uuid();
  v_redemption uuid := gen_random_uuid();
  v_visible integer;
  v_expected_confirmed integer;
  v_wallet jsonb;
begin
  select id into v_owner from public.users order by created_at limit 1;
  select id into v_viewer from public.users where id <> v_owner order by created_at limit 1;
  if v_owner is null or v_viewer is null then
    raise exception 'Two users are required for the RLS test';
  end if;
  insert into public.products (id, name, type, points, active)
    values (v_product, 'RLS test', 'coupon', 1000, false);
  insert into public.redemptions (id, user_id, product_id, points, status, idempotency_key)
    values (v_redemption, v_owner, v_product, 1000, 'requested', gen_random_uuid()::text);
  insert into public.point_transactions
    (user_id, kind, amount, week_id, status, idempotency_key)
    values (v_owner, 'adjust', 1, '2020-W02', 'confirmed', gen_random_uuid()::text);
  select coalesce(sum(amount), 0)::integer into v_expected_confirmed
    from public.point_transactions where user_id = v_owner and status = 'confirmed';

  perform set_config('request.jwt.claim.sub', v_viewer::text, true);
  execute 'set local role authenticated';
  select count(*) into v_visible from public.point_transactions where user_id = v_owner;
  if v_visible <> 0 then raise exception 'Another user can read ledger rows'; end if;
  select count(*) into v_visible from public.redemptions where user_id = v_owner;
  if v_visible <> 0 then raise exception 'Another user can read redemption rows'; end if;
  execute 'reset role';

  perform set_config('request.jwt.claim.sub', v_owner::text, true);
  execute 'set local role authenticated';
  select public.wallet_summary() into v_wallet;
  if (v_wallet->>'confirmed_points')::integer <> v_expected_confirmed then
    raise exception 'Wallet summary did not read the owner balance';
  end if;
  execute 'reset role';
end $$;
rollback;
