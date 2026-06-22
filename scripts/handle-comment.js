const { loadConfig } = require('./lib/config');
const { decideComment } = require('./lib/decide-comment');
const { decideNegotiation } = require('./lib/decide-negotiation');
const { setMarker, MARKER, readState, readListing } = require('./lib/markers');
const { parseNegotiationAmount, classifyReactions } = require('./lib/negotiation');

// Classify the issue's negotiation comments (with operator/bot reactions),
// oldest first. Used to detect an accepted-active negotiation.
async function classifiedNegotiations(github, owner, repo, rawComments, config) {
  const out = [];
  for (const c of rawComments) {
    const author = c.user && c.user.login;
    if (!author || author.endsWith('[bot]')) continue;
    if (!c.body || !c.body.includes(config.negotiateKeyword)) continue;
    const amount = parseNegotiationAmount(c.body, config.negotiateKeyword);
    if (amount === null) continue;
    const reactions = await github.paginate(github.rest.reactions.listForIssueComment, { owner, repo, comment_id: c.id, per_page: 100 });
    out.push({ id: c.id, author, amount, createdAt: c.created_at, klass: classifyReactions(reactions, config.owner) });
  }
  return out.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
}

module.exports = async function run({ github, context, configPath = 'config.json', now = new Date() }) {
  const config = loadConfig(configPath);
  const { owner, repo } = context.repo;
  const issue = context.payload.issue;
  const issue_number = issue.number;
  const labelNames = (issue.labels || []).map((l) => (typeof l === 'string' ? l : l.name));
  const commentBody = context.payload.comment.body;

  // #네고희망 intake
  if (config.negotiateKeyword && commentBody.includes(config.negotiateKeyword)) {
    const neg = decideNegotiation({ commentBody, labelNames, config });
    if (neg.action === 'ignore') return neg;
    if (neg.action === 'comment_only') {
      await github.rest.issues.createComment({ owner, repo, issue_number, body: neg.comment });
      return neg;
    }
    // negotiate_open
    await github.rest.issues.removeLabel({ owner, repo, issue_number, name: config.labels.available }).catch(() => {});
    if (!labelNames.includes(config.labels.negotiating)) {
      await github.rest.issues.addLabels({ owner, repo, issue_number, labels: [config.labels.negotiating] });
    }
    await github.rest.issues.createComment({ owner, repo, issue_number, body: neg.comment });
    return neg;
  }

  const rawComments = await github.paginate(github.rest.issues.listComments, { owner, repo, issue_number, per_page: 100 });
  const comments = rawComments.map((c) => ({ author: c.user && c.user.login, body: c.body, createdAt: c.created_at }));
  const listing = readListing(issue.body || '');

  // accepted-active 감지를 위해 네고중일 때만 리액션 조회
  const negotiationComments = labelNames.includes(config.labels.negotiating)
    ? await classifiedNegotiations(github, owner, repo, rawComments, config) : [];

  const result = decideComment({
    issueNumber: issue_number, commentBody, commenter: context.payload.comment.user.login,
    labelNames, issueBody: issue.body || '', comments, listing, negotiationComments, config, now,
  });

  if (result.action === 'ignore') return result;
  if (result.action === 'comment_only') {
    await github.rest.issues.createComment({ owner, repo, issue_number, body: result.comment });
    return result;
  }
  if (result.action === 'paid_claim') {
    // 예약금 대기중 -> 예약금 확인중 (claimed); record the claim time too.
    const state = readState(issue.body || '');
    const newBody = setMarker(issue.body || '', MARKER.state, {
      reserver: state.reserver, reservedAt: state.reservedAt, availableSince: state.availableSince, paidClaimedAt: now.toISOString(),
    });
    await github.rest.issues.update({ owner, repo, issue_number, body: newBody });
    await github.rest.issues.removeLabel({ owner, repo, issue_number, name: config.labels.reserved }).catch(() => {});
    await github.rest.issues.addLabels({ owner, repo, issue_number, labels: [config.labels.claimed] });
    await github.rest.issues.createComment({ owner, repo, issue_number, body: result.comment });
    return result;
  }

  if (result.action === 'paid_confirm') {
    // operator confirmed: 예약금 대기중/확인중 -> 입금 확인 완료 (paid).
    await github.rest.issues.removeLabel({ owner, repo, issue_number, name: config.labels.reserved }).catch(() => {});
    await github.rest.issues.removeLabel({ owner, repo, issue_number, name: config.labels.claimed }).catch(() => {});
    await github.rest.issues.addLabels({ owner, repo, issue_number, labels: [config.labels.paid] });
    await github.rest.issues.createComment({ owner, repo, issue_number, body: result.comment });
    return result;
  }

  // result.action === 'reserve'
  const state = readState(issue.body || '');
  const newBody = setMarker(issue.body || '', MARKER.state, {
    reserver: result.winner, reservedAt: result.reservedAt, availableSince: state.availableSince, paidClaimedAt: null,
  });
  await github.rest.issues.update({ owner, repo, issue_number, body: newBody });
  await github.rest.issues.removeLabel({ owner, repo, issue_number, name: config.labels.available }).catch(() => {});
  await github.rest.issues.removeLabel({ owner, repo, issue_number, name: config.labels.negotiating }).catch(() => {});
  await github.rest.issues.addLabels({ owner, repo, issue_number, labels: [config.labels.reserved] });
  await github.rest.issues.createComment({ owner, repo, issue_number, body: result.comment });
  return result;
};
