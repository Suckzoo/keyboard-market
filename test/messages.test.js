const { test } = require('node:test');
const assert = require('node:assert');
const m = require('../scripts/lib/messages');

const cfg = {
  keyword: '#구매신청', reservationHours: 3, depositInfo: 'BANK 123 (홍길동)',
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

test('notOpenMessage includes openAt', () => {
  assert.match(m.notOpenMessage({ ...cfg, openAt: '2026-07-01T20:00:00+09:00' }), /2026-07-01/);
});
