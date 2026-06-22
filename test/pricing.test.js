const { test } = require('node:test');
const assert = require('node:assert');
const { PRICE_UNKNOWN } = require('../scripts/lib/listing-import');
const p = require('../scripts/lib/pricing');

test('isUnknownPrice detects the unknown sentence', () => {
  assert.strictEqual(p.isUnknownPrice(PRICE_UNKNOWN), true);
  assert.strictEqual(p.isUnknownPrice('150,000원'), false);
});

test('formatWon formats with separators and 원', () => {
  assert.strictEqual(p.formatWon(12000), '12,000원');
});

test('effectivePrice prefers negotiatedPrice, null for unknown/unset', () => {
  assert.strictEqual(p.effectivePrice({ price: '150,000원' }), '150,000원');
  assert.strictEqual(p.effectivePrice({ price: '150,000원', negotiatedPrice: '120,000원' }), '120,000원');
  assert.strictEqual(p.effectivePrice({ price: PRICE_UNKNOWN }), null);
  assert.strictEqual(p.effectivePrice({}), null);
});

test('priceLine renders normal, negotiated, unknown', () => {
  assert.strictEqual(p.priceLine({ price: '150,000원' }), '**가격:** 150,000원');
  assert.strictEqual(p.priceLine({ price: '150,000원', negotiatedPrice: '120,000원' }), '**가격:** ~~150,000원~~ → 120,000원 🤝');
  assert.strictEqual(p.priceLine({ price: PRICE_UNKNOWN, negotiatedPrice: '120,000원' }), '**가격:** 120,000원 🤝');
  assert.strictEqual(p.priceLine({ price: PRICE_UNKNOWN }), `**가격:** ${PRICE_UNKNOWN}`);
});

test('boardPrice marks negotiated and 가격 미정', () => {
  assert.deepStrictEqual(p.boardPrice({ price: '150,000원' }), { price: '150,000원', negotiated: false });
  assert.deepStrictEqual(p.boardPrice({ price: '150,000원', negotiatedPrice: '120,000원' }), { price: '120,000원 🤝', negotiated: true });
  assert.deepStrictEqual(p.boardPrice({ price: PRICE_UNKNOWN }), { price: '가격 미정', negotiated: false });
});

test('depositAmount is 10% of the price digits', () => {
  assert.strictEqual(p.depositAmount('150,000원'), '15,000원');
  assert.strictEqual(p.depositAmount('120,000원 🤝'), '12,000원');
  assert.strictEqual(p.depositAmount('가격 미정'), null);
});
