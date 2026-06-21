const { test } = require('node:test');
const assert = require('node:assert');
const { deriveStatus } = require('../scripts/lib/state');

const cfg = { labels: { scope: '매물', available: '구매 가능', reserved: '예약금 대기중', paid: '입금 확인 완료' } };

test('paid wins over reserved and available', () => {
  assert.strictEqual(deriveStatus(['매물', '구매 가능', '입금 확인 완료'], cfg), 'paid');
});
test('reserved when reserved label present', () => {
  assert.strictEqual(deriveStatus(['매물', '예약금 대기중'], cfg), 'reserved');
});
test('available by default', () => {
  assert.strictEqual(deriveStatus(['매물', '구매 가능'], cfg), 'available');
});
test('unknown when no status label', () => {
  assert.strictEqual(deriveStatus(['매물'], cfg), 'unknown');
});
