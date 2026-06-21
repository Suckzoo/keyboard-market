const { test } = require('node:test');
const assert = require('node:assert');
const { formatPriceWon, imagesForPid } = require('../scripts/lib/listing-import');

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
