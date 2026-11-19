// Rewarded ad placement for the settlement booster and the weekly bonus box (iOS/Android).
//
// The ad comes from AdMob through `react-native-google-mobile-ads`. The reward itself is
// never granted here: the ad request carries the user id and the placement in AdMob's
// ServerSideVerificationOptions, and AdMob calls
//   https://<project>.supabase.co/functions/v1/ad-reward-ssv
// with a signature. That callback grants the points, so the app cannot mint them.
//
// This module only reports what happened on the device: `rewarded` means the user watched
// far enough for AdMob to fire its reward event and the SSV callback should follow;
// `dismissed` means the ad closed without the reward; `unavailable` means no ad could be
// shown (Expo Go, no fill, no network) and the guaranteed base earn stays untouched.
//
// Web uses `rewardedAd.web.ts`, which never loads the native package.

import { Platform } from 'react-native';
import type { RewardedAd } from 'react-native-google-mobile-ads';

import { adCustomData, type RewardedAdOutcome, type RewardedPlacement } from './adPlacement';
import { resolveRewardedUnit, testUnitWarning } from './adUnits';

export type { RewardedAdOutcome, RewardedPlacement };

type AdsModule = typeof import('react-native-google-mobile-ads');

// How long to wait for a fill before telling the user the ad could not be loaded.
const LOAD_TIMEOUT_MS = 15_000;

let adsModule: Promise<AdsModule | null> | null = null;
let initialization: Promise<boolean> | null = null;
// 테스트 광고 단위 경고는 실행 중 한 번만 남긴다(빈 문자열 = 이미 확인함).
let resolvedUnitWarning: string | null = null;

function loadAdsModule(): Promise<AdsModule | null> {
  // Expo Go has no AdMob native module: the import fails quietly instead of breaking the app.
  if (!adsModule) {
    adsModule = import('react-native-google-mobile-ads').catch(() => null);
  }
  return adsModule;
}

function rewardedUnitId(ads: AdsModule): string {
  const configured = Platform.OS === 'ios'
    ? process.env.EXPO_PUBLIC_ADMOB_REWARDED_UNIT_ID_IOS
    : process.env.EXPO_PUBLIC_ADMOB_REWARDED_UNIT_ID_ANDROID;
  // Google's published test unit keeps development builds honest until a real unit is set.
  const unit = resolveRewardedUnit(configured, ads.TestIds.REWARDED);
  if (resolvedUnitWarning === null) {
    const warning = testUnitWarning({ test: unit.test, isDev: __DEV__ });
    if (warning) console.warn(warning);
    resolvedUnitWarning = warning ?? '';
  }
  return unit.unitId;
}

async function ensureInitialized(ads: AdsModule): Promise<boolean> {
  if (!initialization) {
    initialization = ads.default().initialize().then(() => true).catch(() => false);
  }
  return initialization;
}

export async function showRewardedAd(
  placement: RewardedPlacement,
  userId: string | undefined,
): Promise<RewardedAdOutcome> {
  if (!userId) return 'unavailable';
  const ads = await loadAdsModule();
  if (!ads) return 'unavailable';
  if (!(await ensureInitialized(ads))) return 'unavailable';

  let rewarded: RewardedAd;
  try {
    rewarded = ads.RewardedAd.createForAdRequest(rewardedUnitId(ads), {
      serverSideVerificationOptions: { userId, customData: adCustomData(placement) },
    });
  } catch {
    return 'unavailable';
  }

  return new Promise<RewardedAdOutcome>((resolve) => {
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const listeners: (() => void)[] = [];

    const finish = (outcome: RewardedAdOutcome) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      for (const remove of listeners) {
        try {
          remove();
        } catch {
          // A listener the native side already dropped is not worth reporting.
        }
      }
      resolve(outcome);
    };

    try {
      listeners.push(rewarded.addAdEventListener(ads.RewardedAdEventType.LOADED, () => {
        rewarded.show().catch(() => finish('unavailable'));
      }));
      // Fired only when the view was long enough to count; the SSV callback follows.
      listeners.push(rewarded.addAdEventListener(ads.RewardedAdEventType.EARNED_REWARD,
        () => finish('rewarded')));
      listeners.push(rewarded.addAdEventListener(ads.AdEventType.CLOSED, () => finish('dismissed')));
      listeners.push(rewarded.addAdEventListener(ads.AdEventType.ERROR, () => finish('unavailable')));
      timer = setTimeout(() => finish('unavailable'), LOAD_TIMEOUT_MS);
      rewarded.load();
    } catch {
      finish('unavailable');
    }
  });
}
