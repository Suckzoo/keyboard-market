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

function closedMessage(config) {
  return `온라인 예약판매 기간이 종료되었습니다. (마감: **${config.closeAt}**) 남은 매물은 행사 현장에서 판매됩니다.`;
}

function soldMessage() {
  return '이미 판매 완료된 매물입니다.';
}

function reservedByOtherMessage() {
  return '이미 예약 진행 중입니다. 만료되면 자동으로 다시 구매 가능 상태가 됩니다.';
}

function remindReserverMessage(config, issueNumber, user, reservedAt) {
  return [
    `@${user}님은 이미 예약 상태입니다. 입금 후 이 이슈에 \`${config.paidKeyword}\` 댓글을 남겨주세요.`,
    `💳 ${config.depositInfo}`,
    `📝 희망 수령 시간대 폼: ${buildFormUrl(config, issueNumber, user)}`,
    `⏰ 입금 마감: ${deadlineIso(reservedAt, config.reservationHours)}`,
  ].join('\n');
}

function reserveConfirmMessage(config, issueNumber, winner, reservedAt) {
  return [
    `**@${winner}**님 예약 완료 ✅`,
    `${config.reservationHours}시간 내 입금 후, 이 이슈에 \`${config.paidKeyword}\` 댓글을 남겨주세요. (미입금 시 자동으로 다시 구매 가능 전환)`,
    `💳 ${config.depositInfo}`,
    `📝 희망 수령 시간대 폼: ${buildFormUrl(config, issueNumber, winner)}`,
    `⏰ 입금 마감: ${deadlineIso(reservedAt, config.reservationHours)}`,
  ].join('\n');
}

function expiredMessage(config) {
  return `예약이 만료되어 다시 구매 가능 상태가 되었습니다. 원하시면 \`${config.keyword}\` 댓글을 남겨주세요.`;
}

function paidClaimedMessage(config) {
  return `입금 확인 요청이 접수되었습니다. 운영자가 실제 입금을 확인한 뒤 처리하며, 확인 전까지 자동 해제(${config.reservationHours}시간)는 중지됩니다.`;
}

module.exports = {
  buildFormUrl, deadlineIso, notOpenMessage, closedMessage, soldMessage,
  reservedByOtherMessage, remindReserverMessage, reserveConfirmMessage, expiredMessage,
  paidClaimedMessage,
};
