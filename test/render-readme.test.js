const { test } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const run = require('../scripts/render-readme');

const configPath = path.join(__dirname, 'fixtures', 'config.test.json');
const context = { repo: { owner: 'Suckzoo', repo: 'keyboard-market' } };

function fakeGithub(issues, readme) {
  const calls = [];
  const content = Buffer.from(readme, 'utf8').toString('base64');
  const rest = {
    issues: { listForRepo: async () => ({ data: issues }) },
    repos: {
      getContent: async () => ({ data: { content, sha: 'abc123', encoding: 'base64' } }),
      createOrUpdateFileContents: async (p) => { calls.push(['put', p]); return { data: {} }; },
    },
  };
  return { github: { rest, paginate: async (fn, params) => (await fn(params)).data }, calls };
}

const README = '# 장터\n<!-- BOARD:START -->\nOLD\n<!-- BOARD:END -->\n';

test('writes a new README when the board changes', async () => {
  const issues = [{
    number: 12, title: 'Keychron Q1', html_url: 'u12',
    labels: [{ name: '매물' }, { name: '구매 가능' }],
    body: '<!-- market-listing: {"price":"120,000"} -->',
  }];
  const { github, calls } = fakeGithub(issues, README);
  const r = await run({ github, context, configPath });
  assert.strictEqual(r.changed, true);
  const put = calls.find((c) => c[0] === 'put')[1];
  const written = Buffer.from(put.content, 'base64').toString('utf8');
  assert.match(written, /Keychron Q1/);
  assert.strictEqual(put.sha, 'abc123');
});

test('excludes [Test Purpose] issues from the board', async () => {
  const issues = [
    {
      number: 1, title: '[Test Purpose] Dummy', html_url: 'u1',
      labels: [{ name: '매물' }, { name: '구매 가능' }],
      body: '<!-- market-listing: {"price":"1"} -->',
    },
    {
      number: 2, title: 'Real Listing', html_url: 'u2',
      labels: [{ name: '매물' }, { name: '구매 가능' }],
      body: '<!-- market-listing: {"price":"2"} -->',
    },
  ];
  const { github, calls } = fakeGithub(issues, README);
  await run({ github, context, configPath });
  const written = Buffer.from(calls.find((c) => c[0] === 'put')[1].content, 'base64').toString('utf8');
  assert.match(written, /Real Listing/);
  assert.doesNotMatch(written, /Dummy/);
});

test('does not write when the board is unchanged', async () => {
  const issues = [{
    number: 12, title: 'Keychron Q1', html_url: 'u12',
    labels: [{ name: '매물' }, { name: '구매 가능' }],
    body: '<!-- market-listing: {"price":"120,000"} -->',
  }];
  const first = fakeGithub(issues, README);
  await run({ github: first.github, context, configPath });
  const writtenReadme = Buffer.from(first.calls.find((c) => c[0] === 'put')[1].content, 'base64').toString('utf8');

  const second = fakeGithub(issues, writtenReadme);
  const r2 = await run({ github: second.github, context, configPath });
  assert.strictEqual(r2.changed, false);
  assert.strictEqual(second.calls.length, 0);
});
