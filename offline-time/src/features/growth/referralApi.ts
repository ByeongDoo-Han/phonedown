import { supabase } from '@/lib/supabase';

// 친구 초대. 코드 발급·입력·현황은 모두 서버 RPC가 처리하고, 앱은 포인트를 만들지 않는다.
// 0008 모듈이 아직 적용되지 않은 서버에서는 RPC가 없어(404/PGRST202) 'unavailable'로 끝낸다.

export type ReferralInviteStatus = 'pending' | 'completed' | 'void';

export type ReferralInvite = {
  id: string;
  status: ReferralInviteStatus;
  progress_days: number;
  required_days: number;
  inviter_points: number;
  denied_reason: string | null;
  created_at: string;
  completed_at: string | null;
};

export type ReferralSummary = {
  code: string | null;
  points: number;
  required_days: number;
  monthly_limit: number;
  monthly_completed: number;
  monthly_points: number;
  pending_count: number;
  completed_count: number;
  invites: ReferralInvite[];
};

export const referralSummaryQueryKey = (userId: string | undefined) =>
  ['referralSummary', userId] as const;

export const GROWTH_UNAVAILABLE = 'growth_unavailable';

function isMissingFunction(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return error.code === 'PGRST202' || error.code === '42883'
    || (error.message ?? '').includes('Could not find the function');
}

export async function getReferralSummary(): Promise<ReferralSummary> {
  if (!supabase) throw new Error(GROWTH_UNAVAILABLE);
  const { data, error } = await supabase.rpc('referral_summary');
  if (isMissingFunction(error)) throw new Error(GROWTH_UNAVAILABLE);
  if (error || !data) throw error ?? new Error('초대 현황을 불러오지 못했습니다.');
  const summary = data as Partial<ReferralSummary>;
  return {
    code: summary.code ?? null,
    points: summary.points ?? 300,
    required_days: summary.required_days ?? 3,
    monthly_limit: summary.monthly_limit ?? 5,
    monthly_completed: summary.monthly_completed ?? 0,
    monthly_points: summary.monthly_points ?? 0,
    pending_count: summary.pending_count ?? 0,
    completed_count: summary.completed_count ?? 0,
    invites: (summary.invites ?? []) as ReferralInvite[],
  };
}

// 친구가 내 코드를 넣을 때 부른다. 코드는 서버가 대문자로 정리한다.
export async function enterReferralCode(code: string):
  Promise<{ ok: boolean; reason?: string }> {
  if (!supabase) return { ok: false, reason: 'unavailable' };
  const { data, error } = await supabase.rpc('enter_referral_code', { p_code: code });
  if (isMissingFunction(error)) return { ok: false, reason: 'unavailable' };
  if (error) throw error;
  const result = (data ?? {}) as { ok?: boolean; reason?: string };
  return { ok: result.ok === true, reason: result.reason };
}
