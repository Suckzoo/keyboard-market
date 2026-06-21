const { test } = require('node:test');
const assert = require('node:assert');
const { toListingModel } = require('../scripts/lib/listing-model');

const config = { labels: { scope: '매물', available: '구매 가능', reserved: '예약금 대기중', paid: '입금 확인 완료' } };

test('builds a model from an issue', () => {
  const issue = {
    number: 12, title: 'Keychron Q1', html_url: 'https://github.com/o/r/issues/12',
    labels: [{ name: '매물' }, { name: '예약금 대기중' }],
    body: '<!-- market-listing: {"price":"120,000"} -->\n<!-- market-state: {"reserver":"octocat","reservedAt":"x","availableSince":null} -->',
  };
  const m = toListingModel(issue, config);
  assert.strictEqual(m.number, 12);
  assert.strictEqual(m.title, 'Keychron Q1');
  assert.strictEqual(m.price, '120,000');
  assert.strictEqual(m.status, 'reserved');
  assert.strictEqual(m.reserver, 'octocat');
  assert.strictEqual(m.url, 'https://github.com/o/r/issues/12');
});
