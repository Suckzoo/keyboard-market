const { deriveStatus } = require('./state');
const { readListing, readState } = require('./markers');

function toListingModel(issue, config) {
  const labelNames = (issue.labels || []).map((l) => (typeof l === 'string' ? l : l.name));
  const listing = readListing(issue.body || '');
  const state = readState(issue.body || '');
  return {
    number: issue.number,
    title: issue.title,
    price: listing.price || '',
    status: deriveStatus(labelNames, config),
    reserver: state.reserver || null,
    url: issue.html_url,
  };
}
module.exports = { toListingModel };
