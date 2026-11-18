import assert from 'node:assert/strict';
import test from 'node:test';

import { challengeCondition, challengeProgressLabel, formatKrw, isReferralCode,
  normalizeReferralCode, referralFailText, referralShareMessage,
  segmentLabel } from '../src/features/growth/referralCode.ts';

// The server issues 8 uppercase hex characters. A friend may type spaces, dashes or lowercase.
test('a typed code is tidied to the server format', () => {
  assert.equal(normalizeReferralCode(' 3f7a-9c21 '), '3F7A9C21');
  assert.equal(normalizeReferralCode('3F7A9C21EXTRA'), '3F7A9C21');
  assert.equal(isReferralCode('3f7a9c21'), true);
  assert.equal(isReferralCode('3f7a9c2'), false);
  assert.equal(isReferralCode('ZZZZZZZZ'), false);
});

test('the share message carries the code and the reward', () => {
  const message = referralShareMessage('3f7a9c21', 300);
  assert.match(message, /3F7A9C21/);
  assert.match(message, /300P/);
  assert.match(message, /3일 연속/);
});

test('every rejected entry reason has plain Korean copy', () => {
  assert.match(referralFailText('own_code'), /내 초대 코드/);
  assert.match(referralFailText('unknown_code'), /찾지 못했어요/);
  assert.match(referralFailText('not_new'), /기록이 있는 계정/);
  assert.equal(referralFailText(undefined), referralFailText('unavailable'));
});

test('a challenge condition reads as one sentence', () => {
  assert.equal(
    challengeCondition({ mode: 'sleep', target_days: 5, min_minutes_per_day: 420,
      window_days: 7, consecutive: true }),
    '7일 안에 수면 7시간 이상을 5일 연속 기록');
  assert.equal(
    challengeCondition({ mode: 'focus', target_days: 2, min_minutes_per_day: 90,
      window_days: 7, consecutive: false }),
    '7일 안에 집중 90분 이상을 2일 기록');
});

test('challenge status copy covers progress, completion, and expiry', () => {
  assert.equal(challengeProgressLabel({ status: 'joined', progress_days: 2, target_days: 5,
    consecutive: true }), '2 / 5일 진행');
  assert.match(challengeProgressLabel({ status: 'completed', progress_days: 5, target_days: 5,
    consecutive: true }), /쿠폰/);
  assert.match(challengeProgressLabel({ status: 'expired', progress_days: 1, target_days: 5,
    consecutive: true }), /다시 참여/);
});

test('segment and money labels match the onboarding modes', () => {
  assert.equal(segmentLabel('sleep_recovery'), '수면·회복');
  assert.equal(segmentLabel('focus_growth'), '집중·자기개발');
  assert.equal(segmentLabel('both'), '모든 사용자');
  assert.equal(formatKrw(3000), '3,000원 상당');
  assert.equal(formatKrw(0), '');
});
