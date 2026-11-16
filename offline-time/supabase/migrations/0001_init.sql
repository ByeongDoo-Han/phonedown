create type public.primary_mode as enum ('sleep', 'focus', 'both');
create type public.session_mode as enum ('sleep', 'focus');
create type public.session_source as enum ('charge', 'timer');
create type public.session_status as enum ('open', 'valid', 'invalid');
create type public.txn_kind as enum ('earn_sleep', 'earn_focus', 'bonus', 'redeem', 'refund', 'adjust');
create type public.txn_status as enum ('pending', 'confirmed', 'void');
create type public.redemption_status as enum ('requested', 'issued', 'failed');

create table public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  primary_mode public.primary_mode not null default 'both',
  timezone text not null default 'Asia/Seoul',
  onboarded_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  platform text not null check (platform in ('ios', 'android')),
  push_token text,
  last_seen_at timestamptz not null default now()
);

create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  device_id uuid references public.devices(id) on delete set null,
  mode public.session_mode not null,
  source public.session_source not null,
  client_started_at timestamptz not null,
  client_ended_at timestamptz,
  server_started_at timestamptz not null default now(),
  server_ended_at timestamptz,
  status public.session_status not null default 'open',
  invalid_reason text,
  planned_minutes int,
  created_at timestamptz not null default now()
);
create index sessions_user_week_idx on public.sessions (user_id, server_started_at desc);
create unique index sessions_one_open_per_user on public.sessions (user_id) where status = 'open';

create table public.point_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  kind public.txn_kind not null,
  amount int not null,
  session_id uuid references public.sessions(id) on delete set null,
  redemption_id uuid,
  week_id text not null,
  status public.txn_status not null default 'pending',
  note text,
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  confirmed_at timestamptz
);
create unique index point_txn_idem on public.point_transactions (idempotency_key);
create index point_txn_user_idx on public.point_transactions (user_id, created_at desc);

create function public.forbid_amount_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.amount is distinct from old.amount
    or new.kind is distinct from old.kind
    or new.user_id is distinct from old.user_id
    or new.idempotency_key is distinct from old.idempotency_key
    or new.session_id is distinct from old.session_id
    or new.redemption_id is distinct from old.redemption_id
    or new.week_id is distinct from old.week_id then
    raise exception 'point_transactions is append-only';
  end if;
  return new;
end $$;
create trigger point_txn_append_only before update on public.point_transactions
  for each row execute function public.forbid_amount_update();

create table public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type text not null check (type in ('naverpay', 'coupon')),
  points int not null check (points % 1000 = 0 and points >= 1000),
  stock int,
  active boolean not null default true,
  sort_order int not null default 0
);

create table public.redemptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  product_id uuid not null references public.products(id),
  points int not null,
  phone text,
  status public.redemption_status not null default 'requested',
  issued_at timestamptz,
  fail_reason text,
  idempotency_key text not null,
  created_at timestamptz not null default now()
);
create unique index redemptions_idem on public.redemptions (idempotency_key);
alter table public.point_transactions add constraint point_txn_redemption_fk
  foreign key (redemption_id) references public.redemptions(id) on delete set null;

create table public.point_rules (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

insert into public.point_rules (key, value) values
  ('currency', '{"point_to_krw":1}'),
  ('earn_rate', '{"sleep_per_hour":2,"focus_per_hour":3,"floor_minutes":10}'),
  ('primary_bonus', '{"multiplier":1.5}'),
  ('weekly_cap', '{"points":180,"after_cap_multiplier":1.0}'),
  ('session_min_minutes', '{"sleep":40,"focus":20}'),
  ('session_max_minutes', '{"sleep":720,"focus":180}'),
  ('daily_cap_minutes', '{"sleep":600,"focus":360}'),
  ('settlement', '{"weekday":"monday","start_minute_kst":0,"end_minute_kst":10,"expire":false}'),
  ('redemption', '{"minimum_points":1000,"step_points":1000}'),
  ('clock_skew', '{"seconds":120}'),
  ('ads', '{"morning_max":1,"focus_max":1,"on_launch":false}');

create table public.settlements (
  week_id text not null,
  user_id uuid not null references public.users(id) on delete cascade,
  confirmed_points int not null,
  confirmed_at timestamptz not null default now(),
  primary key (week_id, user_id)
);

create function public.create_user_profile() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.users (id) values (new.id);
  return new;
end $$;
create trigger auth_user_profile after insert on auth.users
  for each row execute function public.create_user_profile();

alter table public.users enable row level security;
alter table public.devices enable row level security;
alter table public.sessions enable row level security;
alter table public.point_transactions enable row level security;
alter table public.products enable row level security;
alter table public.redemptions enable row level security;
alter table public.point_rules enable row level security;
alter table public.settlements enable row level security;

create policy users_read_own on public.users for select to authenticated using (id = (select auth.uid()));
create policy users_update_own on public.users for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));
create policy devices_read_own on public.devices for select to authenticated using (user_id = (select auth.uid()));
create policy sessions_read_own on public.sessions for select to authenticated using (user_id = (select auth.uid()));
create policy transactions_read_own on public.point_transactions for select to authenticated using (user_id = (select auth.uid()));
create policy products_read_active on public.products for select to authenticated using (active = true);
create policy redemptions_read_own on public.redemptions for select to authenticated using (user_id = (select auth.uid()));
create policy point_rules_read on public.point_rules for select to authenticated using (true);
create policy settlements_read_own on public.settlements for select to authenticated using (user_id = (select auth.uid()));

-- Point-granting and spending writes stay on the service role side in later milestones.
