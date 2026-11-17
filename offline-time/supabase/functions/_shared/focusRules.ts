export const FOCUS_MIN_MINUTES = 20;
export const FOCUS_MAX_MINUTES = 180;
export const MAX_CLOCK_SKEW_MS = 120_000;

export function parseClientTime(value: unknown, serverTimeMs: number): string | null {
  if (typeof value !== 'string') return null;
  const clientTimeMs = Date.parse(value);
  if (!Number.isFinite(clientTimeMs) || Math.abs(clientTimeMs - serverTimeMs) > MAX_CLOCK_SKEW_MS) return null;
  return new Date(clientTimeMs).toISOString();
}

export function evaluateFocusEnd(startedAt: string, endedAtMs: number, clientTimeValid: boolean) {
  const elapsedMs = Math.max(0, endedAtMs - Date.parse(startedAt));
  const cappedEndMs = Math.min(endedAtMs, Date.parse(startedAt) + FOCUS_MAX_MINUTES * 60_000);
  const invalidReason = !clientTimeValid ? 'clock_skew'
    : elapsedMs < FOCUS_MIN_MINUTES * 60_000 ? 'too_short'
    : null;

  return {
    serverEndedAt: new Date(cappedEndMs).toISOString(),
    status: invalidReason ? 'invalid' as const : 'valid' as const,
    invalidReason,
  };
}
