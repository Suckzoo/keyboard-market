const { deriveStatus } = require('./state');
const { readState } = require('./markers');
const messages = require('./messages');

function isBot(author) {
  return typeof author === 'string' && author.endsWith('[bot]');
}

function decideComment(input) {
  const { issueNumber, commentBody, commenter, labelNames, issueBody, comments, config, now } = input;

  if (!commentBody || !commentBody.includes(config.keyword)) {
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
