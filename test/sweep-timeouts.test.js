const { test } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const run = require('../scripts/sweep-timeouts');

const configPath = path.join(__dirname, 'fixtures', 'config.test.json');

function fakeGithub(issues) {
  const calls = [];
  const rest = {
    issues: {
      listForRepo: async () => ({ data: issues }),
      createComment: async (p) => calls.push(['createComment', p]),
      addLabels: async (p) => calls.push(['addLabels', p]),
      removeLabel: async (p) => calls.push(['removeLabel', p]),
      update: async (p) => calls.push(['update', p]),
    },
  };
  return { github: { rest, paginate: async (fn, params) => (await fn(params)).data }, calls };
}

const context = { repo: { owner: 'Suckzoo', repo: 'keyboard-market' } };

test('sweeps an expired reserved issue and resets marker', async () => {
  const issues = [{
    number: 7,
    labels: [{ name: '매물' }, { name: '예약금 대기중' }],
    body: 'desc\n<!-- market-state: {"reserver":"bob","reservedAt":"2026-07-01T11:00:00Z","availableSince":null} -->',
  }];
  const { github, calls } = fakeGithub(issues);
  const r = await run({ github, context, configPath, now: new Date('2026-07-01T14:30:00Z') });
  assert.strictEqual(r.swept, 1);
  const update = calls.find((c) => c[0] === 'update')[1];
  assert.match(update.body, /"reserver":null/);
  assert.match(update.body, /"availableSince":"2026-07-01T14:30:00.000Z"/);
  assert.ok(calls.some((c) => c[0] === 'addLabels'));
  assert.ok(calls.some((c) => c[0] === 'removeLabel'));
  assert.ok(calls.some((c) => c[0] === 'createComment'));
});

test('leaves a fresh reservation untouched', async () => {
  const issues = [{
    number: 8,
    labels: [{ name: '매물' }, { name: '예약금 대기중' }],
    body: '<!-- market-state: {"reserver":"bob","reservedAt":"2026-07-01T14:00:00Z","availableSince":null} -->',
  }];
  const { github, calls } = fakeGithub(issues);
  const r = await run({ github, context, configPath, now: new Date('2026-07-01T14:30:00Z') });
  assert.strictEqual(r.swept, 0);
  assert.strictEqual(calls.length, 0);
});
