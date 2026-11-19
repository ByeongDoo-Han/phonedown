import assert from 'node:assert/strict';
import test from 'node:test';

import { adminErrorText, couponState, fulfillmentCounts, isProcessing, itemSubtitle,
  itemTitle, modeGuidance, redemptionState, PROCESSING_LOCK_MINUTES, validReason }
  from '../src/features/admin/fulfillmentView.ts';

const now = Date.parse('2026-11-19T10:00:00+09:00');

const redemption = {
  id: 'r1', user_id: '11111111-1111-4111-8111-111111111111', user_email: 'a@example.test',
  product_name: '메가커피 아메리카노', points: 2800, phone: '01012345678', status: 'requested',
  provider: 'manual', provider_ref: null, attempts: 0, processing_started_at: null,
  processed_at: null, fail_reason: null, last_error: null,
  created_at: '2026-11-19T09:00:00+09:00', issued_at: null, memo: null,
};

const coupon = {
  id: 'c1', user_id: '11111111-1111-4111-8111-111111111111', user_email: 'a@example.test',
  challenge_title: '7시간 수면 5일', code: 'SP-ABC1234567', reward_title: '수면용품 브랜드 쿠폰',
  value_krw: 3000, delivery_status: 'pending', provider: 'manual', provider_ref: null,
  attempts: 0, processing_started_at: null, processed_at: null, last_error: null,
  issued_at: '2026-11-19T09:00:00+09:00', delivered_at: null,
};

test('a waiting redemption can be sent, completed, or refunded', () => {
  const state = redemptionState(redemption, now);
  assert.equal(state.label, '대기');
  assert.deepEqual([state.canSend, state.canFulfill, state.canFail], [true, true, true]);
});

test('a redemption grabbed less than 15 minutes ago is not sent twice', () => {
  const grabbed = { ...redemption, processing_started_at: new Date(now - 4 * 60_000).toISOString(),
    attempts: 1 };
  assert.equal(isProcessing(grabbed.processing_started_at, now), true);
  const state = redemptionState(grabbed, now);
  assert.equal(state.label, '발송 중');
  assert.equal(state.canSend, false);
  // 다른 운영자가 이미 잡았어도 결과를 기록할 수는 있어야 한다.
  assert.equal(state.canFulfill, true);
  assert.equal(state.canFail, true);

  const stale = { ...grabbed, processing_started_at: new Date(now - (PROCESSING_LOCK_MINUTES + 1) * 60_000).toISOString() };
  assert.equal(isProcessing(stale.processing_started_at, now), false);
  assert.equal(redemptionState(stale, now).canSend, true);
  assert.equal(isProcessing(null, now), false);
});

test('an issued redemption shows its transaction id and cannot be refunded', () => {
  const state = redemptionState({ ...redemption, status: 'issued', provider_ref: 'ORD-1001',
    issued_at: '2026-11-19T09:30:00+09:00' }, now);
  assert.equal(state.label, '발송 완료');
  assert.equal(state.note, '거래 번호 ORD-1001');
  assert.deepEqual([state.canSend, state.canFulfill, state.canFail], [false, false, false]);
});

test('a refunded redemption shows the reason and offers nothing', () => {
  const state = redemptionState({ ...redemption, status: 'failed', fail_reason: '재고 소진' }, now);
  assert.equal(state.label, '환급 완료');
  assert.equal(state.note, '환급 사유 · 재고 소진');
  assert.deepEqual([state.canSend, state.canFulfill, state.canFail], [false, false, false]);
});

test('a coupon that failed can be retried, a sent one cannot', () => {
  const failed = couponState({ ...coupon, delivery_status: 'failed', last_error: '브랜드 재고 없음' }, now);
  assert.equal(failed.label, '재시도 필요');
  assert.equal(failed.canSend, true);
  assert.equal(failed.canFail, false);
  assert.match(failed.note, /브랜드 재고 없음/);

  const sent = couponState({ ...coupon, delivery_status: 'sent', provider_ref: 'SP-ORDER-9' }, now);
  assert.equal(sent.label, '발송 완료');
  assert.deepEqual([sent.canSend, sent.canFulfill, sent.canFail], [false, false, false]);
});

test('the counts line separates waiting, processing, and needs attention', () => {
  const counts = fulfillmentCounts({
    redemptions: [
      redemption,
      { ...redemption, id: 'r2', processing_started_at: new Date(now - 60_000).toISOString() },
      { ...redemption, id: 'r3', status: 'failed', fail_reason: '번호 오류' },
    ],
    coupons: [
      coupon,
      { ...coupon, id: 'c2', delivery_status: 'failed' },
      { ...coupon, id: 'c3', delivery_status: 'sent' },
    ],
    nowMs: now,
  });
  assert.deepEqual(counts, { waiting: 2, processing: 1, failed: 2 });
});

test('items read as a sentence an operator can scan', () => {
  assert.equal(itemTitle('redemption', redemption), '메가커피 아메리카노 · 2,800P');
  assert.equal(itemSubtitle('redemption', redemption), 'a@example.test · 01012345678');
  assert.equal(itemTitle('coupon', coupon), '수면용품 브랜드 쿠폰 · SP-ABC1234567');
  assert.equal(itemSubtitle('coupon', coupon), 'a@example.test · 7시간 수면 5일');
  const anonymous = { ...redemption, user_email: null };
  assert.match(itemSubtitle('redemption', anonymous), /^11111111 ·/);
});

test('the mode guidance says what the send button will do', () => {
  assert.match(modeGuidance('manual').title, /직접 발송/);
  assert.match(modeGuidance('manual').body, /직접 보낸 뒤/);
  assert.match(modeGuidance('giftishow').title, /자동 발송/);
});

test('a failure reason must be something an operator can read back', () => {
  assert.equal(validReason(' '), false);
  assert.equal(validReason('x'), false);
  assert.equal(validReason('재고 소진'), true);
  assert.equal(validReason('a'.repeat(301)), false);
});

test('unknown transport errors are translated, server messages are kept', () => {
  assert.match(adminErrorText('Edge Function returned a non-2xx status code'), /운영자 권한/);
  assert.equal(adminErrorText('다른 운영자가 발송 중입니다. 15분 뒤에 다시 시도해 주세요.'),
    '다른 운영자가 발송 중입니다. 15분 뒤에 다시 시도해 주세요.');
  assert.match(adminErrorText(''), /다시 시도/);
});
