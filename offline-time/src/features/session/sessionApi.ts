import { supabase } from '@/lib/supabase';
import type { PointTransaction } from '@/features/points/pointApi';

export type FocusMinutes = 30 | 60 | 90;
export type SessionStatus = 'open' | 'valid' | 'invalid';

export type TimeSession = {
  id: string;
  user_id: string;
  mode: 'sleep' | 'focus';
  source: 'charge' | 'timer';
  planned_minutes: number | null;
  client_started_at: string;
  client_ended_at: string | null;
  server_started_at: string;
  server_ended_at: string | null;
  status: SessionStatus;
  invalid_reason: string | null;
};

export type FocusEndResult = { session: TimeSession; transaction: PointTransaction | null };

export const sessionQueryKey = (userId: string | undefined) => ['sessions', userId] as const;

const columns = 'id,user_id,mode,source,planned_minutes,client_started_at,client_ended_at,server_started_at,server_ended_at,status,invalid_reason';

export async function listSessions(userId: string): Promise<TimeSession[]> {
  if (!supabase) throw new Error('서비스에 연결하지 못했습니다.');
  const { data, error } = await supabase.from('sessions').select(columns)
    .eq('user_id', userId).order('server_started_at', { ascending: false }).limit(50);
  if (error) throw error;
  return (data ?? []) as TimeSession[];
}

async function invokeSession(name: 'session-start', body: object): Promise<TimeSession> {
  if (!supabase) throw new Error('서비스에 연결하지 못했습니다.');
  const { data, error } = await supabase.functions.invoke<{ session: TimeSession }>(name, { body });
  if (error || !data?.session?.id) throw error ?? new Error('기록 응답이 올바르지 않습니다.');
  return data.session;
}

export function startFocusSession(plannedMinutes: FocusMinutes): Promise<TimeSession> {
  return invokeSession('session-start', {
    plannedMinutes,
    clientStartedAt: new Date().toISOString(),
  });
}

export async function endFocusSession(sessionId: string): Promise<FocusEndResult> {
  if (!supabase) throw new Error('서비스에 연결하지 못했습니다.');
  const { data, error } = await supabase.functions.invoke<FocusEndResult>('session-end', { body: {
    sessionId,
    clientEndedAt: new Date().toISOString(),
  } });
  if (error || !data?.session?.id) throw error ?? new Error('기록 응답이 올바르지 않습니다.');
  return data;
}
