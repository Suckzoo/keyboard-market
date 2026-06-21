const { test } = require('node:test');
const assert = require('node:assert');
const { decideSweep } = require('../scripts/lib/decide-sweep');
const config = { reservationHours: 3, labels: {} };

test('expired when reserved older than 3h', () => {
  const r = decideSweep({ status: 'reserved', reservedAt: '2026-07-01T11:00:00Z', config, now: new Date('2026-07-01T14:00:01Z') });
  assert.strictEqual(r.expired, true);
});
test('not expired within 3h', () => {
  const r = decideSweep({ status: 'reserved', reservedAt: '2026-07-01T11:00:00Z', config, now: new Date('2026-07-01T13:59:00Z') });
  assert.strictEqual(r.expired, false);
});
test('not expired when not reserved', () => {
  const r = decideSweep({ status: 'available', reservedAt: null, config, now: new Date('2026-07-02T00:00:00Z') });
  assert.strictEqual(r.expired, false);
});
test('not expired when payment claimed (#입금완료)', () => {
  const r = decideSweep({ status: 'reserved', reservedAt: '2026-07-01T11:00:00Z', paidClaimedAt: '2026-07-01T11:30:00Z', config, now: new Date('2026-07-01T20:00:00Z') });
  assert.strictEqual(r.expired, false);
});
