# 오프라인 타임 — Codex 초기 프롬프트

> **사용법** — 아래 `===== PROMPT START =====` 부터 끝까지를 그대로 복사해 OpenAI Codex(또는 Codex CLI)에 붙여넣으면 됩니다. 이 파일 전체를 붙여넣어도 됩니다. 프롬프트는 영문으로 작성했습니다(코드 생성 정확도가 가장 높은 형식). 앱 안의 문구·주석은 한국어로 생성하도록 지시되어 있습니다.

===== PROMPT START =====

# Project: Offline Time — a "time spent off the phone" reward app (iOS + Android)

You are the coding agent for this project. Build it incrementally, in the order of the milestones at the end of this prompt, and stop to report at each milestone. Read the whole prompt before writing code.

## 1. Product in one paragraph

Korean users already have separate apps that pay them for sleeping (Sleep Money, Cash Sleep), for charging the phone (Cash Charge), and for locking the phone (Time Spread). This product merges all three into **one timeline of "offline time"**: at night the phone is charging, during the day a focus timer runs, and both accumulate into a single point balance that is **settled once a week (Sunday 24:00 KST)** and redeemed in 1,000-point units for Naver Pay points and Korean gift cards. The promise to the user is: 3 apps → 1, no midnight expiry, no lottery-style "one entry at a time" grinding, and only 1–2 ads per day, shown at settlement. UI text is Korean; code, identifiers, and comments in English.

## 2. Non-negotiable product rules

Copy these values into `src/constants/pointRules.ts` and also into a server-side `point_rules` table. They must never be hard-coded in two places — the client reads them from the server, with these values as defaults.

| Rule | Value |
|---|---|
| Currency | 1 point (P) = 1 KRW, integers only |
| Sleep earn rate | 2 P per hour, floor to 10-minute steps |
| Focus earn rate | 3 P per hour, floor to 10-minute steps |
| Primary-mode bonus | ×1.5 on the user's chosen primary mode only (`sleep` / `focus` / `both` → both modes get ×1.5) |
| Weekly cap | 180 P per user per week (bonus included); after the cap, keep accruing at 1.0× |
| Min session | sleep 40 min, focus 20 min (shorter = `invalid`, no points) |
| Max session | sleep 12 h, focus 3 h (truncate the rest) |
| Daily cap | sleep 10 h, focus 6 h combined per day |
| Settlement | weekly, Monday 00:00–00:10 KST batch; `pending` → `confirmed`; no expiry |
| Redemption | minimum 1,000 P, step 1,000 P; only `confirmed` balance can be spent |
| Clock skew | reject session if \|client start − server start\| > 120 s |
| Ads | exactly one rewarded video at morning settlement and at most one at focus settlement; **never on app launch** |

Rules that are architectural, not cosmetic:

1. **The client never computes points.** It sends session start/end, mode, and whether the charger was connected. The server recomputes duration, applies caps, and writes the ledger.
2. **Points are an append-only ledger.** `point_transactions` rows are never updated in amount; corrections are new `adjust` rows with the opposite sign. Balance = sum of confirmed rows.
3. **Idempotency everywhere.** Every write that grants or spends points carries an `idempotency_key` (e.g. `session:<uuid>:earn`), enforced by a unique index.
4. **Background execution is not assumed.** iOS cannot keep a timer alive; Android may be killed. Sessions are interval records reconciled on next app launch.

## 3. Tech stack (fixed — do not substitute without asking)

- **App:** React Native with **Expo SDK 54+**, TypeScript strict, `expo-router` (file-based routing), React 19.
- **State:** Zustand for the live session/timer, TanStack Query for all server state.
- **Styling:** StyleSheet + a single design-token file (`src/theme/tokens.ts`). No UI kit.
- **Backend:** Supabase — Postgres 15, Auth (email + Apple + Google), Edge Functions (Deno) for session validation and redemption, `pg_cron` for the weekly settlement.
- **Local:** `expo-sqlite` for the offline session queue, `expo-secure-store` for tokens.
- **Notifications:** `expo-notifications` + Expo Push.
- **Ads:** `react-native-google-mobile-ads` (AdMob rewarded) with server-side verification (SSV) endpoint.
- **Observability:** Sentry (`@sentry/react-native`), PostHog events: `session_start`, `session_end`, `settle_claim`, `redeem_request`, `cap_reached`.
- **Tests:** Vitest for pure logic, Jest + React Native Testing Library for components, Maestro for 3 E2E smoke flows.

Package manager: `pnpm`. Node 22. Use `npx expo install` for Expo-managed packages so versions match the SDK.

## 4. Repository layout

```
offline-time/
├─ app/                         # expo-router routes
│  ├─ (auth)/sign-in.tsx        # email / Apple / Google
│  ├─ (onboarding)/mode.tsx     # single question: sleep | focus | both
│  ├─ (tabs)/
│  │  ├─ _layout.tsx            # 3 tabs, no badges
│  │  ├─ index.tsx              # TAB 1 홈: today's offline state
│  │  ├─ records.tsx            # TAB 2 기록: weekly rhythm + settlement preview
│  │  └─ store.tsx              # TAB 3 교환소: redeem 1,000 P units
│  ├─ settle/[sessionId].tsx    # morning settlement card (AD + confirm)
│  └─ ledger.tsx                # transaction history
├─ src/
│  ├─ components/               # TimerRing, StatRow, ProductCard, ModeBadge, TabBar
│  ├─ features/
│  │  ├─ session/               # sessionEngine.ts, useSession.ts, sessionQueue.ts
│  │  ├─ battery/               # iOS + Android charge detection adapters
│  │  ├─ points/                # pointMath.ts (pure, fully unit-tested), formatting
│  │  ├─ settlement/            # claim flow, SSV callback handling
│  │  └─ rewards/               # products, redemption flow
│  ├─ lib/supabase.ts, queryClient.ts, analytics.ts, notifications.ts
│  ├─ constants/pointRules.ts
│  └─ theme/tokens.ts
├─ modules/                     # local Expo config plugins (native code)
│  ├─ charge-detector/          # iOS + Android charge event bridge
│  ├─ focus-guard/              # Android UsageStats foreground detection
│  └─ live-activity/            # iOS ActivityKit timer
├─ supabase/
│  ├─ migrations/               # numbered SQL migrations (see §6)
│  ├─ functions/session-end/index.ts
│  ├─ functions/redeem/index.ts
│  └─ functions/admob-ssv/index.ts
└─ docs/                        # this prompt + the product spec (spec.md)
```

## 5. Data model (Supabase / Postgres)

Write this as `supabase/migrations/0001_init.sql`. Use enums, `uuid` primary keys, `timestamptz`, and RLS on every table (a user may only read/write their own rows; service role bypasses RLS for batch jobs).

```sql
create type primary_mode as enum ('sleep','focus','both');
create type session_mode as enum ('sleep','focus');
create type session_source as enum ('charge','timer');
create type session_status as enum ('open','valid','invalid');
create type txn_kind as enum ('earn_sleep','earn_focus','bonus','redeem','refund','adjust');
create type txn_status as enum ('pending','confirmed','void');
create type redemption_status as enum ('requested','issued','failed');

create table users (
  id uuid primary key references auth.users(id) on delete cascade,
  primary_mode primary_mode not null default 'both',
  timezone text not null default 'Asia/Seoul',
  onboarded_at timestamptz,
  created_at timestamptz not null default now()
);

create table devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  platform text not null check (platform in ('ios','android')),
  push_token text,
  last_seen_at timestamptz not null default now()
);

create table sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  device_id uuid references devices(id) on delete set null,
  mode session_mode not null,
  source session_source not null,
  client_started_at timestamptz not null,
  client_ended_at timestamptz,
  server_started_at timestamptz not null default now(),
  server_ended_at timestamptz,
  status session_status not null default 'open',
  invalid_reason text,
  planned_minutes int,
  created_at timestamptz not null default now()
);
create index sessions_user_week_idx on sessions (user_id, server_started_at desc);
create unique index sessions_one_open_per_user on sessions (user_id) where status = 'open';

create table point_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  kind txn_kind not null,
  amount int not null,                  -- signed: +earn, -redeem
  session_id uuid references sessions(id) on delete set null,
  redemption_id uuid,
  week_id text not null,                -- ISO week in KST, e.g. '2026-W46'
  status txn_status not null default 'pending',
  note text,
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  confirmed_at timestamptz
);
create unique index point_txn_idem on point_transactions (idempotency_key);
create index point_txn_user_idx on point_transactions (user_id, created_at desc);
-- amounts are immutable
create function forbid_amount_update() returns trigger language plpgsql as $$
begin
  if new.amount <> old.amount or new.kind <> old.kind then
    raise exception 'point_transactions is append-only';
  end if;
  return new;
end $$;
create trigger point_txn_append_only before update on point_transactions
  for each row execute function forbid_amount_update();

create table products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type text not null check (type in ('naverpay','coupon')),
  points int not null check (points % 1000 = 0 and points >= 1000),
  stock int,
  active boolean not null default true,
  sort_order int not null default 0
);

create table redemptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  product_id uuid not null references products(id),
  points int not null,
  phone text,
  status redemption_status not null default 'requested',
  issued_at timestamptz,
  fail_reason text,
  idempotency_key text not null,
  created_at timestamptz not null default now()
);
create unique index redemptions_idem on redemptions (idempotency_key);

create table point_rules (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

create table settlements (
  week_id text not null,
  user_id uuid not null references users(id) on delete cascade,
  confirmed_points int not null,
  confirmed_at timestamptz not null default now(),
  primary key (week_id, user_id)
);
```

Then implement these database functions (all `security definer`, `search_path = public`):

- `week_id_for(ts timestamptz) returns text` — ISO week number computed in `Asia/Seoul`.
- `confirmed_balance(uid uuid) returns int` — `sum(amount)` where `status = 'confirmed'`.
- `apply_earn(p_session_id uuid) returns point_transactions` — recompute duration from server timestamps, apply min/max/daily/weekly caps, insert one ledger row with `on conflict (idempotency_key) do nothing` and return the existing row if it already exists.
- `redeem_product(p_user_id uuid, p_product_id uuid, p_phone text, p_idem text) returns redemptions` — single transaction: lock the user's confirmed balance, check ≥ 1,000 and ≥ product points, insert `redeem` ledger row and `redemptions` row, return it. Must be safe under double-tap (same `p_idem` → returns the same redemption).
- `settle_week(p_week_id text) returns int` — flip `pending` → `confirmed` for all users in that week, write `settlements`, respect the 180 P cap at confirmation time, return the number of rows.

Schedule it with `pg_cron`:

```sql
select cron.schedule('weekly-settlement', '0 0 * * 1', $$ select settle_week(week_id_for(now() - interval '1 minute')) $$);
```

(The job runs Monday 00:00 in the database timezone; set the database timezone to `Asia/Seoul` in the Supabase project settings, or convert explicitly inside the function.)

## 6. Pure point math (write this first, with tests)

`src/features/points/pointMath.ts` — no imports, no I/O:

```ts
export type Mode = 'sleep' | 'focus';
export type PrimaryMode = 'sleep' | 'focus' | 'both';

export const RULES = {
  sleepPerHour: 2,
  focusPerHour: 3,
  bonus: 1.5,
  weeklyCap: 180,
  minMinutes: { sleep: 40, focus: 20 },
  maxMinutes: { sleep: 12 * 60, focus: 3 * 60 },
  dayCapMinutes: { sleep: 10 * 60, focus: 6 * 60 },
} as const;

/** Minutes are floored to 10-minute steps before the rate is applied. */
export function earnPoints(mode: Mode, minutes: number, primary: PrimaryMode): number
```

Required behaviour (write these as Vitest cases):
- `earnPoints('sleep', 450, 'sleep')` → 22 (450 min → 15 P → ×1.5 = 22.5 → floor 22)
- `earnPoints('sleep', 450, 'focus')` → 15
- `earnPoints('focus', 120, 'both')` → 9 (2 h × 3 P = 6 P, ×1.5 = 9)
- `earnPoints('focus', 19, 'focus')` → 0 (below the 20-minute minimum)
- weekly cap: 171 P earned + a 20 P session → 9 P, and the session is flagged `cap_reached`
- 10-minute flooring: 455 min at sleep rate behaves as 450 min

## 7. Screens

Three tabs only. No feed, no badges, no roulette.

**Tab 1 홈 — "오늘의 오프라인"**
- Big ring `TimerRing` (SVG) with elapsed time, secondary label (`수면 적립 중` / `집중 적립 중` / `대기 중`), and the live "expected points" (`+22P 예정`, with an `×1.5` badge when the bonus applies).
- Sleep state: starts automatically when the charger is connected (or when the user taps "지금 시작"). Ends when the device is unlocked after ≥ 5 minutes of no app activity, or on charger disconnect.
- Focus state: presets 30 / 60 / 90 min, default = last used. Leaving the app pauses the session; returning within 3 min resumes; otherwise the session ends and is submitted.
- Morning settlement CTA: only between 05:00 and 11:00 local time, and only once per day; otherwise a text link "오늘 기록 보기".
- A single line of guidance, never a permission nag.

**Settlement card (`app/settle/[sessionId].tsx`)**
- "굿모닝! 어젯밤 7시간 30분 푹 쉬었어요", the confirmed amount, and one button: `광고 1편 보고 정산 받기`.
- If the rewarded ad fails to load within 3 s, confirm automatically and show "오늘은 광고 없이 지급".
- On SSV success (or the timeout path) call `session-end`/`claim` and show the new balance.

**Tab 2 기록**
- This week's total offline time, sleep/focus 7-day bars, weekly settlement preview, cap gauge (of 180 P), current and best streak, last week's settlement.
- Pulls from a single RPC `weekly_summary(p_user_id, p_week)` — do not aggregate on the client.

**Tab 3 교환소**
- Confirmed balance only; products in 1,000 P steps; `[부족]` state when the balance is short; redemption history with `신청 / 발송완료 / 실패(환급)`.
- Redemption asks for a phone number (gift cards), confirms once, and disables the button while the request is in flight.

**Onboarding** — one question: `주로 언제 폰을 내려놓고 싶으세요?` with `밤에 잘 때 / 낮에 일·공부할 때 / 둘 다`. Then an optional notification prompt and a one-screen explanation of charge detection. Total under 40 seconds.

## 8. Platform integration guide

**Shared rule:** sessions are intervals. The app records start, writes it to SQLite, and submits on the next foreground/launch. Never rely on an in-app timer to keep counting in the background.

**iOS**
- Battery: `UIDevice.current.isBatteryMonitoringEnabled = true`, observe `batteryStateDidChangeNotification` (`.charging/.full`). In Expo, `Battery.addBatteryStateListener` covers the foreground case; the custom plugin must forward the notification while the app is active.
- Background: there is no continuous background timer. Do not request one. Use `BGProcessingTask` only as a best-effort sync hook, and treat the result as optional.
- Lock/unlock: `UIApplication.didBecomeActiveNotification` + `protectedDataDidBecomeAvailable` identify the morning unlock that ends a sleep session.
- Live Activity (`ActivityKit`, iOS 16.1+) shows the running timer on the lock screen and Dynamic Island. Content is neutral (elapsed time, mode) — no reward CTAs inside the Live Activity.
- Info.plist: no location, camera, or contacts. Only `NSUserNotificationsUsageDescription` if a notification explanation is needed, and `NSSupportsLiveActivities` for the timer.

**Android**
- Battery: register a `BroadcastReceiver` for `ACTION_POWER_CONNECTED`, `ACTION_POWER_DISCONNECTED`, and read the sticky `ACTION_BATTERY_CHANGED` on start. No runtime permission.
- Foreground service: `foregroundServiceType="specialUse"` with a manifest `<property android:name="android.app.PROPERTY_SPECIAL_USE_FGS_SUBTYPE" android:value="offline sleep/focus session tracking"/>`, a persistent, low-importance notification ("수면 적립 중"), and a `POST_NOTIFICATIONS` request on Android 13+.
- Focus guard: `UsageStatsManager.queryEvents` (needs the user to grant `PACKAGE_USAGE_STATS` in Settings via `Settings.ACTION_USAGE_ACCESS_SETTINGS`). If the permission is denied, degrade to time-only measurement and say so on screen once.
- Session end alarm: `AlarmManager.setExactAndAllowWhileIdle` with `SCHEDULE_EXACT_ALARM`; fall back to inexact alarms when not granted.
- Sync: `WorkManager` periodic (15 min minimum) to flush the SQLite queue.
- Do **not** implement lock-screen replacement, accessibility-service overlays, or `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` demands. Those violate Play policy or the product's promise.

**Both:** submit `{ mode, source, clientStartedAt, clientEndedAt, deviceId }` to `session-end`. That Edge Function stamps server time, applies the validation rules of §2, calls `apply_earn`, and returns the ledger row. Reject silently in the UI only when the user can act on it; otherwise show "확인 중" with the reason.

## 9. Milestones (build and report in this order)

| # | Goal | Done when |
|---|---|---|
| M0 | Repo + Expo app + Supabase project, auth (email/Apple/Google), onboarding question | A new user lands on the home tab with `primary_mode` persisted |
| M1 | Charge detection and session engine on both platforms, local queue, `session-end` function | A 45-minute simulated sleep session produces exactly one `pending` ledger row and one `sessions` row |
| M2 | Home tab (both states) + focus timer with presets and pause/resume rules | Timer survives app backgrounding and resumes with the correct remaining time |
| M3 | Settlement card + AdMob rewarded + SSV endpoint + weekly batch + Monday push | Weekly batch flips every pending row, the push arrives, the card shows the exact amount |
| M4 | Records tab (weekly summary RPC, bars, streak, cap gauge) | 7 days of seeded data renders correctly, including a cap-reached week |
| M5 | Store tab + redemption RPC + history | Double-tapping redeem creates exactly one redemption and one negative ledger row |
| M6 | Abuse rules, Sentry/PostHog, Maestro flows, store listing copy | The 10 acceptance checks in §10 pass |

Do not start M3 before M1's ledger is idempotent and tested. Do not add a fourth tab.

## 10. Definition of done / test checklist

Unit (Vitest, must all pass):
1. `earnPoints` cases from §6, including flooring, minimums, and the ×1.5 rule for each `primary_mode`.
2. Weekly cap: cap applied across multiple sessions in one week; never negative; cap-reached flag raised.
3. Overlap merge: a sleep session and a focus session that overlap count the overlapping minutes once.
4. `idempotency_key` collision returns the original row, not a second one.

Integration (Supabase local, SQL tests):
5. `redeem_product` under two concurrent calls spends the balance once.
6. `settle_week` leaves zero `pending` rows for the week and is safe to run twice.
7. A session started with a client clock 2 hours ahead is stored `invalid` with `clock_skew`.
8. RLS: user A cannot read user B's `point_transactions` or `redemptions`.

E2E (Maestro):
9. Onboarding → home → start focus 30 min (mocked clock) → settlement → balance increases.
10. Store: redeem Naver Pay 1,000 P with a 1,000 P balance → balance 0, history shows 발송완료.

## 11. Guardrails

- Do not add ads on app launch, popups, attendance roulette, or an offerwall.
- Do not request location, contacts, photos, or the camera.
- Do not compute points on the client, and do not trust any client-sent point value.
- Do not expire points; if you must notify about inactivity, notify only.
- Keep all user-visible copy in Korean, in the tone of the spec (short, calm, no exclamation-mark marketing).
- Every PR should keep the app runnable: no half-merged native modules.
- Commit style: conventional commits, one milestone per branch (`feat/m1-session-engine`).

## 12. First actions

1. Scaffold with `pnpm create expo-app offline-time --template default` (TypeScript), add `expo-router`, and commit.
2. Write `src/features/points/pointMath.ts` and its Vitest suite — this is the specification of the product's arithmetic; get it right before any UI.
3. Create the Supabase migrations from §5 and run them locally (`supabase start`, `supabase db reset`).
4. Implement `session-end` and `apply_earn`, then prove M1 with a scripted session.
5. Report back with: what was built, the test output, and any place where this prompt was ambiguous.

===== PROMPT END =====
