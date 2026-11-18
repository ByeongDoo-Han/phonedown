import { supabase } from '@/lib/supabase';
import type { SponsorSegment } from '@/features/growth/referralCode';

// 브랜드 스폰서 챌린지. 목록·참여·쿠폰은 RLS로 본인 것만 읽고, 참여/포기는 서버 RPC가 처리한다.
// 달성 판정과 쿠폰 발급은 세션 정산 뒤 서버(service_role)만 한다 — 앱은 결과를 읽기만 한다.

export type ChallengeStatus = 'joined' | 'completed' | 'abandoned' | 'expired';

export type Challenge = {
  id: string;
  title: string;
  description: string | null;
  segment: SponsorSegment;
  mode: 'sleep' | 'focus';
  target_days: number;
  min_minutes_per_day: number;
  window_days: number;
  consecutive: boolean;
  reward_title: string;
  reward_value_krw: number;
  ends_at: string | null;
  sponsors: { name: string } | null;
};

export type Participation = {
  id: string;
  challenge_id: string;
  status: ChallengeStatus;
  progress_days: number;
  window_start: string;
  completed_at: string | null;
};

export type SponsorCoupon = {
  id: string;
  challenge_id: string;
  code: string;
  reward_title: string;
  value_krw: number;
  delivery_status: 'pending' | 'sent' | 'failed';
  issued_at: string;
};

export const challengesQueryKey = ['sponsorChallenges'] as const;
export const participationsQueryKey = (userId: string | undefined) =>
  ['challengeParticipations', userId] as const;
export const couponsQueryKey = (userId: string | undefined) =>
  ['sponsorCoupons', userId] as const;

const challengeColumns = 'id,title,description,segment,mode,target_days,min_minutes_per_day,'
  + 'window_days,consecutive,reward_title,reward_value_krw,ends_at,sponsors(name)';

export async function listChallenges(): Promise<Challenge[]> {
  if (!supabase) throw new Error('서비스에 연결하지 못했습니다.');
  // RLS가 활성 챌린지와 내가 참여한 챌린지만 돌려준다(비활성이라도 내 쿠폰은 보여야 한다).
  const { data, error } = await supabase.from('sponsor_challenges')
    .select(challengeColumns).order('sort_order', { ascending: true });
  // 0008 이전 서버에는 테이블이 없다(42P01). 화면은 "준비 중"으로 끝내면 된다.
  if (error) throw error;
  return (data ?? []) as unknown as Challenge[];
}

export async function listParticipations(userId: string): Promise<Participation[]> {
  if (!supabase) throw new Error('서비스에 연결하지 못했습니다.');
  const { data, error } = await supabase.from('challenge_participations')
    .select('id,challenge_id,status,progress_days,window_start,completed_at')
    .eq('user_id', userId).order('joined_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as Participation[];
}

export async function listCoupons(userId: string): Promise<SponsorCoupon[]> {
  if (!supabase) throw new Error('서비스에 연결하지 못했습니다.');
  const { data, error } = await supabase.from('sponsor_coupons')
    .select('id,challenge_id,code,reward_title,value_krw,delivery_status,issued_at')
    .eq('user_id', userId).order('issued_at', { ascending: false }).limit(20);
  if (error) throw error;
  return (data ?? []) as SponsorCoupon[];
}

export async function joinChallenge(challengeId: string):
  Promise<{ ok: boolean; reason?: string }> {
  if (!supabase) return { ok: false, reason: 'unavailable' };
  const { data, error } = await supabase.rpc('join_challenge', { p_challenge_id: challengeId });
  if (error) throw error;
  const result = (data ?? {}) as { ok?: boolean; reason?: string };
  return { ok: result.ok === true, reason: result.reason };
}

export async function leaveChallenge(challengeId: string):
  Promise<{ ok: boolean; reason?: string }> {
  if (!supabase) return { ok: false, reason: 'unavailable' };
  const { data, error } = await supabase.rpc('leave_challenge', { p_challenge_id: challengeId });
  if (error) throw error;
  const result = (data ?? {}) as { ok?: boolean; reason?: string };
  return { ok: result.ok === true, reason: result.reason };
}
