const MARKER = { listing: 'market-listing', state: 'market-state' };

function markerRegex(name) {
  // <!-- name: {...json...} -->
  return new RegExp(`<!--\\s*${name}:\\s*([\\s\\S]*?)\\s*-->`);
}

function parseMarker(body, name) {
  const m = (body || '').match(markerRegex(name));
  if (!m) return null;
  try {
    return JSON.parse(m[1]);
  } catch {
    return null;
  }
}

function setMarker(body, name, obj) {
  const line = `<!-- ${name}: ${JSON.stringify(obj)} -->`;
  const re = markerRegex(name);
  if (re.test(body || '')) {
    return body.replace(re, line);
  }
  const base = body && body.length ? body.replace(/\s*$/, '') : '';
  return `${base}\n\n${line}\n`;
}

function readListing(body) {
  return parseMarker(body, MARKER.listing) || {};
}

function readState(body) {
  const s = parseMarker(body, MARKER.state) || {};
  return {
    reserver: s.reserver ?? null,
    reservedAt: s.reservedAt ?? null,
    availableSince: s.availableSince ?? null,
    paidClaimedAt: s.paidClaimedAt ?? null,
  };
}

module.exports = { MARKER, parseMarker, setMarker, readListing, readState };
