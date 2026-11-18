-- Executes only in a rollback transaction. No user's balance is changed.
-- v0.2: a completed week confirms ad bonus rows together with the base earn rows.
begin;
do $$
declare
  v_user uuid;
  v_first_id uuid := gen_random_uuid();
  v_bonus_id uuid := gen_random_uuid();
  v_late_id uuid := gen_random_uuid();
  v_initial_balance integer;
  v_changed integer;
  v_status public.txn_status;
  v_settlement integer;
begin
  select id into v_user from public.users order by created_at limit 1;
  if v_user is null then raise exception 'No user available for settlement test'; end if;
  v_initial_balance := public.confirmed_balance(v_user);
  insert into public.point_transactions
    (id, user_id, kind, amount, week_id, status, idempotency_key)
  values (v_first_id, v_user, 'earn_focus', 9, '2020-W02', 'pending',
    'test:settlement:' || v_first_id::text);
  insert into public.point_transactions
    (id, user_id, kind, amount, week_id, status, idempotency_key, note, bonus_pool)
  values (v_bonus_id, v_user, 'bonus', 9, '2020-W02', 'pending',
    'test:settlement-bonus:' || v_bonus_id::text, 'ad_booster', 'ad');

  v_changed := public.settle_week('2020-W02');
  if v_changed <> 2 then raise exception 'Expected two confirmed rows, got %', v_changed; end if;
  v_changed := public.settle_week('2020-W02');
  if v_changed <> 0 then raise exception 'Repeated settlement changed % rows', v_changed; end if;
  select status into v_status from public.point_transactions where id = v_first_id;
  if v_status <> 'confirmed' then raise exception 'Base earn row was not confirmed'; end if;
  select status into v_status from public.point_transactions where id = v_bonus_id;
  if v_status <> 'confirmed' then raise exception 'Ad bonus row was not confirmed'; end if;
  select confirmed_points into v_settlement from public.settlements
    where user_id = v_user and week_id = '2020-W02';
  if v_settlement <> 18
     or public.confirmed_balance(v_user) <> v_initial_balance + 18 then
    raise exception 'Settlement balance or summary mismatch';
  end if;

  insert into public.point_transactions
    (id, user_id, kind, amount, week_id, status, idempotency_key)
  values (v_late_id, v_user, 'earn_focus', 2, '2020-W03', 'pending',
    'test:late-settlement:' || v_late_id::text);
  v_changed := public.settle_due_weeks();
  if v_changed <> 1 or public.settle_due_weeks() <> 0 then
    raise exception 'Late-week catch-up was not idempotent';
  end if;

  begin
    perform public.settle_week(public.week_id_for(clock_timestamp()));
    raise exception 'Current week was settled';
  exception when sqlstate '22023' then null;
  end;
end $$;
rollback;
