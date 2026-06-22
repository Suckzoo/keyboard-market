const { test } = require('node:test');
const assert = require('node:assert');
const { planKeycapPhotos } = require('../scripts/lib/keycap-photos');

const config = { csvMapping: { id: 'pid', photoLinks: '사진 링크' } };

test('maps pid>=100 rows to {pid}_{n}.jpg, dedupes within a cell', () => {
  const rows = [
    { pid: '100', '사진 링크': 'a.jpg' },
    { pid: '108', '사진 링크': 'b.jpg\nb.jpg' },           // 중복 → 1개
    { pid: '109', '사진 링크': 'c.jpg\nd.jpg' },           // 2개
  ];
  assert.deepStrictEqual(planKeycapPhotos(rows, config), [
    { pid: '100', source: 'a.jpg', dest: '100_1.jpg' },
    { pid: '108', source: 'b.jpg', dest: '108_1.jpg' },
    { pid: '109', source: 'c.jpg', dest: '109_1.jpg' },
    { pid: '109', source: 'd.jpg', dest: '109_2.jpg' },
  ]);
});

test('ignores keyboards (pid<100) and empty photo cells', () => {
  const rows = [
    { pid: '1', '사진 링크': '' },
    { pid: '50', '사진 링크': 'x.jpg' },
    { pid: '110', '사진 링크': '' },
  ];
  assert.deepStrictEqual(planKeycapPhotos(rows, config), []);
});
