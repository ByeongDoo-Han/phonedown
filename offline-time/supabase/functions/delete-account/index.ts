import { withSupabase } from 'npm:@supabase/server@1';

import { errorResponse } from '../_shared/session.ts';

// 계정 탈퇴(App Store 심사 필수). 순서가 중요하다:
//   1) 로그인한 본인인지 확인한다(JWT → ctx.userClaims.id). 남의 계정을 지울 수 없다.
//   2) 대기 중인 교환 신청을 취소·환급해 재고를 되돌린다(보낼 곳이 사라지므로).
//   3) 개인 식별 정보가 없는 회계 요약을 만든다(지급·교환 수량만).
//   4) auth.users 행을 지운다 → public.users 이하 모든 행이 FK cascade로 함께 사라진다.
//   5) 삭제가 끝난 뒤에야 요약을 보존 표에 남긴다(삭제가 실패하면 보존 기록도 남기지 않는다).
//
// 앱은 마지막에 signOut하고 로그인 화면으로 돌아간다.

export default {
  fetch: withSupabase({ auth: 'user' }, async (req, ctx) => {
    if (req.method !== 'POST') return errorResponse('POST 요청만 지원합니다.', 405);
    const userId = ctx.userClaims?.id;
    if (!userId) return errorResponse('로그인이 필요합니다.', 401);

    const admin = ctx.supabaseAdmin;

    // 1) 본인 계정이 실제로 있는지 먼저 확인한다(이미 지운 계정의 재요청은 조용히 성공으로).
    const { data: profile, error: profileError } = await admin.from('users')
      .select('id').eq('id', userId).maybeSingle();
    if (profileError) return errorResponse('계정을 확인하지 못했습니다.', 500);
    if (!profile) return Response.json({ deleted: true, alreadyDeleted: true });

    // 2) 대기 중인 교환은 취소·환급한다. 0009 이전 서버에는 함수가 없으므로 실패를 치명적으로
    //    다루지 않는다(그 서버에는 발송 대기열도 없다).
    const released = await admin.rpc('release_account_redemptions',
      { p_user_id: userId, p_actor: userId });
    if (released.error && released.error.code !== 'P0002') {
      console.error('release_account_redemptions failed:', released.error.code, released.error.message);
    }

    // 3) 요약.
    let summary: Record<string, unknown> | null = null;
    const collected = await admin.rpc('collect_account_deletion_summary', { p_user_id: userId });
    if (collected.error) {
      console.error('collect_account_deletion_summary failed:', collected.error.code, collected.error.message);
    } else {
      summary = (collected.data ?? {}) as Record<string, unknown>;
    }

    // 4) 계정 삭제. service_role의 admin API만 할 수 있다.
    const { error: deleteError } = await admin.auth.admin.deleteUser(userId);
    if (deleteError) {
      console.error('deleteUser failed:', deleteError.message);
      return errorResponse('계정을 지우지 못했습니다. 잠시 뒤에 다시 시도해 주세요.', 500);
    }

    // 5) 보존 기록. 여기서 실패해도 계정은 이미 지워졌으므로 사용자에게 실패를 말하지 않는다.
    if (summary) {
      const recorded = await admin.rpc('record_account_deletion', {
        p_summary: summary, p_completed: true,
      });
      if (recorded.error) {
        console.error('record_account_deletion failed:', recorded.error.code, recorded.error.message);
      }
    }

    return Response.json({
      deleted: true,
      releasedRedemptions: typeof released.data === 'number' ? released.data : 0,
      summary,
    });
  }),
};
