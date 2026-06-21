const { test } = require('node:test');
const assert = require('node:assert');
const { decideComment } = require('../scripts/lib/decide-comment');

const config = {
  openAt: '2026-07-01T11:00:00.000Z', keyword: '#구매신청', reservationHours: 3,
  depositInfo: 'BANK', formBaseUrl: 'https://f', formIssueEntryId: 'entry.1', formUserEntryId: 'entry.2',
  labels: { scope: '매물', available: '구매 가능', reserved: '예약금 대기중', paid: '입금 확인 완료' },
};
const base = { issueNumber: 12, commenter: 'alice', issueBody: 'desc', config };

test('ignores comment without keyword', () => {
  const r = decideComment({ ...base, commentBody: '질문 있어요', labelNames: ['매물', '구매 가능'],
    comments: [], now: new Date('2026-07-01T12:00:00Z') });
  assert.strictEqual(r.action, 'ignore');
});

test('rejects before openAt', () => {
  const r = decideComment({ ...base, commentBody: '#구매신청', labelNames: ['매물', '구매 가능'],
    comments: [{ author: 'alice', body: '#구매신청', createdAt: '2026-07-01T10:00:00Z' }],
    now: new Date('2026-07-01T10:00:00Z') });
  assert.strictEqual(r.action, 'comment_only');
  assert.match(r.comment, /아직 열리지 않았습니다/);
});

test('rejects when already sold', () => {
  const r = decideComment({ ...base, commentBody: '#구매신청', labelNames: ['매물', '입금 확인 완료'],
    comments: [], now: new Date('2026-07-01T12:00:00Z') });
  assert.match(r.comment, /판매 완료/);
});

test('reserved + other commenter -> already reserved', () => {
  const issueBody = 'desc\n<!-- market-state: {"reserver":"bob","reservedAt":"2026-07-01T11:30:00Z","availableSince":null} -->';
  const r = decideComment({ ...base, commentBody: '#구매신청', labelNames: ['매물', '예약금 대기중'], issueBody,
    comments: [], now: new Date('2026-07-01T12:00:00Z') });
  assert.match(r.comment, /이미 예약 진행 중/);
});

test('reserved + same reserver -> remind with form link', () => {
  const issueBody = 'desc\n<!-- market-state: {"reserver":"alice","reservedAt":"2026-07-01T11:30:00Z","availableSince":null} -->';
  const r = decideComment({ ...base, commentBody: '#구매신청', labelNames: ['매물', '예약금 대기중'], issueBody,
    comments: [], now: new Date('2026-07-01T12:00:00Z') });
  assert.strictEqual(r.action, 'comment_only');
  assert.match(r.comment, /이미 예약 상태/);
});

test('available + open -> reserves earliest keyword commenter, not the trigger', () => {
  const comments = [
    { author: 'carol', body: '먼저 #구매신청 합니다', createdAt: '2026-07-01T11:00:01Z' },
    { author: 'alice', body: '#구매신청', createdAt: '2026-07-01T11:00:03Z' },
  ];
  const r = decideComment({ ...base, commenter: 'alice', commentBody: '#구매신청',
    labelNames: ['매물', '구매 가능'], comments, now: new Date('2026-07-01T11:00:03Z') });
  assert.strictEqual(r.action, 'reserve');
  assert.strictEqual(r.winner, 'carol');
  assert.strictEqual(r.reservedAt, '2026-07-01T11:00:01Z');
  assert.match(r.comment, /@carol/);
});

test('available + open -> ignores bot-authored keyword comments as candidates', () => {
  const comments = [
    { author: 'github-actions[bot]', body: `다시 #구매신청 가능`, createdAt: '2026-07-01T11:00:01Z' },
    { author: 'alice', body: '#구매신청', createdAt: '2026-07-01T11:00:03Z' },
  ];
  const r = decideComment({ ...base, commenter: 'alice', commentBody: '#구매신청',
    labelNames: ['매물', '구매 가능'], comments, now: new Date('2026-07-01T11:00:03Z') });
  assert.strictEqual(r.winner, 'alice');
});

test('reopened round uses availableSince as the first-come baseline', () => {
  const issueBody = 'desc\n<!-- market-state: {"reserver":null,"reservedAt":null,"availableSince":"2026-07-01T15:00:00Z"} -->';
  const comments = [
    { author: 'old', body: '#구매신청', createdAt: '2026-07-01T11:00:00Z' }, // 이전 라운드, 무시
    { author: 'newbie', body: '#구매신청', createdAt: '2026-07-01T15:00:05Z' },
  ];
  const r = decideComment({ ...base, commenter: 'newbie', commentBody: '#구매신청',
    labelNames: ['매물', '구매 가능'], issueBody, comments, now: new Date('2026-07-01T15:00:05Z') });
  assert.strictEqual(r.winner, 'newbie');
});
