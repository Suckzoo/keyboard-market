const { test } = require('node:test');
const assert = require('node:assert');
const { decideNegotiation } = require('../scripts/lib/decide-negotiation');

const config = {
  negotiateKeyword: '#네고희망',
  labels: { scope: '매물', available: '구매 가능', reserved: '예약금 대기중', negotiating: '네고중', paid: '입금 확인 완료' },
};

test('ignores comment without the keyword', () => {
  assert.strictEqual(decideNegotiation({ commentBody: '안녕', labelNames: ['매물', '구매 가능'], config }).action, 'ignore');
});

test('comment_only on bad amount', () => {
  const r = decideNegotiation({ commentBody: '#네고희망 깎아줘', labelNames: ['매물', '구매 가능'], config });
  assert.strictEqual(r.action, 'comment_only');
});

test('negotiate_open on available', () => {
  const r = decideNegotiation({ commentBody: '#네고희망 120000', labelNames: ['매물', '구매 가능'], config });
  assert.strictEqual(r.action, 'negotiate_open');
  assert.strictEqual(r.amount, 120000);
});

test('negotiate_open on already negotiating', () => {
  const r = decideNegotiation({ commentBody: '#네고희망 100000', labelNames: ['매물', '네고중'], config });
  assert.strictEqual(r.action, 'negotiate_open');
});

test('comment_only(not allowed) on reserved/paid', () => {
  assert.strictEqual(decideNegotiation({ commentBody: '#네고희망 100000', labelNames: ['매물', '예약금 대기중'], config }).action, 'comment_only');
  assert.strictEqual(decideNegotiation({ commentBody: '#네고희망 100000', labelNames: ['매물', '입금 확인 완료'], config }).action, 'comment_only');
});

// Nego intake follows the same window as #구매신청: rejected before openAt and after closeAt.
const timedConfig = { ...config, openAt: '2026-06-24T03:00:00.000Z', closeAt: '2026-07-01T03:00:00.000Z' };

test('rejects nego before openAt (not negotiate_open)', () => {
  const r = decideNegotiation({ commentBody: '#네고희망 120000', labelNames: ['매물', '구매 가능'], config: timedConfig, now: new Date('2026-06-22T07:55:00.000Z') });
  assert.strictEqual(r.action, 'comment_only');
  assert.match(r.comment, /열리지 않았습니다/);
});

test('rejects nego after closeAt', () => {
  const r = decideNegotiation({ commentBody: '#네고희망 120000', labelNames: ['매물', '구매 가능'], config: timedConfig, now: new Date('2026-07-02T00:00:00.000Z') });
  assert.strictEqual(r.action, 'comment_only');
  assert.match(r.comment, /종료/);
});

test('before openAt wins over bad-amount format', () => {
  const r = decideNegotiation({ commentBody: '#네고희망 깎아줘', labelNames: ['매물', '구매 가능'], config: timedConfig, now: new Date('2026-06-22T07:55:00.000Z') });
  assert.strictEqual(r.action, 'comment_only');
  assert.match(r.comment, /열리지 않았습니다/);
});

test('negotiate_open within the open window', () => {
  const r = decideNegotiation({ commentBody: '#네고희망 120000', labelNames: ['매물', '구매 가능'], config: timedConfig, now: new Date('2026-06-25T00:00:00.000Z') });
  assert.strictEqual(r.action, 'negotiate_open');
  assert.strictEqual(r.amount, 120000);
});
