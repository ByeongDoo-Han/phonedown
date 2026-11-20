# 오프라인 타임

Expo SDK 58 모바일 앱과 Supabase 데이터베이스의 초기 구현입니다. 가입, 로그인, 주력 시간 선택, 수동 집중·수면 기록 시작·종료, 최근 기록 조회, 유효한 기록의 포인트 적립, 지난주 포인트 정산, 교환 신청·이력이 동작합니다. 포인트는 기본 적립(1시간 = 2P, 주 100P까지)과 광고 부스터(2배, 주 80P까지)·주간 보너스 상자로 나뉘며, 광고 보상은 AdMob SSV 콜백으로만 지급됩니다. 수면은 충전 상태를 확인해 시작하고 충전기가 꽂혀 있으면 1탭으로 바로 시작하며, 아침에 한 번 눌러 정산합니다. iOS에서는 집중·수면 기록이 도는 동안 잠금화면과 다이내믹 아일랜드에 실시간 타이머가 떠 있고(Live Activity, 개발 빌드 필요), 정산하면 그 자리에서 닫힙니다. 충전 이벤트는 앱이 살아 있는 동안 받고 복귀·정산 시점에 다시 읽습니다(백그라운드 자동 감지·서버 푸시는 없음). `혜택` 탭에서 친구 초대(3일 연속 정산 시 양쪽 +300P, 월 5회)와 브랜드 스폰서 챌린지(달성 시 브랜드 쿠폰)를 쓸 수 있습니다 — 챌린지는 제휴 계약 전이라 비활성 씨앗만 있습니다. 발송은 이제 앱 안의 **운영자 도구**에서 처리합니다: 공급자 키가 없으면 수동 모드로 운영자가 직접 보낸 뒤 완료/실패를 기록하고, 키를 넣으면 기프티콘 공급자 호출로 바뀝니다. 계정 탈퇴(App Store 필수)와 이용약관·개인정보처리방침 화면도 들어갔습니다.

연결된 원격 `apptech` 프로젝트(`uhisjleftevizjfudeip`)는 PostgreSQL 17.11입니다. 초기 기획의 PostgreSQL 15 고정 조건은 2026-11-16 사용자 선택에 따라 이 프로젝트에서 PostgreSQL 17로 변경했습니다. `0001_init.sql`과 앱 복귀 URL 설정은 원격에 적용됐습니다.

## 로컬 실행

Node 22와 pnpm이 필요합니다.

```sh
pnpm install
npx supabase start
npx supabase db reset
```

`npx supabase status`에서 나온 API URL과 anon/publishable key를 `.env.example`을 복사한 `.env`에 넣습니다. Android 에뮬레이터에서는 로컬 API 호스트를 `10.0.2.2`로 바꿔야 합니다. 실제 기기에서는 개발 PC의 LAN 주소를 사용합니다.

```sh
pnpm start
```

이메일 인증은 로컬 Supabase에서 즉시 가입되도록 설정되어 있습니다. 원격 `apptech` 프로젝트는 이메일 확인이 켜져 있어 가입 후 메일 링크를 열어야 합니다.

## 원격 인증 설정

원격 Supabase 프로젝트와 앱 환경 변수는 연결됐습니다. Google 및 Apple 제공자가 활성화됐습니다.

- Auth Redirect URL `offlinetime://auth/callback`과 개발 웹 URL은 등록됐습니다.
- Apple Developer에 앱 ID `app.offlinetime.mobile`과 Sign in with Apple 기능을 등록하고, Supabase Apple provider의 허용 Client ID에 같은 앱 ID를 설정했습니다. iOS 앱은 네이티브 Apple 로그인과 Supabase ID 토큰 교환을 사용하며 nonce를 검증합니다. 실제 iOS Apple 로그인은 Apple 권한이 포함된 서명 빌드에서 확인해야 합니다.
- Google 로그인은 Supabase OAuth와 PKCE(S256)를 사용하며 `offlinetime://auth/callback`으로 앱에 돌아옵니다. iOS 개발 빌드에서 계정 로그인, 앱 복귀, 온보딩 저장, 홈 진입, 앱 완전 종료 후 재실행 시 로그인 유지까지 확인했습니다.
- Android 개발 APK를 에뮬레이터에 설치했습니다. Google 계정 로그인 후 앱 홈 복귀, 주력 시간 표시, 앱 완전 종료 후 재실행 시 로그인 유지까지 확인했습니다.
- Android와 웹에서는 현재 Apple 로그인 버튼을 표시하지 않습니다. Android와 웹에 Apple 로그인을 제공하려면 Apple Services ID와 비밀 키를 설정해야 합니다.

Expo 프로젝트 [`@mybeats/offline-time`](https://expo.dev/accounts/mybeats/projects/offline-time)를 연결하고 `preview` 빌드 환경에 앱용 Supabase URL과 publishable key를 등록했습니다. `eas.json`에는 iOS 시뮬레이터와 실기기용 프로필이 있습니다. [iOS 시뮬레이터 빌드](https://expo.dev/accounts/mybeats/projects/offline-time/builds/c346d033-9b73-426e-a18d-e658365b9eec)는 완료돼 설치했습니다. Apple 버튼은 열렸지만 시뮬레이터에 Apple 계정이 로그인되지 않아 인증이 중단됐습니다. 설치된 시뮬레이터 앱의 코드 서명에는 Apple 로그인 권한이 보이지 않아, 실제 Apple 로그인 검증은 권한이 포함된 실기기 서명 빌드에서 진행해야 합니다.

Google 로그인은 Expo Go에서 복귀 URL을 테스트할 수 없습니다. iOS 또는 Android 개발 빌드에서 로그인하고, Google 동의 화면이 테스트 상태라면 테스트 사용자로 지정된 계정을 사용합니다. 개발 빌드 방법은 [Expo 인증 문서](https://docs.expo.dev/guides/authentication/)를 참고하세요.

서비스 역할 키와 OAuth 비밀 키는 앱 환경 변수에 넣지 않습니다. 앱에는 publishable key만 사용합니다.

## 집중 기록

홈에서 30·60·90분 목표를 선택하고 집중 기록을 시작하거나 종료할 수 있습니다. 서버의 `session-start`, `session-end` Edge Function이 로그인 사용자와 서버 시각을 확인한 뒤 `sessions`에 저장합니다. 같은 사용자의 열린 기록은 하나만 허용하며, 종료 요청을 다시 보내도 이미 종료된 기록을 반환합니다.

20분 미만은 `invalid`로 저장하고, 3시간을 넘기면 저장 시간을 3시간으로 제한합니다. 기록 탭은 최근 50건을 읽습니다.

`0002_focus_points.sql`은 종료와 포인트 적립을 한 트랜잭션으로 처리합니다. 유효한 집중 기록은 서버 시각을 기준으로 10분 단위, 시간당 2P를 계산하고 KST 기준 하루 집중 6시간 제한과 주간 기본 적립 100P 제한을 적용합니다. 주력 모드 배율은 v0.2에서 1.0이 되었고(보상은 광고 부스터로 이전), 기본 한도를 넘는 기록도 세션은 `valid`로 남고 포인트만 0P · `weekly_cap_reached`로 기록됩니다. `session:<id>:earn` 고유 키로 재시도 중복을 막습니다. 적립 행은 `pending`이며 앱은 포인트를 계산하지 않고 서버 장부의 적립 예정 금액을 표시합니다.

`0003_weekly_settlement.sql`은 완료된 KST 주의 `pending` 적립을 `confirmed`로 바꿉니다. 운영 DB는 UTC이며 Cron이 매일 UTC 15:00(KST 00:00)에 완료된 주를 확인합니다. 월요일에 지난주를 정산하고, 뒤늦게 들어온 지난주 적립도 다음 실행에서 처리합니다. 같은 주를 다시 정산해도 포인트를 중복 확정하지 않습니다. 이번 주 적립은 그 주가 끝나기 전에는 확정할 수 없습니다.

`0004_redemption.sql`은 활성 상품에 대해서만 교환을 허용합니다. 확정 잔액·최소 1,400P·100P 단위·재고를 DB 트랜잭션 안에서 확인하고, 교환 신청과 음수 장부 행을 함께 기록합니다. 같은 요청 키를 재전송해도 원래 신청을 반환합니다. 실제 발송 후 운영자가 `resolve_redemption(id, true)`로 발송 완료 처리할 수 있고, 발송 실패 시 `resolve_redemption(id, false, reason)`은 환급 장부 행과 재고 복원을 한 번만 수행합니다. 앱 교환소는 확정 잔액, 정산 전 포인트, 활성 상품, 신청 이력을 읽습니다.

`0006_weekly_cap_split.sql`은 v0.2 최종 단가·상한입니다. 기본 적립을 1시간 2P(30분 = 1P)로 올리고, 주간 상한을 기본 100P + 광고 부스터 80P로 나눕니다. 기본 한도에 닿은 세션은 기록은 그대로 남고 0P · `weekly_cap_reached`로 적립되며, 부스터·주간 상자는 같은 주 `bonus` 합계가 80P를 넘지 않게 잘리고 초과분은 `weekly_booster_cap`으로 기록만 됩니다. 소액 교환 라인업(네이버페이 1,000원 1,400P, 메가커피 아메리카노 2,800P, 상품권 5,000원 7,000P)을 `active = false`로 씨앗만 넣어 두었습니다.

`0005_ad_revenue_defense.sql`은 v0.2 수익·원가 방어 구조입니다(단가·주간 상한은 0006으로 대체). 기본 적립을 1시간 1P로 낮추고, 유효 세션마다 광고 1편에 세션 기본 적립과 같은 `bonus` 행을 한 번 더 넣어 2배로 만듭니다(`claim_ad_booster`, 하루 2회·세션당 1회). 정산이 끝난 주에는 `claim_weekly_box`로 20P 상자를 한 번 열 수 있고, 교환 비율은 1,000원 = 1,400P(1P ≈ 0.714원)입니다. `ad_reward_claims`가 SSV 거래 1건당 1행을 보장하고, `settle_week`/`settle_due_weeks`는 `bonus` 행도 함께 확정합니다. 광고 보상은 `ad-reward-ssv` Edge Function이 AdMob 서명을 검증한 뒤에만 지급되며, 앱은 포인트를 만들 수 없습니다.

## 수면 기록

홈에서 모드를 `수면`으로 고르면 목표 취침·기상 시간(기본 23:00–07:00, 30분 간격 프리셋)과 충전 상태가 보이고, 한 번 누르면 수면 기록이 열립니다. 아침에 `일어났어요 · 정산하기`를 한 번 누르면 서버가 종료·적립을 한 트랜잭션으로 처리합니다. 수면 중에는 홈 카드에 경과 시간과 충전 안내가 표시되고, 충전기가 꽂혀 있으면 홈 위쪽에 `충전기 연결됨 · 지금 누르면 아침까지 수면 기록이 이어져요` 배너가 떠 그 자리에서 1탭으로 시작합니다. 기록 중에는 iOS 잠금화면·다이내믹 아일랜드에 경과 시간과 `기상 목표 07:00`까지의 남은 시간이 함께 보입니다.

- **규칙**: 40분부터 유효, 세션은 12시간에서 자릅니다(넘으면 `truncated`로 알림), KST 하루 수면 10시간까지 적립합니다. 시간당 2P·10분 절사라 7시간 30분 = 15P입니다.
- **충전 상태**: `expo-battery`로 상태를 읽어 `sessions.started_charging`·`ended_charging`에 근거로 남깁니다. iOS는 백그라운드에서 배터리 리스너를 멈추므로 앱이 포그라운드로 돌아올 때와 정산 직전에 다시 읽어, 밤새 꽂혀 있던 기록이 예전 값으로 남지 않게 합니다. 기록 중 충전이 풀리면 홈 카드가 그 사실을 알려 줍니다. 충전은 적립 조건이 아니고 권한도 요구하지 않습니다. iOS 시뮬레이터·웹에서는 상태를 알 수 없어 안내만 달라집니다.
- **목표 시간**: `users.sleep_bedtime`·`users.sleep_waketime`(KST 벽시계)에 저장하고, 홈은 밤 시간(취침~기상)에 수면 카드를 먼저 보여 줍니다. 목표는 안내용이고 적립은 실제 기록 시간으로 계산합니다.
- **주간 상한**: 기본 100P는 수면·집중 **합산**으로 계산합니다. 수면만으로 100P를 채우면 그 뒤 수면도 0P · `weekly_cap_reached`로 기록만 남고, 하루 수면 10시간 한도가 먼저 걸리면 `daily_cap_reached`가 우선합니다.
- 앱은 0007 적용 전 서버(지금의 원격)에서도 기록·프로필을 읽도록 충전 열이 없으면 예전 열로 다시 조회합니다(목표 시간은 기본값으로 표시).

`0007_sleep_mode.sql`이 이 모드입니다. `users`에 목표 시간 두 열, `sessions`에 충전 이벤트 두 열을 더하고, 수면 전용 정산 함수 `finish_sleep_session(p_session_id, p_user_id, p_client_ended_at, p_ended_charging)`을 만듭니다. 적립 자체는 기존 `apply_earn`이 모드별 규칙(`earn_rate.sleep_per_hour`, `daily_cap_minutes.sleep`)으로 처리하므로 원장·정산·부스터가 수면에도 그대로 적용됩니다. `session-start`는 `mode: 'sleep'`을 받아 `source = 'charge'`(충전 중 시작) 또는 `'timer'`로 저장하고, `session-end`는 세션 모드를 읽어 두 정산 함수 중 하나를 고릅니다.

## 화면 · 로컬 알림 (2026-11-19 리뉴얼)

화면 전체를 라이트 캔버스(`#F7F8FA`) + 화이트 카드 + 딥 에메랄드(`#0F766E`)로 다시 만들고, 수면에 해당하는 카드만 미드나잇(`#0F172A`~`#172033`) + 문라이트 라벤더로 뒤집어 낮(집중)과 밤(수면)을 시각적으로 갈랐습니다. 토큰은 `src/theme/tokens.ts` 한 곳에 있고, 공통 조각은 `src/components/`(`Screen`, `ActionButton`, `Card`, `Chip`, `ProgressBar`, `Pill`)에 있습니다. 탭바 아이콘은 `@expo/vector-icons`(Ionicons)를 씁니다.

- **시작 딜레이**: 시작 버튼을 누르면 서버 응답을 기다리지 않고 열린 세션을 로컬에 먼저 넣어 타이머로 넘어갑니다(`src/features/session/optimistic.ts`). `서버와 동기화 중…` 배지를 띄우고, 응답이 오면 `server_started_at`으로 기준을 보정합니다. 실패하면 이전 상태로 되돌리고 409·네트워크 오류를 구분해 안내합니다.
- **집중 종료 알림**: 시작이 성공하면 목표 시간(30·60·90분) 뒤에 로컬 알림을 예약하고, 조기 종료하면 취소합니다. 종료 요청이 실패하면 다시 예약합니다.
- **수면 알림**: 수면 카드의 취침·기상 스위치로 매일 알림을 켜고 끕니다(`AsyncStorage` 키 `offline-time.sleep-reminders.v1`). 목표 시간을 바꾸면 켜 둔 알림이 새 시각으로 따라 움직입니다.
- **플랫폼**: `expo-notifications`(SDK 58)는 로컬 알림만 쓰도록 `enableRemoteNotifications: false`로 등록했습니다. 웹은 `notifications.web.ts` 스텁이 `unsupported`를 돌려주고, Expo Go·시뮬레이터에서 예약이 실패해도 기록·정산은 그대로 동작합니다. `DAILY` 트리거는 기기 로컬 시계를 쓰므로 해외 체류 중에는 기기 시간대를 따릅니다.
- 알림 시각 계산은 `src/features/notifications/schedule.ts`의 순수 함수이고, `tests/notifications.test.mjs`와 `tests/sessionStart.test.mjs`가 규칙을 검사합니다.

## 광고 부스터 (AdMob)

`react-native-google-mobile-ads`(17.4.0)로 리워드 광고를 실제로 띄웁니다. 광고 단위는 환경변수 `EXPO_PUBLIC_ADMOB_REWARDED_UNIT_ID_IOS`·`..._ANDROID`를 먼저 쓰고, 비어 있으면 Google이 공개한 테스트 광고 단위(`TestIds.REWARDED`)로 떨어집니다. 앱 ID는 `app.json`의 Expo config plugin(`iosAppId`·`androidAppId`)에 넣었고, 현재 값은 Google 테스트 앱 ID입니다.

- 광고 요청에는 `serverSideVerificationOptions.userId`(Supabase user id)와 `customData`(`{"v":1,"kind":"settlement_booster","session_id":"…"}` 또는 `{"v":1,"kind":"weekly_box"}`)를 실어 보냅니다. 앱과 콜백의 인코딩이 같은지 `tests/adPlacement.test.mjs`가 검사합니다.
- 앱은 광고를 띄우기만 하고 포인트를 만들지 않습니다. 지급은 AdMob SSV 콜백(`ad-reward-ssv`)이 서명을 검증한 뒤에만 일어나며, 앱은 `rewarded`·`dismissed`·`unavailable` 세 결과만 안내합니다.
- 광고 로드 15초 타임아웃, 웹·Expo Go·모듈 없음·노필 모두 `unavailable`로 처리해 기본 적립은 그대로 유지됩니다.
- `rewarded`를 받은 뒤에는 SSV 콜백이 서버에 닿을 때까지 해당 버튼만 `부스터 확인 중…`/`상자 확인 중…`으로 잠그고, 2초 간격 5회(최대 10초) `ad_reward_claims`·포인트·지갑을 다시 읽습니다. 주장 행이 보이면 스스로 풀리고(거절이면 이유 안내), 10초 안에 오지 않아도(테스트 광고 등) 버튼을 풀고 안내만 남깁니다. 판단·대기 로직은 `src/features/points/adRewardWatch.ts`에 있고 `tests/adRewardWatch.test.mjs`가 가짜 시계로 검사합니다.
- **AdMob 콘솔에 꼭 해야 할 일**: 앱 등록 → 광고 단위(리워드) 생성 → 광고 단위 ID를 위 환경변수에 넣기 → 광고 단위의 SSV 콜백 URL을 `https://uhisjleftevizjfudeip.supabase.co/functions/v1/ad-reward-ssv`로 등록. `app.json`의 앱 ID도 실제 AdMob 앱 ID로 바꿔야 수익이 잡힙니다.

## 혜택 (친구 초대 · 브랜드 스폰서 챌린지)

`0008_referral_sponsor.sql`이 `혜택` 탭의 두 기능을 만듭니다. 둘 다 포인트를 만드는 경로는 서버뿐입니다.

### 친구 초대

- **내 코드**: 계정마다 하나, 8자리 대문자 16진수(0/O·1/I 혼동 없음). 서버가 발급하고 사용자가 바꿀 수 없습니다(트리거 보호).
- **보상**: 친구가 코드를 넣고 **3일 연속** 기록을 정산하면 양쪽 **+300P**. 초대한 사람은 **달마다 5회(1,500P)** 까지이고, 한도를 채운 뒤에도 친구 몫 300P는 그대로 지급합니다.
- **조건**: 초대받는 계정은 포인트 기록이 없어야 하고(`새 계정만`), 계정당 한 번만 초대받을 수 있으며, 내 코드와 서로 초대하는 고리는 거절합니다.
- **3일의 정의**: 유효 세션이 **끝난 KST 날짜**의 연속 구간입니다. 오늘 또는 어제까지 이어진 구간만 인정해 지난주 기록으로 소급 수령하지 못하게 했고, 밤 수면은 일어난 날에 귀속됩니다.
- **지급·갱신**: `bonus` 거래 2건, `bonus_pool = 'referral'`. 세션을 정산할 때 `session-end`가 `refresh_growth_progress`를 불러 진행과 지급을 한 번에 처리합니다.

### 브랜드 스폰서 챌린지

- **조건**: 모드(수면·집중), 하루 최소 시간, 목표 일수, 창(일수), 연속 여부. 예: `7일 안에 수면 7시간 이상을 5일 연속 기록`.
- **진행**: 참여 시점부터 창 안에서 그 모드 유효 세션이 하루 기준을 넘긴 날을 셉니다(연속 조건이면 가장 긴 구간). 참여 전 기록으로는 소급 달성되지 않습니다.
- **보상**: 참여 1건당 브랜드 쿠폰 1장(`SP-XXXXXXXXXX`). `delivery_status = 'pending'`으로 발급되고 실제 발송·재발송은 브랜드/운영자 몫입니다. **포인트 원장과 분리**되어 쿠폰 발급은 `point_transactions`에 행을 만들지 않습니다.
- **세그먼트**: `sleep_recovery`(수면·회복) / `focus_growth`(집중·자기개발)는 온보딩 주력 모드에 맞춘 노출·카피 기준입니다. 참여 자체를 막지는 않습니다(`both` 사용자 보호).
- **씨앗**: 제휴 계약과 쿠폰 발송 수단이 없으므로 3건 모두 `active = false`입니다. 테스트로 열어 볼 때만 아래를 실행하세요(계약 없이 열면 지킬 수 없는 쿠폰을 약속하게 됩니다).

```sh
npx supabase db query --remote=uhisjleftevizjfudeip \
  --sql "update public.sponsor_challenges set active = true where title = '7시간 수면 5일'" --yes
```

### 보너스 풀 분리

초대·챌린지 보너스는 광고 부스터 주 80P 풀을 쓰지 않습니다. `point_transactions.bonus_pool`이 `ad` / `referral` / `sponsor_challenge`를 구분하고, `claim_ad_booster`·`claim_weekly_box`는 `bonus_pool = 'ad'`만 셉니다. `kind = 'bonus'`인 행은 `bonus_pool`이 반드시 있어야 하고(CHECK), append-only 트리거가 이 열의 변경도 막습니다.

현재 발송 제휴사·쿠폰 재고가 없어 **운영 활성 상품은 0건**입니다. 상품 발송 수단과 재고를 마련한 뒤에만 실제 상품을 활성화해야 합니다. 켜 두면 신청이 들어오고, 실패는 환급으로 끝나므로 재고·발송 수단을 먼저 확인하세요. 발송 처리 방법은 아래 3단계 절에 있습니다.

```sh
npx supabase db push --remote=uhisjleftevizjfudeip --skip-vault
npx supabase functions deploy session-start session-end ad-reward-ssv redeem-product admin-fulfillment delete-account --project-ref uhisjleftevizjfudeip --use-api
pnpm test
npx supabase db query --remote=uhisjleftevizjfudeip --file tests/focusPoints.sql --yes
npx supabase db query --remote=uhisjleftevizjfudeip --file tests/settlement.sql --yes
npx supabase db query --remote=uhisjleftevizjfudeip --file tests/redemption.sql --yes
npx supabase db query --remote=uhisjleftevizjfudeip --file tests/redemptionRls.sql --yes
npx supabase db query --remote=uhisjleftevizjfudeip --file tests/adBooster.sql --yes
npx supabase db query --remote=uhisjleftevizjfudeip --file tests/weeklyCaps.sql --yes
npx supabase db query --remote=uhisjleftevizjfudeip --file tests/sleepMode.sql --yes
npx supabase db query --remote=uhisjleftevizjfudeip --file tests/referral.sql --yes
npx supabase db query --remote=uhisjleftevizjfudeip --file tests/sponsorChallenge.sql --yes
npx supabase db query --remote=uhisjleftevizjfudeip --file tests/fulfillment.sql --yes
npx supabase db query --remote=uhisjleftevizjfudeip --file tests/accountDeletion.sql --yes
```

`ad-reward-ssv`는 AdMob 콘솔의 SSV 콜백 URL(`https://<project>.supabase.co/functions/v1/ad-reward-ssv`)로 등록하고 JWT 검증을 끄고 배포해야 합니다(`verify_jwt = false`). 나머지 함수는 JWT 검증이 켜져 있습니다.

**적용 순서**: DB를 먼저 올리고 함수를 배포합니다. 새 `session-start`·`session-end`는 0007이 더한 `started_charging`·`ended_charging` 열을 쓰기 때문에, 순서가 바뀌면 수면 기록만 실패합니다(집중 기록은 그대로 동작). 앱은 열이 없는 동안 예전 열로 다시 조회해 화면이 깨지지 않습니다. 0008의 `refresh_growth_progress`도 같은 원칙입니다 — 함수가 없으면 `session-end`는 경고만 남기고 정산을 마치므로, 순서가 바뀌어도 기록·포인트는 안전하고 초대 진행만 늦어집니다. 0009도 같은 방식입니다: 새 앱은 발송 열이 없는 서버에서 교환 내역을 예전 열로 다시 읽고, `delete-account`는 0009 이전 서버에서도 탈퇴를 마칩니다(요약만 남기지 않음).

`supabase/config.toml`에는 로컬 개발용 Auth 기본값도 들어 있습니다. 전체 파일을 `supabase config push`로 원격에 적용하면 이메일 확인 같은 원격 설정이 바뀔 수 있으므로, 원격 설정은 변경할 항목만 지정해 적용합니다.

## 발송 처리 (3단계 · 운영자 도구)

교환 상품과 브랜드 쿠폰의 **실제 발송**은 앱이 아니라 운영자가 합니다. `0009_fulfillment_and_account.sql`이 발송 시도·결과를 남길 열과 감사 로그를 더하고, Edge Function `admin-fulfillment`가 그 처리를 대신합니다.

- **상태**: `redemptions.status`(`requested`/`issued`/`failed`)는 그대로 두고, 그 위에 `provider`·`provider_ref`(공급자 거래 번호)·`attempts`·`processing_started_at`·`processed_at`·`last_error`를 얹었습니다. 열거형에 "발송 중"을 더하지 않은 이유는 새 enum 값을 같은 트랜잭션에서 쓸 수 없기 때문이고, 실제로 필요한 것은 "누가 언제 잡았는지"뿐입니다.
- **중복 발송 방지**: `begin_redemption` / `begin_sponsor_coupon`이 15분짜리 락(`processing_started_at`)과 시도 횟수를 남깁니다. 두 운영자가 같은 신청을 동시에 열어도 한 명만 잡고, 15분이 지나면 다시 잡을 수 있습니다.
- **완료·실패**: `fulfill_redemption`은 메타데이터를 남긴 뒤 `resolve_redemption(id, true)`를, `fail_redemption`은 `resolve_redemption(id, false, reason)`을 그대로 부릅니다. 그래서 환급 장부·재고 복원은 0004의 규칙(한 번만)을 그대로 따릅니다. 이미 환급한 신청을 뒤늦게 "발송 완료"로 뒤집으면 오류로 막습니다.
- **쿠폰**: `resolve_sponsor_coupon(id, sent)`이 상태만 옮깁니다(포인트 없음). 실패 뒤 다시 잡으면 `pending`으로 돌아가 재시도할 수 있고, 발송 완료는 다시 실패로 뒤집히지 않습니다.
- **감사 로그**: `fulfillment_events`(append-only, service_role 전용)에 begin/issued/sent/failed/error와 사람이 적은 메모가 남습니다. 개인 정보는 넣지 않습니다.
- **공급자 경계**: `supabase/functions/_shared/giftCoupon.ts` 하나에 모았습니다. `GIFTISHOW_API_URL`·`GIFTISHOW_API_KEY`·`GIFTISHOW_USER_ID`가 모두 있으면 실제 호출로, 없으면 **수동 모드**로 동작합니다. 수동 모드에서 "발송"은 신청을 잡아 두기만 하고, 운영자가 직접 보낸 뒤 거래 번호를 남겨 완료 처리합니다. 계약 문서의 필드가 다르면 `buildOrderBody`·`readOrderResult` 두 함수만 고칩니다.
- **권한**: `admin-fulfillment`는 호출자의 Supabase 세션을 확인하고 `ADMIN_USER_IDS`(쉼표 구분 uuid)에 있는 사람만 통과시킵니다. 비어 있으면 503으로 "무엇을 설정해야 하는지" 돌려주고, 앱에서는 운영자 도구 자체가 보이지 않습니다(`whoami`).
- **앱**: 설정 → 운영자 도구(`src/app/admin.tsx`)에서 교환·쿠폰 대기 목록, 자동/수동 모드 안내, 발송 시도·완료(거래 번호·메모)·실패(사유) 처리를 합니다. 교환소의 교환 내역은 발송일·실패 사유·환급 안내를 보여 주고, 혜택 탭의 쿠폰은 전달 상태(발송 준비/전달 완료/전달 확인 중)를 보여 줍니다. 두 화면 모두 0009 이전 서버에서는 예전 열로 다시 읽어 깨지지 않습니다.

## 출시 준비 (4단계)

- **계정 탈퇴**: 설정 → 회원 탈퇴 → "탈퇴" 입력 → 삭제. `delete-account` Edge Function이 로그인 사용자를 확인한 뒤 ① 대기 중인 교환을 취소·환급해 재고를 되돌리고 ② 개인 식별 정보 없는 회계 요약(지급·교환 수량)을 만들고 ③ `auth.admin.deleteUser`로 계정을 지웁니다. `public.users`의 모든 FK가 `on delete cascade`라 세션·원장·교환·쿠폰·초대·정산·기기가 함께 사라지고, 삭제가 끝난 뒤에야 요약이 `account_deletions`에 남습니다. 이메일·전화번호·user_id는 저장하지 않습니다.
- **이용약관·개인정보처리방침**: `src/features/legal/legalText.ts`의 문구를 로그인 화면 하단과 설정에서 앱 안에서 바로 엽니다(`src/app/legal.tsx`). 적립 단가·주간 상한·교환 비율·정산 시각·탈퇴 시 파기까지 실제 구현과 같은 숫자로 적었고, `tests/legalText.test.mjs`가 그 숫자를 검사합니다. 문의 주소는 기본값이 실제 수신 주소 `quden04@gmail.com`이고, 다른 주소로 받으려면 `EXPO_PUBLIC_SUPPORT_EMAIL`로 덮어씁니다.
- **AdMob 실전 값 분리**: `app.config.ts`가 `ADMOB_APP_ID_IOS`·`ADMOB_APP_ID_ANDROID`로 `app.json`의 테스트 앱 ID를 덮어씁니다. **production 프로필에서 테스트 ID가 남아 있으면 빌드가 시작되지 않습니다.** 광고 단위는 런타임 값(`EXPO_PUBLIC_ADMOB_REWARDED_UNIT_ID_*`)이고, 테스트 단위로 떨어지면 개발 중에는 조용히, 배포 빌드에서는 한 번 경고합니다(`src/features/ads/adUnits.ts`).
- **EAS**: `eas.json`에 `development`(dev client)와 `production`(store, `autoIncrement`) 프로필을 두었습니다. Android production은 `app-bundle`입니다.
- **출시 체크리스트**: 마이그레이션·함수 배포 순서, secrets, AdMob SSV 콜백, Apple capability·Widget Extension·App Group, 실기기 검증 표, 스토어 제출 항목을 [docs/release-checklist.md](docs/release-checklist.md)에 정리했습니다.

## 공개 고지 페이지 (GitHub Pages)

스토어 제출에 넣는 공개 주소는 **저장소 루트의 `docs/`**(이 폴더의 `offline-time/docs/`와 다른 곳)에 있는
정적 HTML입니다. 앱 안 화면(`src/features/legal/legalText.ts`)과 같은 문구·숫자를 담고,
`tests/legalPages.test.mjs`가 조항·숫자·문의 주소·내부 링크와 앵커를 대조합니다. 빌드 도구 없이 열리므로
Pages·S3 어디에 올려도 됩니다. 같은 이름의 폴더가 앱 안에 하나 더 있으니 경로를 볼 때 주의하세요.

| 파일 | 용도 | 주소 |
| --- | --- | --- |
| [`docs/index.html`](../docs/index.html) | 고지 문서 개요(세 문서로 가는 길) | https://byeongdoo-han.github.io/phonedown/ |
| [`docs/privacy.html`](../docs/privacy.html) | App Store Connect "개인정보처리방침 URL", Google Play 데이터 보안 | https://byeongdoo-han.github.io/phonedown/privacy.html |
| [`docs/terms.html`](../docs/terms.html) | 이용약관(전문) | https://byeongdoo-han.github.io/phonedown/terms.html |
| [`docs/account-deletion.html`](../docs/account-deletion.html) | App Store "계정 삭제 URL", Google Play 계정 삭제 URL | https://byeongdoo-han.github.io/phonedown/account-deletion.html |

켜는 방법(저장소마다 한 번): GitHub 저장소 → **Settings → Pages → Build and deployment** →
Source를 `Deploy from a branch`, Branch `main`, Folder `/docs`로 두고 Save. 1~2분 뒤 위 주소가 열립니다.
같은 일을 CLI로 하려면:

```sh
gh api -X POST repos/ByeongDoo-Han/phonedown/pages \
  -f 'source[branch]=main' -f 'source[path]=/docs'
```

- `docs/.nojekyll`이 있어 Jekyll 처리를 건너뜁니다(HTML을 그대로 서빙).
- 문의 주소는 앱과 공개 페이지가 같은 `quden04@gmail.com`을 씁니다(`legalText.ts` 기본값). 다른 주소로
  바꾸려면 `EXPO_PUBLIC_SUPPORT_EMAIL`을 넣고 루트 [docs/](../docs/) HTML의 `mailto:`·본문도 함께 바꿉니다.
- 정책 숫자·조항을 바꾸면 `legalText.ts`와 루트 `docs/` HTML을 같이 고치고 `pnpm test`로 확인합니다.

## 확인

```sh
pnpm test
npx tsc --noEmit
pnpm lint
npx expo config --type public > /dev/null
npx expo export --platform web
npx expo export --platform ios
```

SQL 테스트(로컬 PGlite 또는 원격 `supabase db query`)는 `tests/*.sql` 11개이고, Edge Function은
`deno check supabase/functions/*/index.ts`로 전체를 확인합니다.

기획 원문은 [spec.md](docs/spec.md)에 있습니다. 정책 수치와 적립 로직은 후속 마일스톤에서 서버 함수와 함께 구현합니다.
