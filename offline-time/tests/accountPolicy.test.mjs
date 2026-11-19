import assert from 'node:assert/strict';
import test from 'node:test';

import { canConfirmDeletion, DELETION_CONFIRM_WORD, DELETION_CONSEQUENCES,
  deletionFailureText, pendingRedemptionWarning } from '../src/features/account/accountPolicy.ts';

test('deleting needs the word typed exactly', () => {
  assert.equal(DELETION_CONFIRM_WORD, '탈퇴');
  assert.equal(canConfirmDeletion('탈퇴'), true);
  assert.equal(canConfirmDeletion('  탈퇴 '), true);
  assert.equal(canConfirmDeletion('탈퇴할래'), false);
  assert.equal(canConfirmDeletion(''), false);
  assert.equal(canConfirmDeletion('delete'), false);
});

test('the confirmation lists every loss before the button is enabled', () => {
  assert.ok(DELETION_CONSEQUENCES.length >= 3);
  const all = DELETION_CONSEQUENCES.join(' ');
  assert.match(all, /기록/);
  assert.match(all, /포인트/);
  assert.match(all, /교환/);
  assert.match(all, /쿠폰/);
});

test('a pending shipment is called out, an empty list is not', () => {
  assert.equal(pendingRedemptionWarning(0), null);
  assert.equal(pendingRedemptionWarning(-1), null);
  assert.equal(pendingRedemptionWarning(Number.NaN), null);
  assert.match(pendingRedemptionWarning(2), /2건/);
  assert.match(pendingRedemptionWarning(1), /환급되지 않아요/);
});

test('deletion failures are explained by status', () => {
  assert.match(deletionFailureText(401), /로그인/);
  assert.match(deletionFailureText(503), /준비/);
  assert.equal(deletionFailureText(null), '탈퇴를 마치지 못했어요. 연결을 확인하고 다시 시도해 주세요.');
});
