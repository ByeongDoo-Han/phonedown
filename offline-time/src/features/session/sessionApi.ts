import { supabase } from '@/lib/supabase';
import type { PointTransaction } from '@/features/points/pointApi';

export type FocusMinutes = 30 | 60 | 90;
export type SessionMode = 'sleep' | 'focus';
export type SessionStatus = 'open' | 'valid' | 'invalid';

export type TimeSession = {
  id: string;
  user_id: string;
  mode: SessionMode;
  source: 'charge' | 'timer';
  planned_minutes: number | null;
  client_started_at: string;
  client_ended_at: string | null;
  server_started_at: string;
  server_ended_at: string | null;
  status: SessionStatus;
  invalid_reason: string | null;
  started_charging: boolean | null;
  ended_charging: boolean | null;
};

export type SessionEndResult = {
  session: TimeSession;
  transaction: PointTransaction | null;
  // Set by the sleep settlement when the night ran past the 12-hour maximum.
  truncated?: boolean;
  // Set when the server also moved the referral / sponsor challenge forward (0008).
  growth?: GrowthResult | null;
};

export type GrowthResult = {
  referral?: { changed?: boolean; completed?: boolean; inviter_points?: number;
    invitee_points?: number; progress_days?: number };
  challenge?: { changed?: boolean; completed?: number };
};

export type SessionStartInput =
  | { mode: 'focus'; plannedMinutes: FocusMinutes }
  | { mode: 'sleep'; plannedMinutes?: number };

export const sessionQueryKey = (userId: string | undefined) => ['sessions', userId] as const;

const columns = 'id,user_id,mode,source,planned_minutes,client_started_at,client_ended_at,server_started_at,server_ended_at,status,invalid_reason,started_charging,ended_charging';
// Before 0007_sleep_mode.sql is applied the charging columns do not exist yet; the screens
// still work (without the charge note) instead of failing to load the record list.
const legacyColumns = 'id,user_id,mode,source,planned_minutes,client_started_at,client_ended_at,server_started_at,server_ended_at,status,invalid_reason';

export async function listSessions(userId: string): Promise<TimeSession[]> {
  if (!supabase) throw new Error('서비스에 연결하지 못했습니다.');
  const read = (select: string) => supabase!.from('sessions').select(select)
    .eq('user_id', userId).order('server_started_at', { ascending: false }).limit(50);
  let { data, error } = await read(columns);
  if (error?.code === '42703') ({ data, error } = await read(legacyColumns));
  if (error) throw error;
  const rows = (data ?? []) as unknown as TimeSession[];
  return rows.map((row) => ({
    ...row,
    started_charging: row.started_charging ?? null,
    ended_charging: row.ended_charging ?? null,
  }));
}

async function invokeSession(name: 'session-start', body: object): Promise<TimeSession> {
  if (!supabase) throw new Error('서비스에 연결하지 못했습니다.');
  const { data, error } = await supabase.functions.invoke<{ session: TimeSession }>(name, { body });
  if (error || !data?.session?.id) throw error ?? new Error('기록 응답이 올바르지 않습니다.');
  return data.session;
}

// `charging` is the device's battery state at the moment the record starts: true, false, or
// null when the platform cannot tell. The server stores it as evidence only.
export function startSession(input: SessionStartInput,
  charging: boolean | null = null): Promise<TimeSession> {
  return invokeSession('session-start', {
    mode: input.mode,
    plannedMinutes: input.plannedMinutes,
    clientStartedAt: new Date().toISOString(),
    charging,
  });
}

// Ends either mode. A sleep record settled here is the morning's one-tap check-out.
export async function endSession(sessionId: string,
  charging: boolean | null = null): Promise<SessionEndResult> {
  if (!supabase) throw new Error('서비스에 연결하지 못했습니다.');
  const { data, error } = await supabase.functions.invoke<SessionEndResult>('session-end', {
    body: { sessionId, clientEndedAt: new Date().toISOString(), charging },
  });
  if (error || !data?.session?.id) throw error ?? new Error('기록 응답이 올바르지 않습니다.');
  return data;
}
