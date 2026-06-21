function decideSweep({ status, reservedAt, config, now }) {
  if (status !== 'reserved' || !reservedAt) return { expired: false };
  const elapsed = now.getTime() - new Date(reservedAt).getTime();
  return { expired: elapsed > config.reservationHours * 3600 * 1000 };
}
module.exports = { decideSweep };
