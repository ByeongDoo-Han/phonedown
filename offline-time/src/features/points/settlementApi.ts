import { supabase } from '@/lib/supabase';

export type Settlement = {
  week_id: string;
  confirmed_points: number;
  confirmed_at: string;
};

export const settlementsQueryKey = (userId: string | undefined) =>
  ['settlements', userId] as const;

export async function listSettlements(userId: string): Promise<Settlement[]> {
  if (!supabase) throw new Error('서비스에 연결하지 못했습니다.');
  const { data, error } = await supabase.from('settlements')
    .select('week_id,confirmed_points,confirmed_at').eq('user_id', userId)
    .order('week_id', { ascending: false }).limit(12);
  if (error) throw error;
  return (data ?? []) as Settlement[];
}
