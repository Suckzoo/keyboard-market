const { test } = require('node:test');
const assert = require('node:assert');
const { buildIssue } = require('../scripts/lib/build-issue');
const { readListing, readState } = require('../scripts/lib/markers');

const config = {
  csvMapping: { id: '번호', title: '매물명', price: '가격', image: '사진', body: ['상태', '설명'] },
  labels: { scope: '매물', available: '구매 가능', reserved: '예약금 대기중', paid: '입금 확인 완료' },
};

test('buildIssue maps title, price marker, labels, image, body fields', () => {
  const row = { 번호: '1', 매물명: 'Keychron Q1', 가격: '120,000', 사진: 'https://img/q1.png', 상태: 'A급', 설명: '거의 새것' };
  const out = buildIssue(row, config);
  assert.strictEqual(out.title, 'Keychron Q1');
  assert.deepStrictEqual(out.labels, ['매물', '구매 가능']);
  assert.match(out.body, /!\[\]\(https:\/\/img\/q1\.png\)/);  // image as markdown
  assert.match(out.body, /A급/);
  assert.match(out.body, /거의 새것/);
  const listing = readListing(out.body);
  assert.strictEqual(listing.id, '1');
  assert.strictEqual(listing.price, '120,000');
  assert.strictEqual(listing.name, 'Keychron Q1');
  assert.deepStrictEqual(readState(out.body), { reserver: null, reservedAt: null, availableSince: null, paidClaimedAt: null });
});

test('buildIssue tolerates missing optional columns', () => {
  const row = { 번호: '2', 매물명: 'NK65' };
  const out = buildIssue(row, config);
  assert.strictEqual(out.title, 'NK65');
  assert.strictEqual(readListing(out.body).id, '2');
});

test('buildIssue renders multiple images from opts.images', () => {
  const row = { 번호: '5', 매물명: 'Multi' };
  const out = buildIssue(row, config, { images: ['https://img/a.jpg', 'https://img/b.jpg'] });
  assert.match(out.body, /!\[\]\(https:\/\/img\/a\.jpg\)/);
  assert.match(out.body, /!\[\]\(https:\/\/img\/b\.jpg\)/);
});

test('opts.images takes precedence over single image column', () => {
  const row = { 번호: '6', 매물명: 'P', 사진: 'https://img/single.png' };
  const out = buildIssue(row, config, { images: ['https://img/multi.jpg'] });
  assert.match(out.body, /multi\.jpg/);
  assert.doesNotMatch(out.body, /single\.png/);
});

test('buildIssue writes the pid as visible content, not only in the hidden marker', () => {
  const row = { 번호: '42', 매물명: 'X' };
  const out = buildIssue(row, config);
  const visible = out.body.replace(/<!--[\s\S]*?-->/g, ''); // strip hidden markers
  assert.match(visible, /PID/);
  assert.match(visible, /42/);
});

test('buildIssue appends opts.footer before the hidden markers', () => {
  const row = { 번호: '8', 매물명: 'F' };
  const out = buildIssue(row, config, { footer: '## 예약 방법\n자세한 내용' });
  assert.match(out.body, /## 예약 방법/);
  // footer must come before the market-listing marker
  assert.ok(out.body.indexOf('예약 방법') < out.body.indexOf('market-listing'));
});

test('buildIssue renders 비고 body column when present', () => {
  const config2 = { ...config, csvMapping: { ...config.csvMapping, body: ['비고'] } };
  const row = { 번호: '7', 매물명: 'Q', 비고: '적정 가격 제시를 받습니다' };
  const out = buildIssue(row, config2);
  assert.match(out.body, /\*\*비고:\*\* 적정 가격 제시를 받습니다/);
});
