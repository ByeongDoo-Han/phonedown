import assert from 'node:assert/strict';
import test from 'node:test';

import { adCustomData, placementLabel } from '../src/features/ads/adPlacement.ts';
import { parseAdCustomData } from '../supabase/functions/_shared/adReward.ts';

// The app builds the SSV custom data; the callback parses it. This test keeps the two in step.
test('the app custom data for a settlement booster parses on the callback', () => {
  const encoded = adCustomData({ kind: 'settlement_booster', sessionId: '8a2c0a16-3a4e-4d2f-9f0e-6c1b2f3a4b5c' });
  assert.deepEqual(parseAdCustomData(encoded), {
    v: 1,
    kind: 'settlement_booster',
    session_id: '8a2c0a16-3a4e-4d2f-9f0e-6c1b2f3a4b5c',
  });
  assert.equal(placementLabel({ kind: 'settlement_booster', sessionId: 'x' }), '기록 부스터');
});

test('the app custom data for the weekly box parses on the callback', () => {
  const encoded = adCustomData({ kind: 'weekly_box' });
  assert.deepEqual(parseAdCustomData(encoded), { v: 1, kind: 'weekly_box' });
  assert.equal(placementLabel({ kind: 'weekly_box' }), '주간 보너스 상자');
});
