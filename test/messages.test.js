const { test } = require('node:test');
const assert = require('node:assert');
const m = require('../scripts/lib/messages');

const cfg = {
  keyword: '#구매신청', paidKeyword: '#입금완료', reservationHours: 3, depositInfo: 'BANK 123 (홍길동)',
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

test('reservationFooter covers full payment, intake window, and visit option', () => {
  const f = m.reservationFooter({ ...cfg, visitIssueUrl: 'https://x/issues/68' });
  assert.match(f, /전액/);                 // 물품 가액 전액 입금
  assert.match(f, /시작 전|종료 후/);       // 접수 기간 정책
  assert.match(f, /x\/issues\/68/);         // 예약 없이 참가 링크
});

test('reserveConfirmMessage mentions full payment', () => {
  assert.match(m.reserveConfirmMessage(cfg, 12, 'octocat', '2026-07-01T11:00:00.000Z'), /전액/);
});

test('notOpenMessage includes openAt', () => {
  assert.match(m.notOpenMessage({ ...cfg, openAt: '2026-07-01T20:00:00+09:00' }), /2026-07-01/);
});
