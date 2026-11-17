-- 수면(sleep) 모드: 충전 상태와 함께 밤 시간을 기록하고 아침에 한 번에 정산한다.
-- 집중 모드와 같은 원장(apply_earn)을 쓰되, 유효 기준만 수면 규칙(40분 이상, 12시간 절단,
-- 하루 10시간)을 따른다. 단가는 두 모드 모두 시간당 2P(10분 절사)이고, 주간 기본 100P
-- 상한은 두 모드의 기본 적립을 합쳐서 계산되므로 수면만으로도·집중과 섞여도 넘지 않는다.

-- 1) 수면 목표 시간: 프로필에 취침·기상 목표를 둔다(없으면 앱이 기본값을 안내만 한다).
alter table public.users add column if not exists sleep_bedtime time without time zone;
alter table public.users add column if not exists sleep_waketime time without time zone;
comment on column public.users.sleep_bedtime is '목표 취침 시각(KST 벽시계). 기록 시작 알림에만 쓰고 적립 계산에는 쓰지 않는다.';
comment on column public.users.sleep_waketime is '목표 기상 시각(KST 벽시계). 아침 정산 카드의 목표 시간 표시에 쓴다.';

-- 2) 세션에 충전 이벤트를 남긴다. 충전은 적립 조건이 아니라 기록 근거다
--    (권한을 요구하지 않고, 충전 중이 아니어도 수동 수면 기록은 유효하다).
alter table public.sessions add column if not exists started_charging boolean;
alter table public.sessions add column if not exists ended_charging boolean;

-- 3) 수면 세션 종료·정산. finish_focus_session과 같은 구조이며 규칙 키만 sleep을 읽는다.
create or replace function public.finish_sleep_session(
  p_session_id uuid,
  p_user_id uuid,
  p_client_ended_at timestamptz,
  p_ended_charging boolean default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_session public.sessions%rowtype;
  v_txn public.point_transactions%rowtype;
  v_now timestamptz;
  v_min_minutes integer;
  v_max_minutes integer;
  v_truncated boolean := false;
begin
  select * into v_session from public.sessions
    where id = p_session_id and user_id = p_user_id and mode = 'sleep' for update;
  if not found then raise exception 'Sleep session not found' using errcode = 'P0002'; end if;

  if v_session.status = 'open' then
    v_now := clock_timestamp();
    select (value->>'sleep')::integer into v_min_minutes
      from public.point_rules where key = 'session_min_minutes';
    select (value->>'sleep')::integer into v_max_minutes
      from public.point_rules where key = 'session_max_minutes';
    if v_min_minutes is null or v_max_minutes is null then
      raise exception 'Sleep rules are incomplete';
    end if;
    v_truncated := v_now - v_session.server_started_at > make_interval(mins => v_max_minutes);
    update public.sessions set
      client_ended_at = coalesce(p_client_ended_at, v_now),
      ended_charging = coalesce(p_ended_charging, ended_charging),
      server_ended_at = greatest(server_started_at,
        least(v_now, server_started_at + make_interval(mins => v_max_minutes))),
      status = case
        when p_client_ended_at is null
          or abs(extract(epoch from p_client_ended_at - v_now)) > 120 then 'invalid'::public.session_status
        when v_now - server_started_at < make_interval(mins => v_min_minutes) then 'invalid'::public.session_status
        else 'valid'::public.session_status end,
      invalid_reason = case
        when p_client_ended_at is null
          or abs(extract(epoch from p_client_ended_at - v_now)) > 120 then 'clock_skew'
        when v_now - server_started_at < make_interval(mins => v_min_minutes) then 'too_short'
        else null end
      where id = p_session_id returning * into v_session;
  else
    -- A repeated request returns the stored end state, never a second settlement.
    v_truncated := false;
  end if;
  if v_session.status = 'valid' then v_txn := public.apply_earn(p_session_id); end if;
  return jsonb_build_object('session', to_jsonb(v_session),
    'transaction', case when v_txn.id is null then null else to_jsonb(v_txn) end,
    'truncated', v_truncated);
end $$;

revoke all on function public.finish_sleep_session(uuid, uuid, timestamptz, boolean)
  from public, anon, authenticated;
grant execute on function public.finish_sleep_session(uuid, uuid, timestamptz, boolean)
  to service_role;

-- 4) 수면 규칙 확인용 값(0001에서 이미 들어 있다). 원격에 값이 비어 있으면 기본값을 채운다.
insert into public.point_rules (key, value)
values ('session_min_minutes', '{"sleep":40,"focus":20}'),
       ('session_max_minutes', '{"sleep":720,"focus":180}'),
       ('daily_cap_minutes', '{"sleep":600,"focus":360}')
on conflict (key) do nothing;
