export const SESSION_COLUMNS = 'id,user_id,mode,source,planned_minutes,client_started_at,client_ended_at,server_started_at,server_ended_at,status,invalid_reason,started_charging,ended_charging';

export function errorResponse(message: string, status: number): Response {
  return Response.json({ error: message }, { status });
}

export function isUuid(value: unknown): value is string {
  return typeof value === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
