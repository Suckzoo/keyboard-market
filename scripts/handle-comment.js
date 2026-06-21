const { loadConfig } = require('./lib/config');
const { decideComment } = require('./lib/decide-comment');
const { setMarker, MARKER, readState } = require('./lib/markers');

module.exports = async function run({ github, context, configPath = 'config.json', now = new Date() }) {
  const config = loadConfig(configPath);
  const { owner, repo } = context.repo;
  const issue = context.payload.issue;
  const issue_number = issue.number;
  const labelNames = (issue.labels || []).map((l) => (typeof l === 'string' ? l : l.name));

  const rawComments = await github.paginate(github.rest.issues.listComments, {
    owner, repo, issue_number, per_page: 100,
  });
  const comments = rawComments.map((c) => ({
    author: c.user && c.user.login, body: c.body, createdAt: c.created_at,
  }));

  const result = decideComment({
    issueNumber: issue_number,
    commentBody: context.payload.comment.body,
    commenter: context.payload.comment.user.login,
    labelNames,
    issueBody: issue.body || '',
    comments,
    config,
    now,
  });

  if (result.action === 'ignore') return result;

  if (result.action === 'comment_only') {
    await github.rest.issues.createComment({ owner, repo, issue_number, body: result.comment });
    return result;
  }

  if (result.action === 'paid_claim') {
    const state = readState(issue.body || '');
    const newBody = setMarker(issue.body || '', MARKER.state, {
      reserver: state.reserver,
      reservedAt: state.reservedAt,
      availableSince: state.availableSince,
      paidClaimedAt: now.toISOString(),
    });
    await github.rest.issues.update({ owner, repo, issue_number, body: newBody });
    await github.rest.issues.createComment({ owner, repo, issue_number, body: result.comment });
    return result;
  }

  // result.action === 'reserve'
  const state = readState(issue.body || '');
  const newBody = setMarker(issue.body || '', MARKER.state, {
    reserver: result.winner,
    reservedAt: result.reservedAt,
    availableSince: state.availableSince,
    paidClaimedAt: null,
  });
  await github.rest.issues.update({ owner, repo, issue_number, body: newBody });
  await github.rest.issues.removeLabel({ owner, repo, issue_number, name: config.labels.available })
    .catch(() => {}); // label may already be absent
  await github.rest.issues.addLabels({ owner, repo, issue_number, labels: [config.labels.reserved] });
  await github.rest.issues.createComment({ owner, repo, issue_number, body: result.comment });
  return result;
};
