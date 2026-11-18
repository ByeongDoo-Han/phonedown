// Which ledger entry a rewarded-ad view belongs to. The encoded string travels to AdMob as
// the rewarded ad's SSV custom data and comes back unchanged on the callback, where
// supabase/functions/_shared/adReward.ts parses it. Keep the two encodings identical; the
// unit test in tests/adPlacement.test.mjs checks that with the callback's own parser.

export const AD_CUSTOM_DATA_VERSION = 1;

export type RewardedPlacement =
  | { kind: 'settlement_booster'; sessionId: string }
  | { kind: 'weekly_box' };

// What the device saw: the reward event, a close without it, or no ad at all.
export type RewardedAdOutcome = 'rewarded' | 'dismissed' | 'unavailable';

export function adCustomData(placement: RewardedPlacement): string {
  if (placement.kind === 'settlement_booster') {
    return JSON.stringify({
      v: AD_CUSTOM_DATA_VERSION,
      kind: placement.kind,
      session_id: placement.sessionId,
    });
  }
  return JSON.stringify({ v: AD_CUSTOM_DATA_VERSION, kind: placement.kind });
}

export function placementLabel(placement: RewardedPlacement): string {
  return placement.kind === 'settlement_booster' ? '기록 부스터' : '주간 보너스 상자';
}
