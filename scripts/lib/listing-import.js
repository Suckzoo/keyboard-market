// Pure helpers for importing the real keyboard listings.
// Price in the CSV is in 만원 (×10,000 KRW); photos are matched to a listing by
// the `{pid}_...` filename prefix.

const PRICE_UNKNOWN = '정보 확인이 어려워 적정 가격을 제시받고 있습니다';

function formatPriceWon(rawManwon) {
  if (rawManwon === undefined || rawManwon === null) return null;
  const trimmed = String(rawManwon).trim();
  if (trimmed === '') return null;
  const won = Number(trimmed) * 10000;
  return `${won.toLocaleString('en-US')}원`;
}

function imagesForPid(pid, filenames, baseUrl) {
  const prefix = `${pid}_`;
  return (filenames || [])
    .filter((f) => f.startsWith(prefix))
    .sort()
    .map((f) => `${baseUrl}/${f}`);
}

// Format the listing's price in place: 만원 → 원, or a unified notice when blank.
function prepareRow(row, config) {
  const map = config.csvMapping;
  row[map.price] = formatPriceWon(row[map.price]) || PRICE_UNKNOWN;
  return row;
}

module.exports = { formatPriceWon, imagesForPid, prepareRow, PRICE_UNKNOWN };
