const { test } = require('node:test');
const assert = require('node:assert');
const { sortListings, renderTable, renderBoard, spliceBoard, isTestPurpose, BOARD_START, BOARD_END } = require('../scripts/lib/render-board');

const models = [
  { id: '3', number: 14, title: 'Tofu60', price: '70,000', status: 'paid', reserver: 'hubot', url: 'u14' },
  { id: '1', number: 12, title: 'Keychron Q1', price: '120,000', status: 'available', reserver: null, url: 'u12' },
  { id: '2', number: 13, title: 'NK65', price: '90,000', status: 'reserved', reserver: 'octocat', url: 'u13' },
];

test('sortListings orders available, reserved, paid', () => {
  const order = sortListings(models).map((m) => m.number);
  assert.deepStrictEqual(order, [12, 13, 14]);
});

test('renderTable shows reserver as @handle or dash (no 비고 column)', () => {
  const md = renderTable(sortListings(models));
  assert.match(md, /\| ID \| 매물 \| 가격 \| 상태 \| 예약자 \| 이슈 \|/);
  assert.match(md, /\| 1 \| Keychron Q1 \| 120,000 \| 🟢 구매 가능 \| - \|/);
  assert.match(md, /@octocat/);
});

test('renderBoard appends a 비고 section below the table for notes', () => {
  const md = renderBoard([
    { id: '1', number: 3, title: 'A', price: '150,000원', note: '', status: 'available', reserver: null, url: 'u3' },
    {
      id: '7',
      number: 9,
      title: 'B',
      price: '가격 미정',
      note: '정확한 가격 정보 확인이 어려운 키보드는 적정 가격을 제안받아 확인 후 가격을 확정할 예정입니다.',
      status: 'available',
      reserver: null,
      url: 'u9',
    },
  ]);
  assert.match(md, /\| ID \| 매물 \| 가격 \| 상태 \| 예약자 \| 이슈 \|/); // table has no 비고 column
  assert.match(md, /\*\*비고\*\*/);
  assert.match(md, /정확한 가격 정보 확인이 어려운 키보드/);
});

test('renderBoard with no notes is just the table', () => {
  const md = renderBoard([{ id: '1', number: 3, title: 'A', price: '150,000원', note: '', status: 'available', reserver: null, url: 'u3' }]);
  assert.doesNotMatch(md, /비고/);
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
