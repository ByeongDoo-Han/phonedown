import { withSupabase } from 'npm:@supabase/server@1';

import { parseClientTime } from '../_shared/focusRules.ts';
import { errorResponse, SESSION_COLUMNS } from '../_shared/session.ts';

type StartBody = {
  mode?: unknown;
  clientStartedAt?: unknown;
  plannedMinutes?: unknown;
  charging?: unknown;
};

const FOCUS_PLANS = [30, 60, 90];

export default {
  fetch: withSupabase({ auth: 'user' }, async (req, ctx) => {
    if (req.method !== 'POST') return errorResponse('POST 요청만 지원합니다.', 405);
    const userId = ctx.userClaims?.id;
    if (!userId) return errorResponse('로그인이 필요합니다.', 401);

    let body: StartBody;
    try {
      body = await req.json();
    } catch {
      return errorResponse('요청 형식이 올바르지 않습니다.', 400);
    }
    // An older client sends no mode; that request is a focus session.
    const mode = body.mode === 'sleep' ? 'sleep' : 'focus';
    const now = Date.now();
    const clientStartedAt = parseClientTime(body.clientStartedAt, now);
    if (!clientStartedAt) return errorResponse('기기 시간을 확인한 뒤 다시 시도해 주세요.', 400);

    if (mode === 'focus' && !FOCUS_PLANS.includes(body.plannedMinutes as number)) {
      return errorResponse('집중 시간은 30분, 60분, 90분 중 선택해 주세요.', 400);
    }
    // Sleep runs until the morning wake button, so a plan is optional and only informative.
    const plannedMinutes = mode === 'focus'
      ? body.plannedMinutes as number
      : typeof body.plannedMinutes === 'number' && Number.isFinite(body.plannedMinutes)
        ? Math.min(720, Math.max(1, Math.round(body.plannedMinutes)))
        : null;
    // Charging never decides whether a session is valid; it is recorded as evidence.
    const charging = typeof body.charging === 'boolean' ? body.charging : null;

    const admin = ctx.supabaseAdmin;
    const { data: openSession, error: readError } = await admin.from('sessions').select(SESSION_COLUMNS)
      .eq('user_id', userId).eq('status', 'open').maybeSingle();
    if (readError) return errorResponse('기록을 확인하지 못했습니다.', 500);
    if (openSession) {
      // Pressing the same button twice returns the running session instead of failing.
      if (openSession.mode !== mode) return errorResponse('다른 기록이 진행 중입니다.', 409);
      return Response.json({ session: openSession });
    }

    const { data, error } = await admin.from('sessions').insert({
      user_id: userId,
      mode,
      source: mode === 'sleep' && charging ? 'charge' : 'timer',
      planned_minutes: plannedMinutes,
      client_started_at: clientStartedAt,
      server_started_at: new Date(now).toISOString(),
      started_charging: charging,
    }).select(SESSION_COLUMNS).single();
    if (error?.code === '23505') {
      const { data: concurrent } = await admin.from('sessions').select(SESSION_COLUMNS)
        .eq('user_id', userId).eq('status', 'open').maybeSingle();
      if (concurrent?.mode === mode) return Response.json({ session: concurrent });
      return errorResponse('다른 기록이 진행 중입니다.', 409);
    }
    if (error || !data) {
      return errorResponse(mode === 'sleep' ? '수면 기록을 시작하지 못했습니다.'
        : '집중 기록을 시작하지 못했습니다.', 500);
    }
    return Response.json({ session: data });
  }),
};
