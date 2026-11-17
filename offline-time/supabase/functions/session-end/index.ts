import { withSupabase } from 'npm:@supabase/server@1';

import { evaluateFocusEnd, parseClientTime } from '../_shared/focusRules.ts';
import { errorResponse, isUuid, SESSION_COLUMNS } from '../_shared/session.ts';

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

    const admin = ctx.supabaseAdmin;
    const { data: session, error: readError } = await admin.from('sessions').select(SESSION_COLUMNS)
      .eq('id', body.sessionId).eq('user_id', userId).maybeSingle();
    if (readError) return errorResponse('기록을 확인하지 못했습니다.', 500);
    if (!session || session.mode !== 'focus') return errorResponse('집중 기록을 찾지 못했습니다.', 404);
    if (session.status !== 'open') return Response.json({ session });

    const now = Date.now();
    const clientEndedAt = parseClientTime(body.clientEndedAt, now);
    const result = evaluateFocusEnd(session.server_started_at, now, !!clientEndedAt);
    const { data, error } = await admin.from('sessions').update({
      client_ended_at: clientEndedAt ?? new Date(now).toISOString(),
      server_ended_at: result.serverEndedAt,
      status: result.status,
      invalid_reason: result.invalidReason,
    }).eq('id', session.id).eq('user_id', userId).eq('status', 'open').select(SESSION_COLUMNS).maybeSingle();
    if (error) return errorResponse('집중 기록을 종료하지 못했습니다.', 500);
    if (data) return Response.json({ session: data });

    // A concurrent retry may have completed the same session first.
    const { data: completed } = await admin.from('sessions').select(SESSION_COLUMNS)
      .eq('id', session.id).eq('user_id', userId).maybeSingle();
    return completed ? Response.json({ session: completed }) : errorResponse('집중 기록을 찾지 못했습니다.', 404);
  }),
};
