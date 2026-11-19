import assert from 'node:assert/strict';
import test from 'node:test';

import { actorLabel, checkAdmin, configuredAdminIds }
  from '../supabase/functions/_shared/admin.ts';
import {
  buildOrderBody,
  missingKeys,
  readOrderResult,
  readProviderConfig,
  sendFulfillment,
} from '../supabase/functions/_shared/giftCoupon.ts';

const ADMIN = '11111111-1111-4111-8111-111111111111';
const OPERATOR = '22222222-2222-4222-8222-222222222222';

test('admin ids are read from a comma or space separated list', () => {
  assert.deepEqual(configuredAdminIds(' A ,b\nc '), ['a', 'b', 'c']);
  assert.deepEqual(configuredAdminIds(''), []);
  assert.deepEqual(configuredAdminIds(undefined), []);
});

test('nobody is an operator until ADMIN_USER_IDS is set', () => {
  const unset = checkAdmin(ADMIN, '');
  assert.equal(unset.ok, false);
  assert.equal(unset.status, 503);
  assert.match(unset.message, /ADMIN_USER_IDS/);
});

test('only a signed-in listed user may fulfill', () => {
  assert.deepEqual(checkAdmin(ADMIN, ADMIN), { ok: true });
  assert.deepEqual(checkAdmin(ADMIN.toUpperCase(), ADMIN), { ok: true });
  const stranger = checkAdmin(OPERATOR, ADMIN);
  assert.equal(stranger.status, 403);
  const anonymous = checkAdmin(undefined, ADMIN);
  assert.equal(anonymous.status, 401);
  assert.equal(actorLabel(OPERATOR), OPERATOR);
});

test('the provider stays manual until all vendor secrets are present', () => {
  assert.equal(readProviderConfig(() => undefined).provider, 'manual');
  const complete = readProviderConfig((key) => ({
    GIFTISHOW_API_URL: 'https://vendor.example/send',
    GIFTISHOW_API_KEY: 'key',
    GIFTISHOW_USER_ID: 'user',
  })[key]);
  assert.equal(complete.provider, 'giftishow');
  assert.deepEqual(missingKeys(complete), []);

  // 공급자를 명시했는데 키가 비면 manual로 조용히 떨어지지 않고 무엇이 빠졌는지 알려 준다.
  const partial = readProviderConfig((key) => (key === 'FULFILLMENT_PROVIDER' ? 'giftishow' : undefined));
  assert.equal(partial.provider, 'giftishow');
  assert.deepEqual(missingKeys(partial), ['GIFTISHOW_API_URL', 'GIFTISHOW_API_KEY', 'GIFTISHOW_USER_ID']);
});

test('an order carries the target, the phone, and the vendor user id', () => {
  const config = { provider: 'giftishow', url: 'https://vendor.example/send', apiKey: 'k', userId: 'u' };
  const body = buildOrderBody({
    kind: 'redemption', targetId: 'abc', productName: '메가커피 아메리카노',
    rewardTitle: '메가커피 아메리카노', points: 2800, phone: '01012345678', memo: '오전 발송',
  }, config);
  assert.equal(body.userid, 'u');
  assert.equal(body.order_no, 'abc');
  assert.equal(body.receiver_phone, '01012345678');
  assert.equal(body.message, '오전 발송');
  assert.equal(body.quantity, 1);
});

test('vendor responses are read in the shapes the vendor uses', () => {
  assert.deepEqual(readOrderResult({ resultCode: '0', trId: 'T-1' }), { ok: true, externalId: 'T-1' });
  assert.deepEqual(readOrderResult({ code: 0, tr_id: 'T-2' }), { ok: true, externalId: 'T-2' });
  assert.deepEqual(readOrderResult({ success: false, resultMessage: '잔액 부족' }),
    { ok: false, error: '잔액 부족' });
  assert.equal(readOrderResult(null).ok, false);
});

const order = {
  kind: 'redemption', targetId: 'abc', productName: '기프티콘', rewardTitle: '기프티콘',
  points: 1400, phone: '01012345678', memo: null,
};

test('manual mode never calls the vendor', () => {
  let called = 0;
  const fetchImpl = async () => { called += 1; return new Response('{}'); };
  return sendFulfillment(order, { provider: 'manual', url: null, apiKey: null, userId: null },
    { fetchImpl }).then((outcome) => {
    assert.equal(outcome.ok, false);
    assert.equal(outcome.error, 'manual_mode');
    assert.equal(called, 0);
  });
});

test('a vendor success returns its transaction id', async () => {
  const fetchImpl = async (url, init) => {
    assert.equal(url, 'https://vendor.example/send');
    assert.equal(init.method, 'POST');
    assert.equal(init.headers.Authorization, 'Bearer key');
    return new Response(JSON.stringify({ resultCode: '0', trId: 'TR-9' }), { status: 200 });
  };
  const outcome = await sendFulfillment(order,
    { provider: 'giftishow', url: 'https://vendor.example/send', apiKey: 'key', userId: 'u' },
    { fetchImpl });
  assert.deepEqual(outcome, { ok: true, provider: 'giftishow', externalId: 'TR-9',
    message: '공급자가 발송을 접수했습니다.' });
});

test('network and server errors are retryable, a rejected order is not', async () => {
  const config = { provider: 'giftishow', url: 'https://vendor.example/send', apiKey: 'key', userId: 'u' };
  const timedOut = await sendFulfillment(order, config, {
    timeoutMs: 5,
    fetchImpl: async () => { const error = new Error('timeout'); error.name = 'TimeoutError'; throw error; },
  });
  assert.equal(timedOut.ok, false);
  assert.equal(timedOut.retryable, true);

  const serverError = await sendFulfillment(order, config, {
    fetchImpl: async () => new Response('nope', { status: 503 }),
  });
  assert.equal(serverError.retryable, true);

  const rejected = await sendFulfillment(order, config, {
    fetchImpl: async () => new Response(JSON.stringify({ resultCode: 'E1', resultMessage: '상품 코드 오류' }),
      { status: 400 }),
  });
  assert.equal(rejected.ok, false);
  assert.equal(rejected.retryable, false);
  assert.equal(rejected.error, '상품 코드 오류');

  const garbage = await sendFulfillment(order, config, {
    fetchImpl: async () => new Response('<html>', { status: 200 }),
  });
  assert.equal(garbage.ok, false);
  assert.equal(garbage.retryable, false);
});
