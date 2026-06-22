const { deriveStatus } = require('./state');
const { readListing, readState } = require('./markers');
const { PRICE_UNKNOWN } = require('./listing-import');
const { boardPrice, PRICE_UNKNOWN_DISPLAY } = require('./pricing');

const NEGOTIATED_NOTE = '🤝 = 네고로 조정된 가격';

function toListingModel(issue, config) {
  const labelNames = (issue.labels || []).map((l) => (typeof l === 'string' ? l : l.name));
  const listing = readListing(issue.body || '');
  const state = readState(issue.body || '');
  const bp = boardPrice(listing);
  let note = '';
  if (bp.negotiated) note = NEGOTIATED_NOTE;
  else if (bp.price === PRICE_UNKNOWN_DISPLAY) note = PRICE_UNKNOWN;
  return {
    number: issue.number,
    id: listing.id ? String(listing.id) : String(issue.number),
    title: issue.title,
    price: bp.price,
    note,
    status: deriveStatus(labelNames, config),
    reserver: state.reserver || null,
    url: issue.html_url,
    thumb: listing.thumb || null,
  };
}
module.exports = { toListingModel };
