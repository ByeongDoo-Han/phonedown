import assert from 'node:assert/strict';
import test from 'node:test';

import { LEGAL_UPDATED_AT, legalDocument, supportEmail }
  from '../src/features/legal/legalText.ts';

const terms = legalDocument('terms', 'help@example.test');
const privacy = legalDocument('privacy', 'help@example.test');

test('both documents exist with a date and sections', () => {
  assert.equal(terms.title, '이용약관');
  assert.equal(privacy.title, '개인정보처리방침');
  assert.equal(terms.updatedAt, LEGAL_UPDATED_AT);
  assert.ok(terms.sections.length >= 10);
  assert.ok(privacy.sections.length >= 8);
  // 계정 삭제가 다시 물어보는 문구가 약관에도 있어야 한다.
  assert.match(terms.sections.map((s) => s.body.join(' ')).join(' '), /탈퇴/);
});

test('the terms carry the numbers the app actually runs on', () => {
  const text = terms.sections.map((section) => `${section.title} ${section.body.join(' ')}`).join('\n');
  assert.match(text, /1시간에 2P/);
  assert.match(text, /주간 기본 상한 100P/);
  assert.match(text, /주간 80P/);
  assert.match(text, /20P/);
  assert.match(text, /300P/);
  assert.match(text, /월요일 00시/);
  assert.match(text, /1,400P/);
  assert.match(text, /1,000원은 1,400P/);
  assert.match(text, /40분/);
  assert.match(text, /20분/);
  assert.match(text, /12시간/);
  assert.match(text, /3시간/);
  assert.match(text, /10분 단위/);
});

test('the privacy policy says what is collected and what is not', () => {
  const text = privacy.sections.map((section) => `${section.title} ${section.body.join(' ')}`).join('\n');
  assert.match(text, /이메일/);
  assert.match(text, /휴대전화 번호/);
  assert.match(text, /AdMob/);
  assert.match(text, /위치·연락처·사진·카메라·건강 정보는 받지 않습니다/);
  assert.match(text, /즉시 지워집니다/);
  // 탈퇴 뒤 남는 것은 개인을 알아볼 수 없는 수량뿐이라는 점.
  assert.match(text, /개인을 알아볼 수 없는 요약/);
  assert.match(text, /Supabase/);
});

test('both documents point at the support address they were given', () => {
  assert.match(terms.sections.at(-1).body[0], /help@example\.test/);
  assert.match(privacy.sections.at(-1).body[0], /help@example\.test/);
});

test('the support address comes from the environment, with the real inbox as the fallback', () => {
  assert.equal(supportEmail(' ops@offlinetime.app '), 'ops@offlinetime.app');
  assert.equal(supportEmail('not-an-email'), 'quden04@gmail.com');
  assert.equal(supportEmail(''), 'quden04@gmail.com');
  assert.equal(supportEmail(undefined), 'quden04@gmail.com');
});
