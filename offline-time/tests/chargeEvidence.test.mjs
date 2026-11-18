import assert from 'node:assert/strict';
import test from 'node:test';

import {
  chargeChangeNotice, chargeTransition, endChargingFlag, sleepChargeNote, sleepStartOffer,
} from '../src/features/sleep/chargeEvidence.ts';

test('the one-tap sleep offer appears only with a charger and no open record', () => {
  const offer = sleepStartOffer({ charge: 'charging', hasOpenSession: false });
  assert.ok(offer);
  assert.match(offer.title, /충전기 연결됨/);
  assert.match(offer.body, /아침까지/);
  assert.equal(offer.action, '수면 기록 시작');

  assert.equal(sleepStartOffer({ charge: 'charging', hasOpenSession: true }), null);
  assert.equal(sleepStartOffer({ charge: 'unplugged', hasOpenSession: false }), null);
  assert.equal(sleepStartOffer({ charge: 'unknown', hasOpenSession: false }), null);
});

test('the sleep note follows the charger and whether a record is running', () => {
  assert.match(sleepChargeNote('charging', true), /충전 중/);
  assert.match(sleepChargeNote('unplugged', true), /풀렸어요/);
  assert.match(sleepChargeNote('unknown', true), /확인할 수 없어요/);
  assert.match(sleepChargeNote('charging', false), /시작할까요/);
  assert.match(sleepChargeNote('unplugged', false), /연결되지 않았어요/);
  assert.match(sleepChargeNote('unknown', false), /그대로 할 수 있어요/);
});

test('a settlement keeps the check-out reading over the last one the app saw', () => {
  // Read again at check-out: the truth is what the charger is doing now.
  assert.equal(endChargingFlag('unplugged', 'charging'), false);
  assert.equal(endChargingFlag('charging', 'unplugged'), true);
  // No reading now: the listener's last value is the only evidence there is.
  assert.equal(endChargingFlag('unknown', 'charging'), true);
  assert.equal(endChargingFlag('unknown', 'unplugged'), false);
  // Nothing known at all stays null instead of claiming the phone was unplugged.
  assert.equal(endChargingFlag('unknown', 'unknown'), null);
});

test('only a real change between two known readings is reported', () => {
  assert.equal(chargeTransition('charging', 'unplugged'), 'unplugged');
  assert.equal(chargeTransition('unplugged', 'charging'), 'plugged');
  assert.equal(chargeTransition('charging', 'charging'), null);
  assert.equal(chargeTransition('unknown', 'unplugged'), null);
  assert.equal(chargeTransition('charging', 'unknown'), null);

  assert.match(chargeChangeNotice('unplugged') ?? '', /충전이 풀렸어요/);
  assert.match(chargeChangeNotice('plugged') ?? '', /다시 연결/);
  assert.equal(chargeChangeNotice(null), null);
});
