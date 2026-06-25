const { deriveStatus } = require('./state');
const { readState } = require('./markers');
const { effectivePrice, depositAmount } = require('./pricing');
const { isOperator } = require('./operators');
const messages = require('./messages');

function isBot(author) {
  return typeof author === 'string' && author.endsWith('[bot]');
}

function decideComment(input) {
  const { issueNumber, commentBody, commenter, labelNames, issueBody, comments, config, now } = input;
  const listing = input.listing || {};
  const negotiationComments = input.negotiationComments || [];

  const body = commentBody || '';

  // #입금확인: the operator confirms the transfer -> 입금 확인 완료. Owner only,
  // from an active reservation (예약금 대기중 or 예약금 확인중).
  if (config.paidConfirmKeyword && body.includes(config.paidConfirmKeyword)) {
    const status = deriveStatus(labelNames, config);
    if (isOperator(commenter, config) && (status === 'reserved' || status === 'claimed')) {
      return { action: 'paid_confirm', comment: messages.paidConfirmedMessage(config) };
    }
    return { action: 'ignore' };
  }

  // #입금완료: the reserver claims they paid -> 예약금 확인중 (auto-sweep no longer
  // applies; the operator verifies). Only the current reserver counts.
  if (config.paidKeyword && body.includes(config.paidKeyword)) {
    const status = deriveStatus(labelNames, config);
    const state = readState(issueBody);
    if (status === 'reserved' && state.reserver && state.reserver === commenter) {
      return { action: 'paid_claim', comment: messages.paidClaimedMessage(config) };
    }
    return { action: 'ignore' };
  }

  if (!body.includes(config.keyword)) return { action: 'ignore' };

  const openAt = new Date(config.openAt);
  if (now < openAt) return { action: 'comment_only', comment: messages.notOpenMessage(config) };

  const status = deriveStatus(labelNames, config);
  const state = readState(issueBody);

  if (status === 'paid') return { action: 'comment_only', comment: messages.soldMessage() };

  if (status === 'reserved') {
    if (state.reserver && state.reserver === commenter) {
      const dep = depositAmount(effectivePrice(listing));
      return { action: 'comment_only', comment: messages.remindReserverMessage(config, issueNumber, commenter, state.reservedAt, dep) };
    }
    return { action: 'comment_only', comment: messages.reservedByOtherMessage() };
  }

  // reservable: available or negotiating
  if (status !== 'available' && status !== 'negotiating') return { action: 'ignore' };

  // New reservations close at closeAt; existing reservers can still pay/remind.
  if (config.closeAt && now >= new Date(config.closeAt)) {
    return { action: 'comment_only', comment: messages.closedMessage(config) };
  }

  const effective = effectivePrice(listing);
  if (effective === null) {
    return { action: 'comment_only', comment: messages.priceUnknownReserveMessage(config) };
  }
  if (negotiationComments.some((c) => c.klass === 'accepted-active')) {
    return { action: 'comment_only', comment: messages.reserveBlockedByNegotiationMessage() };
  }

  const since = state.availableSince ? new Date(state.availableSince) : openAt;
  const candidates = (comments || [])
    .filter((c) => !isBot(c.author) && c.body && c.body.includes(config.keyword) && new Date(c.createdAt) >= since)
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

  if (candidates.length === 0) return { action: 'ignore' };

  const winner = candidates[0].author;
  const reservedAt = candidates[0].createdAt;
  return {
    action: 'reserve',
    winner,
    reservedAt,
    comment: messages.reserveConfirmMessage(config, issueNumber, winner, reservedAt, depositAmount(effective)),
  };
}

module.exports = { decideComment };
