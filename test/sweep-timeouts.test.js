const { test } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const run = require('../scripts/sweep-timeouts');

const configPath = path.join(__dirname, 'fixtures', 'config.test.json');
const context = { repo: { owner: 'Suckzoo', repo: 'keyboard-market' } };

function fakeGithub(issuesByLabel, commentsByIssue = {}, reactionsByComment = {}) {
  const calls = [];
  const rest = {
    issues: {
      listForRepo: async ({ labels }) => ({ data: issuesByLabel[labels] || [] }),
      listComments: async ({ issue_number }) => ({ data: commentsByIssue[issue_number] || [] }),
      createComment: async (p) => calls.push(['createComment', p]),
      addLabels: async (p) => calls.push(['addLabels', p]),
      removeLabel: async (p) => calls.push(['removeLabel', p]),
      update: async (p) => calls.push(['update', p]),
    },
    reactions: {
      listForIssueComment: async ({ comment_id }) => ({ data: reactionsByComment[comment_id] || [] }),
      createForIssueComment: async (p) => calls.push(['createReaction', p]),
    },
  };
  return { github: { rest, paginate: async (fn, params) => (await fn(params)).data }, calls };
}

test('sweeps an expired reserved issue and resets marker', async () => {
  const issuesByLabel = {
    '네고중': [],
    '예약금 대기중': [{ number: 7, labels: [{ name: '매물' }, { name: '예약금 대기중' }],
      body: 'desc\n<!-- market-state: {"reserver":"bob","reservedAt":"2026-07-01T11:00:00Z","availableSince":null} -->' }],
  };
  const { github, calls } = fakeGithub(issuesByLabel);
  const r = await run({ github, context, configPath, now: new Date('2026-07-01T14:30:00Z') });
  assert.strictEqual(r.swept, 1);
  const update = calls.find((c) => c[0] === 'update')[1];
  assert.match(update.body, /"reserver":null/);
  assert.match(update.body, /"availableSince":"2026-07-01T14:30:00.000Z"/);
  assert.ok(calls.some((c) => c[0] === 'addLabels' && c[1].labels.includes('구매 가능')));
  assert.ok(calls.some((c) => c[0] === 'removeLabel'));
  assert.ok(calls.some((c) => c[0] === 'createComment'));
});

test('leaves a payment-claimed reservation untouched even if past 3h', async () => {
  const issuesByLabel = {
    '네고중': [],
    '예약금 대기중': [{ number: 9, labels: [{ name: '매물' }, { name: '예약금 대기중' }],
      body: '<!-- market-state: {"reserver":"bob","reservedAt":"2026-07-01T11:00:00Z","availableSince":null,"paidClaimedAt":"2026-07-01T11:30:00Z"} -->' }],
  };
  const { github, calls } = fakeGithub(issuesByLabel);
  const r = await run({ github, context, configPath, now: new Date('2026-07-01T20:00:00Z') });
  assert.strictEqual(r.swept, 0);
  assert.strictEqual(calls.length, 0);
});

test('leaves a fresh reservation untouched', async () => {
  const issuesByLabel = {
    '네고중': [],
    '예약금 대기중': [{ number: 8, labels: [{ name: '매물' }, { name: '예약금 대기중' }],
      body: '<!-- market-state: {"reserver":"bob","reservedAt":"2026-07-01T14:00:00Z","availableSince":null} -->' }],
  };
  const { github, calls } = fakeGithub(issuesByLabel);
  const r = await run({ github, context, configPath, now: new Date('2026-07-01T14:30:00Z') });
  assert.strictEqual(r.swept, 0);
  assert.strictEqual(calls.length, 0);
});

test('reconcile: 👍 accepted negotiation -> reserves at negotiated price', async () => {
  const issuesByLabel = {
    '네고중': [{ number: 7, labels: [{ name: '매물' }, { name: '네고중' }],
      body: 'PID: 9\n\n**가격:** 150,000원\n\n<!-- market-listing: {"id":"9","name":"x","price":"150,000원"} -->\n<!-- market-state: {"reserver":null,"reservedAt":null,"availableSince":null} -->' }],
    '예약금 대기중': [],
  };
  const commentsByIssue = { 7: [{ id: 50, user: { login: 'bob' }, body: '#네고희망 120000', created_at: '2026-07-01T11:00:00Z' }] };
  const reactionsByComment = { 50: [{ content: '+1', user: { login: 'Suckzoo' } }] };
  const { github, calls } = fakeGithub(issuesByLabel, commentsByIssue, reactionsByComment);
  await run({ github, context, configPath, now: new Date('2026-07-01T12:00:00Z') });
  const update = calls.find((c) => c[0] === 'update')[1];
  assert.match(update.body, /"negotiatedPrice":"120,000원"/);
  assert.match(update.body, /"reserver":"bob"/);
  assert.match(update.body, /~~150,000원~~ → 120,000원/);
  assert.ok(calls.some((c) => c[0] === 'addLabels' && c[1].labels.includes('예약금 대기중')));
  assert.ok(calls.some((c) => c[0] === 'createComment' && /12,000원/.test(c[1].body)));
});

test('reconcile: all 👎 -> release to 구매 가능', async () => {
  const issuesByLabel = {
    '네고중': [{ number: 8, labels: [{ name: '매물' }, { name: '네고중' }],
      body: '<!-- market-listing: {"price":"150,000원"} -->\n<!-- market-state: {"reserver":null} -->' }],
    '예약금 대기중': [],
  };
  const commentsByIssue = { 8: [{ id: 60, user: { login: 'bob' }, body: '#네고희망 100000', created_at: 't' }] };
  const reactionsByComment = { 60: [{ content: '-1', user: { login: 'Suckzoo' } }] };
  const { github, calls } = fakeGithub(issuesByLabel, commentsByIssue, reactionsByComment);
  await run({ github, context, configPath, now: new Date('2026-07-01T12:00:00Z') });
  assert.ok(calls.some((c) => c[0] === 'addLabels' && c[1].labels.includes('구매 가능')));
  assert.ok(calls.some((c) => c[0] === 'removeLabel' && c[1].name === '네고중'));
});

test('expiry of accepted negotiation marks the comment 😕 and retains negotiatedPrice', async () => {
  const issuesByLabel = {
    '네고중': [],
    '예약금 대기중': [{ number: 9, labels: [{ name: '매물' }, { name: '예약금 대기중' }],
      body: '<!-- market-listing: {"price":"150,000원","negotiatedPrice":"120,000원"} -->\n<!-- market-state: {"reserver":"bob","reservedAt":"2026-07-01T11:00:00Z","availableSince":null,"paidClaimedAt":null,"acceptedNegotiationCommentId":50} -->' }],
  };
  const commentsByIssue = { 9: [{ id: 50, user: { login: 'bob' }, body: '#네고희망 120000', created_at: '2026-07-01T11:00:00Z' }] };
  const reactionsByComment = { 50: [{ content: '+1', user: { login: 'Suckzoo' } }] };
  const { github, calls } = fakeGithub(issuesByLabel, commentsByIssue, reactionsByComment);
  await run({ github, context, configPath, now: new Date('2026-07-01T20:00:00Z') });
  assert.ok(calls.some((c) => c[0] === 'createReaction' && c[1].content === 'confused' && c[1].comment_id === 50));
  const update = calls.find((c) => c[0] === 'update')[1];
  assert.match(update.body, /"negotiatedPrice":"120,000원"/);
});
