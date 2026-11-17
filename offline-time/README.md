# 오프라인 타임

Expo SDK 58 모바일 앱과 Supabase 데이터베이스의 초기 구현입니다. 가입, 로그인, 주력 시간 선택, 수동 집중·수면 기록 시작·종료, 최근 기록 조회, 유효한 기록의 포인트 적립, 지난주 포인트 정산, 교환 신청·이력이 동작합니다. 포인트는 기본 적립(1시간 = 2P, 주 100P까지)과 광고 부스터(2배, 주 80P까지)·주간 보너스 상자로 나뉘며, 광고 보상은 AdMob SSV 콜백으로만 지급됩니다. 수면은 충전 상태를 확인해 시작하고 아침에 한 번 눌러 정산하며, 충전 이벤트는 앱이 살아 있는 동안만 받습니다(백그라운드 자동 감지·Live Activity는 아직 없음). 교환 상품 발송은 아직 동작하지 않습니다.

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

홈에서 모드를 `수면`으로 고르면 목표 취침·기상 시간(기본 23:00–07:00, 30분 간격 프리셋)과 충전 상태가 보이고, 한 번 누르면 수면 기록이 열립니다. 아침에 `일어났어요 · 정산하기`를 한 번 누르면 서버가 종료·적립을 한 트랜잭션으로 처리합니다. 수면 중에는 홈 카드에 경과 시간과 충전 안내가 표시됩니다.

- **규칙**: 40분부터 유효, 세션은 12시간에서 자릅니다(넘으면 `truncated`로 알림), KST 하루 수면 10시간까지 적립합니다. 시간당 2P·10분 절사라 7시간 30분 = 15P입니다.
- **충전 상태**: `expo-battery`로 앱이 살아 있는 동안만 상태를 읽어 `sessions.started_charging`·`ended_charging`에 근거로 남깁니다. 충전은 적립 조건이 아니고 권한도 요구하지 않습니다. iOS 시뮬레이터·웹에서는 상태를 알 수 없어 안내만 달라집니다.
- **목표 시간**: `users.sleep_bedtime`·`users.sleep_waketime`(KST 벽시계)에 저장하고, 홈은 밤 시간(취침~기상)에 수면 카드를 먼저 보여 줍니다. 목표는 안내용이고 적립은 실제 기록 시간으로 계산합니다.
- **주간 상한**: 기본 100P는 수면·집중 **합산**으로 계산합니다. 수면만으로 100P를 채우면 그 뒤 수면도 0P · `weekly_cap_reached`로 기록만 남고, 하루 수면 10시간 한도가 먼저 걸리면 `daily_cap_reached`가 우선합니다.
- 앱은 0007 적용 전 서버(지금의 원격)에서도 기록·프로필을 읽도록 충전 열이 없으면 예전 열로 다시 조회합니다(목표 시간은 기본값으로 표시).

`0007_sleep_mode.sql`이 이 모드입니다. `users`에 목표 시간 두 열, `sessions`에 충전 이벤트 두 열을 더하고, 수면 전용 정산 함수 `finish_sleep_session(p_session_id, p_user_id, p_client_ended_at, p_ended_charging)`을 만듭니다. 적립 자체는 기존 `apply_earn`이 모드별 규칙(`earn_rate.sleep_per_hour`, `daily_cap_minutes.sleep`)으로 처리하므로 원장·정산·부스터가 수면에도 그대로 적용됩니다. `session-start`는 `mode: 'sleep'`을 받아 `source = 'charge'`(충전 중 시작) 또는 `'timer'`로 저장하고, `session-end`는 세션 모드를 읽어 두 정산 함수 중 하나를 고릅니다.

## 광고 부스터 (AdMob)

`react-native-google-mobile-ads`(17.4.0)로 리워드 광고를 실제로 띄웁니다. 광고 단위는 환경변수 `EXPO_PUBLIC_ADMOB_REWARDED_UNIT_ID_IOS`·`..._ANDROID`를 먼저 쓰고, 비어 있으면 Google이 공개한 테스트 광고 단위(`TestIds.REWARDED`)로 떨어집니다. 앱 ID는 `app.json`의 Expo config plugin(`iosAppId`·`androidAppId`)에 넣었고, 현재 값은 Google 테스트 앱 ID입니다.

- 광고 요청에는 `serverSideVerificationOptions.userId`(Supabase user id)와 `customData`(`{"v":1,"kind":"settlement_booster","session_id":"…"}` 또는 `{"v":1,"kind":"weekly_box"}`)를 실어 보냅니다. 앱과 콜백의 인코딩이 같은지 `tests/adPlacement.test.mjs`가 검사합니다.
- 앱은 광고를 띄우기만 하고 포인트를 만들지 않습니다. 지급은 AdMob SSV 콜백(`ad-reward-ssv`)이 서명을 검증한 뒤에만 일어나며, 앱은 `rewarded`·`dismissed`·`unavailable` 세 결과만 안내합니다.
- 광고 로드 15초 타임아웃, 웹·Expo Go·모듈 없음·노필 모두 `unavailable`로 처리해 기본 적립은 그대로 유지됩니다.
- **AdMob 콘솔에 꼭 해야 할 일**: 앱 등록 → 광고 단위(리워드) 생성 → 광고 단위 ID를 위 환경변수에 넣기 → 광고 단위의 SSV 콜백 URL을 `https://uhisjleftevizjfudeip.supabase.co/functions/v1/ad-reward-ssv`로 등록. `app.json`의 앱 ID도 실제 AdMob 앱 ID로 바꿔야 수익이 잡힙니다.

현재 발송 제휴사·쿠폰 재고가 없어 **운영 활성 상품은 0건**입니다. 상품 발송 수단과 재고를 마련한 뒤에만 실제 상품을 활성화해야 합니다. 교환 신청이 접수되더라도 외부 발송은 자동화되지 않았으며, 운영자가 발송 결과를 확인하고 상태를 처리해야 합니다.

```sh
npx supabase db push --remote=uhisjleftevizjfudeip --skip-vault
npx supabase functions deploy session-start session-end ad-reward-ssv --remote=uhisjleftevizjfudeip --use-api
pnpm test
npx supabase db query --remote=uhisjleftevizjfudeip --file tests/focusPoints.sql --yes
npx supabase db query --remote=uhisjleftevizjfudeip --file tests/settlement.sql --yes
npx supabase db query --remote=uhisjleftevizjfudeip --file tests/redemption.sql --yes
npx supabase db query --remote=uhisjleftevizjfudeip --file tests/redemptionRls.sql --yes
npx supabase db query --remote=uhisjleftevizjfudeip --file tests/adBooster.sql --yes
npx supabase db query --remote=uhisjleftevizjfudeip --file tests/weeklyCaps.sql --yes
npx supabase db query --remote=uhisjleftevizjfudeip --file tests/sleepMode.sql --yes
```

`ad-reward-ssv`는 AdMob 콘솔의 SSV 콜백 URL(`https://<project>.supabase.co/functions/v1/ad-reward-ssv`)로 등록하고 JWT 검증을 끄고 배포해야 합니다(`verify_jwt = false`). 나머지 함수는 JWT 검증이 켜져 있습니다.

**적용 순서**: DB를 먼저 올리고 함수를 배포합니다. 새 `session-start`·`session-end`는 0007이 더한 `started_charging`·`ended_charging` 열을 쓰기 때문에, 순서가 바뀌면 수면 기록만 실패합니다(집중 기록은 그대로 동작). 앱은 열이 없는 동안 예전 열로 다시 조회해 화면이 깨지지 않습니다.

`supabase/config.toml`에는 로컬 개발용 Auth 기본값도 들어 있습니다. 전체 파일을 `supabase config push`로 원격에 적용하면 이메일 확인 같은 원격 설정이 바뀔 수 있으므로, 원격 설정은 변경할 항목만 지정해 적용합니다.

## 확인

```sh
npx tsc --noEmit
npx expo lint
```

기획 원문은 [spec.md](docs/spec.md)에 있습니다. 정책 수치와 적립 로직은 후속 마일스톤에서 서버 함수와 함께 구현합니다.
