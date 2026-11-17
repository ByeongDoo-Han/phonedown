import { supabase } from '@/lib/supabase';

export type WalletSummary = { confirmed_points: number; pending_points: number };
export type Product = {
  id: string;
  name: string;
  type: 'naverpay' | 'coupon';
  points: number;
  stock: number | null;
};
export type Redemption = {
  id: string;
  product_id: string;
  points: number;
  status: 'requested' | 'issued' | 'failed';
  created_at: string;
};

export const walletQueryKey = (userId: string | undefined) => ['wallet', userId] as const;
export const productsQueryKey = ['products'] as const;
export const redemptionsQueryKey = (userId: string | undefined) => ['redemptions', userId] as const;

export async function getWalletSummary(): Promise<WalletSummary> {
  if (!supabase) throw new Error('서비스에 연결하지 못했습니다.');
  const { data, error } = await supabase.rpc('wallet_summary');
  if (error || !data) throw error ?? new Error('포인트를 확인하지 못했습니다.');
  return data as WalletSummary;
}

export async function listProducts(): Promise<Product[]> {
  if (!supabase) throw new Error('서비스에 연결하지 못했습니다.');
  const { data, error } = await supabase.from('products')
    .select('id,name,type,points,stock').eq('active', true)
    .order('sort_order', { ascending: true }).order('name', { ascending: true });
  if (error) throw error;
  return (data ?? []) as Product[];
}

export async function listRedemptions(userId: string): Promise<Redemption[]> {
  if (!supabase) throw new Error('서비스에 연결하지 못했습니다.');
  const { data, error } = await supabase.from('redemptions')
    .select('id,product_id,points,status,created_at').eq('user_id', userId)
    .order('created_at', { ascending: false }).limit(50);
  if (error) throw error;
  return (data ?? []) as Redemption[];
}

export async function requestRedemption(productId: string, phone: string, idempotencyKey: string): Promise<Redemption> {
  if (!supabase) throw new Error('서비스에 연결하지 못했습니다.');
  const { data, error } = await supabase.functions.invoke<{ redemption: Redemption }>('redeem-product', {
    body: { productId, phone, idempotencyKey },
  });
  if (error) {
    const context = (error as { context?: unknown }).context;
    if (context instanceof Response) {
      const payload = await context.json().catch(() => null) as { error?: unknown } | null;
      if (typeof payload?.error === 'string') throw new Error(payload.error);
    }
    throw error;
  }
  if (!data?.redemption?.id) throw new Error('교환 신청 결과를 확인하지 못했습니다.');
  return data.redemption;
}
