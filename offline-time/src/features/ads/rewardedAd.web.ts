// The web build has no AdMob native module, so it never imports the package: the booster
// buttons report `unavailable` and the guaranteed base earn stays as it is.

import type { RewardedAdOutcome, RewardedPlacement } from './adPlacement';

export type { RewardedAdOutcome, RewardedPlacement };

export async function showRewardedAd(
  _placement: RewardedPlacement,
  _userId: string | undefined,
): Promise<RewardedAdOutcome> {
  return 'unavailable';
}
