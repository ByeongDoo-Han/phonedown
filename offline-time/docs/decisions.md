# 구현 결정

## 2026-11-19: 잠금화면 Live Activity · 충전 근거 최신화

집중·수면 기록이 도는 동안 iOS 잠금화면과 다이내믹 아일랜드에 실제로 흐르는 타이머를 띄우고(`feat/sleep-live-activity-charging`), 수면 카드의 충전 안내를 1탭 시작과 최신 근거 중심으로 다시 만들었다. **DB 스키마·Edge Function은 한 줄도 바꾸지 않았다** — `ended_charging`은 이미 있는 열이고, 앱이 그 값을 더 정확한 시점에 보내도록만 바꿨다.

### 1) Live Activity는 `expo-widgets`(SDK 58 1st-party)로

- 선택지 비교: (a) Swift `ActivityKit` 타겟 + 자체 config plugin, (b) `@bacons/apple-targets` + 서드파티 `expo-live-activity`, (c) `expo-widgets` 58.0.29. (c)를 골랐다. Expo가 SDK 58에 맞춰 배포하는 정식 모듈이고, `createLiveActivity` + `@expo/ui/swift-ui` 컴포넌트만으로 레이아웃을 쓰며, config plugin이 Widget Extension 타겟·App Group·`NSSupportsLiveActivities`·EAS `appExtensions` 항목까지 한 번에 만든다. Swift를 저장소에 넣지 않아 CNG 규칙(`ios/`·`android/` 수기 편집 금지)과 충돌하지 않는다.
- `app.json`: `ios.infoPlist.NSSupportsLiveActivities = true`, `ios.deploymentTarget = "16.4"`, plugin `["expo-widgets", { bundleIdentifier: "app.offlinetime.mobile.ExpoWidgetsTarget", groupIdentifier: "group.app.offlinetime.mobile", enablePushNotifications: false, frequentUpdates: false }]`. **원격 푸시는 끈다** — 로컬 알림 결정과 같은 이유로 `aps-environment` entitlement를 추가하지 않아 기존 프로비저닝을 건드리지 않는다.
- **`widgets[]`는 비워 둔다**: Live Activity는 `createLiveActivity`가 런타임에 등록하고 내장 타겟(`WidgetLiveActivity`)이 그린다. 홈 위젯 항목을 넣으면 갤러리용 타겟이 하나 더 생길 뿐이다. `expo prebuild`로 확인: `ios/ExpoWidgetsTarget/index.swift`가 `WidgetLiveActivity()`만 담고, 앱 Info.plist에 `NSSupportsLiveActivities=true`, 양쪽 entitlement에 App Group이 들어간다.
- **레이아웃은 문자열로 컴파일된다**: `babel-preset-expo`의 widgets plugin이 `'widget'` 지시문이 있는 함수를 소스 문자열로 바꿔 네이티브에 넘기고, 위젯 런타임이 그것을 eval한다. 그래서 레이아웃 안에서는 props와 `@expo/ui/swift-ui` 컴포넌트/모디파이어(전역으로 주입됨)만 쓸 수 있고, 바깥 상수·헬퍼·`Intl`은 쓸 수 없다. 모든 문구·시각 계산은 `src/features/liveActivity/payload.ts`(순수 함수)에서 끝내고 레이아웃은 배치만 한다.
- **타이머는 SwiftUI가 센다**: `Text(timerInterval:countsDown:)`와 `ProgressView(timerInterval:)`를 쓰므로 앱이 잠들어도 잠금화면 숫자가 흐른다. 집중은 목표까지 카운트다운(+진행 바), 수면은 시작부터 카운트업(+`기상 목표 07:00`까지 남은 시간). JS 타이머로 1초마다 push하지 않는다(백그라운드에서 멈추고 배터리도 낭비).
- **수면의 기상 목표**: `payload.ts`가 KST 고정 오프셋으로 계산한다. 23:10에 시작한 07:00 목표는 다음날 아침, 00:30에 시작하면 같은 날 아침이다. 자정을 넘겨도 뒤로 가지 않는다.
- **끝맺음**: 정산 성공 시 `finishSessionActivity`가 `end(after(now+30s), 정산 상태)`로 닫아 30초 동안 `수면 기록 정산 완료 · 총 7시간 20분`을 남긴 뒤 시스템이 치운다. 앱이 죽어 남은 활동은 다음 실행에서 `sessions` 목록이 로드된 뒤 정리한다(로딩 중 빈 목록을 "기록 없음"으로 오해해 밤새 도는 활동을 지우지 않도록 `ready` 플래그를 쓴다).
- **폴백**: `liveActivity.ts`는 `Platform.OS !== 'ios'`면 즉시 `unsupported`, iOS에서도 `require('expo-widgets')`를 try/catch 안에서만 부른다(Expo Go에는 네이티브 모듈이 없다). 모든 네이티브 호출은 결과 문자열(`started`/`updated`/`ended`/`unsupported`/`error`)로 끝나고 던지지 않는다. 웹은 `liveActivity.web.ts` 스텁. 화면은 지원될 때만 "잠금화면에서도 보여요" 줄을 띄운다.

### 2) 충전은 '조건'이 아니라 '근거'

- **1탭 시작**: 충전 중이고 열린 기록이 없으면 홈 위쪽에 `충전기 연결됨 · 지금 누르면 아침까지 수면 기록이 이어져요` 배너(달 아이콘 + `수면 기록 시작` 버튼)가 뜨고, 누르면 수면 기록이 바로 시작된다. 수면 카드/세그먼트를 고른 상태에서만 보인다.
- **밤새 값이 낡지 않게**: iOS는 백그라운드에서 배터리 리스너를 멈춘다. 그래서 `useChargeState`가 포그라운드 복귀마다 `getBatteryStateAsync()`를 다시 읽고, **정산 직전에도 한 번 더 읽어**(`endChargingFlag(fresh, observed)`) `ended_charging`을 정한다. 새 판독이 `unknown`일 때만 화면이 마지막으로 본 값을 쓴다(둘 다 모르면 `null` — 꽂혀 있었다고 주장하지 않는다).
- **기록 중 변화 알림**: 앱이 살아 있는 동안 `charging → unplugged` 전이를 보면 `충전이 풀렸어요. 기록은 그대로 이어지고, 아침 정산에 충전 해제도 함께 남겨요.`를 보여 준다. 권한·배터리 최적화 예외는 여전히 요구하지 않는다.
- 순수 판정(배너 노출, 문구, 끝 충전값 선택, 전이 판정)은 `src/features/sleep/chargeEvidence.ts`로 분리해 `tests/chargeEvidence.test.mjs`가 검사한다.

### 3) 검증

`pnpm test` 72건 통과(신규 16건: Live Activity 페이로드 12 · 충전 근거 4), `npx tsc --noEmit`, `pnpm lint`, `npx expo config --type public`, `npx expo export --platform web`, `npx expo export --platform ios` 모두 통과. `npx expo prebuild --platform ios --no-install`로 타겟/Info.plist/entitlement/EAS `appExtensions` 생성을 확인하고 생성물은 지웠다(`ios/`는 gitignore).

### 4) 배포 시 확인할 것

- 새 Widget Extension 타겟(`app.offlinetime.mobile.ExpoWidgetsTarget`)과 App Group(`group.app.offlinetime.mobile`)이 Apple Developer 포털에 등록돼야 한다. EAS Build는 `extra.eas.build.experimental.ios.appExtensions`를 읽어 타겟을 빌드하므로, App Store Connect API 키로 capability를 동기화하는 빌드 프로필에서 한 번 새로 만들어야 한다.
- Live Activity는 **개발 빌드(dev client) 이상**에서만 뜬다(Expo Go 불가). 실기기(iOS 16.2+ 권장, 다이내믹 아일랜드는 iPhone 14 Pro 이상)에서 잠금화면 표시·정산 시 닫힘·미지원 기기 폴백을 확인해야 한다.
- `expo-battery`는 시뮬레이터에서 상태를 알려 주지 않으므로, 충전 근거는 실기기에서 확인한다.

---

## 2026-11-19: UI 리뉴얼 · 시작 딜레이 개선 · 로컬 알림


사용자가 "디자인이 너무 밤티임"이라고 한 화면 전체와, 집중/수면 시작 시 1~3초 멈춘 듯한 체감을 함께 손봤다. 브랜치 `feat/ux-ui-overhaul-notifications`. **DB 스키마(0001~0008), Edge Function(`session-start`·`session-end`·`ad-reward-ssv`), 0008 미반영 폴백은 한 줄도 바꾸지 않았다.**

### 1) 시작은 즉시, 보정은 도착하면

- 시작 버튼을 누르면 `onMutate`가 `pending-<ISO>` id의 **열린 세션을 로컬에 먼저 넣는다**(`src/features/session/optimistic.ts`). 홈은 그 즉시 타이머 화면·수면 카드로 바뀌고 0초부터 흐른다. 서버가 답하면 실제 행이 그 자리를 대체하고 `server_started_at`(서버 시각)으로 다시 기준을 잡는다. 두 시각 차이는 1초 안쪽이라 숫자가 튀지 않는다.
- 그동안 카드 안에 작은 `서버와 동기화 중…` 배지를 띄운다. 버튼은 `기록을 시작하는 중…`으로 잠근다.
- 실패하면 `onMutate`가 잡아 둔 이전 배열로 되돌리고, 이유를 문장으로 나눈다(`describeStartError`): 409/이미 열린 기록 → "이미 진행 중인 기록이 있어요", 네트워크·타임아웃 → "연결이 불안정해…", 그 밖 → "연결을 확인해 주세요". `tests/sessionStart.test.mjs`가 두 규칙(낙관적 행의 모양, 오류 문장)을 검사한다.
- 종료 응답은 그대로 서버를 기다린다. 종료는 포인트·정산이 걸려 있어 낙관적으로 닫으면 오히려 되돌리는 비용이 크다.

### 2) 로컬 알림 (`expo-notifications` 58.1.9)

- `npx expo install expo-notifications`로 SDK 58 호환 버전을 받고 `app.json` plugins에 등록했다. **로컬 알림만 쓰므로 `enableRemoteNotifications: false`** — APNs entitlement를 추가하지 않아 기존 EAS 프로필·프로비저닝을 건드리지 않는다. Android 아이콘은 흰 달 모양 96×96(`assets/images/notification-icon.png`)을 새로 만들었고 채널은 `offline-time` 하나다.
- **집중 종료 알림**: 시작이 서버에서 성공하면 `server_started_at + plannedMinutes`에 `DATE` 트리거로 1건 예약한다. 조기 종료를 누르는 순간(`end.onMutate`) 예약을 지우고, 종료 요청이 실패하면 다시 건다. 앱을 닫아도 OS가 띄우므로 "목표를 채웠다"는 사실을 놓치지 않는다.
- **수면 취침·기상 알림**: `sleep_bedtime`·`sleep_waketime`을 그대로 `DAILY` 트리거의 시·분으로 쓴다. 토글은 수면 카드 안에 두 개(취침/기상) 있고, 선택은 `AsyncStorage`(`offline-time.sleep-reminders.v1`)에 남긴다. 앱을 다시 열면 저장된 선택으로 다시 예약해, 재부팅·업데이트로 스케줄이 사라져도 되살아난다. 목표 시간을 바꾸면 켜 둔 알림이 새 시각으로 따라 움직인다.
- **권한·플랫폼**: 예약 직전에만 권한을 묻는다(거절되면 "휴대폰 설정에서 알림을 허용해 주세요" 안내만 하고 기록은 그대로). 웹은 `notifications.web.ts` 스텁이 `unsupported`를 돌려주고, 화면은 "웹에서는 알림을 예약할 수 없어요"라고 말한다. Expo Go·시뮬레이터에서도 예약 실패가 기록·정산을 막지 않는다(모든 호출이 결과 객체로 끝난다).
- 시각 계산은 `src/features/notifications/schedule.ts`에 순수 함수로 분리했고 `tests/notifications.test.mjs`가 자정 넘김·월말/연말 롤오버·정확히 같은 분·잘못된 시각을 검사한다.
- **한계**: `DAILY` 트리거는 기기 로컬 시계를 쓴다. 목표 시간은 KST 벽시계이고 국내 사용자는 둘이 같지만, 해외 체류 중에는 기기 시간대를 따른다. Android 12+ 정확한 알람 권한은 요청하지 않아(`bestEffort`) 수 분 늦을 수 있다. 원격 푸시(서버 발송)는 이번 범위가 아니다.

### 3) 화면

- `src/theme/tokens.ts`를 새 팔레트로 바꿨다: 라이트 캔버스 `#F7F8FA`, 화이트 카드, 딥 에메랄드 `#0F766E`, 인디고 `#5B5BD6`, 그리고 수면용 미드나잇 `#0F172A`/`#172033` + 문라이트 라벤더 `#C7D2FE`. 그림자는 `card`/`soft`/`lift` 세 단계, 숫자는 `tabular-nums`.
- 공통 컴포넌트: `Screen`(라이트/나이트 캔버스), `ActionButton`(primary·secondary·ghost·soft·night·moon, loading), `Card`(+`SectionHeader`), `Chip`, `ProgressBar`(+`LabeledBar`), `Pill`/`Notice`.
- **홈**: 상단에 이번 주 적립 미니 요약(기본/부스터 두 줄), 집중/수면 세그먼트, 모드별 히어로 카드(집중은 화이트, 수면은 미드나잇), 대형 타이머, 프리셋 칩, 큰 CTA 하나. 수면 카드 안에 목표 시간 칩과 알림 스위치를 함께 넣어 "밤"의 성격을 한 덩어리로 보여 준다. 로그아웃은 헤더 아이콘으로 옮겼다.
- **기록**: 기본 100P + 광고 부스터 80P 듀얼 게이지, 남은 한도 pill, 주간 상자 카드, 세션 카드(모드 아이콘·상태 pill·큰 시간·포인트 문장), 부스터 CTA 강조.
- **혜택**: 초대 코드 카드(점선 코드 박스·공유·이번 달/받은 포인트 타일·보낸 초대 목록), 코드 입력 카드, 챌린지 카드(세그먼트 pill·보상 줄·진행률 바·쿠폰 박스).
- **교환소**: 딥 에메랄드 지갑 카드(잔액·정산 전·교환 비율), 1,000원/5,000원 환산 타일, 상품 카드, 신청 폼, 내역.
- **로그인·온보딩**: 브랜드 마크와 큰 문장, 라벨이 붙은 입력, 소셜 버튼(Google 로고·Apple 네이티브 버튼 56px), 온보딩은 3개 선택 카드와 단계 표시.
- 탭바는 `@expo/vector-icons`(Ionicons) 아이콘 + 11px 라벨, 안전영역 높이를 반영한다.

### 4) 검증

`pnpm test` 56건 통과(신규 9건), `npx tsc --noEmit`, `npx expo lint`, `npx expo export --platform web`, `npx expo export --platform ios` 모두 통과.

---

## 2026-11-18: 4단계 친구 초대 · 브랜드 스폰서 챌린지 구현

2단계 성장 로드맵(2026-11-17 확정)의 두 항목을 `0008_referral_sponsor.sql`과 `혜택` 탭으로 구현했다. 브랜치 `feat/referral-sponsor-challenge`.

### 1) 친구 초대

- **규칙은 확정안 그대로**: 초대받은 친구가 3일 연속 오프라인 정산을 마치면 양쪽 +300P, 초대한 사람은 **달 기준 5회(1,500P)**까지. 값은 `point_rules('referral')`에서 읽으므로 조정은 DB 한 줄이다.
- **코드**: 사용자당 하나, 8자리 **대문자 16진수**. 16진수에는 0/O·1/I가 나오지 않아 친구가 불러 주고 입력할 때 헷갈리지 않는다. 코드는 서버(`ensure_referral_code`·회원가입 트리거)만 만들고, 사용자가 바꾸지 못하도록 트리거(`users_referral_code_guard`)로 막았다 — RLS의 UPDATE 정책은 **행**만 제한하고 **열**은 막지 못하기 때문이다.
- **새 계정만 넣을 수 있다**: 코드 입력 시점에 포인트 거래가 하나도 없어야 한다(`not_new`). 이미 기록이 있는 계정이 코드를 마지막에 넣어 보상을 가져가는 길을 막는다. 초대하는 사람은 온보딩을 마친 계정이어야 한다.
- **1인 1회**: `referrals.invitee_id` 유니크. 내 코드(`own_code`)와 서로 초대(A→B, B→A)하는 고리(`circular`)를 거절한다.
- **"3일 연속"의 정의**: `session_day_streak`가 **유효 세션이 끝난 KST 날짜**의 연속 구간을 센다. 오늘 또는 어제까지 이어진 구간만 인정해, 지난주에 만든 연속 기록으로 소급 수령하지 못하게 했다. 밤 수면은 일어난 날(끝난 날)에 귀속된다.
- **지급**: `bonus` 거래 2건, `bonus_pool = 'referral'`, 멱등키 `referral:<id>:inviter|invitee`. 초대한 사람이 월 한도에 걸리면 그쪽만 0P·`denied_reason='monthly_limit'`이고 **친구 몫 300P는 그대로** 준다(3일을 채운 사람은 친구다).
- **갱신 시점**: 세션 정산 뒤 `session-end` Edge Function이 `refresh_growth_progress`를 부른다. 0008 이전 서버에는 함수가 없으므로 실패를 경고로만 남기고 정산은 성공으로 둔다(앱의 다른 마이그레이션 폴백과 같은 규칙).

### 2) 브랜드 스폰서 챌린지

- **데이터 모델**: `sponsors` / `sponsor_challenges` / `challenge_participations` / `sponsor_coupons`. 달성 조건은 `mode`(수면·집중)·`min_minutes_per_day`·`target_days`·`window_days`·`consecutive`로 표현하고, `segment`(수면·회복 / 집중·자기개발)는 온보딩 주력 모드와 맞춰 노출·카피에 쓴다.
- **세그먼트는 노출 기준이지 참여 제한이 아니다**: `both`를 고른 사용자와 모드를 바꾼 사용자를 막으면 챌린지가 사실상 사라진다. 브랜드 보고용 구분은 목록 정렬·라벨로 처리하고, 실제 참여는 모드와 무관하게 허용한다.
- **진행 판정**: 참여 시점(`window_start`)부터 `window_days` 안에서, 그 모드의 유효 세션이 하루 `min_minutes_per_day` 이상인 KST 날짜를 센다(연속 조건이면 가장 긴 연속 구간). 참여 **전** 기록으로 소급 달성되지 않는다. 한 세션은 끝난 날에 귀속된다.
- **쿠폰**: 참여 1건당 1장(`sponsor_coupons.participation_id` 유니크). `delivery_status='pending'`으로 발급되고 실제 발송·재발송은 브랜드/운영자 몫이다. **포인트 원장과 분리**되어 쿠폰 발급은 `point_transactions`에 아무 행도 만들지 않는다(SQL 테스트로 확인).
- **끝난 참여**: 기간이 지나 미달성하면 `expired`, 사용자가 포기하면 `abandoned`(참여 인원 차감). 완료한 참여는 포기할 수 없다.
- **시드**: 브랜드 계약과 쿠폰 발송 수단이 없으므로 3건 모두 `active = false`로 넣었다(교환 상품 씨앗과 같은 원칙). 활성화 SQL은 README에 있다.

### 3) 보너스 풀 분리 (`bonus_pool`)

- 0006의 광고 부스터·주간 상자는 **그 주 `bonus` 합계**를 80P 풀 사용량으로 본다. 초대·챌린지 보너스를 같은 `kind`로 넣으면 광고 풀이 잠식되어 사용자가 광고를 봐도 0P가 된다.
- 그래서 `point_transactions.bonus_pool`('ad' / 'referral' / 'sponsor_challenge')을 추가하고, `claim_ad_booster`·`claim_weekly_box`를 `bonus_pool = 'ad'`만 세도록 다시 정의했다. 기존 `bonus` 행은 모두 `'ad'`로 채웠다(지금까지의 보너스는 광고에서만 나왔다).
- **조용히 비껴가지 않게**: append-only 트리거가 `bonus_pool`도 보호하고, `kind='bonus'`인 행은 `bonus_pool`이 반드시 있어야 한다는 CHECK를 추가했다. 앱 `records.tsx`의 주간 80P 진행률도 광고 풀만 센다.
- 이 변경 때문에 기존 SQL 테스트의 보너스 픽스처(`settlement.sql`, `weeklyCaps.sql`)에 `bonus_pool = 'ad'`를 명시했다. 검증하려는 규칙은 그대로다.

### 4) 앱

- 새 탭 **`혜택`**: 내 코드·공유·보낸 초대 현황·코드 입력, 그리고 챌린지 목록/진행/쿠폰. 공유는 네이티브에서 `Share`, 웹에서 클립보드로 떨어진다.
- 홈 정산 피드백에 초대 완료·챌린지 달성 안내를 덧붙인다(`session-end`가 돌려주는 `growth`).
- 0008 이전 서버에서는 `referral_summary`가 없어 `PGRST202`로 떨어지고, 화면은 "준비 중"으로 끝난다. 초대 코드·챌린지가 없어도 앱의 다른 기능은 그대로 동작한다.

### 5) 아직 없는 것

- 초대 진행은 **세션 정산 시점**에만 갱신된다(앱을 열지 않으면 친구 진행 표시가 늦다).
- 브랜드 쿠폰 자동 발송·재발송, 만료 알림, 친구에게 보내는 푸시가 없다.
- 챌린지 참여 상한(`sponsor` 규칙의 `max_joined_per_user`)은 값만 두고 아직 강제하지 않는다.

---

## 2026-11-18: 광고 표시(AdMob) 연결 · 수면 모드 구현

v0.2의 "앱에 광고가 없다"와 "수면 자동 감지가 없다" 두 구멍을 닫았다. 브랜치 `feat/admob-sleep-mode`.

### 1) 리워드 광고를 실제로 띄운다 (`react-native-google-mobile-ads` 17.4.0)

- **패키지·플러그인**: `react-native-google-mobile-ads@17.4.0`(peer: `react-native >= 0.86`, `expo >= 47` — 현재 0.88.1/SDK 58과 맞음)을 설치하고 `app.json` plugins에 Expo config plugin을 등록했다. `iosAppId`·`androidAppId`는 **Google이 공개한 테스트 앱 ID**를 넣어 두었다(실제 ID는 AdMob 콘솔에서 발급). `userTrackingUsageDescription`은 한국 서비스라도 App Store 심사·ATT 설명에 필요하므로 넣었다.
- **광고 단위**: `EXPO_PUBLIC_ADMOB_REWARDED_UNIT_ID_IOS`·`_ANDROID`를 먼저 쓰고, 비어 있으면 `TestIds.REWARDED`로 떨어진다. 개발 빌드가 실제 광고를 요청해 정책 위반(무효 트래픽)이 나지 않도록, 테스트 단위를 기본값으로 둥다.
- **SSV 규격**: 광고 요청에 `serverSideVerificationOptions.userId`(Supabase user id)와 `customData`(`{v:1,kind,session_id?}`)를 실어 보낸다. 콜백 `ad-reward-ssv`가 이미 이 형식을 파싱하므로 서버는 바꾸지 않았다. 앱 쪽 인코더는 `src/features/ads/adPlacement.ts`, 콜백 파서는 `supabase/functions/_shared/adReward.ts`이며 **둘이 같은 JSON을 만드는지 `tests/adPlacement.test.mjs`가 검사**한다.
- **앱은 포인트를 만들지 않는다**: 앱은 `rewarded`·`dismissed`·`unavailable`만 반환하고, 지급은 서명 검증 뒤 서버 RPC에서만 일어난다. 앱은 `rewarded`에서 원장·잠금·청구 목록을 다시 읽기만 한다(SSV가 늦게 도착할 수 있어 "확인 중" 문구를 유지).
- **실패 처리**: 플랫폼이 웹·Expo Go·모듈 없음·노필·오류·타임아웃(15초)이면 `unavailable`로 끝내고 기본 적립은 그대로 둔다. 광고를 못 봐서 사용자가 손해를 보는 경로를 만들지 않는다.
- **알려진 한계**: 앱이 백그라운드면 광고를 미리 로드하지 않으므로 첫 부스터는 로드 시간이 붙는다. 실제 광고 단위·앱 ID로 바꾸기 전에는 수익이 잡히지 않는다(테스트 단위).

### 2) 수면 모드 (`0007_sleep_mode.sql`)

- **규칙**: 기존 `point_rules`의 수면 값(최소 40분·최대 12시간·하루 10시간)을 그대로 쓴다. 단가는 0006의 2P/시간·10분 절사. 7시간 30분 = 15P.
- **적립은 새로 만들지 않았다**: `apply_earn`이 이미 `mode`별 단가·하루 한도를 읽고 `earn_sleep` 행을 쓰고 있었다. 수면에 필요했던 것은 **종료·유효성 판정**뿐이라 `finish_sleep_session`을 추가하고, `apply_earn`·정산·부스터는 한 줄도 바꾸지 않았다. 그 결과 부스터·주간 상자·주간 기본 상한이 수면에도 자동으로 적용되고, **주간 기본 100P는 수면·집중 합산**이다(수면만으로 채우면 그 뒤 수면도 0P · `weekly_cap_reached`).
- **세션 하나만 열린다**: `sessions_one_open_per_user` 유니크 인덱스가 수면·집중 동시 기록을 막아 겹침 적립 문제가 생길 수 없다. 세션 시작 함수가 다른 모드가 열려 있으면 409를 준다.
- **충전은 근거이지 조건이 아니다**: `expo-battery`로 앱이 살아 있는 동안만 상태를 받고(권한·배터리 최적화 예외 요구 없음), `started_charging`·`ended_charging`에 기록한다. 충전 중이 아니어도 수면 기록은 유효하다. 시뮬레이터·웹은 상태를 모르므로 안내 문구만 바뀌고 `null`로 저장된다.
- **목표 시간**: `users.sleep_bedtime`·`sleep_waketime`(KST 벽시계, `time`)에 둔다. 별도 설정 테이블을 만들지 않았다 — 값이 하나뿐이고 프로필과 함께 읽히기 때문. 목표는 안내용이며 적립 계산에는 쓰지 않는다. 홈은 취침~기상 사이에 수면 카드를 먼저 보여 주고, 그 밖에는 집중을 먼저 보여 준다(사용자가 고른 모드가 우선).
- **아침 1탭**: 수면 중에는 버튼이 `일어났어요 · 정산하기`로 바뀌고, 한 번 누르면 종료·적립이 한 트랜잭션으로 끝난다. 12시간을 넘은 밤은 12시간에서 자르고 `truncated`로 알려 준다.
- **마이그레이션 전 호환**: 원격 DB에는 아직 0007(과 0005·0006)이 없다. 새 열을 select하면 오류(42703)가 나므로 앱은 예전 열로 한 번 더 조회한다. 이 폴백이 없으면 지금의 프리뷰 빌드가 홈·기록 화면을 열지 못한다.
- **테스트**: `tests/sleepMode.sql`(목표 시간 저장, 7시간 30분 = 15P, 하루 10시간 부분 지급·초과 0P, 주간 100P 공유, 40분 미만 거절, 12시간 절단, 재정산 멱등, 집중 20분 유지, 타인 정산 거부), `tests/sleepGoal.test.mjs`(자정 넘는 목표·밤 시간대·모드 선택).
- **아직 없는 것**: 백그라운드 충전 리시버·포그라운드 서비스·Live Activity(Android/iOS 네이티브 작업), 취침·기상 푸시 알림, 아침 정산 전용 카드 화면(현재는 홈 피드백 + 기록 탭).

---
## 2026-11-17 (최종 확정): v0.2 단가 2P/시간 + 주간 상한 분리(기본 100P · 광고 부스터 80P)

같은 날 오전의 1P/시간 안은 "1시간 미만 세션은 0P"(30분 집중 = 0P)라는 한계가 있었고, 30분 프리셋을 살릴 수 없었다. 오후에 사용자가 **2P/시간 + 주간 상한 분리**를 확정해 `feat/ad-revenue-defense`에 반영했다(`0006_weekly_cap_split.sql`).

- **기본 적립**: 모든 모드 **1시간 = 2P**, 10분 단위 절사(`earn_rate`). 30분 = 1P, 1시간 = 2P, 7시간 30분 = 15P. 광고를 보지 않아도 지급되는 보장 적립이다.
- **주간 상한 분리**(`weekly_cap` = `{base_points:100, booster_points:80, points:180, after_cap_multiplier:0}`):
  - 기본 적립은 주 **100P**까지. 100P는 50시간 상당이라 직장인(수면 7시간 x 7일)이면 주중에 도달한다.
  - 광고 부스터는 주 **80P**까지. 합계 최대 **180P/주**(약 129원).
  - **상한 이후에도 세션은 정상 기록**된다(`sessions.status = 'valid'`). 포인트만 0P이고 `point_transactions.note = 'weekly_cap_reached'`, 한도에 걸쳐 지급되는 세션은 남은 만큼만 받고 같은 note를 남긴다. 스트릭·기록·정산 주기는 그대로 유지된다.
- **부스터 한도 계산**: `claim_ad_booster`·`claim_weekly_box`는 그 주 `kind='bonus'` 거래 합계를 광고 풀 사용량으로 보고, 지급액을 `least(계산된 보너스, 80 - 사용량)`으로 자른다. 풀이 비면 광고는 `denied_reason = 'weekly_booster_cap'`으로 기록만 남기고 0P를 준다. 주간 상자는 현재 주 풀에서 차감된다(상자는 현재 주에 적립되므로).
- **주력 모드 배율**: 1.0 유지(보상은 부스터로 일원화).
- **교환 비율**: `1P ≈ 0.714원`, `1,000원 = 1,400P`, 최소 1,400P·100P 단위(0005 값 유지).
- **상품 씨앗**: `네이버페이 포인트 1,000원 = 1,400P`, `메가커피 아메리카노 = 2,800P`, `컬처랜드 상품권 5,000원 = 7,000P`를 `active = false`로 넣었다. 발송 수단이 준비되기 전에는 교환소에 노출되지 않고, 운영 활성 상품은 여전히 0건이다.
- **경제성**: 최대 180P/주 ≈ 128.6원, 월 약 557원. 보장 지출은 100P/주 ≈ 71원/주로 묶여 광고 수익(리워드 1편 10~20원, 하루 최대 2편)이 지출을 넘지 않는다. 1P/시간 안보다 사용자 보상은 커졌지만(30분 = 1P), 상한이 분리되어 원가 상한은 그대로다.

### 2단계 성장 로드맵 (같은 날 확정)

- **친구 초대**: 초대받은 친구가 **3일 연속 오프라인 정산**을 완료하면 양쪽에 **+300P**, **월 최대 5회**(월 1,500P). 지급은 `bonus` 거래로 넣고 주간 부스터 풀과 분리된 별도 한도(`referral`)를 쓴다.
- **브랜드 스폰서 챌린지**: 온보딩 모드로 세그먼트를 나눈다. 수면·회복형 → 영양제·수면용품·편의점, 집중·자기개발형 → 카페·스터디카페·간식·문구. 챌린지 달성 시 브랜드 쿠폰을 지급하고, 우리는 매칭·검증·정산만 맡아 지급 리스크를 브랜드로 넘긴다.

---

## 2026-11-17: v0.2 수익·원가 방어 구조 (광고 부스터 + 교환 비율) — 단가·주간 상한은 위 최종안으로 대체됨

v0.1은 수면 2P·집중 3P(주력 1.5배), 1P=1원, 하루 광고 2회 조건이었다. 보수적 eCPM(1만 원) 가정에서 유저당 월 120원 적자가 나는 구조였으므로, **광고를 본 만큼만 보너스를 주고 교환 비율로 원가를 방어하는 v0.2**를 `feat/ad-revenue-defense` 브랜치에서 적용했다.

- **기본 적립**: 모든 모드 **1시간 = 1P**(10분 단위 절사, `point_rules.earn_rate`). 광고를 보지 않아도 지급되는 보장 적립이다.
- **주력 모드 1.5배 → 1.0배**: 1P 단가에서 1.5배는 0.5P 절사로만 남아 의미가 없고, 보상 채널이 광고 부스터와 겹친다. `primary_bonus.multiplier = 1.0`으로 두고 보상은 부스터로 옮겼다.
- **정산 부스터**: 유효 세션의 기본 적립이 남아 있는 동안 광고 1편당, 세션 기본 적립과 같은 `bonus` 거래를 한 번 더 넣어 합계를 2배로 만든다. **하루 2회**(`ads.daily_max`), **세션당 1회**(`ad_reward_claims_session_idx`), **SSV 거래 1건당 1회**(`ad_reward_claims_ssv_idx`)로 제한한다.
- **광고 보상은 SSV만 인정**: 새 Edge Function `ad-reward-ssv`가 AdMob 서명(ECDSA P-256/SHA-256, DER)을 검증한 뒤 `claim_ad_booster`/`claim_weekly_box`를 호출한다. 앱은 포인트를 만들 수 없다. 콜백은 `verify_jwt = false` + `auth: 'none'`으로 열되 서명으로 인증한다.
- **주간 보너스 상자**: 정산이 끝난 주마다 1회, 광고 1편으로 `weekly_bonus_points`(20P)를 `bonus`로 지급한다. 정산된 가장 최근 주에만 열 수 있다.
- **교환 비율**: **1P ≈ 0.714원, 1,000원 = 1,400P**(`currency`). `products`의 1,000P 배수 제약을 100P 단위·최소 100P로 완화하고, 실제 교환은 `point_rules.redemption`의 최소 1,400P·100P 단위로 막는다.
- **정산**: `settle_week`/`settle_due_weeks`가 `bonus` 거래도 함께 확정한다. 늦게 도착한 부스터는 다음 일일 정산에서 해당 주에 합산된다.
- **한계(알려진 사항)**: 10분 절사 + 1시간 1P 조합에서는 1시간 미만 세션이 0P였다(30분 집중 = 0P). **위 최종안(2P/시간)에서 해소**됨.
- **아직 남은 일**: `react-native-google-mobile-ads`가 의존성에 없어 앱에서 광고를 띄울 수 없다. `src/features/ads/rewardedAd.ts` 한 곳만 교체하면 되고, AdMob 광고 단위와 SSV 콜백 URL 등록이 필요하다.

## 2026-11-16: 원격 PostgreSQL 17 사용

초기 프롬프트는 PostgreSQL 15를 고정 스택으로 지정했다. 새로 만든 Supabase `apptech` 프로젝트(`uhisjleftevizjfudeip`)가 PostgreSQL 17.11.0.019임을 확인했고, 사용자가 기존 PostgreSQL 17 프로젝트 사용과 마이그레이션 적용을 선택했다. 로컬 Supabase 설정도 PostgreSQL 17로 맞춘다. 원문 기획 파일은 변경하지 않고 이 결정을 별도로 기록한다.

원격 프로젝트에 `0001_init.sql`을 적용하고 Auth의 기본 URL과 추가 복귀 URL을 `offlinetime://auth/callback`에 맞췄다. 로컬 PostgreSQL 17.11에서 마이그레이션 초기화와 M0 인증·프로필·RLS 검증을 다시 통과했다. Apple·Google 제공자는 아직 인증 정보가 없어 비활성 상태다.
