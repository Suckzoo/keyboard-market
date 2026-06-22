// Pure decision from classified negotiation comments (sorted oldest-first).
// accepted-active wins (earliest); else pending → stay; else → release.
function reconcileNegotiation({ negotiationComments }) {
  const list = negotiationComments || [];
  const accepted = list.find((c) => c.klass === 'accepted-active');
  if (accepted) {
    return { action: 'accept', winner: accepted.author, amount: accepted.amount, commentId: accepted.id };
  }
  if (list.some((c) => c.klass === 'pending')) {
    return { action: 'stay_negotiating' };
  }
  return { action: 'release' };
}

module.exports = { reconcileNegotiation };
