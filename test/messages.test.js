const { test } = require('node:test');
const assert = require('node:assert');
const m = require('../scripts/lib/messages');

const cfg = {
  keyword: '#구매신청', paidKeyword: '#입금완료', negotiateKeyword: '#네고희망', reservationHours: 3, depositInfo: 'BANK 123 (홍길동)',
  formBaseUrl: 'https://docs.google.com/forms/d/e/ID/viewform',
  formIssueEntryId: 'entry.111', formUserEntryId: 'entry.222',
};

test('buildFormUrl prefills issue number and user', () => {
  const url = m.buildFormUrl(cfg, 12, 'octocat');
  assert.match(url, /usp=pp_url/);
  assert.match(url, /entry\.111=12/);
  assert.match(url, /entry\.222=octocat/);
});

test('deadlineIso adds reservationHours', () => {
  const out = m.deadlineIso('2026-07-01T11:00:00.000Z', 3);
  assert.strictEqual(new Date(out).toISOString(), '2026-07-01T14:00:00.000Z');
});

test('formatKst renders an instant in Asia/Seoul', () => {
  assert.strictEqual(m.formatKst('2026-07-01T14:00:00.000Z'), '2026-07-01 23:00 (KST)');
});

test('reserveConfirmMessage deadline is shown in KST', () => {
  // reservedAt 11:00Z + 3h = 14:00Z = 23:00 KST
  const msg = m.reserveConfirmMessage(cfg, 12, 'octocat', '2026-07-01T11:00:00.000Z', '15,000원');
  assert.match(msg, /23:00 \(KST\)/);
});

test('reserveConfirmMessage mentions winner, deposit, form link', () => {
  const msg = m.reserveConfirmMessage(cfg, 12, 'octocat', '2026-07-01T11:00:00.000Z');
  assert.match(msg, /@octocat/);
  assert.match(msg, /BANK 123/);
  assert.match(msg, /entry\.111=12/);
});

test('reserveConfirmMessage instructs to leave the paid keyword comment', () => {
  const msg = m.reserveConfirmMessage(cfg, 12, 'octocat', '2026-07-01T11:00:00.000Z');
  assert.match(msg, /#입금완료/);
});

test('remindReserverMessage instructs to leave the paid keyword comment', () => {
  const msg = m.remindReserverMessage(cfg, 12, 'octocat', '2026-07-01T11:00:00.000Z');
  assert.match(msg, /#입금완료/);
});

test('reservationFooter includes steps, payment (deposit), and period', () => {
  const f = m.reservationFooter(cfg);
  assert.match(f, /예약 방법/);
  assert.match(f, /#구매신청/);
  assert.match(f, /#입금완료/);
  assert.match(f, /BANK 123/);      // depositInfo (입금 방법)
  assert.match(f, /예약 기간/);
});

test('reservationFooter covers the deposit, refund policy, and intake window', () => {
  const f = m.reservationFooter(cfg);
  assert.match(f, /예약금/);                // 예약금 안내
  assert.match(f, /10%/);                   // 물품 가액의 10%
  assert.match(f, /반환/);                  // 예약금 반환 정책
  assert.match(f, /시작 전|종료 후/);       // 접수 기간 정책
});

test('reservationFooter omits the visit-without-reservation section', () => {
  assert.doesNotMatch(m.reservationFooter(cfg), /예약 없이 참가/);
});

test('reserveConfirmMessage mentions the 10% deposit', () => {
  const msg = m.reserveConfirmMessage(cfg, 12, 'octocat', '2026-07-01T11:00:00.000Z');
  assert.match(msg, /예약금/);
  assert.match(msg, /10%/);
});

test('reserveConfirmMessage includes the exact deposit amount when given', () => {
  const msg = m.reserveConfirmMessage(cfg, 12, 'octocat', '2026-07-01T11:00:00.000Z', '15,000원');
  assert.match(msg, /15,000원/);
  assert.match(msg, /예약금/);
});

test('negotiation/blocking messages exist', () => {
  assert.match(m.negotiateAckMessage(cfg, 120000), /120,000/);
  assert.match(m.negotiateRejectedFormatMessage(cfg), /#네고희망/);
  assert.match(m.negotiateNotAllowedMessage(), /네고/);
  assert.match(m.priceUnknownReserveMessage(cfg), /네고|가격 미정/);
  assert.match(m.reserveBlockedByNegotiationMessage(), /네고/);
});

test('reservationFooter mentions negotiation', () => {
  assert.match(m.reservationFooter(cfg), /네고|#네고희망/);
});

test('reservationFooter notes price-unknown items are negotiation-only', () => {
  assert.match(m.reservationFooter(cfg), /가격 미정/);
});

test('paidConfirmedMessage confirms the reservation', () => {
  assert.match(m.paidConfirmedMessage(cfg), /확정|입금.*확인|판매 완료/);
});

test('notOpenMessage includes openAt', () => {
  assert.match(m.notOpenMessage({ ...cfg, openAt: '2026-07-01T20:00:00+09:00' }), /2026-07-01/);
});
