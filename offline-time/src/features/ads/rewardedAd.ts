// Rewarded ad placement for the settlement booster and the weekly bonus box.
//
// The ad itself comes from AdMob through the native SDK, which this build does not install
// yet (`react-native-google-mobile-ads` is not a dependency). Until it is, the app cannot
// show an ad, so every request reports `unavailable` and the user keeps the guaranteed base
// earn — never a silent loss.
//
// When the SDK is added, load a rewarded ad with
//   ServerSideVerificationOptions({
//     userId: <supabase user id>,
//     customData: JSON.stringify({ v: 1, kind: 'settlement_booster', session_id })  // or { v: 1, kind: 'weekly_box' }
//   })
// and set the AdMob SSV callback URL to <project>.supabase.co/functions/v1/ad-reward-ssv.
// The reward is granted by that callback, never from this code, so only this function
// changes when the SDK lands.

export type RewardedAdOutcome = 'rewarded' | 'dismissed' | 'unavailable';

export const REWARDED_AD_AVAILABLE = false;

export async function showRewardedAd(): Promise<RewardedAdOutcome> {
  return 'unavailable';
}
