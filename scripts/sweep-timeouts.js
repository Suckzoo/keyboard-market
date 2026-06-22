const { loadConfig } = require('./lib/config');
const { decideSweep } = require('./lib/decide-sweep');
const { reconcileNegotiation } = require('./lib/reconcile-negotiation');
const { deriveStatus } = require('./lib/state');
const { setMarker, MARKER, readState, readListing } = require('./lib/markers');
const { parseNegotiationAmount, classifyReactions, REACTION_EXPIRED } = require('./lib/negotiation');
const { effectivePrice, depositAmount, priceLine, formatWon } = require('./lib/pricing');
const { expiredMessage, reserveConfirmMessage } = require('./lib/messages');

async function classifiedNegotiations(github, owner, repo, issue_number, config) {
  const raw = await github.paginate(github.rest.issues.listComments, { owner, repo, issue_number, per_page: 100 });
  const out = [];
  for (const c of raw) {
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

function priceDigits(str) { const d = String(str || '').replace(/[^0-9]/g, ''); return d ? Number(d) : Infinity; }

module.exports = async function run({ github, context, configPath = 'config.json', now = new Date() }) {
  const config = loadConfig(configPath);
  const { owner, repo } = context.repo;
  const L = config.labels;

  // ---- 네고 리콘실 (네고중) ----
  const negIssues = await github.paginate(github.rest.issues.listForRepo, { owner, repo, state: 'open', labels: L.negotiating, per_page: 100 });
  for (const issue of negIssues) {
    const issue_number = issue.number;
    const negComments = await classifiedNegotiations(github, owner, repo, issue_number, config);
    const r = reconcileNegotiation({ negotiationComments: negComments });
    if (r.action === 'stay_negotiating') continue;
    if (r.action === 'release') {
      await github.rest.issues.removeLabel({ owner, repo, issue_number, name: L.negotiating }).catch(() => {});
      await github.rest.issues.addLabels({ owner, repo, issue_number, labels: [L.available] });
      continue;
    }
    // accept — min ratchet + 본문/상태 갱신
    const listing = readListing(issue.body || '');
    const negWon = Math.min(priceDigits(listing.negotiatedPrice), r.amount);
    const negotiatedPrice = formatWon(negWon);
    const listing2 = { ...listing, negotiatedPrice };
    let body = setMarker(issue.body || '', MARKER.listing, listing2);
    body = body.replace(/^\*\*가격:\*\*.*$/m, priceLine(listing2));
    body = setMarker(body, MARKER.state, {
      reserver: r.winner, reservedAt: now.toISOString(), availableSince: null, paidClaimedAt: null, acceptedNegotiationCommentId: r.commentId,
    });
    await github.rest.issues.update({ owner, repo, issue_number, body });
    await github.rest.issues.removeLabel({ owner, repo, issue_number, name: L.negotiating }).catch(() => {});
    await github.rest.issues.addLabels({ owner, repo, issue_number, labels: [L.reserved] });
    await github.rest.issues.createComment({ owner, repo, issue_number, body: reserveConfirmMessage(config, issue_number, r.winner, now.toISOString(), depositAmount(effectivePrice(listing2))) });
  }

  // ---- 만료 (예약금 대기중) ----
  let swept = 0;
  const resIssues = await github.paginate(github.rest.issues.listForRepo, { owner, repo, state: 'open', labels: L.reserved, per_page: 100 });
  for (const issue of resIssues) {
    const issue_number = issue.number;
    const labelNames = (issue.labels || []).map((l) => (typeof l === 'string' ? l : l.name));
    const status = deriveStatus(labelNames, config);
    const state = readState(issue.body || '');
    if (!decideSweep({ status, reservedAt: state.reservedAt, paidClaimedAt: state.paidClaimedAt, config, now }).expired) continue;

    if (state.acceptedNegotiationCommentId) {
      await github.rest.reactions.createForIssueComment({ owner, repo, comment_id: state.acceptedNegotiationCommentId, content: REACTION_EXPIRED }).catch(() => {});
    }
    const negComments = await classifiedNegotiations(github, owner, repo, issue_number, config);
    const hasPending = negComments.some((c) => c.klass === 'pending');

    const newBody = setMarker(issue.body || '', MARKER.state, {
      reserver: null, reservedAt: null, availableSince: now.toISOString(), paidClaimedAt: null, acceptedNegotiationCommentId: null,
    });
    await github.rest.issues.update({ owner, repo, issue_number, body: newBody });
    await github.rest.issues.removeLabel({ owner, repo, issue_number, name: L.reserved }).catch(() => {});
    await github.rest.issues.addLabels({ owner, repo, issue_number, labels: [hasPending ? L.negotiating : L.available] });
    await github.rest.issues.createComment({ owner, repo, issue_number, body: expiredMessage(config) });
    swept += 1;
  }
  return { swept };
};
