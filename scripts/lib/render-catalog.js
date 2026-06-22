const { sortListings, STATUS_DISPLAY } = require('./render-board');

const CATALOG_START = '<!-- CATALOG:START -->';
const CATALOG_END = '<!-- CATALOG:END -->';
const COLUMNS = 3;

// One listing → an HTML card (table cell). GitHub strips style/class in cells,
// so only <img width>, <b>, <br>, <a> are used.
function card(m) {
  const img = m.thumb ? `<img src="${m.thumb}" width="200"><br>` : '';
  const id = m.id || String(m.number);
  const status = STATUS_DISPLAY[m.status] || '❔';
  const reserver = m.reserver ? ` · @${m.reserver}` : '';
  return `${img}<b>${m.title}</b><br>PID ${id} · ${m.price || '-'}<br>${status}${reserver}<br><a href="${m.url}">#${m.number}</a>`;
}

function renderCatalog(models) {
  const sorted = sortListings(models);
  if (sorted.length === 0) return '_등록된 매물이 없습니다._';
  const rows = [];
  for (let i = 0; i < sorted.length; i += COLUMNS) {
    const cells = sorted.slice(i, i + COLUMNS)
      .map((m) => `<td width="33%" valign="top" align="center">${card(m)}</td>`)
      .join('');
    rows.push(`<tr>${cells}</tr>`);
  }
  return `<table>\n${rows.join('\n')}\n</table>`;
}

function spliceCatalog(doc, html) {
  const start = doc.indexOf(CATALOG_START);
  const end = doc.indexOf(CATALOG_END);
  if (start === -1 || end === -1 || end < start) {
    throw new Error('CATALOG.md is missing CATALOG:START/CATALOG:END markers');
  }
  return `${doc.slice(0, start + CATALOG_START.length)}\n${html}\n${doc.slice(end)}`;
}

module.exports = { CATALOG_START, CATALOG_END, renderCatalog, spliceCatalog };
