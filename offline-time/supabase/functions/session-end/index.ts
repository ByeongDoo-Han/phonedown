import { withSupabase } from 'npm:@supabase/server@1';

import { isUuid, errorResponse } from '../_shared/session.ts';

export default {
  fetch: withSupabase({ auth: 'user' }, async (req, ctx) => {
    if (req.method !== 'POST') return errorResponse('POST 요청만 지원합니다.', 405);
    const userId = ctx.userClaims?.id;
    if (!userId) return errorResponse('로그인이 필요합니다.', 401);

    let body: { sessionId?: unknown; clientEndedAt?: unknown };
    try {
      body = await req.json();
    } catch {
      return errorResponse('요청 형식이 올바르지 않습니다.', 400);
    }
    if (!isUuid(body.sessionId)) return errorResponse('기록 ID가 올바르지 않습니다.', 400);

    const clientEndedAt = typeof body.clientEndedAt === 'string'
      && Number.isFinite(Date.parse(body.clientEndedAt))
      ? new Date(body.clientEndedAt).toISOString() : null;
    const { data, error } = await ctx.supabaseAdmin.rpc('finish_focus_session', {
      p_session_id: body.sessionId,
      p_user_id: userId,
      p_client_ended_at: clientEndedAt,
    });
    if (error?.code === 'P0002') return errorResponse('집중 기록을 찾지 못했습니다.', 404);
    if (error || !data?.session) return errorResponse('집중 기록을 종료하지 못했습니다.', 500);
    return Response.json(data);
  }),
};
