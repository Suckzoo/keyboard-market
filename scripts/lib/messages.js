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
    `@${user}님은 이미 예약 상태입니다.`,
    `${config.reservationHours}시간 이내에 ①송금 ②예약 폼 작성을 완료하신 뒤, 이 이슈에 \`${config.paidKeyword}\` 댓글을 남겨주시면 예약이 확정됩니다.`,
    `💳 ${config.depositInfo}`,
    `📝 예약 폼: ${buildFormUrl(config, issueNumber, user)}`,
    `⏰ 마감: ${deadlineIso(reservedAt, config.reservationHours)}`,
  ].join('\n');
}

function reserveConfirmMessage(config, issueNumber, winner, reservedAt) {
  return [
    `**@${winner}**님 예약 완료 ✅`,
    `${config.reservationHours}시간 이내에 ①송금 ②예약 폼 작성을 완료하신 뒤, 이 이슈에 \`${config.paidKeyword}\` 댓글을 남겨주시면 예약이 확정됩니다.`,
    `(${config.reservationHours}시간 내 \`${config.paidKeyword}\` 댓글이 없으면 예약은 자동 취소되어 다시 구매 가능 상태로 전환됩니다.)`,
    `💳 ${config.depositInfo}`,
    `📝 예약 폼: ${buildFormUrl(config, issueNumber, winner)}`,
    `⏰ 마감: ${deadlineIso(reservedAt, config.reservationHours)}`,
  ].join('\n');
}

function expiredMessage(config) {
  return `예약이 만료되어 다시 구매 가능 상태가 되었습니다. 원하시면 \`${config.keyword}\` 댓글을 남겨주세요.`;
}

function paidClaimedMessage(config) {
  return `입금 확인 요청이 접수되었습니다. 운영자가 실제 입금을 확인한 뒤 처리하며, 확인 전까지 자동 해제(${config.reservationHours}시간)는 중지됩니다.`;
}

// Footer appended to every listing issue (and mirrored in the README).
function reservationFooter(config) {
  return [
    '---',
    '',
    '## 📌 예약 방법',
    '',
    `1. 구매를 원하시는 글에 \`${config.keyword}\` 키워드를 넣어 댓글을 남겨주세요.`,
    '2. 봇 안내에 따라 3시간 이내에 송금 및 예약 폼 작성을 완료해 주세요.',
    `3. 완료 후 같은 판매글에 \`${config.paidKeyword}\` 댓글을 남기면 예약이 확정됩니다.`,
    '',
    `3시간 이내에 \`${config.paidKeyword}\` 댓글이 없을 경우 예약은 자동 취소되며, 판매글은 다시 구매 가능 상태로 전환됩니다.`,
    '',
    `입금 후 \`${config.paidKeyword}\` 댓글을 남기지 않아 예약이 취소된 사이 다른 분의 예약이 확정된 경우, 나중에 예약을 완료하신 분께 구매 권한이 있으며 기존 입금분은 수동 환불해 드립니다.`,
    '',
    '## 💳 입금 방법',
    '',
    config.depositInfo,
    '',
    '## 🗓 예약 기간',
    '',
    '2026년 6월 24일(수) 12:00 ~ 2026년 7월 1일(수) 12:00 (KST)',
    '',
    '물건의 수량이 많아 다른 곳에 보관하고 있습니다. 올려드린 사진 외에 추가적인 상태·구성품 확인이 어려운 점 양해 부탁드립니다.',
  ].join('\n');
}

module.exports = {
  buildFormUrl, deadlineIso, notOpenMessage, closedMessage, soldMessage,
  reservedByOtherMessage, remindReserverMessage, reserveConfirmMessage, expiredMessage,
  paidClaimedMessage, reservationFooter,
};
