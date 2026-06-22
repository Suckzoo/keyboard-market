const { test } = require('node:test');
const assert = require('node:assert');
const { renderCatalog, spliceCatalog, CATALOG_START, CATALOG_END } = require('../scripts/lib/render-catalog');

const base = (o) => ({ number: 1, id: '1', title: 'T', price: '1원', status: 'available', reserver: null, url: 'u', thumb: null, ...o });

test('renders a card with image, name, pid·price, status, issue link', () => {
  const html = renderCatalog([base({ number: 100, id: '100', title: 'PBTFans 1984', price: '50,000원', thumb: 'https://raw/thumbs/100.jpg', url: 'https://gh/100' })]);
  assert.match(html, /<table>/);
  assert.match(html, /<img src="https:\/\/raw\/thumbs\/100\.jpg" width="200">/);
  assert.match(html, /<b>PBTFans 1984<\/b>/);
  assert.match(html, /PID 100 · 50,000원/);
  assert.match(html, /🟢 구매 가능/);
  assert.match(html, /<a href="https:\/\/gh\/100">#100<\/a>/);
});

test('omits img tag when thumb is null', () => {
  const html = renderCatalog([base({ thumb: null })]);
  assert.doesNotMatch(html, /<img/);
});

test('shows reserver when present', () => {
  const html = renderCatalog([base({ status: 'reserved', reserver: 'octocat' })]);
  assert.match(html, /🟡 예약금 대기중 · @octocat/);
});

test('groups three cards per row and sorts by status then pid', () => {
  const html = renderCatalog([
    base({ number: 3, id: '3', status: 'paid' }),
    base({ number: 1, id: '1', status: 'available' }),
    base({ number: 2, id: '2', status: 'available' }),
    base({ number: 4, id: '4', status: 'available' }),
  ]);
  const rows = html.match(/<tr>/g) || [];
  assert.strictEqual(rows.length, 2); // 4 cards → 2 rows of 3
  // available(1,2,4) before paid(3): first cell is pid 1
  assert.ok(html.indexOf('PID 1 ') < html.indexOf('PID 3 '));
});

test('empty models render a placeholder, not a table', () => {
  assert.match(renderCatalog([]), /등록된 매물이 없습니다/);
});

test('spliceCatalog replaces only between markers; throws if missing', () => {
  const doc = `# 카탈로그\n${CATALOG_START}\nOLD\n${CATALOG_END}\n끝`;
  const out = spliceCatalog(doc, '새카드');
  assert.match(out, new RegExp(`${CATALOG_START}\\n새카드\\n${CATALOG_END}`));
  assert.doesNotMatch(out, /OLD/);
  assert.match(out, /끝/);
  assert.throws(() => spliceCatalog('no markers', 'x'), /CATALOG/);
});
