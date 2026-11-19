import { deletionFailureText } from '@/features/account/accountPolicy';
import { describeFunctionError } from '@/lib/functionError';
import { supabase } from '@/lib/supabase';

// 계정 삭제는 앱이 아니라 서버가 한다: 세션 검증 → 대기 교환 취소·환급 → 회계 요약 →
// auth.users 삭제(cascade) → 보존 기록. 성공하면 세션이 무효가 되므로 로그인 화면으로 돌아간다.

export type DeleteAccountResult = {
  deleted: boolean;
  releasedRedemptions: number;
};

export class AccountDeletionError extends Error {
  status: number | null;
  constructor(message: string, status: number | null) {
    super(message);
    this.name = 'AccountDeletionError';
    this.status = status;
  }
}

export async function deleteAccount(): Promise<DeleteAccountResult> {
  if (!supabase) throw new AccountDeletionError('서비스에 연결하지 못했습니다.', null);
  const { data, error } = await supabase.functions.invoke<DeleteAccountResult>('delete-account', {
    body: { confirm: true },
  });
  if (error) {
    const failure = await describeFunctionError(error);
    throw new AccountDeletionError(
      failure.message || deletionFailureText(failure.status), failure.status);
  }
  if (!data?.deleted) throw new AccountDeletionError(deletionFailureText(null), null);
  return { deleted: true, releasedRedemptions: data.releasedRedemptions ?? 0 };
}

/** 탈퇴 직후 세션을 정리한다. 서버에서 계정이 이미 사라졌으므로 실패해도 무시한다. */
export async function clearLocalSession(): Promise<void> {
  try {
    await supabase?.auth.signOut({ scope: 'local' });
  } catch {
    // 세션이 이미 무효면 signOut이 실패할 수 있다. 화면은 로그인으로 돌아가면 된다.
  }
}

/** 탈퇴 확인 모달에서 "발송 대기 중인 교환"을 알려 주기 위한 개수. 실패하면 0. */
export async function countPendingRedemptions(userId: string | undefined): Promise<number> {
  if (!supabase || !userId) return 0;
  const { count, error } = await supabase.from('redemptions')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId).eq('status', 'requested');
  if (error) return 0;
  return count ?? 0;
}
