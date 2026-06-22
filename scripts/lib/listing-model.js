const { deriveStatus } = require('./state');
const { readListing, readState } = require('./markers');
const { LEGACY_PRICE_UNKNOWN, PRICE_UNKNOWN } = require('./listing-import');

const PRICE_UNKNOWN_DISPLAY = '가격 미정';

function toListingModel(issue, config) {
  const labelNames = (issue.labels || []).map((l) => (typeof l === 'string' ? l : l.name));
  const listing = readListing(issue.body || '');
  const state = readState(issue.body || '');
  const rawPrice = listing.price || '';
  const unknown = rawPrice === PRICE_UNKNOWN || rawPrice === LEGACY_PRICE_UNKNOWN;
  return {
    number: issue.number,
    id: listing.id ? String(listing.id) : String(issue.number),
    title: issue.title,
    price: unknown ? PRICE_UNKNOWN_DISPLAY : rawPrice,
    note: unknown ? PRICE_UNKNOWN : '',
    status: deriveStatus(labelNames, config),
    reserver: state.reserver || null,
    url: issue.html_url,
  };
}
module.exports = { toListingModel };
