const { LEGACY_PRICE_UNKNOWN, PRICE_UNKNOWN } = require('./listing-import');

const NEGOTIATED_EMOJI = '🤝';
const PRICE_UNKNOWN_DISPLAY = '가격 미정';

function isUnknownPrice(price) {
  return price === PRICE_UNKNOWN || price === LEGACY_PRICE_UNKNOWN;
}

function formatWon(won) {
  return `${Number(won).toLocaleString('en-US')}원`;
}

// The chargeable price string (negotiated wins); null if unknown/unset.
function effectivePrice(listing) {
  const neg = (listing && listing.negotiatedPrice) || '';
  if (neg) return neg;
  const orig = (listing && listing.price) || '';
  if (!orig || isUnknownPrice(orig)) return null;
  return orig;
}

// The `**가격:** ...` line for an issue body.
function priceLine(listing) {
  const orig = (listing && listing.price) || '';
  const neg = (listing && listing.negotiatedPrice) || '';
  if (neg) {
    if (!orig || isUnknownPrice(orig)) return `**가격:** ${neg} ${NEGOTIATED_EMOJI}`;
    return `**가격:** ~~${orig}~~ → ${neg} ${NEGOTIATED_EMOJI}`;
  }
  return `**가격:** ${orig}`;
}

// The board cell price + whether it is negotiated.
function boardPrice(listing) {
  const orig = (listing && listing.price) || '';
  const neg = (listing && listing.negotiatedPrice) || '';
  if (neg) return { price: `${neg} ${NEGOTIATED_EMOJI}`, negotiated: true };
  if (isUnknownPrice(orig)) return { price: PRICE_UNKNOWN_DISPLAY, negotiated: false };
  return { price: orig, negotiated: false };
}

// 10% deposit as a won string; null when the price has no digits.
function depositAmount(priceStr) {
  const digits = String(priceStr == null ? '' : priceStr).replace(/[^0-9]/g, '');
  if (!digits) return null;
  return formatWon(Math.round(Number(digits) * 0.1));
}

module.exports = {
  NEGOTIATED_EMOJI, PRICE_UNKNOWN_DISPLAY,
  isUnknownPrice, formatWon, effectivePrice, priceLine, boardPrice, depositAmount,
};
