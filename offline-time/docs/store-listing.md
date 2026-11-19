---
title: "오프라인 타임 — 스토어 등록 문구 · 심사 노트 (v1.0.0)"
---

> 이 문서는 **그대로 복사해 App Store Connect와 Google Play Console에 붙여 넣는 제출용 원고**입니다.
> 모든 숫자·동작은 이 저장소의 실제 구현(`supabase/migrations/`, `supabase/functions/`, `src/`)과 같습니다.
> 문구를 고칠 때는 먼저 [5. 숫자 대조표](#5-숫자-대조표-문구--구현)를 보고, 같은 값을 쓰는 앱 안 약관
> (`src/features/legal/legalText.ts`)·공개 페이지(저장소 루트 `docs/*.html`)도 함께 고칩니다.
> `tests/storeListing.test.mjs`가 아래 글자 수 한도와 핵심 숫자·URL이 빠지지 않았는지 검사합니다.
>
> **`[입력 필요]`** 표시는 사람이 채워야 하는 값입니다. 목록은 [7. 제출 전 남은 일](#7-제출-전-남은-일-사람이-하는-일)에 모았습니다.

## 0. 기준 정보

| 항목 | 값 | 출처 |
| --- | --- | --- |
| 스토어에 보이는 이름 | **오프라인 타임** | `app.json` → `expo.name` (`app.config.ts`는 이름을 바꾸지 않는다) |
| 저장소·프로젝트 이름 | `phonedown` (저장소) / `offline-time` (앱 폴더, Expo slug) | — **스토어 이름이 아니다** |
| slug | `offline-time` | `app.json` |
| iOS 번들 ID | `app.offlinetime.mobile` | `app.json` |
| Android 패키지 | `app.offlinetime.mobile` | `app.json` |
| 버전 / 빌드 | `1.0.0`, 빌드 번호는 `autoIncrement` | `app.json`, `eas.json` |
| iOS 최소 버전 | 16.4 (Live Activity) | `app.json` → `ios.deploymentTarget` |
| Android 최소 버전 | Android 10+ (기획서 기준) | `docs/spec.md` |
| Expo 프로젝트 | `@mybeats/offline-time` | `app.json` → `owner` |
| 원격 Supabase | `uhisjleftevizjfudeip` (PostgreSQL 17) | `README.md` |
| 언어 | 한국어 단일 | 앱 화면 전체 |
| 문의 메일 | `help@offlinetime.app` — **임시 기본값** `[입력 필요]` | `src/features/legal/legalText.ts` |
| 공개 페이지 | `https://byeongdoo-han.github.io/phonedown/` 외 3개 — **4개 모두 200 확인**(2026-11-19) | GitHub Pages `built` (source `main` / `docs`, https 강제) |
| 브랜드 색 | 배경 `#F7F8FA`, 강조 `#0F766E`, 밤 `#0F172A`~`#172033` | `src/theme/tokens.ts` |

문의 메일을 실제 주소로 바꾸면 `EXPO_PUBLIC_SUPPORT_EMAIL`과 저장소 루트 `docs/*.html`의 `mailto:`를
같이 바꾸고 `pnpm test`로 확인합니다(`tests/legalPages.test.mjs`가 앱과 페이지의 주소가 같은지 본다).

---

## 1. App Store Connect (iOS)

앱 정보 → **한국어(기본 언어)** 기준. 영어 스토어를 열지 않으면 영어 칸은 비워 둡니다.

### 1.1 앱 이름 (30자 이내)

```text
오프라인 타임
```

- 이름은 `app.json`의 `expo.name`과 같아야 설치 후 홈 화면 이름과 어긋나지 않습니다.
- App Store 이름은 전 세계에서 유일해야 합니다. 등록 화면에서 이미 쓰이고 있으면 아래 대안을 씁니다(둘 다 30자 이내).

```text
오프라인 타임 – 수면·집중 적립
```

```text
오프라인 타임: 폰 내려놓기
```

### 1.2 부제 (30자 이내)

```text
폰 내려놓은 시간을 포인트로
```

부제는 검색에 반영됩니다. 앱 이름에 이미 들어간 "오프라인 타임"을 반복하지 않고, 기록 대상(시간)과
결과(포인트)를 같이 넣었습니다.

### 1.3 프로모션 텍스트 (170자 이내)

```text
잠들 때, 일할 때 폰을 내려놓은 시간이 그대로 포인트가 돼요. 수면과 집중 모두 1시간 2P, 주간 기본 100P에 광고 부스터 80P까지. 확정된 포인트는 1,400P부터 네이버페이·기프티콘으로 교환할 수 있어요.
```

스토어에서 앱을 고르는 순간에 보이는 문장이므로 숫자를 앞에 두었습니다. 출시 후 언제든 고칠 수 있는
칸이라, 이벤트·시즌 문구를 넣기에도 좋습니다.

### 1.4 설명 (4,000자 이내)

```text
오프라인 타임은 폰을 내려놓고 지낸 시간을 기록해 포인트로 모으는 앱입니다. 잠든 시간과 집중한 시간을 한곳에서 기록하고, 매주 월요일 00시(한국 시간)에 지난주 포인트가 확정되면 네이버페이·모바일 상품권으로 교환할 수 있어요.

■ 기록은 두 가지예요
· 수면 — 자기 전에 한 번, 아침에 한 번. 충전기를 꽂아 두면 홈 화면에 배너가 떠서 1탭으로 시작할 수 있어요. 수면 목표 시간(기본 23:00–07:00)과 매일 알림은 선택이에요.
· 집중 — 30·60·90분 중 목표를 고르고 시작해요. 폰을 내려놓는 동안 남은 시간이 잠금화면과 다이내믹 아일랜드에도 보입니다(iOS 16.4 이상).

■ 적립 규칙 (화면에 보이는 계산식 그대로)
· 기본 적립: 수면·집중 모두 1시간에 2P. 10분 단위로 내림 계산해서 30분이면 1P예요.
· 유효 조건: 수면은 40분부터, 한 번에 12시간까지, 하루 10시간까지. 집중은 20분부터, 한 번에 3시간까지, 하루 6시간까지. 기준을 못 채운 기록도 남지만 유효 시간으로 계산되지 않아요.
· 주간 기본 상한: 수면과 집중을 합쳐 주 100P.
· 광고 부스터: 기록을 마친 뒤 리워드 광고 1편을 보면 그 기록의 기본 적립만큼 한 번 더 쌓여요(하루 2회, 기록 1건당 1회, 주 80P까지).
· 주간 보너스 상자: 정산이 끝난 주에는 광고 1편으로 20P를 한 번 더 받을 수 있어요.
· 친구 초대: 친구가 내 코드를 넣고 3일 연속 기록을 정산하면 두 사람 모두 300P. 초대한 사람은 달마다 5회(1,500P)까지 받아요.

■ 광고는 여기까지만
앱을 열 때나 기록을 볼 때 광고가 뜨지 않아요. 광고는 부스터·보너스 상자를 직접 눌렀을 때만 나오고, 광고를 보지 않아도 기본 적립은 그대로 쌓입니다. 맞춤형 광고를 허용하지 않아도 광고와 적립은 똑같이 동작해요.

■ 정산과 교환
· 지난주 포인트는 매주 월요일 00시(한국 시간)에 확정돼요. 그 주가 끝나기 전에는 확정되지 않아요.
· 확정된 포인트만 교환할 수 있고, 최소 1,400P부터 100P 단위로 신청해요. 1,000원은 1,400P예요.
· 교환 내역에서 신청·발송 상태를 확인할 수 있고, 발송이 어려우면 사유와 함께 포인트를 돌려드려요.

■ 기록은 서버가 확인해요
시작·종료 시각은 서버 시각을 기준으로 남고, 포인트를 만드는 계산은 서버에서만 이루어집니다. 기기 시간을 바꿔도 적립되지 않아요. 앱에는 공개 키만 넣고, 서버 비밀 키는 앱에 두지 않습니다.

■ 내 정보는 내가 지워요
설정에서 회원 탈퇴를 하면 기록·포인트·교환 내역이 즉시 지워지고 되돌릴 수 없어요. 위치·연락처·사진·카메라·건강 정보에는 접근하지 않아요. 교환을 신청할 때 적는 휴대전화 번호는 상품 발송에만 씁니다. 알림은 선택이고, 거부해도 기록과 적립은 그대로 동작해요.

문의: help@offlinetime.app
개인정보처리방침: https://byeongdoo-han.github.io/phonedown/privacy.html
이용약관: https://byeongdoo-han.github.io/phonedown/terms.html
```

- 첫 문단만 읽어도 "무엇을 하는 앱이고 무엇을 받는지"가 남도록 썼습니다.
- "국내에 이런 앱이 없다" 같은 비교·최상급 표현은 쓰지 않았습니다(확인 불가한 주장은 심사·표시광고
  리스크). 기획서 `docs/spec.md` 1.3절도 같은 이유로 범위를 좁혀 쓰라고 적고 있습니다.
- 교환 상품은 실제 활성 상품 이름만 씁니다. 지금 씨앗 데이터는 `네이버페이 포인트 1,000원`,
  `메가커피 아메리카노`, `컬처랜드 상품권 5,000원`이고 **모두 `active = false`** 입니다(6장 참고).

### 1.5 키워드 (100자 이내, 쉼표 구분)

```text
수면기록,집중타이머,앱테크,포인트적립,리워드,폰잠금,수면앱,공부타이머,기프티콘,네이버페이
```

앱 이름·부제에 이미 있는 단어(오프라인, 타임, 폰, 포인트)는 넣지 않았습니다. 띄어쓰기는 쓰지 않습니다
(Apple이 문자 수로 세고, 띄어쓰기가 자리를 차지합니다).

### 1.6 카테고리

| 칸 | 값 | 이유 |
| --- | --- | --- |
| 1차 | **라이프스타일** | 수면·집중 습관을 기록하고 보상으로 이어 붙이는 앱. 같은 카테고리의 국내 리워드 앱들이 라이프스타일 인기 순위에 있습니다(`docs/spec.md` 1.3절). |
| 2차 | **건강 및 피트니스** | 수면 시간이 핵심 기능이라 검색 노출을 넓힙니다. |

건강 및 피트니스를 1차로 두는 선택도 가능합니다(수면 강조). 다만 앱의 중심이 "기록 → 정산 → 교환"이라
라이프스타일이 더 맞고, 심사에서 건강 앱으로 분류되면 건강 관련 기기·데이터 요구가 붙기 쉽습니다.

### 1.7 연령 등급 설문 가이드

Apple의 연령 등급 설문(2026년 기준 항목)에 아래처럼 답합니다.

| 항목 | 답 | 근거 |
| --- | --- | --- |
| 폭력·공포·성적 표현·약물·도박 | 없음 | 해당 콘텐츠 없음 |
| 의학/치료 정보 | 없음 | 수면 시간은 기록이지 의학 정보가 아님 |
| 사용자 제작 콘텐츠·메시지 | 없음 | 친구 초대는 코드 교환뿐, 게시판·채팅 없음 |
| 무제한 웹 접근 | 없음 | 브라우저 없음. 외부로 나가는 링크는 약관·방침·메일뿐 |
| 인앱 결제 | 없음 | 포인트는 무료 적립으로만 쌓이고, 현금 결제 없음 |
| 광고 | 있음 | Google AdMob 리워드 광고(사용자가 누를 때만) |
| 위치 공유 | 없음 | 위치 권한을 요청하지 않음 |

예상 결과는 **4+** 입니다. 만 14세 미만은 가입할 수 없다는 점을 약관 2조와 방침 7항에 적어 두었으니,
설문에 나이 제한을 묻는 칸이 있으면 그대로 답합니다. **키즈 카테고리는 선택하지 않습니다.**

### 1.8 URL

| 칸 | 값 |
| --- | --- |
| 지원 URL (필수) | `https://byeongdoo-han.github.io/phonedown/` |
| 마케팅 URL (선택) | 비워 둠 (지원 URL과 같아도 되지만 중복 입력은 심사에 도움이 되지 않음) |
| 개인정보처리방침 URL (필수) | `https://byeongdoo-han.github.io/phonedown/privacy.html` |
| 계정 삭제 URL (App Privacy 항목) | `https://byeongdoo-han.github.io/phonedown/account-deletion.html` |

네 주소는 GitHub Pages(`main` / `docs`)에서 서빙되고 있고, 2026-11-19에 `privacy.html`,
`terms.html`, `account-deletion.html`, `index.html`과 `assets/legal.css`가 모두 200으로 응답하는 것을
확인했습니다(Pages 상태 `built`, https 강제). 스토어 칸에는 이제 그대로 저장할 수 있습니다.

문구를 고치면 `main`에 머지된 뒤 1~2분 안에 반영됩니다. Pages를 껐다 켜야 하는 상황은
`docs/release-checklist.md` 6번에 적어 두었습니다.

### 1.9 버전 정보 (What's New)

첫 출시이므로 비워 두거나 아래 한 줄을 씁니다.

```text
첫 출시예요. 수면·집중 기록을 포인트로 모아 매주 정산하고, 네이버페이·상품권으로 교환해 보세요.
```

### 1.10 스크린샷 카피 (6.9" / 6.5" iPhone, 6장)

요건: 6.9"(1320×2868 또는 1290×2796), 6.5"(1284×2778 또는 1242×2688). 세로, 최소 1장·최대 10장.
아래 순서대로 6장을 올리면 앱의 흐름(기록 → 적립 → 정산 → 교환 → 함께)이 그대로 읽힙니다.

| # | 화면 | 캡처할 상태 | 큰 문구 | 작은 문구 |
| --- | --- | --- | --- | --- |
| 1 | 홈(밤·수면 카드) | 밤 시간대, 수면 목표 23:00–07:00, 충전기 연결 배너가 뜬 상태 | 잠든 시간이 포인트가 돼요 | 자기 전 한 번, 아침에 한 번 |
| 2 | 홈(집중 타이머 진행 중) | 60분 집중을 20분쯤 진행한 상태(경과 시간 표시) | 폰을 내려놓은 만큼 쌓여요 | 1시간에 2P, 10분 단위로 계산 |
| 3 | 잠금화면 Live Activity | 집중 기록 중 잠금화면(또는 다이내믹 아일랜드) 캡처 | 잠금화면에서도 시간이 보여요 | iOS 16.4 이상 · 앱을 안 열어도 그대로 |
| 4 | 기록 탭 | 이번 주 적립 막대(기본/부스터)와 기록 3~4건이 보이는 상태 | 이번 주 적립이 한눈에 | 기본 100P + 부스터 80P |
| 5 | 교환소 | 확정 포인트와 **활성 상품 1개 이상**이 보이는 상태 | 1,400P면 1,000원 | 네이버페이 · 모바일 상품권 |
| 6 | 혜택(친구 초대) | 내 초대 코드와 진행 중 초대 1건 | 친구랑 같이 모아요 | 3일 연속 정산하면 서로 300P |

캡처 전에 심사용·데모 계정에 아래를 미리 만들어 두면 화면이 비어 보이지 않습니다.

- 지난주 기록 2~3건(수면 1건 7시간 30분 = 15P, 집중 1건 60분 = 2P)과 **확정된** 포인트 5,000P 이상
- 확정 포인트로 교환 내역 1건(발송 완료 상태) — 교환 내역 카드가 보이도록
- 친구 초대 1건(진행 중) — `혜택` 탭이 비어 보이지 않도록

5번은 상품이 **비활성이면 "상품을 준비 중이에요" 카드가 찍힙니다.** 스크린샷을 만들기 전에 6장의
"활성 상품"을 먼저 준비해야 합니다.

### 1.11 App Store 심사 노트 (App Review Notes)

App Store Connect → 앱 심사 정보 → **심사 노트** 칸에 그대로 붙여 넣습니다. 심사자가 한국어를 읽지
못할 수 있으므로 영어를 먼저 두고 한국어를 뒤에 붙입니다.

```text
[EN]
App purpose: Offline Time records the time a user leaves the phone alone (sleep at night, focus
during the day) and converts it into points that can be redeemed for Korean gift cards. There is
no purchase of any kind inside the app; points are earned only by recorded time.

1) Sign-in is required for every screen. Review account:
   email: [입력 필요]  password: [입력 필요]
   (The account already has confirmed points and one redemption history entry, and one test
   product is active so the redemption flow can be completed.)

2) How points work (all calculation is server-side; the app cannot create points):
   - Earn: 2P per hour for both sleep and focus, floored to 10-minute units.
   - Valid session: sleep from 40 min (max 12 h per session, 10 h per day); focus from 20 min
     (max 3 h per session, 6 h per day).
   - Weekly base cap: 100P combined (sleep + focus).
   - Settlement: last week's pending points are confirmed every Monday 00:00 KST by a scheduled
     database job. Only confirmed points can be redeemed.
   - Redemption: minimum 1,400P, 100P steps, 1,000 KRW = 1,400P. Fulfillment is handled manually
     by the operator today; a failed delivery is refunded automatically.
   Because settlement runs weekly, a session started during review stays "pending" until the next
   Monday - this is expected behaviour, not a failure. The review account is pre-loaded with
   confirmed points so the store and redemption screens can be tested immediately.

3) Ads are optional and rewarded only. A rewarded AdMob video is offered after a finished session
   (booster) or for the weekly bonus box. Skipping, failing, or never watching an ad leaves the
   base points untouched. No banner or interstitial ads exist; no ads appear on launch.
   AdMob SSV (server-side verification) confirms the reward; the app itself only shows the ad.

4) iOS specifics:
   - Live Activity (NSSupportsLiveActivities = true, iOS 16.4+): a Lock Screen / Dynamic Island
     timer appears while a sleep or focus session is running and closes when the session is settled.
   - Charging state is read with expo-battery to show a "start sleep now" banner. It is not a
     condition for earning points, and no permission is requested for it.
   - Notifications are local only (no remote push). Declining the permission does not block any
     recording or earning.
   - Account deletion: Settings (gear icon) -> 회원 탈퇴 -> type 탈퇴 -> 탈퇴하고 모든 기록 삭제.
     Web fallback: https://byeongdoo-han.github.io/phonedown/account-deletion.html
   - Terms and privacy policy open from the sign-in screen footer and from Settings.
   - No HealthKit, no location, no contacts, no camera, no photo access.
```

```text
[KO]
앱 목적: 잠들 때·집중할 때 폰을 내려놓은 시간을 기록해 포인트로 모으고, 그 포인트를 국내 상품권으로
교환하는 앱입니다. 앱 안에서 결제·구매는 없습니다. 포인트는 기록으로만 쌓입니다.

1) 모든 화면이 로그인 후에 열립니다. 심사용 계정
   이메일: [입력 필요]  비밀번호: [입력 필요]
   (계정에 확정 포인트와 교환 내역 1건이 미리 들어 있고, 심사용 테스트 상품 1종이 활성화되어 있어
   교환 흐름을 바로 확인할 수 있습니다.)

2) 포인트 구조 (계산은 전부 서버에서만 일어나고 앱은 포인트를 만들 수 없습니다)
   - 적립: 수면·집중 모두 1시간 2P, 10분 단위로 내림.
   - 유효 조건: 수면 40분부터(1회 12시간·하루 10시간), 집중 20분부터(1회 3시간·하루 6시간).
   - 주간 기본 상한: 수면·집중 합산 100P.
   - 정산: 매주 월요일 00시(한국 시간)에 지난주 적립이 확정됩니다. 확정된 포인트만 교환할 수 있습니다.
   - 교환: 최소 1,400P, 100P 단위, 1,000원 = 1,400P. 발송은 현재 운영자가 직접 처리하고, 발송에
     실패하면 포인트가 자동으로 환급됩니다.
   정산이 주 1회라 심사 중에 시작한 기록은 다음 월요일까지 "정산 전"으로 남습니다. 정상 동작이며,
   심사용 계정에 확정 포인트를 미리 넣어 두어 교환소·교환 흐름을 바로 확인하실 수 있습니다.

3) 광고는 선택이며 리워드형만 있습니다. 기록을 마친 뒤 부스터 또는 주간 보너스 상자에서 광고 1편을
   제안하고, 보지 않거나 재생이 실패해도 기본 적립은 그대로 유지됩니다. 배너·전면 광고는 없고 앱을
   열 때 광고가 뜨지 않습니다. 보상 지급은 AdMob 서버 콜백(SSV)으로 확인합니다.

4) iOS 관련
   - Live Activity(iOS 16.4 이상): 수면·집중 기록 중 잠금화면과 다이내믹 아일랜드에 타이머가 뜨고,
     정산하면 닫힙니다.
   - 충전 상태는 expo-battery로 읽어 "지금 수면 시작" 배너를 보여 주는 데만 쓰고, 적립 조건이
     아니며 권한도 요구하지 않습니다.
   - 알림은 기기 안에서만 예약하는 로컬 알림입니다(원격 푸시 없음). 권한을 거부해도 기록·적립은
     그대로 동작합니다.
   - 계정 삭제: 설정(톱니바퀴) → 회원 탈퇴 → "탈퇴" 입력 → 탈퇴하고 모든 기록 삭제.
     앱을 열 수 없을 때: https://byeongdoo-han.github.io/phonedown/account-deletion.html
   - 이용약관·개인정보처리방침은 로그인 화면 하단과 설정에서 열립니다.
   - HealthKit·위치·연락처·카메라·사진 접근을 쓰지 않습니다.
```

`[입력 필요]`가 남은 채로 제출하면 심사가 곧바로 막힙니다(로그인 화면에서 더 진행할 수 없음).

---

## 2. Google Play Console (Android)

### 2.1 앱 이름 (30자 이내)

```text
오프라인 타임
```

Play는 30자까지 이름에 설명을 붙일 수 있지만, iOS와 같은 이름을 써서 스토어 간 혼동을 없앴습니다.

```text
오프라인 타임 - 수면·집중 포인트
```

### 2.2 간단한 설명 (80자 이내)

```text
수면·집중 기록을 포인트로 모아 네이버페이·상품권으로 교환하는 앱테크
```

### 2.3 자세한 설명 (4,000자 이내)

```text
폰을 내려놓고 지낸 시간을 기록해 포인트로 모으는 앱, 오프라인 타임입니다.
잠든 시간과 집중한 시간을 한곳에 남기고, 매주 월요일 00시(한국 시간)에 지난주 포인트가 확정되면 네이버페이·모바일 상품권으로 교환할 수 있어요.

■ 이렇게 기록해요
· 수면: 자기 전에 한 번, 아침에 한 번 누르면 끝나요. 충전기를 꽂아 두면 홈 화면 배너에서 1탭으로 시작할 수 있어요. 수면 목표 시간과 매일 알림은 원하는 만큼만 켜 두세요.
· 집중: 30·60·90분 목표를 고르고 시작해요. 기록이 도는 동안에는 잠금화면에서도 시간이 보여요(iOS).

■ 적립 규칙
· 수면·집중 모두 1시간에 2P, 10분 단위로 내림 계산(30분 = 1P)
· 수면은 40분부터 유효, 한 번에 12시간·하루 10시간까지
· 집중은 20분부터 유효, 한 번에 3시간·하루 6시간까지
· 주간 기본 상한은 수면·집중 합쳐 100P
· 광고 부스터: 기록을 마친 뒤 리워드 광고 1편으로 기본 적립만큼 한 번 더(하루 2회, 기록 1건당 1회, 주 80P까지)
· 주간 보너스 상자: 정산이 끝난 주에 광고 1편으로 20P
· 친구 초대: 친구가 내 코드를 넣고 3일 연속 정산하면 서로 300P(초대한 사람은 달마다 5회까지)

■ 광고는 직접 누를 때만
앱을 열 때나 기록을 볼 때 광고가 뜨지 않아요. 부스터·보너스 상자를 눌렀을 때만 광고가 나오고, 보지 않아도 기본 적립은 그대로예요. 맞춤형 광고를 허용하지 않아도 광고와 적립은 같게 동작합니다.

■ 정산과 교환
· 지난주 포인트는 매주 월요일 00시(한국 시간)에 확정돼요.
· 확정된 포인트만 교환할 수 있고, 최소 1,400P부터 100P 단위로 신청해요. 1,000원은 1,400P예요.
· 교환 내역에서 신청·발송 상태를 확인할 수 있고, 발송이 어려우면 사유와 함께 포인트를 돌려드려요.

■ 기록은 서버가 확인해요
시작·종료 시각은 서버 시각을 기준으로 남고, 포인트를 만드는 계산은 서버에서만 이루어집니다. 기기 시간을 바꿔도 적립되지 않아요.

■ 내 정보는 내가 지워요
설정에서 회원 탈퇴를 하면 기록·포인트·교환 내역이 즉시 지워지고 되돌릴 수 없어요. 위치·연락처·사진·카메라·건강 정보에는 접근하지 않아요. 교환을 신청할 때 적는 휴대전화 번호는 상품 발송에만 씁니다.

문의: help@offlinetime.app
개인정보처리방침: https://byeongdoo-han.github.io/phonedown/privacy.html
이용약관: https://byeongdoo-han.github.io/phonedown/terms.html
```

### 2.4 스토어 설정

| 항목 | 값 |
| --- | --- |
| 앱 이름 | 오프라인 타임 |
| 기본 언어 | 한국어 |
| 카테고리 | 라이프스타일 (Play는 1개만 고릅니다) |
| 태그 | 습관, 생산성 (Play 콘솔에 보이는 목록 중에서 고른다 — 목록은 언어·지역에 따라 다르다) |
| 연락처 이메일 | `help@offlinetime.app` `[입력 필요]` |
| 웹사이트 | `https://byeongdoo-han.github.io/phonedown/` |
| 개인정보처리방침 | `https://byeongdoo-han.github.io/phonedown/privacy.html` |
| 계정 삭제 URL | `https://byeongdoo-han.github.io/phonedown/account-deletion.html` |
| 광고 포함 | **예** (AdMob 리워드) |
| 앱 액세스 권한 | **모든 기능이 로그인으로 제한됨 → 예**, 심사용 계정 필수 |
| 아동 대상 | 아니오 (만 14세 미만 가입 불가) |

### 2.5 콘텐츠 등급 설문 (IARC)

| 질문 | 답 | 근거 |
| --- | --- | --- |
| 폭력·공포·성적 콘텐츠·욕설 | 없음 | — |
| 도박·약물·알코올 | 없음 | — |
| 사용자 간 상호작용·위치 공유 | 없음 | 초대 코드만 교환, 지도·위치 없음 |
| 디지털 구매 | 없음 | 인앱 결제 없음 |
| 광고 포함 | 있음 | AdMob 리워드 |
| 무제한 웹 접근 | 없음 | 브라우저 없음 |
| 개인정보 공유 | 있음 | 교환 발송을 위해 상품명·수령 번호를 발송 대행사에 전달(4.3 표 참고) |

예상 등급은 **전체이용가(3세 이상)** 또는 12세 이상입니다(설문 버전에 따라 다름).

### 2.6 데이터 보안 (Data safety) 응답 가이드

Play는 "수집"과 "공유"를 나눠 묻습니다. **공유**는 제3자(AdMob, 상품 발송 대행사)에게 넘기는 경우,
**수집**은 앱이 서버로 보내는 경우입니다. 둘 다 해당합니다.

| Play 데이터 유형 | 수집 | 공유 | 필수/선택 | 목적 | 비고 |
| --- | --- | --- | --- | --- | --- |
| 개인 정보 → 이메일 주소 | 예 | 아니오 | 필수 | 계정 관리, 앱 기능 | 이메일 또는 Apple·Google 로그인 |
| 개인 정보 → 전화번호 | 예 | 예 | 선택 | 앱 기능 | 교환 신청 시에만 입력, 발송 대행사에 전달 |
| 개인 정보 → 사용자 ID | 예 | 예 | 필수 | 앱 기능, 광고 | Supabase 계정 ID. AdMob SSV 콜백의 `userId`로 전달 |
| 앱 활동 → 앱 내 상호작용 | 예 | 아니오 | 필수 | 앱 기능 | 기록 시작·종료, 포인트, 교환 |
| 앱 활동 → 기타 사용자 생성 콘텐츠 | 예 | 아니오 | 필수 | 앱 기능 | 수면·집중 기록(모드·시각·계획 시간·충전 여부) |
| 기기 또는 기타 ID → 기기 또는 기타 ID | 예 | 예 | 필수 | 광고 | AdMob 광고 ID |
| 위치·연락처·사진·동영상·오디오·파일·캘린더·문자·검색 기록·건강·금융 정보 | 아니오 | — | — | — | 접근하지 않음 |

- **전송 중 암호화**: 예 (전 구간 HTTPS, Supabase TLS)
- **삭제 요청**: 예 → `https://byeongdoo-han.github.io/phonedown/account-deletion.html`
  (앱 안 설정 → 회원 탈퇴, 앱 밖은 이메일 요청 — 두 길을 모두 안내)
- **데이터를 삭제하는 방법**: "사용자가 계정을 삭제하면 데이터가 삭제됨" 선택. 탈퇴 시 즉시 삭제되고,
  개인 식별 없는 회계 요약만 최대 5년 남는다는 점은 방침 3항과 같습니다.
- **광고 SDK**: `react-native-google-mobile-ads`(AdMob)만 있습니다. 분석·충돌 수집 SDK는 없습니다.
- 건강 데이터를 "건강 및 피트니스"로 표시하지 않은 이유: 앱은 HealthKit·Google Fit을 쓰지 않고,
  사용자가 직접 시작·종료한 세션 시각만 저장합니다(방침 1항 "위치·연락처·사진·카메라·건강 정보는
  받지 않습니다"와 일치). 수면 기록을 건강 데이터로 분류하고 싶다면 방침 문구와 이 표를 함께 고칩니다.

### 2.7 스토어 등록정보 그래픽

| 항목 | 요건 | 준비 |
| --- | --- | --- |
| 앱 아이콘 | 512×512 32비트 PNG | `assets/images/icon.png`에서 내보내기 `[입력 필요]` |
| 그래픽 이미지 | 1024×500 PNG/JPG | 스크린샷 1번 배경 + 큰 문구로 제작 `[입력 필요]` |
| 휴대전화 스크린샷 | 2~8장, 1080×1920 이상, 16:9~9:16 | 1.10의 6장을 그대로 사용 |
| 태블릿 스크린샷 | 선택 | 세로 화면이 태블릿에서 어색하지 않으면 생략 |

---

## 3. App Store 개인정보 영양성분표 (App Privacy)

App Store Connect → 앱 개인정보 → **데이터 유형별로 아래처럼 답합니다.** "연결됨"은 계정(이메일·사용자
ID)으로 식별되는지를 뜻합니다.

| 데이터 유형 | 수집 | 연결됨 | 추적에 사용 | 목적 | 근거 |
| --- | --- | --- | --- | --- | --- |
| 연락처 정보 → 이메일 주소 | 예 | 예 | 아니오 | 앱 기능 | `auth.users.email` (이메일 가입) |
| 연락처 정보 → 전화번호 | 예 | 예 | 아니오 | 앱 기능 | `redemptions.phone` — 교환 신청 시에만 |
| 식별자 → 사용자 ID | 예 | 예 | 아니오 | 앱 기능 | `public.users.id` (Supabase uuid) |
| 식별자 → 기기 ID | 예 | 예 | **아니오** | 타사 광고 | AdMob 광고 ID. SSV `userId`로 계정과 연결됨 |
| 사용 데이터 → 광고 데이터 | 예 | 예 | **아니오** | 타사 광고 | AdMob 리워드 노출·시청 결과(`ad_reward_claims`) |
| 사용 데이터 → 앱 상호작용 | 예 | 예 | 아니오 | 앱 기능 | 세션·포인트·교환 기록 |
| 진단 | 아니오 | — | — | — | 충돌·분석 SDK 없음 |
| 위치·연락처·사진·오디오·건강·금융·검색 기록 | 아니오 | — | — | — | 접근하지 않음 |

**추적(Tracking)을 "아니오"로 두는 이유**: 앱 코드는 App Tracking Transparency 권한을 요청하지
않습니다(`src/`에 `requestTrackingAuthorization` 호출이 없음). 따라서 iOS에서 IDFA는 0으로 채워지고
앱 간 추적이 일어나지 않습니다. `app.json`의 `userTrackingUsageDescription`은 나중에 추적을 켤 때를
위해 문구만 준비해 둔 것입니다.

> **추적을 켜는 날 바꿔야 하는 것** — `expo-tracking-transparency`로 권한을 요청하고 광고를 IDFA
> 기반으로 쓰기로 하면, 위 표의 기기 ID·광고 데이터를 **"추적에 사용: 예"** 로 바꾸고 App Store
> Connect의 추적 항목을 켭니다. 방침 1항의 광고 설명과 4항의 AdMob 문구도 함께 고칩니다.

광고 SDK는 AdMob 하나이고, Supabase는 호스팅(처리자)입니다. 상품 발송 대행사에는 교환 건에 한해
상품명·수령 번호만 전달합니다(방침 4항).

---

## 4. Google Play 데이터 보안 ↔ App Privacy 대응

두 스토어가 같은 사실을 다르게 묻기 때문에, 한쪽을 고치면 다른 쪽도 같이 봅니다.

| 사실 | Apple | Google Play |
| --- | --- | --- |
| 이메일 | 연락처 정보 → 이메일, 연결됨 | 개인 정보 → 이메일 주소, 필수 |
| 계정 식별자 | 식별자 → 사용자 ID, 연결됨 | 개인 정보 → 사용자 ID |
| 교환용 전화번호 | 연락처 정보 → 전화번호, 연결됨 | 개인 정보 → 전화번호, 선택, 공유 예 |
| 광고 ID | 식별자 → 기기 ID, 타사 광고 | 기기 또는 기타 ID, 공유 예 |
| 광고 노출·보상 | 사용 데이터 → 광고 데이터 | 앱 활동 → 앱 내 상호작용에 포함해도 되고, 별도 기기 ID로도 가능 |
| 기록 | 사용 데이터 → 앱 상호작용 | 앱 활동 → 앱 내 상호작용 + 기타 사용자 생성 콘텐츠 |
| 계정 삭제 | 계정 삭제 URL | 계정 삭제 URL + "데이터 삭제 방법" |

---

## 5. 숫자 대조표 (문구 ↔ 구현)

스토어 문구에 쓴 모든 숫자와 그 근거입니다. 구현을 바꾸면 이 표의 줄과 문구를 같이 고칩니다.

| 문구에 쓴 값 | 구현 근거 | 검사 |
| --- | --- | --- |
| 1시간에 2P (수면·집중 동일) | `0006_weekly_cap_split.sql` → `point_rules.earn_rate = {sleep_per_hour:2, focus_per_hour:2}` | `tests/rewardMath.test.mjs`, `tests/focusRules.test.mjs` |
| 10분 단위 내림(30분 = 1P) | `earn_rate.floor_minutes = 10` → `apply_earn` | `tests/focusPoints.sql` |
| 주간 기본 상한 100P (합산) | `weekly_cap.base_points = 100` | `tests/weeklyCaps.sql` |
| 광고 부스터 주 80P | `weekly_cap.booster_points = 80` | `tests/adBooster.sql` |
| 부스터 하루 2회·기록 1건당 1회 | `ads.daily_max = 2` + `ad_reward_claims` 중복 차단 | `tests/adBooster.sql` |
| 부스터 = 기본 적립만큼 1회 더 | `ads.booster_multiplier = 2` → `claim_ad_booster` | `tests/adBooster.sql` |
| 주간 보너스 상자 20P | `ads.weekly_bonus_points = 20` → `claim_weekly_box` | `tests/adBooster.sql` |
| 수면 40분 / 12시간 / 하루 10시간 | `session_min_minutes.sleep=40`, `session_max_minutes.sleep=720`, `daily_cap_minutes.sleep=600` | `tests/sleepMode.sql` |
| 집중 20분 / 3시간 / 하루 6시간 | `session_min_minutes.focus=20`, `session_max_minutes.focus=180`, `daily_cap_minutes.focus=360` | `tests/focusPoints.sql` |
| 정산 매주 월요일 00시 (KST) | `0003_weekly_settlement.sql` — cron `15:00 UTC` = `00:00 KST`, `settle_due_weeks` | `tests/settlement.sql` |
| 교환 최소 1,400P · 100P 단위 | `redemption = {minimum_points:1400, step_points:100}` | `tests/redemption.sql` |
| 1,000원 = 1,400P (1P ≈ 0.714원) | `currency = {point_to_krw:0.714, krw_1000_points:1400}` | `tests/rewardMath.test.mjs` |
| 친구 초대 300P · 3일 연속 · 월 5회 | `0008_referral_sponsor.sql` `referral = {points:300, required_days:3, monthly_max:5}` | `tests/referral.sql` |
| 탈퇴 즉시 삭제, 요약 최대 5년 | `delete-account` Edge Function + `account_deletions` + `purge_account_deletions(5 years)` | `tests/accountDeletion.sql` |
| 만 14세 이상 | 약관 2조·방침 7항(`legalText.ts`) | 텍스트만 검사(가입 화면에 나이 확인은 없음) |
| 광고 없이도 적립 | 부스터는 `rewarded` 성공 시에만 지급, 실패·`unavailable`이어도 기본 적립 유지 | `tests/adRewardWatch.test.mjs` |

---

## 6. 제출 전 반드시: 교환 상품을 하나는 켠다

지금 DB의 상품 3종 모두 `active = false`이고, 브랜드 챌린지 3종도 `active = false`입니다
(`0006`, `0008`의 씨앗 행). 그대로 제출하면 교환소 화면은 "상품을 준비 중이에요"만 보여 줍니다.

- 심사자 입장에서 **앱이 약속한 보상이 화면에 없는 상태**가 되고, 스크린샷 5번도 빈 카드로 찍힙니다.
- 운영자가 직접 발송할 수 있으면 수동 모드로 충분합니다(공급자 키가 없어도 `admin-fulfillment`가
  수동 모드로 동작). 재고만 넉넉히 두고 아래처럼 한 종을 켭니다.

```sh
npx supabase db query --remote=uhisjleftevizjfudeip \
  --sql "update public.products set active = true, stock = 100 where name = '네이버페이 포인트 1,000원'" --yes
```

- 심사용으로만 켠다면 심사가 끝난 뒤 되돌리거나, 재고·발송 수단이 준비된 상태를 유지합니다.
- 신청이 들어오면 7일 안에 발송해야 한다는 약속(방침·약관)을 지킬 수 있는지 먼저 확인합니다.
- 브랜드 챌린지는 계약 전에는 켜지 않습니다. 켜면 지킬 수 없는 쿠폰을 약속하게 됩니다.

---

## 7. 제출 전 남은 일 (사람이 하는 일)

### 7.1 `[입력 필요]` 목록

| # | 항목 | 어디에 | 없으면 |
| --- | --- | --- | --- |
| 1 | 실제 수신 문의 메일 주소 | `EXPO_PUBLIC_SUPPORT_EMAIL`, 루트 `docs/*.html`의 `mailto:`, 1.4·2.3 설명 끝 문의 줄 | 스토어·방침의 문의처가 임시 주소(`help@offlinetime.app`)로 나감 |
| 2 | 심사용 계정 이메일·비밀번호 | 1.11 심사 노트 | 심사자가 로그인하지 못해 반려(2.1) |
| 3 | 심사용 계정의 확정 포인트·교환 내역 | DB(심사 계정 uuid) | 교환 흐름을 확인할 수 없음 |
| 4 | 심사 기간 활성 상품 1종 | 6장 SQL | 교환소가 "준비 중"으로 보임 |
| 5 | 앱 이름 중복 확인 | App Store Connect 등록 화면 | 이름을 못 쓰면 1.1 대안으로 교체 |
| 6 | AdMob 실제 앱 ID·리워드 광고 단위 ID | EAS `ADMOB_APP_ID_IOS`/`_ANDROID`, `EXPO_PUBLIC_ADMOB_REWARDED_UNIT_ID_*` | production 빌드가 시작되지 않음(테스트 ID 차단) |
| 7 | AdMob SSV 콜백 URL 등록 | AdMob 콘솔 | 광고를 봐도 포인트가 지급되지 않음 |
| 8 | 개인정보 보호책임자 성명·연락처, 사업자 정보 | 루트 `docs/privacy.html`, 앱 약관 | 국내 개인정보보호법 제30조 고지 요건 미비(스토어 심사와 별개) |
| 9 | Play 아이콘 512×512·그래픽 이미지 1024×500 | Play 스토어 등록정보 | 등록정보 저장 불가 |
| 10 | 저작권 표기(예: `© 2026 오프라인 타임`) | App Store Connect 앱 정보 | 칸이 비어 저장되지 않음 |

### 7.2 순서

1. GitHub Pages 활성화 → 네 URL 접속 확인(`privacy.html`, `terms.html`, `account-deletion.html`, `index.html`)
2. 7.1의 1·6·7·4 채우기(메일 주소 → 광고 ID → SSV → 상품)
3. `npx eas-cli@latest build --platform all --profile production`
4. 심사용 계정 만들고 확정 포인트·교환 내역 넣기(7.1의 2·3)
5. 스크린샷 6장 촬영(1.10) → App Store Connect / Play 등록정보 입력
6. App Privacy(3장)·Data safety(2.6) 입력 → 제출

---

## 8. 심사에서 걸릴 만한 곳 (미리 대비)

| 위험 | 왜 | 대비 |
| --- | --- | --- |
| 빈 교환소 | 상품 3종 모두 비활성 → "상품을 준비 중이에요" | 6장: 심사 기간 활성 상품 1종 + 재고 |
| "포인트가 안 들어온다" | 정산이 주 1회(월요일 00시)라 심사 중 기록은 정산 전으로 남음 | 심사 노트에 명시(1.11) + 심사 계정에 확정 포인트 미리 지급 |
| 리워드 앱 정책 | Google Play는 보상 조건·지급 방법을 명확히 요구 | 2.3 설명과 2.6 데이터 보안에 적립·정산·교환 조건을 숫자로 기재 |
| 광고 없는 적립 | 광고 부스터가 수익 구조라 "광고 없이는 적립 불가"로 오해될 수 있음 | 설명·심사 노트에 "광고는 선택, 기본 적립 유지"를 반복 기재 |
| 로그인 벽 | 앱의 모든 화면이 로그인 후에 열림 | 앱 액세스 권한 "제한됨" + 심사용 계정 |
| 계정 삭제 | Apple은 앱 안 삭제 경로를 요구 | 설정 → 회원 탈퇴(“탈퇴” 입력) + 웹 요청 페이지 |
| 14세 미만 | 약관·방침에만 있고 가입 화면에 나이 확인이 없음 | 심사에서 지적되면 가입 화면에 연령 확인 1단계 추가(현재는 약관 동의 문구로 갈음) |
| 문의처 | 임시 주소면 심사·사용자 문의가 닿지 않음 | 7.1의 1번을 제출 전 반드시 |
