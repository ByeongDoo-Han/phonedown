// 저장소 루트 docs/의 공개 고지 페이지(App Store Connect·Google Play에 넣는 주소)가
// 앱 안 문구와 같은 숫자·같은 말을 담고 있는지, 안의 링크가 실제로 열리는지 확인한다.
//
// 정책 숫자를 바꾸면 src/features/legal/legalText.ts와 docs/*.html을 함께 고쳐야 한다.

import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import test from 'node:test';

import { LEGAL_UPDATED_AT, legalDocument } from '../src/features/legal/legalText.ts';

const docsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../docs');

const pages = ['index.html', 'privacy.html', 'terms.html', 'account-deletion.html'];
const html = Object.fromEntries(
  pages.map((name) => [name, readFileSync(path.join(docsDir, name), 'utf8')]),
);

const textOf = (name) => html[name]
  .replace(/<script[\s\S]*?<\/script>/gi, ' ')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;/g, ' ')
  .replace(/\s+/g, ' ');

test('공개 고지 페이지는 레포 루트 docs/에 있고 GitHub Pages가 그대로 서빙할 수 있다', () => {
  for (const name of pages) {
    assert.match(html[name], /^<!doctype html>/i, `${name}: doctype`);
    assert.match(html[name], /<html lang="ko">/, `${name}: lang`);
    assert.match(html[name], /<meta name="viewport"/, `${name}: viewport`);
    assert.match(html[name], /<title>[^<]+<\/title>/, `${name}: title`);
    assert.match(html[name], /href="assets\/legal.css"/, `${name}: 공통 스타일`);
  }
  // Jekyll 처리를 끄지 않으면 밑줄로 시작하는 파일이 누락될 수 있다.
  assert.ok(readdirSync(docsDir).includes('.nojekyll'), '.nojekyll');
});

test('모든 내부 링크와 앵커가 실제로 열린다', () => {
  const ids = Object.fromEntries(pages.map((name) => [
    name,
    new Set([...html[name].matchAll(/\sid="([^"]+)"/g)].map((match) => match[1])),
  ]));

  for (const name of pages) {
    const hrefs = [...html[name].matchAll(/href="([^"]+)"/g)].map((match) => match[1]);
    for (const href of hrefs) {
      if (href.startsWith('mailto:') || href.startsWith('https://')) continue;
      const [target, hash] = href.split('#');
      const targetName = target === '' ? name : target;
      if (!pages.includes(targetName)) {
        // 스타일시트 같은 정적 파일은 실제로 있는지만 본다.
        assert.ok(existsSync(path.join(docsDir, targetName)), `${name}: 없는 파일 ${href}`);
        continue;
      }
      if (hash) {
        assert.ok(ids[targetName].has(hash), `${name}: ${targetName}#${hash} 앵커가 없다`);
      }
    }
  }
});

test('공개 페이지는 앱 안 약관과 같은 문의 주소를 쓴다', () => {
  const email = legalDocument('terms').sections.at(-1).body[0].match(/[\w.+-]+@[\w.-]+/)[0];
  for (const name of pages) {
    assert.match(html[name], new RegExp(`mailto:${email.replace('.', '\\.')}`), `${name}: ${email}`);
  }
});

test('이용약관 페이지가 앱과 같은 숫자·조항을 담는다', () => {
  const text = textOf('terms.html');
  const appTerms = legalDocument('terms', 'help@example.test');
  for (const section of appTerms.sections) {
    assert.ok(text.includes(section.title), `약관 조항 누락: ${section.title}`);
  }
  for (const needle of ['1시간에 2P', '주간 기본 상한 100P', '주간 80P', '20P', '300P',
    '월요일 00시', '1,400P', '1,000원은 1,400P', '40분', '20분', '12시간', '3시간', '10분 단위']) {
    assert.ok(text.includes(needle), `약관 숫자 누락: ${needle}`);
  }
  assert.ok(text.includes(`최종 수정 ${LEGAL_UPDATED_AT}`), '약관 최종 수정일');
});

test('개인정보처리방침 페이지가 앱과 같은 수집·파기 문구를 담는다', () => {
  const text = textOf('privacy.html');
  const appPrivacy = legalDocument('privacy', 'help@example.test');
  for (const section of appPrivacy.sections) {
    assert.ok(text.includes(section.title), `방침 조항 누락: ${section.title}`);
  }
  for (const needle of ['위치·연락처·사진·카메라·건강 정보는 받지 않습니다', '즉시 지워집니다',
    '개인을 알아볼 수 없는 요약', 'Supabase', 'AdMob', '휴대전화 번호']) {
    assert.ok(text.includes(needle), `방침 문구 누락: ${needle}`);
  }
  assert.ok(text.includes(`최종 수정 ${LEGAL_UPDATED_AT}`), '방침 최종 수정일');
});

test('계정 삭제 안내가 심사 요건(앱 내 절차·즉시 삭제·이메일 요청)을 담는다', () => {
  const text = textOf('account-deletion.html');
  for (const needle of ['설정', '회원 탈퇴', '탈퇴하고 모든 기록 삭제', '유예 기간 없이',
    '발송 대기 중인 교환', '환급되지 않아요', 'quden04@gmail.com', '지체 없이',
    '개인을 알아볼 수 없는 요약', '복구할 수 없']) {
    assert.ok(text.includes(needle), `삭제 안내 문구 누락: ${needle}`);
  }
  // Google Play가 요구하는 "앱 안에서 지우는 단계"와 "앱 밖에서 요청하는 방법"이 각각 앵커를 가진다.
  assert.match(html['account-deletion.html'], /<section id="in-app">/);
  assert.match(html['account-deletion.html'], /<section id="email">/);
});
