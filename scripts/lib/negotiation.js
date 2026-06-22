// Negotiation comment parsing + operator-reaction classification.
// GitHub has no ✅/❌ reactions, so 👍(+1)=accept, 👎(-1)=reject, 😕(confused)=
// expired (added by the bot). Reactions cannot trigger workflows → polled.

const REACTION_ACCEPT = '+1';
const REACTION_REJECT = '-1';
const REACTION_EXPIRED = 'confused';
// The bot (default GITHUB_TOKEN) posts the 😕 expiry marker under this login.
const BOT_LOGIN = 'github-actions[bot]';

function parseNegotiationAmount(body, keyword) {
  const text = String(body || '');
  const idx = text.indexOf(keyword);
  if (idx === -1) return null;
  const after = text.slice(idx + keyword.length);
  const m = after.match(/([0-9][0-9,]*)/);
  if (!m) return null;
  const won = Number(m[1].replace(/,/g, ''));
  if (!Number.isInteger(won) || won <= 0) return null;
  return won;
}

// 'pending' | 'accepted-active' | 'done' from a comment's reactions.
function classifyReactions(reactions, owner) {
  const list = reactions || [];
  // The 😕 expiry marker only counts from the operator or the bot — a stranger
  // must not be able to expire (and thus silently drop) a negotiation.
  const isAuthoritative = (r) => r.user && (r.user.login === owner || r.user.login === BOT_LOGIN);
  if (list.some((r) => r.content === REACTION_EXPIRED && isAuthoritative(r))) return 'done';
  const ownerContents = list.filter((r) => r.user && r.user.login === owner).map((r) => r.content);
  if (ownerContents.includes(REACTION_ACCEPT)) return 'accepted-active';
  if (ownerContents.includes(REACTION_REJECT)) return 'done';
  return 'pending';
}

module.exports = { REACTION_ACCEPT, REACTION_REJECT, REACTION_EXPIRED, parseNegotiationAmount, classifyReactions };
