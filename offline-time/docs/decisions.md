# 구현 결정

## 2026-11-17: v0.2 수익·원가 방어 구조 (광고 부스터 + 교환 비율)

v0.1은 수면 2P·집중 3P(주력 1.5배), 1P=1원, 하루 광고 2회 조건이었다. 보수적 eCPM(1만 원) 가정에서 유저당 월 120원 적자가 나는 구조였으므로, **광고를 본 만큼만 보너스를 주고 교환 비율로 원가를 방어하는 v0.2**를 `feat/ad-revenue-defense` 브랜치에서 적용했다.

- **기본 적립**: 모든 모드 **1시간 = 1P**(10분 단위 절사, `point_rules.earn_rate`). 광고를 보지 않아도 지급되는 보장 적립이다.
- **주력 모드 1.5배 → 1.0배**: 1P 단가에서 1.5배는 0.5P 절사로만 남아 의미가 없고, 보상 채널이 광고 부스터와 겹친다. `primary_bonus.multiplier = 1.0`으로 두고 보상은 부스터로 옮겼다.
- **정산 부스터**: 유효 세션의 기본 적립이 남아 있는 동안 광고 1편당, 세션 기본 적립과 같은 `bonus` 거래를 한 번 더 넣어 합계를 2배로 만든다. **하루 2회**(`ads.daily_max`), **세션당 1회**(`ad_reward_claims_session_idx`), **SSV 거래 1건당 1회**(`ad_reward_claims_ssv_idx`)로 제한한다.
- **광고 보상은 SSV만 인정**: 새 Edge Function `ad-reward-ssv`가 AdMob 서명(ECDSA P-256/SHA-256, DER)을 검증한 뒤 `claim_ad_booster`/`claim_weekly_box`를 호출한다. 앱은 포인트를 만들 수 없다. 콜백은 `verify_jwt = false` + `auth: 'none'`으로 열되 서명으로 인증한다.
- **주간 보너스 상자**: 정산이 끝난 주마다 1회, 광고 1편으로 `weekly_bonus_points`(20P)를 `bonus`로 지급한다. 정산된 가장 최근 주에만 열 수 있다.
- **교환 비율**: **1P ≈ 0.714원, 1,000원 = 1,400P**(`currency`). `products`의 1,000P 배수 제약을 100P 단위·최소 100P로 완화하고, 실제 교환은 `point_rules.redemption`의 최소 1,400P·100P 단위로 막는다.
- **정산**: `settle_week`/`settle_due_weeks`가 `bonus` 거래도 함께 확정한다. 늦게 도착한 부스터는 다음 일일 정산에서 해당 주에 합산된다.
- **한계(알려진 사항)**: 10분 절사 + 1시간 1P 조합에서는 1시간 미만 세션이 0P다(30분 집중 = 0P). 앱은 "1시간부터 적립"으로 안내하지만, 30분 프리셋을 살리려면 최소 1P 지급이나 반올림 규칙을 `point_rules`와 `apply_earn`에 추가해야 한다.
- **아직 남은 일**: `react-native-google-mobile-ads`가 의존성에 없어 앱에서 광고를 띄울 수 없다. `src/features/ads/rewardedAd.ts` 한 곳만 교체하면 되고, AdMob 광고 단위와 SSV 콜백 URL 등록이 필요하다.

## 2026-11-16: 원격 PostgreSQL 17 사용

초기 프롬프트는 PostgreSQL 15를 고정 스택으로 지정했다. 새로 만든 Supabase `apptech` 프로젝트(`uhisjleftevizjfudeip`)가 PostgreSQL 17.11.0.019임을 확인했고, 사용자가 기존 PostgreSQL 17 프로젝트 사용과 마이그레이션 적용을 선택했다. 로컬 Supabase 설정도 PostgreSQL 17로 맞춘다. 원문 기획 파일은 변경하지 않고 이 결정을 별도로 기록한다.

원격 프로젝트에 `0001_init.sql`을 적용하고 Auth의 기본 URL과 추가 복귀 URL을 `offlinetime://auth/callback`에 맞췄다. 로컬 PostgreSQL 17.11에서 마이그레이션 초기화와 M0 인증·프로필·RLS 검증을 다시 통과했다. Apple·Google 제공자는 아직 인증 정보가 없어 비활성 상태다.
