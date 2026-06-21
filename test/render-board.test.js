const { test } = require('node:test');
const assert = require('node:assert');
const { sortListings, renderTable, spliceBoard, BOARD_START, BOARD_END } = require('../scripts/lib/render-board');

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
  assert.match(md, /\| Keychron Q1 \| 120,000 \| 🟢 구매 가능 \| - \|/);
  assert.match(md, /@octocat/);
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
