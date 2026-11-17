// Pure point maths shared by the home, records, and store screens. Kept free of React and
// Supabase so the v0.2 rules (2P/hour base, a 2x ad booster, a 100P base + 80P booster
// weekly cap, and 1,400P = 1,000원) are unit tested directly.

export type BoosterState =
  | { status: 'ready'; bonusPoints: number }
  | { status: 'claimed'; bonusPoints: number }
  | { status: 'limit' }
  | { status: 'closed' }
  | { status: 'no-base' }
  | { status: 'disabled' };

export type BoosterInput = {
  basePoints: number;
  multiplier: number;
  claimedBonus: number | null;
  claimsToday: number;
  dailyMax: number;
  settled: boolean;
  enabled: boolean;
};

export type WeeklyBoxState =
  | { status: 'ready'; weekId: string; bonusPoints: number }
  | { status: 'claimed'; weekId: string; bonusPoints: number }
  | { status: 'locked' }
  | { status: 'disabled' };

// The booster adds `multiplier - 1` times the session's base points on top of it.
export function boosterBonus(basePoints: number, multiplier: number): number {
  if (basePoints <= 0 || multiplier <= 1) return 0;
  return Math.floor(basePoints * (multiplier - 1));
}

export function boosterState(input: BoosterInput): BoosterState {
  if (!input.enabled) return { status: 'disabled' };
  if (input.claimedBonus !== null) return { status: 'claimed', bonusPoints: input.claimedBonus };
  if (input.basePoints <= 0) return { status: 'no-base' };
  if (input.settled) return { status: 'closed' };
  if (input.claimsToday >= input.dailyMax) return { status: 'limit' };
  return { status: 'ready', bonusPoints: boosterBonus(input.basePoints, input.multiplier) };
}

export function weeklyBoxState(input: {
  enabled: boolean;
  settledWeekId: string | null;
  claimedWeekId: string | null;
  bonusPoints: number;
}): WeeklyBoxState {
  if (!input.enabled || input.bonusPoints <= 0) return { status: 'disabled' };
  if (!input.settledWeekId) return { status: 'locked' };
  if (input.claimedWeekId === input.settledWeekId) {
    return { status: 'claimed', weekId: input.settledWeekId, bonusPoints: input.bonusPoints };
  }
  return { status: 'ready', weekId: input.settledWeekId, bonusPoints: input.bonusPoints };
}

// Exchange guidance uses the 1,000원 anchor so 1,400P reads as exactly 1,000원.
export function krwForPoints(points: number, krw1000Points: number): number {
  if (krw1000Points <= 0 || points <= 0) return 0;
  return Math.floor((points * 1000) / krw1000Points);
}

export type WeeklyCap = { base_points: number; booster_points: number };

export type WeeklyAllowance = {
  baseEarned: number;
  baseRemaining: number;
  bonusEarned: number;
  bonusRemaining: number;
  totalEarned: number;
  totalCap: number;
};

// The week's base earn and ad bonus are capped separately: 100P guaranteed + 80P from ads.
export function weeklyAllowance(input: {
  basePoints: number;
  bonusPoints: number;
  cap: WeeklyCap;
}): WeeklyAllowance {
  const baseEarned = Math.max(0, Math.min(input.basePoints, input.cap.base_points));
  const bonusEarned = Math.max(0, Math.min(input.bonusPoints, input.cap.booster_points));
  return {
    baseEarned,
    baseRemaining: Math.max(0, input.cap.base_points - Math.max(0, input.basePoints)),
    bonusEarned,
    bonusRemaining: Math.max(0, input.cap.booster_points - Math.max(0, input.bonusPoints)),
    totalEarned: baseEarned + bonusEarned,
    totalCap: input.cap.base_points + input.cap.booster_points,
  };
}

// 2026-11-17 is ISO week 47 in KST; the id matches the server's week_id (IYYY-"W"IW).
export function currentWeekId(now = new Date()): string {
  const [year, month, day] = now
    .toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' })
    .split('-')
    .map(Number);
  if (!year || !month || !day) return '';
  const date = new Date(Date.UTC(year, month - 1, day));
  const weekday = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - weekday);
  const yearStart = Date.UTC(date.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((date.getTime() - yearStart) / 86_400_000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

export function pointsForKrw(krw: number, krw1000Points: number): number {
  if (krw <= 0) return 0;
  return Math.ceil((krw * krw1000Points) / 1000);
}

// 1P ≈ 0.71원: two decimals are enough for the store header.
export function formatPointRate(pointToKrw: number): string {
  return `${pointToKrw.toFixed(2).replace(/\.?0+$/, '')}원`;
}

// A KST day string (YYYY-MM-DD) matching ad_reward_claims.claim_day.
export function kstDayString(now = new Date()): string {
  return now.toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' });
}
