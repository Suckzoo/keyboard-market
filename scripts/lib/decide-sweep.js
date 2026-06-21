function decideSweep({ status, reservedAt, paidClaimedAt, config, now }) {
  if (status !== 'reserved' || !reservedAt) return { expired: false };
  // #입금완료 claimed -> auto-sweep is paused pending operator verification.
  if (paidClaimedAt) return { expired: false };
  const elapsed = now.getTime() - new Date(reservedAt).getTime();
  return { expired: elapsed > config.reservationHours * 3600 * 1000 };
}
module.exports = { decideSweep };
