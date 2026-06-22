const { test } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { makeFakeGithub } = require('./helpers/fake-github');
const run = require('../scripts/handle-comment');

const configPath = path.join(__dirname, 'fixtures', 'config.test.json');

function ctx({ body, login, labels, issueBody, number = 12 }) {
  return {
    repo: { owner: 'Suckzoo', repo: 'keyboard-market' },
    payload: {
      comment: { body, user: { login } },
      issue: { number, body: issueBody, labels: labels.map((name) => ({ name })) },
    },
  };
}

test('reserve flow: adds reserved label, removes available, writes marker, comments', async () => {
  const comments = [{ user: { login: 'alice' }, body: '#구매신청', created_at: '2026-07-01T11:00:01Z' }];
  const { github, calls } = makeFakeGithub({ comments });
  const issueBody = 'desc\n<!-- market-listing: {"price":"150,000원"} -->';
  const context = ctx({ body: '#구매신청', login: 'alice', labels: ['매물', '구매 가능'], issueBody });
  const r = await run({ github, context, configPath, now: new Date('2026-07-01T11:00:01Z') });

  assert.strictEqual(r.action, 'reserve');
  const names = calls.map((c) => c[0]);
  assert.ok(names.includes('addLabels'));
  assert.ok(names.includes('removeLabel'));
  assert.ok(names.includes('update'));      // marker written to body
  assert.ok(names.includes('createComment'));
  const update = calls.find((c) => c[0] === 'update')[1];
  assert.match(update.body, /market-state/);
  assert.match(update.body, /"reserver":"alice"/);
  // reservation comment states the exact deposit (10% of 150,000원)
  assert.ok(calls.some((c) => c[0] === 'createComment' && /15,000원/.test(c[1].body)));
});

test('negotiate_open: removes 구매 가능, adds 네고중, acks', async () => {
  const { github, calls } = makeFakeGithub({ comments: [] });
  const context = ctx({ body: '#네고희망 120000', login: 'bob', labels: ['매물', '구매 가능'], issueBody: '<!-- market-listing: {"price":"150,000원"} -->' });
  const r = await run({ github, context, configPath, now: new Date('2026-07-01T12:00:00Z') });
  assert.strictEqual(r.action, 'negotiate_open');
  const names = calls.map((c) => c[0]);
  assert.ok(calls.some((c) => c[0] === 'addLabels' && c[1].labels.includes('네고중')));
  assert.ok(calls.some((c) => c[0] === 'removeLabel' && c[1].name === '구매 가능'));
  assert.ok(names.includes('createComment'));
});

test('reserve from 네고중 (no accepted-active) clears 네고중 + 구매 가능 labels', async () => {
  const comments = [
    { id: 9, user: { login: 'bob' }, body: '#네고희망 100000', created_at: '2026-07-01T11:00:00Z' },
    { user: { login: 'alice' }, body: '#구매신청', created_at: '2026-07-01T11:30:00Z' },
  ];
  const { github, calls } = makeFakeGithub({ comments, reactionsByComment: { 9: [] } });
  const context = ctx({ body: '#구매신청', login: 'alice', labels: ['매물', '네고중'], issueBody: '<!-- market-listing: {"price":"150,000원"} -->' });
  const r = await run({ github, context, configPath, now: new Date('2026-07-01T11:30:00Z') });
  assert.strictEqual(r.action, 'reserve');
  const removed = calls.filter((c) => c[0] === 'removeLabel').map((c) => c[1].name);
  assert.ok(removed.includes('네고중'));
});

test('#구매신청 blocked when an accepted-active negotiation exists', async () => {
  const comments = [
    { id: 9, user: { login: 'bob' }, body: '#네고희망 100000', created_at: '2026-07-01T11:00:00Z' },
    { user: { login: 'alice' }, body: '#구매신청', created_at: '2026-07-01T11:30:00Z' },
  ];
  const { github, calls } = makeFakeGithub({ comments, reactionsByComment: { 9: [{ content: '+1', user: { login: 'Suckzoo' } }] } });
  const context = ctx({ body: '#구매신청', login: 'alice', labels: ['매물', '네고중'], issueBody: '<!-- market-listing: {"price":"150,000원"} -->' });
  const r = await run({ github, context, configPath, now: new Date('2026-07-01T11:30:00Z') });
  assert.strictEqual(r.action, 'comment_only');
  assert.deepStrictEqual(calls.map((c) => c[0]), ['createComment']);
});

test('paid_claim flow: writes paidClaimedAt marker and comments, no label change', async () => {
  const issueBody = 'desc\n<!-- market-state: {"reserver":"alice","reservedAt":"2026-07-01T11:00:01Z","availableSince":null} -->';
  const { github, calls } = makeFakeGithub({ comments: [] });
  const context = ctx({ body: '#입금완료', login: 'alice', labels: ['매물', '예약금 대기중'], issueBody });
  const r = await run({ github, context, configPath, now: new Date('2026-07-01T12:00:00Z') });
  assert.strictEqual(r.action, 'paid_claim');
  const names = calls.map((c) => c[0]);
  assert.ok(names.includes('update'));
  assert.ok(names.includes('createComment'));
  assert.ok(!names.includes('addLabels'));
  const update = calls.find((c) => c[0] === 'update')[1];
  assert.match(update.body, /"paidClaimedAt":"/);
  assert.match(update.body, /"reserver":"alice"/);
});

test('ignore flow: no keyword -> no octokit writes', async () => {
  const { github, calls } = makeFakeGithub({ comments: [] });
  const context = ctx({ body: '그냥 질문', login: 'alice', labels: ['매물', '구매 가능'], issueBody: 'desc' });
  const r = await run({ github, context, configPath, now: new Date('2026-07-01T12:00:00Z') });
  assert.strictEqual(r.action, 'ignore');
  assert.strictEqual(calls.length, 0);
});

test('comment_only flow: posts one comment, no label changes', async () => {
  const { github, calls } = makeFakeGithub({ comments: [] });
  const context = ctx({ body: '#구매신청', login: 'alice', labels: ['매물', '입금 확인 완료'], issueBody: 'desc' });
  await run({ github, context, configPath, now: new Date('2026-07-01T12:00:00Z') });
  assert.deepStrictEqual(calls.map((c) => c[0]), ['createComment']);
});
