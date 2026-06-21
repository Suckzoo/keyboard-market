const { setMarker, MARKER } = require('./markers');

function buildIssue(row, config) {
  const map = config.csvMapping || {};
  const title = (map.title && row[map.title]) || '(제목 없음)';
  const id = (map.id && row[map.id]) || title;
  const price = (map.price && row[map.price]) || '';
  const image = (map.image && row[map.image]) || '';

  const sections = [];
  if (image && /^https?:\/\//.test(image)) sections.push(`![](${image})`);
  for (const col of map.body || []) {
    if (row[col]) sections.push(`**${col}:** ${row[col]}`);
  }
  if (price) sections.push(`**가격:** ${price}`);

  let body = sections.join('\n\n');
  body = setMarker(body, MARKER.listing, { id: String(id), name: title, price });
  body = setMarker(body, MARKER.state, { reserver: null, reservedAt: null, availableSince: null });

  return { title, body, labels: [config.labels.scope, config.labels.available] };
}

module.exports = { buildIssue };
