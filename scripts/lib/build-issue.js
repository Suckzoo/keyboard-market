const { setMarker, MARKER } = require('./markers');

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
  for (const url of images) {
    if (/^https?:\/\//.test(url)) sections.push(`![](${url})`);
  }
  if (price) sections.push(`**가격:** ${price}`);
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
