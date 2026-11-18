import { supabase } from '@/lib/supabase';

export type PointKind = 'earn_sleep' | 'earn_focus' | 'bonus';
export type BonusPool = 'ad' | 'referral' | 'sponsor_challenge';

export type PointTransaction = {
  id: string;
  session_id: string | null;
  kind: PointKind;
  amount: number;
  week_id: string;
  status: 'pending' | 'confirmed' | 'void';
  note: string | null;
  bonus_pool: BonusPool | null;
};

export const pointTransactionsQueryKey = (userId: string | undefined) => ['pointTransactions', userId] as const;

export async function listPointTransactions(userId: string): Promise<PointTransaction[]> {
  if (!supabase) throw new Error('서비스에 연결하지 못했습니다.');
  const read = (select: string) => supabase!.from('point_transactions')
    .select(select).eq('user_id', userId)
    .in('kind', ['earn_sleep', 'earn_focus', 'bonus'])
    .order('created_at', { ascending: false }).limit(100);
  let { data, error } = await read('id,session_id,kind,amount,week_id,status,note,bonus_pool');
  // 0008 이전 서버에는 bonus_pool이 없다. 그때는 모든 bonus가 광고 풀이다.
  if (error?.code === '42703') {
    ({ data, error } = await read('id,session_id,kind,amount,week_id,status,note'));
    if (error) throw error;
    return ((data ?? []) as unknown as PointTransaction[]).map((row) => ({
      ...row, bonus_pool: row.kind === 'bonus' ? 'ad' : null,
    }));
  }
  if (error) throw error;
  return (data ?? []) as unknown as PointTransaction[];
}
