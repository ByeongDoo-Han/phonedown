import type { FocusMinutes, SessionMode, TimeSession } from '@/features/session/sessionApi';

// The record the screen shows the instant the start button is pressed, before the server has
// answered. Its clock is the device clock; when the server responds, the real row replaces it
// and the timer re-bases onto `server_started_at`.
export function optimisticSession(input: {
  id: string;
  userId: string;
  mode: SessionMode;
  plannedMinutes: FocusMinutes | number;
  startedAt: string;
  charging: boolean | null;
}): TimeSession {
  return {
    id: input.id,
    user_id: input.userId,
    mode: input.mode,
    source: input.mode === 'sleep' ? 'charge' : 'timer',
    planned_minutes: input.plannedMinutes,
    client_started_at: input.startedAt,
    client_ended_at: null,
    server_started_at: input.startedAt,
    server_ended_at: null,
    status: 'open',
    invalid_reason: null,
    started_charging: input.charging,
    ended_charging: null,
  };
}

export function isOptimisticSession(session: TimeSession): boolean {
  return session.id.startsWith('pending-');
}

// A start can fail for reasons the user can act on differently. Only the offline/conflict
// cases get their own sentence; everything else keeps the "check the connection" wording.
export function describeStartError(error: unknown): string {
  const text = error instanceof Error ? error.message : typeof error === 'string' ? error : '';
  // Supabase's FunctionsHttpError keeps the response on `context`; the status may not be in
  // the message at all, and a 409 is the one case with its own sentence.
  const status = typeof error === 'object' && error !== null
    ? (error as { context?: { status?: number } }).context?.status
    : undefined;
  if (status === 409 || /409|already|conflict|이미/i.test(text)) {
    return '이미 진행 중인 기록이 있어요. 기록을 끝낸 뒤 다시 시작해 주세요.';
  }
  if (/network|fetch|timeout|offline|연결/i.test(text)) {
    return '연결이 불안정해 기록을 시작하지 못했어요. 잠시 뒤 다시 시도해 주세요.';
  }
  return '기록을 시작하지 못했습니다. 연결을 확인해 주세요.';
}
