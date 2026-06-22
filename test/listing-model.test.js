const { test } = require('node:test');
const assert = require('node:assert');
const { toListingModel } = require('../scripts/lib/listing-model');
const { LEGACY_PRICE_UNKNOWN, PRICE_UNKNOWN } = require('../scripts/lib/listing-import');

const config = { labels: { scope: '매물', available: '구매 가능', reserved: '예약금 대기중', paid: '입금 확인 완료' } };

test('builds a model from an issue', () => {
  const issue = {
    number: 12, title: 'Keychron Q1', html_url: 'https://github.com/o/r/issues/12',
    labels: [{ name: '매물' }, { name: '예약금 대기중' }],
    body: '<!-- market-listing: {"price":"120,000"} -->\n<!-- market-state: {"reserver":"octocat","reservedAt":"x","availableSince":null} -->',
  };
  const m = toListingModel(issue, config);
  assert.strictEqual(m.number, 12);
  assert.strictEqual(m.id, '12');
  assert.strictEqual(m.title, 'Keychron Q1');
  assert.strictEqual(m.price, '120,000');
  assert.strictEqual(m.status, 'reserved');
  assert.strictEqual(m.reserver, 'octocat');
  assert.strictEqual(m.url, 'https://github.com/o/r/issues/12');
  assert.strictEqual(m.note, '');
});

test('price-unknown listing maps price to 가격 미정 with the note', () => {
  const issue = {
    number: 9, title: '9번', html_url: 'u',
    labels: [{ name: '매물' }, { name: '구매 가능' }],
    body: `<!-- market-listing: {"price":"${PRICE_UNKNOWN}"} -->`,
  };
  const m = toListingModel(issue, config);
  assert.strictEqual(m.id, '9');
  assert.strictEqual(m.price, '가격 미정');
  assert.strictEqual(m.note, PRICE_UNKNOWN);
});

test('negotiated listing shows negotiated price with 🤝 and legend note', () => {
  const { NEGOTIATED_EMOJI } = require('../scripts/lib/pricing');
  const issue = {
    number: 5, title: 'Q1', html_url: 'u',
    labels: [{ name: '매물' }, { name: '예약금 대기중' }],
    body: '<!-- market-listing: {"id":"5","price":"150,000원","negotiatedPrice":"120,000원"} -->',
  };
  const m = toListingModel(issue, config);
  assert.strictEqual(m.price, `120,000원 ${NEGOTIATED_EMOJI}`);
  assert.match(m.note, /네고/);
});

test('passes thumb from the listing marker', () => {
  const issue = {
    number: 100, title: 'PBTFans 1984', html_url: 'u',
    labels: [{ name: '매물' }, { name: '구매 가능' }],
    body: '<!-- market-listing: {"id":"100","price":"50,000원","thumb":"https://raw/thumbs/100.jpg"} -->',
  };
  assert.strictEqual(toListingModel(issue, config).thumb, 'https://raw/thumbs/100.jpg');
});

test('thumb is null when the marker has none', () => {
  const issue = {
    number: 9, title: '9', html_url: 'u',
    labels: [{ name: '매물' }, { name: '구매 가능' }],
    body: '<!-- market-listing: {"id":"9","price":"1원"} -->',
  };
  assert.strictEqual(toListingModel(issue, config).thumb, null);
});

test('legacy price-unknown marker still maps to 가격 미정 with the current note', () => {
  const issue = {
    number: 15, title: '15번', html_url: 'u',
    labels: [{ name: '매물' }, { name: '구매 가능' }],
    body: `<!-- market-listing: {"id":"15","price":"${LEGACY_PRICE_UNKNOWN}"} -->`,
  };
  const m = toListingModel(issue, config);
  assert.strictEqual(m.id, '15');
  assert.strictEqual(m.price, '가격 미정');
  assert.strictEqual(m.note, PRICE_UNKNOWN);
});
