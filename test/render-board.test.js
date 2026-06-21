const { test } = require('node:test');
const assert = require('node:assert');
const { sortListings, renderTable, spliceBoard, isTestPurpose, BOARD_START, BOARD_END } = require('../scripts/lib/render-board');

const models = [
  { number: 14, title: 'Tofu60', price: '70,000', status: 'paid', reserver: 'hubot', url: 'u14' },
  { number: 12, title: 'Keychron Q1', price: '120,000', status: 'available', reserver: null, url: 'u12' },
  { number: 13, title: 'NK65', price: '90,000', status: 'reserved', reserver: 'octocat', url: 'u13' },
];

test('sortListings orders available, reserved, paid', () => {
  const order = sortListings(models).map((m) => m.number);
  assert.deepStrictEqual(order, [12, 13, 14]);
});

test('renderTable shows reserver as @handle or dash', () => {
  const md = renderTable(sortListings(models));
  assert.match(md, /\| Keychron Q1 \| 120,000 \| - \| 🟢 구매 가능 \| - \|/);
  assert.match(md, /@octocat/);
});

test('renderTable shows the note in a 비고 column', () => {
  const md = renderTable([{ number: 9, title: 'X', price: '가격 문의', note: '협의 필요', status: 'available', reserver: null, url: 'u' }]);
  assert.match(md, /\| X \| 가격 문의 \| 협의 필요 \| 🟢 구매 가능 \| - \|/);
});

test('spliceBoard replaces only between markers', () => {
  const readme = `# 장터\n안내\n${BOARD_START}\nOLD\n${BOARD_END}\n끝`;
  const out = spliceBoard(readme, '새표');
  assert.match(out, /안내/);
  assert.match(out, /끝/);
  assert.match(out, new RegExp(`${BOARD_START}\\n새표\\n${BOARD_END}`));
  assert.doesNotMatch(out, /OLD/);
});

test('spliceBoard throws when markers absent', () => {
  assert.throws(() => spliceBoard('no markers', 'x'), /BOARD/);
});

test('isTestPurpose flags titles tagged [Test Purpose]', () => {
  assert.strictEqual(isTestPurpose('[Test Purpose] Keychron Q1'), true);
  assert.strictEqual(isTestPurpose('[Test Purpose]'), true);
  assert.strictEqual(isTestPurpose('Keychron Q1 화이트'), false);
  assert.strictEqual(isTestPurpose(''), false);
  assert.strictEqual(isTestPurpose(undefined), false);
});
