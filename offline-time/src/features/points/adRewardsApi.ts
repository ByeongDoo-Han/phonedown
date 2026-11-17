import { supabase } from '@/lib/supabase';

export type AdRewardKind = 'settlement_booster' | 'weekly_box';

export type AdRewardClaim = {
  id: string;
  kind: AdRewardKind;
  session_id: string | null;
  week_id: string | null;
  bonus_points: number;
  denied_reason: string | null;
  claim_day: string;
  created_at: string;
};

export const adRewardClaimsQueryKey = (userId: string | undefined) =>
  ['adRewardClaims', userId] as const;

export async function listAdRewardClaims(userId: string): Promise<AdRewardClaim[]> {
  if (!supabase) throw new Error('서비스에 연결하지 못했습니다.');
  const { data, error } = await supabase.from('ad_reward_claims')
    .select('id,kind,session_id,week_id,bonus_points,denied_reason,claim_day,created_at')
    .eq('user_id', userId).order('created_at', { ascending: false }).limit(100);
  if (error) throw error;
  return (data ?? []) as AdRewardClaim[];
}
