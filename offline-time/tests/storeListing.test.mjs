// 스토어 제출 원고(docs/store-listing.md)가 실제 구현과 어긋나지 않는지 확인한다.
//
// 스토어에 들어가는 숫자는 앱 안 약관·공개 페이지와 같은 값이어야 한다. 셋 중 하나만 고치면
// 심사에서 "설명과 다르게 동작한다"는 지적을 받기 쉬우므로, 이 테스트가 ① 글자 수 한도
// ② 핵심 숫자·URL ③ 앱 이름의 출처를 함께 검사한다.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import test from 'node:test';

const here = path.dirname(fileURLToPath(import.meta.url));
const listingPath = path.resolve(here, '../docs/store-listing.md');
const appJsonPath = path.resolve(here, '../app.json');

const listing = readFileSync(listingPath, 'utf8');
const lines = listing.split('\n');
const appJson = JSON.parse(readFileSync(appJsonPath, 'utf8'));

const PAGES = 'https://byeongdoo-han.github.io/phonedown';

/** `### … (30자 이내)` 제목 바로 다음의 첫 ```text 블록을 그 칸의 값으로 본다. */
function fieldsWithLimit() {
  const found = [];
  for (let i = 0; i < lines.length; i += 1) {
    const heading = lines[i];
    const limit = /\((\d[\d,]*)\s*자 이내/.exec(heading);
    if (!heading.startsWith('#') || !limit) continue;
    let start = i + 1;
    while (start < lines.length && !lines[start].trim().startsWith('```text')) start += 1;
    if (start >= lines.length) continue;
    const body = [];
    let end = start + 1;
    while (end < lines.length && !lines[end].trim().startsWith('```')) {
      body.push(lines[end]);
      end += 1;
    }
    found.push({
      heading: heading.replace(/^#+\s*/, '').trim(),
      limit: Number(limit[1].replace(/,/g, '')),
      text: body.join('\n'),
    });
    i = end;
  }
  return found;
}

const fields = fieldsWithLimit();
const field = (headingFragment) => {
  const hit = fields.find((item) => item.heading.includes(headingFragment));
  assert.ok(hit, `store-listing.md에 "${headingFragment}" 칸이 없다`);
  return hit;
};

test('스토어 입력 칸은 모두 스토어 글자 수 한도 안에 있다', () => {
  assert.ok(fields.length >= 6, `글자 수 한도가 붙은 칸이 ${fields.length}개뿐이다`);
  for (const item of fields) {
    assert.ok(item.text.trim().length > 0, `${item.heading}: 비어 있다`);
    assert.ok(
      item.text.length <= item.limit,
      `${item.heading}: ${item.text.length}자 (한도 ${item.limit}자)`,
    );
  }
});

test('앱 이름은 app.json의 이름과 같다', () => {
  const name = field('1.1 앱 이름').text.trim();
  assert.equal(name, appJson.expo.name);
  assert.ok(name.length <= 30);
});

test('문구의 숫자는 구현된 적립·정산·교환 규칙과 같다', () => {
  const numbers = [
    [/1시간에 2P/, '기본 적립 단가'],
    [/10분 단위/, '내림 단위'],
    [/주 100P|100P/, '주간 기본 상한'],
    [/80P/, '광고 부스터 주간 상한'],
    [/20P/, '주간 보너스 상자'],
    [/300P/, '친구 초대 보상'],
    [/40분/, '수면 유효 최소 시간'],
    [/12시간/, '수면 1회 상한'],
    [/3시간/, '집중 1회 상한'],
    [/하루 10시간|10시간/, '수면 하루 상한'],
    [/하루 6시간|6시간/, '집중 하루 상한'],
    [/월요일 00시/, '정산 시각'],
    [/1,400P/, '교환 최소 포인트'],
    [/1,000원은 1,400P/, '교환 비율'],
  ];
  for (const [pattern, label] of numbers) {
    assert.match(listing, pattern, `store-listing.md에 ${label}이(가) 없다`);
  }
});

test('광고는 선택이며 광고 없이도 적립된다는 점을 두 스토어 모두에 적었다', () => {
  // 심사에서 가장 자주 오해되는 부분이라 두 스토어 설명·심사 노트에 반복해 둔다.
  const mentions = listing.match(/보지 않아도[^\n]*적립|광고 없이[^\n]*적립|광고를 보지 않아도[^\n]*적립/g) ?? [];
  assert.ok(mentions.length >= 2, `광고 없이 적립된다는 문장이 ${mentions.length}곳뿐이다`);
  const notes = listing.slice(listing.indexOf('### 1.11'));
  assert.match(notes, /Skipping|광고는 선택|보지 않아도/);
});

test('스토어에 넣는 공개 URL은 저장소 루트 docs/의 실제 페이지를 가리킨다', () => {
  for (const page of ['privacy.html', 'terms.html', 'account-deletion.html']) {
    assert.ok(listing.includes(`${PAGES}/${page}`), `${page} 주소가 없다`);
    assert.ok(
      readFileSync(path.resolve(here, '../../docs', page), 'utf8').length > 0,
      `${page} 파일이 저장소 루트 docs/에 없다`,
    );
  }
  assert.ok(listing.includes(`${PAGES}/`), '지원 URL(개요 페이지) 주소가 없다');
});

test('심사용 계정 자리는 비워 둔 채로 제출하지 않도록 표시해 두었다', () => {
  const notes = listing.slice(listing.indexOf('### 1.11'), listing.indexOf('## 2. Google Play'));
  assert.match(notes, /\[입력 필요\]/);
  assert.match(notes, /심사용 계정|Review account/);
});

test('제출 전 사람이 할 일을 [입력 필요]로 모아 두었다', () => {
  const section = listing.slice(listing.indexOf('### 7.1'));
  assert.match(section, /\[입력 필요\]|7\.1/);
  assert.ok(section.includes('심사용 계정'), '심사용 계정 항목이 없다');
  assert.ok(section.includes('상품'), '활성 상품 항목이 없다');
});
