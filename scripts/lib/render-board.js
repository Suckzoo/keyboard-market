const BOARD_START = '<!-- BOARD:START -->';
const BOARD_END = '<!-- BOARD:END -->';
const STATUS_DISPLAY = {
  available: '🟢 구매 가능',
  reserved: '🟡 예약금 대기중',
  paid: '✅ 판매 완료',
  unknown: '❔',
};
const STATUS_ORDER = { available: 0, reserved: 1, paid: 2, unknown: 3 };

// Issues tagged "[Test Purpose]" in their title are live test fixtures kept in
// the repo for rehearsing on production; they are hidden from the public board.
function isTestPurpose(title) {
  return typeof title === 'string' && title.includes('[Test Purpose]');
}

function sortListings(models) {
  return [...models].sort((a, b) => {
    const d = STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
    return d !== 0 ? d : a.number - b.number;
  });
}

function renderTable(models) {
  const header = '| 번호 | 매물 | 가격 | 상태 | 예약자 | 이슈 |\n|---|---|---|---|---|---|';
  const rows = models.map((m) => {
    const reserver = m.reserver ? `@${m.reserver}` : '-';
    const price = m.price || '-';
    const id = m.id || String(m.number);
    return `| ${id} | ${m.title} | ${price} | ${STATUS_DISPLAY[m.status] || '❔'} | ${reserver} | [#${m.number}](${m.url}) |`;
  });
  return [header, ...rows].join('\n');
}

// Full board = table + a 비고 section listing distinct notes below it.
function renderBoard(models) {
  const table = renderTable(models);
  const notes = [...new Set(models.map((m) => m.note).filter(Boolean))];
  if (notes.length === 0) return table;
  const noteLines = notes.map((n) => `- ${n}`).join('\n');
  return `${table}\n\n**비고**\n${noteLines}`;
}

function spliceBoard(readme, tableMarkdown) {
  const start = readme.indexOf(BOARD_START);
  const end = readme.indexOf(BOARD_END);
  if (start === -1 || end === -1 || end < start) {
    throw new Error('README is missing BOARD:START/BOARD:END markers');
  }
  const before = readme.slice(0, start + BOARD_START.length);
  const after = readme.slice(end);
  return `${before}\n${tableMarkdown}\n${after}`;
}

module.exports = { BOARD_START, BOARD_END, STATUS_DISPLAY, isTestPurpose, sortListings, renderTable, renderBoard, spliceBoard };
