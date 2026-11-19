// 기프티콘 발송 공급자 경계.
//
// 앱은 공급자를 직접 부르지 않는다. 운영자가 관리자 화면에서 발송을 누르면 Edge Function이
// service_role로 대신 부르고, 결과(성공·거래 번호·오류)를 DB에 남긴다. 발송 계약이 끝나기 전에는
// `manual` 모드로 안전하게 동작한다: 함수가 "직접 보내고 완료 처리하세요"를 돌려주고, 운영자가
// 발송한 뒤 완료/실패를 기록한다. `GIFTISHOW_API_URL`·`GIFTISHOW_API_KEY`·`GIFTISHOW_USER_ID`
// 세 값을 넣으면 같은 코드 경로가 실제 공급자 호출로 바뀐다.
//
// 이 파일이 공급자 명세와 만나는 유일한 지점이다. 아래 buildOrderBody / readOrderResult의 필드
// 이름은 계약 문서를 받으면 그 문서에 맞춰 고친다. 관리자 함수와 DB는 `FulfillmentOutcome`만
// 알기 때문에 나머지는 바뀌지 않는다.

export type FulfillmentKind = 'redemption' | 'coupon';

export type FulfillmentOrder = {
  kind: FulfillmentKind;
  /** redemptions.id 또는 sponsor_coupons.id — 공급자 주문 번호로도 쓴다. */
  targetId: string;
  productName: string;
  rewardTitle: string;
  points: number;
  /** 교환 상품은 받을 번호가 필요하다. 브랜드 쿠폰은 앱 안에서 코드로 전달된다. */
  phone: string | null;
  memo: string | null;
};

export type FulfillmentOutcome =
  | { ok: true; provider: string; externalId: string | null; message: string }
  | { ok: false; provider: string; error: string; retryable: boolean };

export type ProviderName = 'manual' | 'giftishow';

export type ProviderConfig = {
  provider: ProviderName;
  url: string | null;
  apiKey: string | null;
  userId: string | null;
};

export type SendOptions = {
  /** 테스트에서 네트워크를 대신할 fetch. */
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
};

export const MANUAL_PROVIDER: ProviderName = 'manual';

export function readProviderName(raw: string | undefined): ProviderName {
  const value = (raw ?? '').trim().toLowerCase();
  return value === 'giftishow' ? 'giftishow' : 'manual';
}

function clean(value: string | undefined): string | null {
  const trimmed = (value ?? '').trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** 환경 변수에서 공급자 설정을 만든다. 값이 모자라면 그대로 manual로 남는다. */
export function readProviderConfig(env: (key: string) => string | undefined): ProviderConfig {
  const choice = readProviderName(env('FULFILLMENT_PROVIDER'));
  const url = clean(env('GIFTISHOW_API_URL'));
  const apiKey = clean(env('GIFTISHOW_API_KEY'));
  const userId = clean(env('GIFTISHOW_USER_ID'));
  // 공급자를 명시했는데 키가 없으면 manual로 조용히 떨어지지 않고, 호출하는 쪽이 알 수 있게
  // provider는 giftishow로 두고 아래 missingKeys()가 503을 만들게 한다.
  if (choice === 'giftishow') return { provider: 'giftishow', url, apiKey, userId };
  if (url && apiKey && userId) return { provider: 'giftishow', url, apiKey, userId };
  return { provider: MANUAL_PROVIDER, url: null, apiKey: null, userId: null };
}

/** giftishow인데 비어 있는 설정 이름들. 비어 있으면 보낼 준비가 됐다는 뜻이다. */
export function missingKeys(config: ProviderConfig): string[] {
  if (config.provider !== 'giftishow') return [];
  const missing: string[] = [];
  if (!config.url) missing.push('GIFTISHOW_API_URL');
  if (!config.apiKey) missing.push('GIFTISHOW_API_KEY');
  if (!config.userId) missing.push('GIFTISHOW_USER_ID');
  return missing;
}

/** 공급자에게 보내는 주문 본문. 계약 문서를 받으면 이 함수만 고친다. */
export function buildOrderBody(order: FulfillmentOrder, config: ProviderConfig): Record<string, unknown> {
  return {
    userid: config.userId,
    // 기프티쇼 계열은 상품 코드로 발송한다. 상품명은 운영 로그·문의용으로 함께 보낸다.
    goods_name: order.productName,
    order_no: order.targetId,
    receiver_phone: order.phone,
    message: order.memo ?? order.rewardTitle,
    quantity: 1,
    kind: order.kind,
    points: order.points,
  };
}

/** 공급자 응답에서 거래 번호를 꺼낸다. 실패면 오류 문구를 돌려준다. */
export function readOrderResult(payload: unknown): { ok: true; externalId: string | null } | { ok: false; error: string } {
  if (!payload || typeof payload !== 'object') return { ok: false, error: '공급자 응답을 읽지 못했습니다.' };
  const row = payload as Record<string, unknown>;
  const code = row.resultCode ?? row.result_code ?? row.code;
  const success = row.success === true || code === 0 || code === '0' || code === '0000' ||
    row.resultCode === 'SUCCESS';
  const message = typeof row.resultMessage === 'string' ? row.resultMessage
    : typeof row.result_message === 'string' ? row.result_message
      : typeof row.message === 'string' ? row.message : null;
  if (!success) {
    return { ok: false, error: message ?? '공급자가 발송을 거절했습니다.' };
  }
  const rawId = row.trId ?? row.tr_id ?? row.transactionId ?? row.order_no;
  const externalId = typeof rawId === 'string' ? rawId : typeof rawId === 'number' ? String(rawId) : null;
  return { ok: true, externalId };
}

const DEFAULT_TIMEOUT_MS = 12_000;

/**
 * 실제 발송. manual 모드에서는 호출하지 않는다(운영자가 직접 보낸 뒤 완료 처리).
 * 네트워크·시간 초과·5xx는 retryable, 4xx(잘못된 상품 코드·번호)는 그대로 실패로 남긴다.
 */
export async function sendFulfillment(
  order: FulfillmentOrder,
  config: ProviderConfig,
  options: SendOptions = {},
): Promise<FulfillmentOutcome> {
  if (config.provider === 'manual') {
    return { ok: false, provider: 'manual', error: 'manual_mode', retryable: true };
  }
  if (!config.url || !config.apiKey) {
    return { ok: false, provider: config.provider, error: '공급자 설정이 비어 있습니다.', retryable: false };
  }
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  let response: Response;
  try {
    response = await fetchImpl(config.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // 계약 문서의 인증 방식에 맞춰 바꾼다(현재는 Bearer + userid 본문).
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify(buildOrderBody(order, config)),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    const timedOut = error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError');
    return {
      ok: false,
      provider: config.provider,
      error: timedOut ? '공급자 응답이 없습니다(시간 초과).' : '공급자에 연결하지 못했습니다.',
      retryable: true,
    };
  }

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  if (response.status >= 500) {
    return { ok: false, provider: config.provider, error: `공급자 오류 ${response.status}`, retryable: true };
  }
  if (!response.ok) {
    const parsed = readOrderResult(payload);
    return {
      ok: false,
      provider: config.provider,
      error: parsed.ok ? `공급자가 거절했습니다(${response.status})` : parsed.error,
      retryable: false,
    };
  }
  const parsed = readOrderResult(payload);
  if (!parsed.ok) return { ok: false, provider: config.provider, error: parsed.error, retryable: false };
  return {
    ok: true,
    provider: config.provider,
    externalId: parsed.externalId,
    message: '공급자가 발송을 접수했습니다.',
  };
}
