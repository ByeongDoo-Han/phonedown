// The rewarded ad only reports that AdMob fired its reward event. The points themselves are
// granted by the SSV callback, which reaches the server a moment later, so `ad_reward_claims`
// stays empty for a second or two after the ad closes. While that is in flight the records
// screen keeps the placement pending — its own button disabled — and re-reads the ledger a
// few times, so the screen settles into the granted state by itself instead of inviting a
// second click. Kept free of React and Supabase for direct unit tests.

import type { RewardedPlacement } from '../ads/adPlacement';
import type { AdRewardClaim } from './adRewardsApi';

// 2초 간격 5회 = SSV 콜백이 늦게 와도 10초 안에 확인한다.
export const AD_REWARD_POLL_ATTEMPTS = 5;
export const AD_REWARD_POLL_INTERVAL_MS = 2_000;
export const AD_REWARD_WAIT_MS = AD_REWARD_POLL_ATTEMPTS * AD_REWARD_POLL_INTERVAL_MS;

export const AD_REWARD_WAIT_NOTICE = '광고 보상 확인이 늦어지고 있어요. 잠시 뒤 기록을 다시 불러오면 반영돼요.';
export const AD_REWARD_PENDING_NOTICE = '광고 보상을 확인하고 있어요. 잠시만 기다려 주세요.';

export type AdRewardWatchOutcome = 'granted' | 'denied' | 'pending';

// 한 번의 광고 시청을 가리키는 키. 같은 기록의 부스터와 주간 상자는 서로를 막지 않는다.
export function adRewardPendingKey(placement: RewardedPlacement): string {
  return placement.kind === 'weekly_box'
    ? 'weekly_box'
    : `settlement_booster:${placement.sessionId}`;
}

export function adRewardPendingLabel(placement: RewardedPlacement): string {
  return placement.kind === 'weekly_box' ? '상자 확인 중…' : '부스터 확인 중…';
}

// The claims list is the server's answer: a row for this placement means the callback
// arrived. A row without bonus points means the callback was refused (daily or weekly cap).
export function adRewardClaimFor(
  claims: AdRewardClaim[],
  placement: RewardedPlacement,
  settledWeekId: string | null,
): AdRewardClaim | undefined {
  if (placement.kind === 'settlement_booster') {
    return claims.find((item) => item.kind === 'settlement_booster'
      && item.session_id === placement.sessionId);
  }
  // 주간 상자는 정산을 마친 주에만 열린다. 다른 주의 상자 주장은 이번 시청과 무관하다.
  if (!settledWeekId) return undefined;
  return claims.find((item) => item.kind === 'weekly_box' && item.week_id === settledWeekId);
}

export function adRewardWatchOutcome(
  claims: AdRewardClaim[],
  placement: RewardedPlacement,
  settledWeekId: string | null,
): AdRewardWatchOutcome {
  const claim = adRewardClaimFor(claims, placement, settledWeekId);
  if (!claim) return 'pending';
  return claim.bonus_points > 0 ? 'granted' : 'denied';
}

export function adRewardDeniedNotice(reason: string | null): string {
  if (reason === 'daily_limit') {
    return '오늘 광고 부스터를 모두 받아서 이번 광고는 적립되지 않았어요.';
  }
  if (reason === 'weekly_booster_cap') {
    return '이번 주 광고 보너스 한도를 모두 채워서 이번 광고는 적립되지 않았어요.';
  }
  return '광고 보상이 지급되지 않았어요. 잠시 뒤 기록을 다시 확인해 주세요.';
}

export type AdRewardWatchResult =
  | { status: 'granted' }
  | { status: 'denied'; reason: string | null }
  | { status: 'timeout' };

type WatchTimer = ReturnType<typeof setTimeout>;

// Waits for one ad's claim row: re-reads the ledger every two seconds, up to five times.
// Returns the stop function the screen calls on unmount, which clears the pending timer so
// no read lands after the screen is gone. Injected scheduling makes the cadence testable.
export function watchAdReward(options: {
  placement: RewardedPlacement;
  settledWeekId: string | null;
  readClaims: () => Promise<AdRewardClaim[]>;
  onSettled: (result: AdRewardWatchResult) => void;
  schedule?: (run: () => void, ms: number) => WatchTimer;
  cancel?: (timer: WatchTimer) => void;
}): () => void {
  const schedule = options.schedule ?? ((run, ms) => setTimeout(run, ms));
  const cancel = options.cancel ?? ((timer) => clearTimeout(timer));
  let stopped = false;
  let attempt = 0;
  let timer: WatchTimer | undefined;

  const tick = async () => {
    if (stopped) return;
    attempt += 1;
    let claims: AdRewardClaim[] = [];
    try {
      claims = await options.readClaims();
    } catch {
      // A read that fails counts as a read without the row: the next attempt tries again.
    }
    if (stopped) return;
    const claim = adRewardClaimFor(claims, options.placement, options.settledWeekId);
    if (claim) {
      stopped = true;
      options.onSettled(claim.bonus_points > 0
        ? { status: 'granted' }
        : { status: 'denied', reason: claim.denied_reason });
      return;
    }
    if (attempt >= AD_REWARD_POLL_ATTEMPTS) {
      stopped = true;
      options.onSettled({ status: 'timeout' });
      return;
    }
    timer = schedule(() => { void tick(); }, AD_REWARD_POLL_INTERVAL_MS);
  };

  timer = schedule(() => { void tick(); }, AD_REWARD_POLL_INTERVAL_MS);
  return () => {
    stopped = true;
    if (timer) cancel(timer);
  };
}
