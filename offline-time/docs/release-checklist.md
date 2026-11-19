# 출시 체크리스트 (4단계)

이 문서는 **사람이 직접 해야 하는 일**만 모은 목록입니다. 코드·마이그레이션·함수는 저장소에 있고,
아래 순서대로 원격에 반영한 뒤 실기기에서 확인하면 스토어 제출이 가능합니다.

- 앱: `app.offlinetime.mobile` (iOS·Android), Expo `@mybeats/offline-time`
- 원격 Supabase: `apptech` / 프로젝트 ref `uhisjleftevizjfudeip`
- 현재 상태: 마이그레이션 `0001`만 원격에 적용됨. 앱은 열이 없는 서버에서도 동작하도록 폴백을
  두고 있으므로, 아래를 반영하기 전에도 프리뷰 빌드는 열립니다(수면 충전 근거·친구 초대·교환
  발송은 반영 후에 켜집니다).

---

## 0. 한 번만 준비

- [ ] Node 22, pnpm 12, Supabase CLI, EAS CLI 로그인(`npx eas-cli@latest login`)
- [ ] `npx supabase login && npx supabase link --project-ref uhisjleftevizjfudeip`
- [ ] `.env`에 앱용 `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`(원격 값)
- [ ] 운영자로 쓸 계정을 앱에 가입시키고 **그 user id(uuid)** 를 적어 둔다. `ADMIN_USER_IDS`에 쓴다.

## 1. 원격 데이터베이스 (순서 중요)

```sh
npx supabase db push --remote=uhisjleftevizjfudeip --skip-vault
```

`0002` → `0009`가 순서대로 적용됩니다. 확인:

```sh
npx supabase migration list --project-ref uhisjleftevizjfudeip
```

- [ ] `0001`~`0009`가 모두 `applied`인지 확인
- [ ] `0003_weekly_settlement.sql`의 `pg_cron` 스케줄이 생성됐는지 확인
      (`select * from cron.job;` — 매일 15:00 UTC = 00:00 KST 정산)
- [ ] `0009` 적용 확인:
      `select column_name from information_schema.columns where table_name = 'redemptions';`
      → `provider`, `provider_ref`, `attempts`, `processing_started_at`, `processed_at`, `last_error`

적용 후 SQL 테스트를 원격에서 한 번씩 돌립니다(각 파일은 스스로 트랜잭션을 되돌립니다).

```sh
for f in focusPoints settlement redemption redemptionRls adBooster weeklyCaps sleepMode referral sponsorChallenge fulfillment accountDeletion; do
  echo "== $f"; npx supabase db query --remote=uhisjleftevizjfudeip --file tests/$f.sql --yes || break
done
```

- [ ] 11개 파일 모두 오류 없이 끝남

## 2. Edge Functions

```sh
npx supabase functions deploy \
  session-start session-end ad-reward-ssv redeem-product admin-fulfillment delete-account \
  --project-ref uhisjleftevizjfudeip --use-api
```

- [ ] 6개 함수가 배포됨
- [ ] `ad-reward-ssv`는 **JWT 검증 끔**(`supabase/config.toml`의 `verify_jwt = false`). AdMob이
      서명으로 인증하므로 Supabase 토큰이 없다. 나머지 5개는 JWT 검증 켜짐.
- [ ] 함수 secrets 등록 (`npx supabase secrets set --project-ref uhisjleftevizjfudeip KEY=value`)

| secret | 필수 | 값 / 설명 |
| --- | --- | --- |
| `ADMIN_USER_IDS` | 운영자 도구를 쓸 때 | 운영자 계정 uuid를 쉼표로. 비어 있으면 `admin-fulfillment`가 503을 돌려주고 앱에 운영자 도구가 보이지 않는다 |
| `FULFILLMENT_PROVIDER` | 선택 | `giftishow` 또는 비움(=수동). 값을 넣었는데 키가 없으면 함수가 503으로 무엇이 빠졌는지 알려 준다 |
| `GIFTISHOW_API_URL` | 자동 발송 시 | 발송 API 엔드포인트(계약 문서의 URL) |
| `GIFTISHOW_API_KEY` | 자동 발송 시 | 발급받은 인증 키 |
| `GIFTISHOW_USER_ID` | 자동 발송 시 | 공급자가 준 계정/발송자 ID |

> 공급자 명세(요청 필드·인증 헤더·응답 필드)는 `supabase/functions/_shared/giftCoupon.ts`의
> `buildOrderBody` / `readOrderResult` 두 함수만 고치면 된다. 그 밖의 코드는 바뀌지 않는다.
> 키가 없을 때는 **수동 모드**로 안전하게 동작한다: 운영자가 직접 보낸 뒤 완료로 기록한다.

- [ ] `ADMIN_USER_IDS` 등록 후 설정 → 운영자 도구가 보이는지 확인

## 3. Auth

- [ ] Email provider 켜짐, 원격은 이메일 확인 필요(가입 후 메일 링크)
- [ ] Apple provider: Service ID 없이 앱 ID `app.offlinetime.mobile`을 허용 Client ID로, secret은
      Apple Developer에서 만든 키로 등록
- [ ] Google provider: Client ID/Secret, 승인된 리디렉션 URL에
      `https://uhisjleftevizjfudeip.supabase.co/auth/v1/callback`
- [ ] Auth Redirect URLs: `offlinetime://auth/callback`, 개발 웹 URL
- [ ] 계정 삭제에 쓰는 `service_role` 키는 앱에 넣지 않는다(서버 함수에만)

## 4. AdMob

- [ ] AdMob에 iOS 앱 등록(`app.offlinetime.mobile`), Android 앱 등록(`app.offlinetime.mobile`)
- [ ] 리워드 광고 단위 생성 → ID를 EAS 환경변수로 등록
      `EXPO_PUBLIC_ADMOB_REWARDED_UNIT_ID_IOS`, `EXPO_PUBLIC_ADMOB_REWARDED_UNIT_ID_ANDROID`
- [ ] AdMob 앱 ID를 EAS **production** 환경변수로 등록
      `ADMOB_APP_ID_IOS`, `ADMOB_APP_ID_ANDROID` (값은 `ca-app-pub-…~…` 형태)
      — `app.config.ts`가 이 값을 `app.json`의 테스트 ID 위에 덮어쓴다. production 빌드에 테스트
      ID가 남아 있으면 **빌드가 시작되지 않고** 무엇을 넣어야 하는지 알려 준다.
- [ ] 광고 단위의 **SSV 콜백 URL**: `https://uhisjleftevizjfudeip.supabase.co/functions/v1/ad-reward-ssv`
- [ ] 앱 ID·광고 단위가 실제 값인지 확인: `npx expo config --type public | grep -A6 google-mobile-ads`
      및 `extra.admobTestAppIds: false`
- [ ] iOS ATT 문구 확인(`userTrackingUsageDescription`) — 거부해도 광고·적립은 그대로
- [ ] 테스트 기기에서 광고 1편 시청 → `ad_reward_claims`에 행이 생기고 포인트가 오르는지

## 5. Apple Developer / EAS

- [ ] App ID `app.offlinetime.mobile`에 **Sign in with Apple** capability
- [ ] Widget Extension 타겟 `app.offlinetime.mobile.ExpoWidgetsTarget` 과 App Group
      `group.app.offlinetime.mobile` 등록(둘 다 `expo-widgets` 플러그인이 만든다). EAS 빌드에서
      프로비저닝이 자동 생성되도록 App Store Connect API 키를 연결한 프로필을 한 번 쓴다.
- [ ] Live Activity: `ios.infoPlist.NSSupportsLiveActivities = true`, 배포 타깃 16.4 이상(설정됨)
- [ ] `npx eas-cli@latest credentials`로 배포 인증서·프로비저닝 확인
- [ ] `eas.json` production 프로필로 빌드:
      `npx eas-cli@latest build --platform ios --profile production`
      (Android는 `--platform android`, `app-bundle`로 나온다)
- [ ] 빌드 번호 자동 증가(`autoIncrement: true`)로 App Store Connect에 올릴 번호가 겹치지 않는지

## 6. 앱 안의 심사 요건

- [ ] **계정 삭제**: 설정 → 회원 탈퇴 → "탈퇴" 입력 → 삭제. 실제로 지워지는지 테스트 계정으로 확인
      (기록·포인트·교환·쿠폰이 사라지고, `account_deletions`에 개인 식별 없는 요약 1행이 남는다)
- [ ] **이용약관·개인정보처리방침**: 로그인 화면 하단 링크와 설정에서 열림. 문구가 실제 동작과 같은지
      (적립 2P/시간, 주 100P+80P, 1,400P 최소, 월요일 정산, 탈퇴 시 즉시 파기)
- [ ] 문의 주소: EAS 환경변수 `EXPO_PUBLIC_SUPPORT_EMAIL`에 실제 수신 주소를 넣는다.
      비어 있으면 `help@offlinetime.app`(임시)로 표시된다. **제출 전 반드시 실제 주소로.**
      바꿨다면 공개 페이지(저장소 루트 `docs/*.html`)의 `mailto:`도 같은 주소로 바꾸고 `pnpm test`로 확인한다.
- [ ] **GitHub Pages 열기**: 저장소 Settings → Pages → Source `Deploy from a branch`,
      Branch `main`, Folder `/docs` (한 번만). 1~2분 뒤 https://byeongdoo-han.github.io/phonedown/ 가 열린다.
      CLI: `gh api -X POST repos/ByeongDoo-Han/phonedown/pages -f 'source[branch]=main' -f 'source[path]=/docs'`
- [ ] 공개 페이지 확인(핸드폰·PC에서 한 번씩): 개요
      https://byeongdoo-han.github.io/phonedown/ , 개인정보처리방침 …/privacy.html ,
      이용약관 …/terms.html , 계정 삭제 …/account-deletion.html . 문의 링크가 메일 앱을 연다.
- [ ] App Store Connect의 **개인정보처리방침 URL**에 `…/privacy.html`을 넣는다(앱 안 화면과 같은 내용).
      GitHub Pages 등 정적 호스팅이면 충분하다.
- [ ] App Store Connect의 **계정 삭제 URL**, Google Play의 계정 삭제 URL 항목에도
      `…/account-deletion.html`을 넣는다. 두 스토어 모두 "앱 안에서 지우는 방법"과 "앱 밖에서
      요청하는 방법"을 같이 요구하므로, 한 페이지에 둘 다 있어야 한다.
- [ ] 심사 노트: 포인트를 모으는 방법(기록 → 월요일 확정 → 교환), 광고 부스터는 선택이며 광고가
      없어도 적립된다는 점, 심사용 계정(이메일/비밀번호)을 적는다.
- [ ] 개인정보 영양성분표(Privacy Nutrition Label): 이메일·기록·포인트·교환 번호·광고 식별자.
      추적(ATT)은 광고에만 사용.

## 7. 실기기 검증 (제출 전)

| 항목 | 확인할 것 |
| --- | --- |
| Apple 로그인 | 서명된 빌드에서 계정 선택 → 앱 복귀 → 온보딩 → 홈. 앱 종료 후 재실행 시 유지 |
| Google 로그인 | 동일(iOS·Android 개발/배포 빌드) |
| 집중 기록 | 30분 시작 → 타이머·잠급화면 Live Activity → 종료 → 포인트 계산 |
| 수면 기록 | 충전기 연결 배너 → 1탭 시작 → 밤새 기록 → 아침 1탭 정산 → 잠금화면 닫힘 |
| 알림 | 취침·기상 토글, 집중 종료 알림. 권한 거절 시에도 기록은 계속 |
| 광고 | 부스터 버튼 → 광고 → `부스터 확인 중…` → 포인트 반영(SSV) |
| 교환 | 확정 포인트로 신청 → 교환 내역에 "신청" → 운영자 도구에서 발송 완료 → "발송 완료"로 바뀜 |
| 발송 실패 | 운영자 도구에서 실패·환급 → 포인트·재고가 되돌아오고 사용자 화면에 사유 표시 |
| 계정 삭제 | 테스트 계정으로 탈퇴 → 로그인 화면 → 같은 계정으로 다시 로그인 불가 |
| 웹 | `npx expo export --platform web` 결과가 열리고, 광고·Live Activity·알림은 안내만 |

## 8. 운영 준비 (출시 직후)

- [ ] 교환 상품을 `active = true`로 켜기 전에 발송 수단(수동이라도)과 재고를 확인한다.
      켜는 순간 사용자가 신청할 수 있고, 실패하면 환급이 나간다.
- [ ] 브랜드 챌린지도 계약이 끝난 것만 `active = true`(README의 SQL 참고).
- [ ] 운영자 도구를 매일 한 번 확인: 대기 0건, "확인 필요"는 사유를 남겨 처리.
- [ ] `account_deletions`는 개인 식별 정보가 없지만 무기한 둘 필요는 없다.
      보존 기간이 지난 행은 `select public.purge_account_deletions(now() - interval '5 years');`
- [ ] 정산 cron이 도는지 매주 화요일에 `select * from public.settlements order by confirmed_at desc limit 5;`
- [ ] 오류 알림: Supabase Functions 로그에서 `admin-fulfillment`, `delete-account` 실패를 주 1회 확인

## 9. 제출

```sh
npx eas-cli@latest build --platform all --profile production
npx eas-cli@latest submit --platform ios --profile production
npx eas-cli@latest submit --platform android --profile production
```

- [ ] App Store Connect: 앱 정보(이름, 부제, 카테고리=건강/라이프스타일), 연령 등급, 스크린샷
      (6.9"/6.5" iPhone), 미리보기, 설명·키워드, 지원 URL
- [ ] Google Play: Data safety, 광고 포함 표시, 타깃 API 레벨, 내부 테스트 → 비공개 테스트 → 프로덕션
- [ ] `ITSAppUsesNonExemptEncryption = false`(설정됨) — 별도 수출 신고 없음
- [ ] 제출 후 심사에서 계정 삭제·약관·광고를 지적하면 6번 항목을 먼저 확인
