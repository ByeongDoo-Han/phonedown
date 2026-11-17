// The rewarded ad request carries this JSON in AdMob's ServerSideVerificationOptions
// custom_data, and the SSV callback hands it back unchanged. It tells the callback which
// ledger entry the view belongs to; the reward itself is still decided server-side.

export const AD_CUSTOM_DATA_VERSION = 1;

export type AdPlacement = 'settlement_booster' | 'weekly_box';

export type AdCustomData =
  | { v: typeof AD_CUSTOM_DATA_VERSION; kind: 'settlement_booster'; session_id: string }
  | { v: typeof AD_CUSTOM_DATA_VERSION; kind: 'weekly_box' };

export function encodeAdCustomData(placement: AdPlacement, sessionId?: string): string {
  if (placement === 'settlement_booster') {
    if (!sessionId) throw new Error('A settlement booster needs a session id');
    return JSON.stringify({ v: AD_CUSTOM_DATA_VERSION, kind: placement, session_id: sessionId });
  }
  return JSON.stringify({ v: AD_CUSTOM_DATA_VERSION, kind: placement });
}

export function parseAdCustomData(raw: string | null): AdCustomData | null {
  if (!raw) return null;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof value !== 'object' || value === null) return null;
  const record = value as Record<string, unknown>;
  if (record.v !== AD_CUSTOM_DATA_VERSION) return null;
  if (record.kind === 'settlement_booster' && typeof record.session_id === 'string'
    && record.session_id.length > 0) {
    return { v: AD_CUSTOM_DATA_VERSION, kind: 'settlement_booster', session_id: record.session_id };
  }
  if (record.kind === 'weekly_box') {
    return { v: AD_CUSTOM_DATA_VERSION, kind: 'weekly_box' };
  }
  return null;
}
