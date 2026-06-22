const { test } = require('node:test');
const assert = require('node:assert');
const { thumbPlan } = require('../scripts/lib/thumbs');

test('picks the first sorted photo per pid', () => {
  const files = ['100_2.jpg', '100_1.jpg', '1_fb.jpg', '21_zxch3.jpg'];
  assert.deepStrictEqual(thumbPlan(files), [
    { pid: '1', source: '1_fb.jpg', dest: '1.jpg' },
    { pid: '21', source: '21_zxch3.jpg', dest: '21.jpg' },
    { pid: '100', source: '100_1.jpg', dest: '100.jpg' },
  ]);
});

test('ignores files without a {pid}_ prefix', () => {
  assert.deepStrictEqual(thumbPlan(['kakaopay-qr.jpeg', 'README']), []);
});
