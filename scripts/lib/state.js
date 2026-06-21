function deriveStatus(labelNames, config) {
  const set = new Set(labelNames || []);
  const L = config.labels;
  if (set.has(L.paid)) return 'paid';
  if (set.has(L.reserved)) return 'reserved';
  if (set.has(L.available)) return 'available';
  return 'unknown';
}

module.exports = { deriveStatus };
