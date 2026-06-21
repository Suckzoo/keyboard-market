const { loadConfig } = require('./lib/config');
const { decideSweep } = require('./lib/decide-sweep');
const { deriveStatus } = require('./lib/state');
const { setMarker, MARKER, readState } = require('./lib/markers');
const { expiredMessage } = require('./lib/messages');

module.exports = async function run({ github, context, configPath = 'config.json', now = new Date() }) {
  const config = loadConfig(configPath);
  const { owner, repo } = context.repo;

  const issues = await github.paginate(github.rest.issues.listForRepo, {
    owner, repo, state: 'open', labels: config.labels.reserved, per_page: 100,
  });

  let swept = 0;
  for (const issue of issues) {
    const labelNames = (issue.labels || []).map((l) => (typeof l === 'string' ? l : l.name));
    const status = deriveStatus(labelNames, config);
    const state = readState(issue.body || '');
    if (!decideSweep({ status, reservedAt: state.reservedAt, paidClaimedAt: state.paidClaimedAt, config, now }).expired) continue;

    const issue_number = issue.number;
    const newBody = setMarker(issue.body || '', MARKER.state, {
      reserver: null, reservedAt: null, availableSince: now.toISOString(), paidClaimedAt: null,
    });
    await github.rest.issues.update({ owner, repo, issue_number, body: newBody });
    await github.rest.issues.removeLabel({ owner, repo, issue_number, name: config.labels.reserved }).catch(() => {});
    await github.rest.issues.addLabels({ owner, repo, issue_number, labels: [config.labels.available] });
    await github.rest.issues.createComment({ owner, repo, issue_number, body: expiredMessage(config) });
    swept += 1;
  }
  return { swept };
};
