import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveRewardedUnit, testUnitWarning } from '../src/features/ads/adUnits.ts';

const TEST_UNIT = 'ca-app-pub-3940256099942544/5224354917';

test('a configured rewarded unit is used as is', () => {
  assert.deepEqual(resolveRewardedUnit(' ca-app-pub-9/1 ', TEST_UNIT),
    { unitId: 'ca-app-pub-9/1', test: false });
});

test('an empty unit falls back to the Google test unit', () => {
  assert.deepEqual(resolveRewardedUnit(undefined, TEST_UNIT), { unitId: TEST_UNIT, test: true });
  assert.deepEqual(resolveRewardedUnit('   ', TEST_UNIT), { unitId: TEST_UNIT, test: true });
});

test('a shipped build warns once about the test unit, development stays quiet', () => {
  assert.equal(testUnitWarning({ test: true, isDev: true }), null);
  assert.equal(testUnitWarning({ test: false, isDev: false }), null);
  assert.match(testUnitWarning({ test: true, isDev: false }), /EXPO_PUBLIC_ADMOB_REWARDED_UNIT_ID/);
});
