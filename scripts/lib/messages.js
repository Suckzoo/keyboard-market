function buildFormUrl(config, issueNumber, user) {
  const params = new URLSearchParams({ usp: 'pp_url' });
  if (config.formIssueEntryId) params.set(config.formIssueEntryId, String(issueNumber));
  if (config.formUserEntryId) params.set(config.formUserEntryId, String(user));
  return `${config.formBaseUrl}?${params.toString()}`;
}

function deadlineIso(reservedAt, reservationHours) {
  return new Date(new Date(reservedAt).getTime() + reservationHours * 3600 * 1000).toISOString();
}

function notOpenMessage(config) {
  return `아직 열리지 않았습니다. **${config.openAt}**부터 구매 가능합니다.`;
}

function soldMessage() {
  return '이미 판매 완료된 매물입니다.';
}

function reservedByOtherMessage() {
  return '이미 예약 진행 중입니다. 만료되면 자동으로 다시 구매 가능 상태가 됩니다.';
}

function remindReserverMessage(config, issueNumber, user, reservedAt) {
  return [
    `@${user}님은 이미 예약 상태입니다. 아래로 입금 + 폼 작성 부탁드립니다.`,
    `💳 ${config.depositInfo}`,
    `📝 폼: ${buildFormUrl(config, issueNumber, user)}`,
    `⏰ 마감: ${deadlineIso(reservedAt, config.reservationHours)}`,
  ].join('\n');
}

function reserveConfirmMessage(config, issueNumber, winner, reservedAt) {
  return [
    `**@${winner}**님 예약 완료 ✅`,
    `${config.reservationHours}시간 내 아래 계좌로 입금 + 폼 작성 부탁드립니다.`,
    `💳 ${config.depositInfo}`,
    `📝 폼: ${buildFormUrl(config, issueNumber, winner)}`,
    `⏰ 마감: ${deadlineIso(reservedAt, config.reservationHours)}`,
  ].join('\n');
}

function expiredMessage(config) {
  return `예약이 만료되어 다시 구매 가능 상태가 되었습니다. 원하시면 \`${config.keyword}\` 댓글을 남겨주세요.`;
}

module.exports = {
  buildFormUrl, deadlineIso, notOpenMessage, soldMessage,
  reservedByOtherMessage, remindReserverMessage, reserveConfirmMessage, expiredMessage,
};
