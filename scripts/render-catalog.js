const { loadConfig } = require('./lib/config');
const { toListingModel } = require('./lib/listing-model');
const { selectListingIssues } = require('./lib/render-board');
const { renderCatalog, spliceCatalog } = require('./lib/render-catalog');

module.exports = async function run({ github, context, configPath = 'config.json' }) {
  const config = loadConfig(configPath);
  const { owner, repo } = context.repo;

  const issues = await github.paginate(github.rest.issues.listForRepo, {
    owner, repo, state: 'all', labels: config.labels.scope, per_page: 100,
  });
  const models = selectListingIssues(issues, config).map((i) => toListingModel(i, config));
  const html = renderCatalog(models);

  const current = await github.rest.repos.getContent({ owner, repo, path: 'CATALOG.md' });
  const sha = current.data.sha;
  const old = Buffer.from(current.data.content, 'base64').toString('utf8');
  const updated = spliceCatalog(old, html);

  if (updated === old) return { changed: false };

  await github.rest.repos.createOrUpdateFileContents({
    owner, repo, path: 'CATALOG.md',
    message: 'chore: update 카탈로그',
    content: Buffer.from(updated, 'utf8').toString('base64'),
    sha,
  });
  return { changed: true };
};
