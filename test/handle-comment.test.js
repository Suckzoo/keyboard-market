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
  const context = ctx({ body: '#구매신청', login: 'alice', labels: ['매물', '구매 가능'], issueBody: 'desc' });
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
