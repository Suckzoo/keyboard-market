const { deriveStatus } = require('./state');
const { readListing, readState } = require('./markers');
const { PRICE_UNKNOWN } = require('./listing-import');

function toListingModel(issue, config) {
  const labelNames = (issue.labels || []).map((l) => (typeof l === 'string' ? l : l.name));
  const listing = readListing(issue.body || '');
  const state = readState(issue.body || '');
  const rawPrice = listing.price || '';
  const unknown = rawPrice === PRICE_UNKNOWN;
  return {
    number: issue.number,
    title: issue.title,
    price: unknown ? '가격 문의' : rawPrice,
    note: unknown ? PRICE_UNKNOWN : '',
    status: deriveStatus(labelNames, config),
    reserver: state.reserver || null,
    url: issue.html_url,
  };
}
module.exports = { toListingModel };
