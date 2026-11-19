import { adminErrorText, type AdminCoupon, type AdminMode, type AdminRedemption,
  type FulfillmentKind } from '@/features/admin/fulfillmentView';
import { describeFunctionError } from '@/lib/functionError';
import { supabase } from '@/lib/supabase';

// 운영자 화면이 부르는 Edge Function 클라이언트. 권한은 서버(ADMIN_USER_IDS)가 판단하므로
// 여기서는 결과만 옮긴다. 화면이 열려 있어도 운영자가 아니면 모든 요청이 403으로 끝난다.

export class AdminRequestError extends Error {
  status: number | null;
  constructor(message: string, status: number | null) {
    super(message);
    this.name = 'AdminRequestError';
    this.status = status;
  }
}

export type AdminList = {
  mode: AdminMode;
  redemptions: AdminRedemption[];
  coupons: AdminCoupon[];
};

export type AdminIdentity = { admin: boolean; mode: AdminMode | null; message: string | null };

async function invokeAdmin<T>(body: Record<string, unknown>): Promise<T> {
  if (!supabase) throw new AdminRequestError('서비스에 연결하지 못했습니다.', null);
  const { data, error } = await supabase.functions.invoke<T>('admin-fulfillment', { body });
  if (error) {
    const failure = await describeFunctionError(error);
    throw new AdminRequestError(adminErrorText(failure.message), failure.status);
  }
  if (!data) throw new AdminRequestError('서버 응답을 읽지 못했습니다.', null);
  return data;
}

/** 설정 화면이 운영자 도구를 보여 줄지 정한다. 권한이 없으면 조용히 admin:false. */
export async function adminIdentity(): Promise<AdminIdentity> {
  try {
    const data = await invokeAdmin<{ admin?: boolean; mode?: AdminMode }>({ action: 'whoami' });
    return { admin: data.admin === true, mode: data.mode ?? 'manual', message: null };
  } catch (error) {
    if (error instanceof AdminRequestError) {
      const status = error.status;
      if (status === 403) return { admin: false, mode: null, message: null };
      return { admin: false, mode: null, message: error.message };
    }
    return { admin: false, mode: null, message: '운영자 기능을 확인하지 못했어요.' };
  }
}

export async function listFulfillment(includeResolved: boolean): Promise<AdminList> {
  const data = await invokeAdmin<Partial<AdminList>>({
    action: 'list',
    limit: 100,
    includeResolved,
  });
  return {
    mode: data.mode ?? 'manual',
    redemptions: data.redemptions ?? [],
    coupons: data.coupons ?? [],
  };
}

export type AdminActionResult = {
  mode: AdminMode;
  instruction?: string;
  message?: string;
};

export async function sendFulfillment(kind: FulfillmentKind, id: string): Promise<AdminActionResult> {
  return invokeAdmin<AdminActionResult>({ action: 'send', kind, id });
}

export async function markFulfilled(kind: FulfillmentKind, id: string,
  externalId: string, memo: string): Promise<AdminActionResult> {
  return invokeAdmin<AdminActionResult>({
    action: 'fulfill', kind, id, externalId, memo,
  });
}

export async function markFailed(kind: FulfillmentKind, id: string,
  reason: string): Promise<AdminActionResult> {
  return invokeAdmin<AdminActionResult>({ action: 'fail', kind, id, reason });
}
