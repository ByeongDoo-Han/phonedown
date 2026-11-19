// 운영자 발송 화면의 판정과 문구. 화면(React)과 테스트(node)가 함께 쓰도록 여기에 모은다.
//
// 서버가 진실이다: 여기서는 "지금 어떤 버튼을 보여 줄지"만 정한다. 버튼을 눌러도 Edge Function이
// ADMIN_USER_IDS로 권한을 다시 확인하고, DB 락(15분)이 중복 발송을 막는다.

export type PillToneName = 'neutral' | 'accent' | 'indigo' | 'lavender' | 'moon' | 'success' | 'danger' | 'warning';

export type AdminMode = 'manual' | 'giftishow';

export type FulfillmentKind = 'redemption' | 'coupon';

export type AdminRedemption = {
  id: string;
  user_id: string;
  user_email: string | null;
  product_name: string | null;
  points: number;
  phone: string | null;
  status: 'requested' | 'issued' | 'failed';
  provider: string;
  provider_ref: string | null;
  attempts: number;
  processing_started_at: string | null;
  processed_at: string | null;
  fail_reason: string | null;
  last_error: string | null;
  created_at: string;
  issued_at: string | null;
  memo: string | null;
};

export type AdminCoupon = {
  id: string;
  user_id: string;
  user_email: string | null;
  challenge_title: string | null;
  code: string;
  reward_title: string;
  value_krw: number;
  delivery_status: 'pending' | 'sent' | 'failed';
  provider: string;
  provider_ref: string | null;
  attempts: number;
  processing_started_at: string | null;
  processed_at: string | null;
  last_error: string | null;
  issued_at: string;
  delivered_at: string | null;
};

export type ItemState = {
  label: string;
  tone: PillToneName;
  /** 공급자 호출 또는 운영자 발송을 시작할 수 있다. */
  canSend: boolean;
  /** 직접 발송한 뒤 완료로 기록할 수 있다. */
  canFulfill: boolean;
  /** 실패로 기록하고 환급(교환)할 수 있다. */
  canFail: boolean;
  note: string | null;
};

/** 다른 운영자가 잡은 발송은 15분 동안 풀리지 않는다(migration 0009와 같은 값). */
export const PROCESSING_LOCK_MINUTES = 15;

export function isProcessing(startedAt: string | null | undefined, nowMs: number): boolean {
  if (!startedAt) return false;
  const started = Date.parse(startedAt);
  if (!Number.isFinite(started)) return false;
  return nowMs - started < PROCESSING_LOCK_MINUTES * 60 * 1000;
}

function noteFor(error: string | null, ref: string | null): string | null {
  if (error) return `마지막 오류 · ${error}`;
  if (ref) return `거래 번호 ${ref}`;
  return null;
}

export function redemptionState(item: AdminRedemption, nowMs: number): ItemState {
  if (item.status === 'issued') {
    return {
      label: '발송 완료',
      tone: 'success',
      canSend: false,
      canFulfill: false,
      canFail: false,
      note: noteFor(null, item.provider_ref),
    };
  }
  if (item.status === 'failed') {
    return {
      label: '환급 완료',
      tone: 'danger',
      canSend: false,
      canFulfill: false,
      canFail: false,
      note: item.fail_reason ? `환급 사유 · ${item.fail_reason}` : null,
    };
  }
  if (isProcessing(item.processing_started_at, nowMs)) {
    return {
      label: '발송 중',
      tone: 'warning',
      canSend: false,
      canFulfill: true,
      canFail: true,
      note: '다른 운영자가 발송을 잡았습니다. 끝났다면 결과를 기록해 주세요.',
    };
  }
  return {
    label: '대기',
    tone: 'neutral',
    canSend: true,
    canFulfill: true,
    canFail: true,
    note: noteFor(item.last_error, null),
  };
}

export function couponState(item: AdminCoupon, nowMs: number): ItemState {
  if (item.delivery_status === 'sent') {
    return {
      label: '발송 완료',
      tone: 'success',
      canSend: false,
      canFulfill: false,
      canFail: false,
      note: noteFor(null, item.provider_ref),
    };
  }
  if (item.delivery_status === 'failed') {
    return {
      label: '재시도 필요',
      tone: 'danger',
      canSend: true,
      canFulfill: true,
      canFail: false,
      note: noteFor(item.last_error, null),
    };
  }
  if (isProcessing(item.processing_started_at, nowMs)) {
    return {
      label: '발송 중',
      tone: 'warning',
      canSend: false,
      canFulfill: true,
      canFail: true,
      note: '다른 운영자가 발송을 잡았습니다.',
    };
  }
  return {
    label: '대기',
    tone: 'neutral',
    canSend: true,
    canFulfill: true,
    canFail: true,
    note: noteFor(item.last_error, null),
  };
}

/** 화면 위쪽 안내: 지금 모드에서 "발송 시도"가 무엇을 하는지. */
export function modeGuidance(mode: AdminMode): { title: string; body: string } {
  if (mode === 'giftishow') {
    return {
      title: '자동 발송 연결됨',
      body: '발송을 누르면 공급자가 바로 접수합니다. 결과는 거래 번호와 함께 기록돼요.',
    };
  }
  return {
    title: '직접 발송 모드',
    body: '공급자 키가 없어 자동 발송은 하지 않아요. 기프티콘을 직접 보낸 뒤 거래 번호를 남기고 완료 처리해 주세요.',
  };
}

/** 목록 위에 한 줄로 보여 줄 요약. */
export function fulfillmentCounts(input: {
  redemptions: AdminRedemption[];
  coupons: AdminCoupon[];
  nowMs: number;
}): { waiting: number; processing: number; failed: number } {
  let waiting = 0;
  let processing = 0;
  let failed = 0;
  for (const item of input.redemptions) {
    const state = redemptionState(item, input.nowMs);
    if (state.label === '대기') waiting += 1;
    else if (state.label === '발송 중') processing += 1;
    else if (state.label === '환급 완료') failed += 1;
  }
  for (const item of input.coupons) {
    const state = couponState(item, input.nowMs);
    if (state.label === '대기') waiting += 1;
    else if (state.label === '발송 중') processing += 1;
    else if (state.label === '재시도 필요') failed += 1;
  }
  return { waiting, processing, failed };
}

export function itemTitle(kind: FulfillmentKind, item: AdminRedemption | AdminCoupon): string {
  if (kind === 'redemption') {
    const redemption = item as AdminRedemption;
    return `${redemption.product_name ?? '교환 상품'} · ${redemption.points.toLocaleString('ko-KR')}P`;
  }
  const coupon = item as AdminCoupon;
  return `${coupon.reward_title} · ${coupon.code}`;
}

export function itemSubtitle(kind: FulfillmentKind, item: AdminRedemption | AdminCoupon): string {
  if (kind === 'redemption') {
    const redemption = item as AdminRedemption;
    const who = redemption.user_email ?? redemption.user_id.slice(0, 8);
    return `${who} · ${redemption.phone ?? '번호 없음'}`;
  }
  const coupon = item as AdminCoupon;
  const who = coupon.user_email ?? coupon.user_id.slice(0, 8);
  return `${who} · ${coupon.challenge_title ?? '브랜드 챌린지'}`;
}

/** 실패 사유는 짧게, 그러나 운영자가 알아볼 수 있게 검사한다. */
export function validReason(reason: string): boolean {
  const trimmed = reason.trim();
  return trimmed.length >= 2 && trimmed.length <= 300;
}

/** 운영자 화면 오류 문구: 서버가 보낸 한국어를 그대로 쓰고, 모르는 오류만 감싼다. */
export function adminErrorText(message: string | null | undefined): string {
  const trimmed = message?.trim();
  if (!trimmed) return '요청을 처리하지 못했어요. 잠시 뒤에 다시 시도해 주세요.';
  if (/Edge Function returned a non-2xx/i.test(trimmed)) {
    return '서버가 요청을 거절했어요. 운영자 권한과 발송 설정을 확인해 주세요.';
  }
  return trimmed;
}
