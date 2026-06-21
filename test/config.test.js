const { test } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { loadConfig, validateConfig } = require('../scripts/lib/config');

test('loadConfig reads the repo config.json', () => {
  const cfg = loadConfig(path.join(__dirname, '..', 'config.json'));
  assert.strictEqual(cfg.keyword, '#구매신청');
  assert.strictEqual(cfg.labels.available, '구매 가능');
  assert.strictEqual(cfg.reservationHours, 3);
});

test('validateConfig throws when a required key is missing', () => {
  const bad = { keyword: '#구매신청' };
  assert.throws(() => validateConfig(bad), /openAt/);
});

test('validateConfig returns the config when valid', () => {
  const good = {
    openAt: '2026-07-01T20:00:00+09:00', keyword: '#구매신청', reservationHours: 3,
    depositInfo: 'x', formBaseUrl: 'https://f',
    labels: { scope: '매물', available: '구매 가능', reserved: '예약금 대기중', paid: '입금 확인 완료' },
  };
  assert.strictEqual(validateConfig(good), good);
});
