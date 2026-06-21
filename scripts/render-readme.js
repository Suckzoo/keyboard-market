const { loadConfig } = require('./lib/config');
const { toListingModel } = require('./lib/listing-model');
const { sortListings, renderTable, spliceBoard, isTestPurpose } = require('./lib/render-board');

module.exports = async function run({ github, context, configPath = 'config.json' }) {
  const config = loadConfig(configPath);
  const { owner, repo } = context.repo;

  const issues = await github.paginate(github.rest.issues.listForRepo, {
    owner, repo, state: 'all', labels: config.labels.scope, per_page: 100,
  });
  // listForRepo can include PRs; keep only issues. Also hide [Test Purpose] fixtures.
  const onlyIssues = issues.filter((i) => !i.pull_request && !isTestPurpose(i.title));
  const models = sortListings(onlyIssues.map((i) => toListingModel(i, config)));
  const table = renderTable(models);

  const current = await github.rest.repos.getContent({ owner, repo, path: 'README.md' });
  const sha = current.data.sha;
  const old = Buffer.from(current.data.content, 'base64').toString('utf8'); // GitHub returns base64
  const updated = spliceBoard(old, table);

  if (updated === old) return { changed: false };

  await github.rest.repos.createOrUpdateFileContents({
    owner, repo, path: 'README.md',
    message: 'chore: update 예약 현황판',
    content: Buffer.from(updated, 'utf8').toString('base64'),
    sha,
  });
  return { changed: true };
};
