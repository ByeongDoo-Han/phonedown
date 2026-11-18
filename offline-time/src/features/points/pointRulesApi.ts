import { supabase } from '@/lib/supabase';

// Values an unconfigured or partially migrated database should still read as: base earn of
// 2P per hour (30 minutes = 1P), a 2x ad booster twice a day, a 100P base + 80P booster
// weekly cap, and 1,000원 at 1,400P.
export type CurrencyRules = {
  point_to_krw: number;
  krw_1000_points: number;
};

export type EarnRules = {
  sleep_per_hour: number;
  focus_per_hour: number;
  floor_minutes: number;
};

export type WeeklyCapRules = {
  base_points: number;
  booster_points: number;
};

export type AdsRules = {
  settlement_booster: boolean;
  booster_multiplier: number;
  daily_max: number;
  weekly_box: boolean;
  weekly_bonus_points: number;
  redeem_interstitial: boolean;
};

export type RedemptionRules = {
  minimum_points: number;
  step_points: number;
};

export type ReferralRules = {
  points: number;
  required_days: number;
  monthly_max: number;
};

export type PointRules = {
  currency: CurrencyRules;
  earn: EarnRules;
  weekly: WeeklyCapRules;
  ads: AdsRules;
  redemption: RedemptionRules;
  referral: ReferralRules;
};

export const DEFAULT_POINT_RULES: PointRules = {
  currency: { point_to_krw: 0.714, krw_1000_points: 1400 },
  earn: { sleep_per_hour: 2, focus_per_hour: 2, floor_minutes: 10 },
  weekly: { base_points: 100, booster_points: 80 },
  ads: {
    settlement_booster: false,
    booster_multiplier: 2,
    daily_max: 2,
    weekly_box: false,
    weekly_bonus_points: 20,
    redeem_interstitial: false,
  },
  redemption: { minimum_points: 1400, step_points: 100 },
  referral: { points: 300, required_days: 3, monthly_max: 5 },
};

export const pointRulesQueryKey = ['pointRules'] as const;

function readNumber(source: unknown, key: string, fallback: number): number {
  if (typeof source !== 'object' || source === null) return fallback;
  const value = (source as Record<string, unknown>)[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function readBoolean(source: unknown, key: string, fallback: boolean): boolean {
  if (typeof source !== 'object' || source === null) return fallback;
  const value = (source as Record<string, unknown>)[key];
  return typeof value === 'boolean' ? value : fallback;
}

export function toPointRules(rows: { key: string; value: unknown }[]): PointRules {
  const byKey = new Map(rows.map((row) => [row.key, row.value]));
  const currency = byKey.get('currency');
  const earn = byKey.get('earn_rate');
  const weekly = byKey.get('weekly_cap');
  const ads = byKey.get('ads');
  const redemption = byKey.get('redemption');
  const referral = byKey.get('referral');
  return {
    currency: {
      point_to_krw: readNumber(currency, 'point_to_krw', DEFAULT_POINT_RULES.currency.point_to_krw),
      krw_1000_points: readNumber(currency, 'krw_1000_points',
        DEFAULT_POINT_RULES.currency.krw_1000_points),
    },
    earn: {
      sleep_per_hour: readNumber(earn, 'sleep_per_hour', DEFAULT_POINT_RULES.earn.sleep_per_hour),
      focus_per_hour: readNumber(earn, 'focus_per_hour', DEFAULT_POINT_RULES.earn.focus_per_hour),
      floor_minutes: readNumber(earn, 'floor_minutes', DEFAULT_POINT_RULES.earn.floor_minutes),
    },
    weekly: {
      base_points: readNumber(weekly, 'base_points', DEFAULT_POINT_RULES.weekly.base_points),
      booster_points: readNumber(weekly, 'booster_points',
        DEFAULT_POINT_RULES.weekly.booster_points),
    },
    ads: {
      settlement_booster: readBoolean(ads, 'settlement_booster',
        DEFAULT_POINT_RULES.ads.settlement_booster),
      booster_multiplier: readNumber(ads, 'booster_multiplier',
        DEFAULT_POINT_RULES.ads.booster_multiplier),
      daily_max: readNumber(ads, 'daily_max', DEFAULT_POINT_RULES.ads.daily_max),
      weekly_box: readBoolean(ads, 'weekly_box', DEFAULT_POINT_RULES.ads.weekly_box),
      weekly_bonus_points: readNumber(ads, 'weekly_bonus_points',
        DEFAULT_POINT_RULES.ads.weekly_bonus_points),
      redeem_interstitial: readBoolean(ads, 'redeem_interstitial',
        DEFAULT_POINT_RULES.ads.redeem_interstitial),
    },
    redemption: {
      minimum_points: readNumber(redemption, 'minimum_points',
        DEFAULT_POINT_RULES.redemption.minimum_points),
      step_points: readNumber(redemption, 'step_points', DEFAULT_POINT_RULES.redemption.step_points),
    },
    referral: {
      points: readNumber(referral, 'points', DEFAULT_POINT_RULES.referral.points),
      required_days: readNumber(referral, 'required_days',
        DEFAULT_POINT_RULES.referral.required_days),
      monthly_max: readNumber(referral, 'monthly_max', DEFAULT_POINT_RULES.referral.monthly_max),
    },
  };
}

export async function getPointRules(): Promise<PointRules> {
  if (!supabase) return DEFAULT_POINT_RULES;
  const { data, error } = await supabase.from('point_rules')
    .select('key,value')
    .in('key', ['currency', 'earn_rate', 'weekly_cap', 'ads', 'redemption', 'referral']);
  if (error) throw error;
  return toPointRules((data ?? []) as { key: string; value: unknown }[]);
}
