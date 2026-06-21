// Pure helpers for importing the real keyboard listings.
// Price in the CSV is in 만원 (×10,000 KRW); photos are matched to a listing by
// the `{pid}_...` filename prefix.

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

module.exports = { formatPriceWon, imagesForPid };
