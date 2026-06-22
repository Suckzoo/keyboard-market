const { deriveStatus } = require('./state');
const { parseNegotiationAmount } = require('./negotiation');
const messages = require('./messages');

// Pure decision for a `#네고희망 {금액}` comment.
function decideNegotiation({ commentBody, labelNames, config }) {
  const body = commentBody || '';
  if (!config.negotiateKeyword || !body.includes(config.negotiateKeyword)) {
    return { action: 'ignore' };
  }
  const amount = parseNegotiationAmount(body, config.negotiateKeyword);
  if (amount === null) {
    return { action: 'comment_only', comment: messages.negotiateRejectedFormatMessage(config) };
  }
  const status = deriveStatus(labelNames, config);
  if (status === 'reserved' || status === 'paid') {
    return { action: 'comment_only', comment: messages.negotiateNotAllowedMessage() };
  }
  return { action: 'negotiate_open', amount, comment: messages.negotiateAckMessage(config, amount) };
}

module.exports = { decideNegotiation };
