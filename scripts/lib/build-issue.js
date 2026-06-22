const { setMarker, MARKER } = require('./markers');
const { priceLine } = require('./pricing');

function buildIssue(row, config, opts = {}) {
  const map = config.csvMapping || {};
  const title = (map.title && row[map.title]) || '(제목 없음)';
  const id = (map.id && row[map.id]) || title;
  const price = (map.price && row[map.price]) || '';

  // Explicit image list (opts.images, e.g. matched by pid) wins; otherwise fall
  // back to the single image column from the CSV row.
  let images = Array.isArray(opts.images) ? opts.images.filter(Boolean) : [];
  if (images.length === 0) {
    const single = (map.image && row[map.image]) || '';
    if (single) images = [single];
  }

  const sections = [];
  // Visible PID so pid↔issue-number mapping works from the issue alone.
  sections.push(`PID: ${id}`);
  for (const url of images) {
    if (/^https?:\/\//.test(url)) sections.push(`![](${url})`);
  }
  if (price) sections.push(priceLine({ price }));
  if (map.notice && row[map.notice]) {
    sections.push(`> ⚠️ **주의사항:** ${row[map.notice]}`);
  }
  for (const col of map.body || []) {
    if (row[col]) sections.push(`**${col}:** ${row[col]}`);
  }
  if (opts.footer) sections.push(opts.footer);

  let body = sections.join('\n\n');
  body = setMarker(body, MARKER.listing, { id: String(id), name: title, price });
  body = setMarker(body, MARKER.state, { reserver: null, reservedAt: null, availableSince: null });

  return { title, body, labels: [config.labels.scope, config.labels.available] };
}

module.exports = { buildIssue };
