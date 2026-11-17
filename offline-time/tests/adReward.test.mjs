import assert from 'node:assert/strict';
import test from 'node:test';

import { encodeAdCustomData, parseAdCustomData } from '../supabase/functions/_shared/adReward.ts';

test('a settlement booster carries the session id through custom data', () => {
  const encoded = encodeAdCustomData('settlement_booster', '8a2c0a16-3a4e-4d2f-9f0e-6c1b2f3a4b5c');
  assert.deepEqual(parseAdCustomData(encoded), {
    v: 1,
    kind: 'settlement_booster',
    session_id: '8a2c0a16-3a4e-4d2f-9f0e-6c1b2f3a4b5c',
  });
});

test('a weekly box needs no session', () => {
  const encoded = encodeAdCustomData('weekly_box');
  assert.deepEqual(parseAdCustomData(encoded), { v: 1, kind: 'weekly_box' });
});

test('a booster without a session id cannot be encoded', () => {
  assert.throws(() => encodeAdCustomData('settlement_booster'));
});

test('custom data from another version, kind, or shape is ignored', () => {
  assert.equal(parseAdCustomData(null), null);
  assert.equal(parseAdCustomData(''), null);
  assert.equal(parseAdCustomData('not json'), null);
  assert.equal(parseAdCustomData('{"v":2,"kind":"weekly_box"}'), null);
  assert.equal(parseAdCustomData('{"v":1,"kind":"settlement_booster"}'), null);
  assert.equal(parseAdCustomData('{"v":1,"kind":"something_else"}'), null);
});
