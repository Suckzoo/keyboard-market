const { deriveStatus } = require('./state');
const { readState } = require('./markers');
const messages = require('./messages');

function isBot(author) {
  return typeof author === 'string' && author.endsWith('[bot]');
}

function decideComment(input) {
  const { issueNumber, commentBody, commenter, labelNames, issueBody, comments, config, now } = input;

  const body = commentBody || '';

  // #입금완료: the reserver claims they paid -> pause the auto-sweep until an
  // operator verifies the actual transfer. Only the current reserver counts.
  if (config.paidKeyword && body.includes(config.paidKeyword)) {
    const status = deriveStatus(labelNames, config);
    const state = readState(issueBody);
    if (status === 'reserved' && state.reserver && state.reserver === commenter) {
      return { action: 'paid_claim', comment: messages.paidClaimedMessage(config) };
    }
    return { action: 'ignore' };
  }

  if (!body.includes(config.keyword)) {
    return { action: 'ignore' };
  }

  const openAt = new Date(config.openAt);
  if (now < openAt) {
    return { action: 'comment_only', comment: messages.notOpenMessage(config) };
  }

  const status = deriveStatus(labelNames, config);
  const state = readState(issueBody);

  if (status === 'paid') {
    return { action: 'comment_only', comment: messages.soldMessage() };
  }

  if (status === 'reserved') {
    if (state.reserver && state.reserver === commenter) {
      return {
        action: 'comment_only',
        comment: messages.remindReserverMessage(config, issueNumber, commenter, state.reservedAt),
      };
    }
    return { action: 'comment_only', comment: messages.reservedByOtherMessage() };
  }

  // status === 'available' (or 'unknown' treated as not reservable)
  if (status !== 'available') {
    return { action: 'ignore' };
  }

  // New reservations close at closeAt; existing reservers can still pay/remind.
  if (config.closeAt && now >= new Date(config.closeAt)) {
    return { action: 'comment_only', comment: messages.closedMessage(config) };
  }

  const since = state.availableSince ? new Date(state.availableSince) : openAt;
  const candidates = (comments || [])
    .filter((c) => !isBot(c.author) && c.body && c.body.includes(config.keyword) && new Date(c.createdAt) >= since)
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

  if (candidates.length === 0) {
    return { action: 'ignore' };
  }

  const winner = candidates[0].author;
  const reservedAt = candidates[0].createdAt;
  return {
    action: 'reserve',
    winner,
    reservedAt,
    comment: messages.reserveConfirmMessage(config, issueNumber, winner, reservedAt),
  };
}

module.exports = { decideComment };
