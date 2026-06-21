const { test } = require('node:test');
const assert = require('node:assert');
const { formatPriceWon, imagesForPid, prepareRow, PRICE_UNKNOWN } = require('../scripts/lib/listing-import');

test('formatPriceWon converts 만원 integer to won string with separators', () => {
  assert.strictEqual(formatPriceWon('15'), '150,000원');
  assert.strictEqual(formatPriceWon('85'), '850,000원');
  assert.strictEqual(formatPriceWon('4'), '40,000원');
});

test('formatPriceWon returns null for empty/blank price', () => {
  assert.strictEqual(formatPriceWon(''), null);
  assert.strictEqual(formatPriceWon('   '), null);
  assert.strictEqual(formatPriceWon(undefined), null);
});

test('imagesForPid matches files by exact pid prefix and sorts them', () => {
  const files = ['11_2cx.jpg', '1_fb.jpg', '2_x.jpg', '15_b.jpg'];
  const base = 'https://raw/assets';
  assert.deepStrictEqual(imagesForPid('1', files, base), ['https://raw/assets/1_fb.jpg']);
});

test('imagesForPid returns all photos for a pid in sorted order', () => {
  const files = ['15_cjh2.jpg', '15_3vx.jpg', '15_cj.jpg', '5_a.jpg'];
  const base = 'https://raw/assets';
  assert.deepStrictEqual(imagesForPid('15', files, base), [
    'https://raw/assets/15_3vx.jpg',
    'https://raw/assets/15_cj.jpg',
    'https://raw/assets/15_cjh2.jpg',
  ]);
});

test('imagesForPid returns empty array when no photos match', () => {
  assert.deepStrictEqual(imagesForPid('99', ['1_a.jpg'], 'https://raw/assets'), []);
});

test('prepareRow formats a 만원 price into won', () => {
  const config = { csvMapping: { price: 'price' } };
  const row = { price: '15' };
  prepareRow(row, config);
  assert.strictEqual(row.price, '150,000원');
});

test('prepareRow uses the unified text for empty price and adds no 비고', () => {
  const config = { csvMapping: { price: 'price' } };
  const row = { price: '' };
  prepareRow(row, config);
  assert.strictEqual(row.price, PRICE_UNKNOWN);
  assert.strictEqual(row.price, '정보 확인이 어려워 적정 가격을 제시받고 있습니다');
  assert.strictEqual(row['비고'], undefined);
});
