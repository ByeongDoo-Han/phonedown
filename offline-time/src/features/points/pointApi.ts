import { supabase } from '@/lib/supabase';

export type PointTransaction = {
  id: string;
  session_id: string | null;
  amount: number;
  status: 'pending' | 'confirmed' | 'void';
  note: string | null;
};

export const pointTransactionsQueryKey = (userId: string | undefined) => ['pointTransactions', userId] as const;

export async function listPointTransactions(userId: string): Promise<PointTransaction[]> {
  if (!supabase) throw new Error('서비스에 연결하지 못했습니다.');
  const { data, error } = await supabase.from('point_transactions')
    .select('id,session_id,amount,status,note')
    .eq('user_id', userId).eq('kind', 'earn_focus')
    .order('created_at', { ascending: false }).limit(50);
  if (error) throw error;
  return (data ?? []) as PointTransaction[];
}
