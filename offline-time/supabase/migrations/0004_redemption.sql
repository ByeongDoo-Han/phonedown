-- Redemption requests are atomic and service-role only. Issuance is a separate manual step.
create function public.redeem_product(
  p_user_id uuid, p_product_id uuid, p_phone text, p_idem text
) returns public.redemptions
language plpgsql security definer set search_path = public as $$
declare
  v_redemption public.redemptions%rowtype;
  v_product public.products%rowtype;
  v_phone text;
  v_minimum integer;
  v_step integer;
  v_balance integer;
begin
  if p_idem is null or p_idem !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    raise exception 'Invalid idempotency key' using errcode = '22023';
  end if;
  v_phone := regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g');
  if v_phone !~ '^01[016789][0-9]{7,8}$' then
    raise exception 'Invalid mobile phone number' using errcode = '22023';
  end if;

  -- All balance-changing operations for this user take this lock first.
  perform 1 from public.users where id = p_user_id for update;
  if not found then raise exception 'User profile not found' using errcode = 'P0002'; end if;
  select * into v_redemption from public.redemptions where idempotency_key = p_idem;
  if found then
    if v_redemption.user_id <> p_user_id or v_redemption.product_id <> p_product_id then
      raise exception 'Idempotency key belongs to another request' using errcode = '22023';
    end if;
    return v_redemption;
  end if;

  select * into v_product from public.products where id = p_product_id for update;
  if not found or not v_product.active then
    raise exception 'Product unavailable' using errcode = 'P0002';
  end if;
  if v_product.stock is not null and v_product.stock <= 0 then
    raise exception 'Product out of stock' using errcode = 'P0001';
  end if;
  select (value->>'minimum_points')::integer, (value->>'step_points')::integer
    into v_minimum, v_step from public.point_rules where key = 'redemption';
  if v_minimum is null or v_step is null or v_step <= 0 then
    raise exception 'Redemption rules are incomplete';
  end if;
  if v_product.points < v_minimum or v_product.points % v_step <> 0 then
    raise exception 'Product points do not match redemption rules' using errcode = '22023';
  end if;
  v_balance := public.confirmed_balance(p_user_id);
  if v_balance < v_product.points then
    raise exception 'Insufficient confirmed balance' using errcode = 'P0001';
  end if;

  insert into public.redemptions
    (user_id, product_id, points, phone, status, idempotency_key)
    values (p_user_id, p_product_id, v_product.points, v_phone, 'requested', p_idem)
    returning * into v_redemption;
  insert into public.point_transactions
    (user_id, kind, amount, redemption_id, week_id, status, idempotency_key, confirmed_at)
    values (p_user_id, 'redeem', -v_product.points, v_redemption.id,
      public.week_id_for(clock_timestamp()), 'confirmed',
      'redeem:' || p_idem, clock_timestamp());
  if v_product.stock is not null then
    update public.products set stock = stock - 1 where id = p_product_id;
  end if;
  return v_redemption;
end $$;

create function public.resolve_redemption(
  p_redemption_id uuid, p_issued boolean, p_fail_reason text default null
) returns public.redemptions
language plpgsql security definer set search_path = public as $$
declare
  v_redemption public.redemptions%rowtype;
begin
  if p_issued is null then raise exception 'Resolution is required' using errcode = '22023'; end if;
  select * into v_redemption from public.redemptions
    where id = p_redemption_id for update;
  if not found then raise exception 'Redemption not found' using errcode = 'P0002'; end if;
  if v_redemption.status <> 'requested' then return v_redemption; end if;
  perform 1 from public.users where id = v_redemption.user_id for update;

  if p_issued then
    update public.redemptions set status = 'issued', issued_at = clock_timestamp()
      where id = p_redemption_id returning * into v_redemption;
  else
    if nullif(trim(p_fail_reason), '') is null then
      raise exception 'Failure reason is required' using errcode = '22023';
    end if;
    insert into public.point_transactions
      (user_id, kind, amount, redemption_id, week_id, status,
        idempotency_key, note, confirmed_at)
      values (v_redemption.user_id, 'refund', v_redemption.points,
        v_redemption.id, public.week_id_for(clock_timestamp()), 'confirmed',
        'redemption:' || v_redemption.id::text || ':refund', p_fail_reason,
        clock_timestamp())
      on conflict (idempotency_key) do nothing;
    update public.products set stock = stock + 1
      where id = v_redemption.product_id and stock is not null;
    update public.redemptions set status = 'failed', fail_reason = p_fail_reason
      where id = p_redemption_id returning * into v_redemption;
  end if;
  return v_redemption;
end $$;

revoke all on function public.redeem_product(uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function public.resolve_redemption(uuid, boolean, text) from public, anon, authenticated;
grant execute on function public.redeem_product(uuid, uuid, text, text) to service_role;
grant execute on function public.resolve_redemption(uuid, boolean, text) to service_role;
