# 네고(가격 협상) 기능 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 구매자가 `#네고희망 {원화}` 댓글로 가격을 제안하고, 운영자가 👍/👎 리액션으로 수락/거절하면 봇이 예약·가격갱신을 처리하는 협상 기능을 추가한다.

**Architecture:** 순수 판정 함수(decide/reconcile/pricing/negotiation) + 글루(comment-handler 즉시, sweep-timeouts 폴링). 리액션은 GitHub가 워크플로를 트리거하지 못하므로 sweeper(10분 cron)가 `네고중` 이슈의 댓글 리액션을 폴링해 처리한다.

**Tech Stack:** Node ≥20, `node:test`, `@octokit/rest`(import 스크립트), GitHub Actions(github-script). 신규 의존성 없음.

**Spec:** `docs/superpowers/specs/2026-06-22-negotiation-design.md`

## Global Constraints

- 런타임: Node ≥20, 테스트: `node --test` (외부 테스트 러너 금지).
- 신규 npm 의존성 추가 금지 (built-in + 기존 octokit만).
- 리액션 매핑: `REACTION_ACCEPT='+1'`(👍), `REACTION_REJECT='-1'`(👎), `REACTION_EXPIRED='confused'`(😕, 봇이 부착).
- 네고가 이모지: `NEGOTIATED_EMOJI='🤝'`. 가격 미정 보드 표기: `'가격 미정'`.
- 운영자: `config.owner = 'Suckzoo'`. 네고 키워드: `config.negotiateKeyword = '#네고희망'`. 네고 라벨: `config.labels.negotiating = '네고중'`.
- 상태 우선순위: `paid > reserved > negotiating > available > unknown`.
- 예약 안내 댓글에는 **정확한 예약금 액수(표시가의 10%)**를 포함한다.
- 커밋 메시지 말미: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>` 와 `Claude-Session: https://claude.ai/code/session_018KELvmPusvN7LPndJPgD68`.
- 매 태스크: 실패 테스트 → 실패 확인 → 최소 구현 → 통과 확인 → 커밋. 작업 후 `node --test` 전체 통과 유지.

---

## File Structure

- Create `scripts/lib/pricing.js` — 가격 표시/예약금 순수 헬퍼 (effectivePrice, priceLine, boardPrice, depositAmount, formatWon, isUnknownPrice, NEGOTIATED_EMOJI, PRICE_UNKNOWN_DISPLAY).
- Create `scripts/lib/negotiation.js` — 네고 댓글 파싱/분류 + 리액션 상수 (parseNegotiationAmount, classifyReactions, REACTION_*).
- Create `scripts/lib/decide-negotiation.js` — `#네고희망` 접수 판정.
- Create `scripts/lib/reconcile-negotiation.js` — 리액션 분류 → accept/release/stay 판정.
- Modify `scripts/lib/state.js` — deriveStatus에 negotiating.
- Modify `scripts/lib/listing-model.js` — boardPrice 사용(네고가 + 🤝 + 범례 노트).
- Modify `scripts/lib/build-issue.js` — priceLine 사용.
- Modify `scripts/lib/messages.js` — 네고/차단 메시지 + 예약금 액수 포함.
- Modify `scripts/lib/decide-comment.js` — `#구매신청` 네고 인지(가격미정·승낙네고 차단, negotiating에서 예약, 예약금 액수).
- Modify `scripts/handle-comment.js` — 네고 접수 글루 + 예약 시 라벨 정리 + 리액션 조회.
- Modify `scripts/sweep-timeouts.js` — 네고 리콘실 + 만료 시 😕 + 네고중 복귀.
- Modify `scripts/render-readme.js` — owner 작성자 필터.
- Modify `config.json` + `test/fixtures/config.test.json` — owner/negotiateKeyword/labels.negotiating.
- Modify `README.md` — 네고 안내 섹션.

각 helper 모듈은 순수함수만 두고 글루(handle-comment/sweep-timeouts)에서 I/O를 담당한다.

---

## Task 1: pricing.js — 가격/예약금 순수 헬퍼

**Files:**
- Create: `scripts/lib/pricing.js`
- Test: `test/pricing.test.js`

**Interfaces:**
- Consumes: `LEGACY_PRICE_UNKNOWN`, `PRICE_UNKNOWN` from `scripts/lib/listing-import.js`.
- Produces:
  - `NEGOTIATED_EMOJI = '🤝'`, `PRICE_UNKNOWN_DISPLAY = '가격 미정'`
  - `isUnknownPrice(price: string): boolean`
  - `formatWon(won: number): string` → `"12,000원"`
  - `effectivePrice(listing: {price?, negotiatedPrice?}): string|null` — 청구 가능한 가격 문자열(negotiatedPrice 우선, 미정/미설정이면 null)
  - `priceLine(listing): string` — 이슈 본문 `**가격:** ...` 한 줄
  - `boardPrice(listing): { price: string, negotiated: boolean }` — 현황판 셀
  - `depositAmount(priceStr: string): string|null` — 10% 원화 문자열

- [ ] **Step 1: Write the failing test**

```js
// test/pricing.test.js
const { test } = require('node:test');
const assert = require('node:assert');
const { PRICE_UNKNOWN } = require('../scripts/lib/listing-import');
const p = require('../scripts/lib/pricing');

test('isUnknownPrice detects the unknown sentence', () => {
  assert.strictEqual(p.isUnknownPrice(PRICE_UNKNOWN), true);
  assert.strictEqual(p.isUnknownPrice('150,000원'), false);
});

test('formatWon formats with separators and 원', () => {
  assert.strictEqual(p.formatWon(12000), '12,000원');
});

test('effectivePrice prefers negotiatedPrice, null for unknown/unset', () => {
  assert.strictEqual(p.effectivePrice({ price: '150,000원' }), '150,000원');
  assert.strictEqual(p.effectivePrice({ price: '150,000원', negotiatedPrice: '120,000원' }), '120,000원');
  assert.strictEqual(p.effectivePrice({ price: PRICE_UNKNOWN }), null);
  assert.strictEqual(p.effectivePrice({}), null);
});

test('priceLine renders normal, negotiated, unknown', () => {
  assert.strictEqual(p.priceLine({ price: '150,000원' }), '**가격:** 150,000원');
  assert.strictEqual(p.priceLine({ price: '150,000원', negotiatedPrice: '120,000원' }), '**가격:** ~~150,000원~~ → 120,000원 🤝');
  assert.strictEqual(p.priceLine({ price: PRICE_UNKNOWN, negotiatedPrice: '120,000원' }), '**가격:** 120,000원 🤝');
  assert.strictEqual(p.priceLine({ price: PRICE_UNKNOWN }), `**가격:** ${PRICE_UNKNOWN}`);
});

test('boardPrice marks negotiated and 가격 미정', () => {
  assert.deepStrictEqual(p.boardPrice({ price: '150,000원' }), { price: '150,000원', negotiated: false });
  assert.deepStrictEqual(p.boardPrice({ price: '150,000원', negotiatedPrice: '120,000원' }), { price: '120,000원 🤝', negotiated: true });
  assert.deepStrictEqual(p.boardPrice({ price: PRICE_UNKNOWN }), { price: '가격 미정', negotiated: false });
});

test('depositAmount is 10% of the price digits', () => {
  assert.strictEqual(p.depositAmount('150,000원'), '15,000원');
  assert.strictEqual(p.depositAmount('120,000원 🤝'), '12,000원');
  assert.strictEqual(p.depositAmount('가격 미정'), null);
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `node --test test/pricing.test.js`
Expected: FAIL — `Cannot find module '../scripts/lib/pricing'`.

- [ ] **Step 3: Implement**

```js
// scripts/lib/pricing.js
const { LEGACY_PRICE_UNKNOWN, PRICE_UNKNOWN } = require('./listing-import');

const NEGOTIATED_EMOJI = '🤝';
const PRICE_UNKNOWN_DISPLAY = '가격 미정';

function isUnknownPrice(price) {
  return price === PRICE_UNKNOWN || price === LEGACY_PRICE_UNKNOWN;
}

function formatWon(won) {
  return `${Number(won).toLocaleString('en-US')}원`;
}

function effectivePrice(listing) {
  const neg = (listing && listing.negotiatedPrice) || '';
  if (neg) return neg;
  const orig = (listing && listing.price) || '';
  if (!orig || isUnknownPrice(orig)) return null;
  return orig;
}

function priceLine(listing) {
  const orig = (listing && listing.price) || '';
  const neg = (listing && listing.negotiatedPrice) || '';
  if (neg) {
    if (!orig || isUnknownPrice(orig)) return `**가격:** ${neg} ${NEGOTIATED_EMOJI}`;
    return `**가격:** ~~${orig}~~ → ${neg} ${NEGOTIATED_EMOJI}`;
  }
  return `**가격:** ${orig}`;
}

function boardPrice(listing) {
  const orig = (listing && listing.price) || '';
  const neg = (listing && listing.negotiatedPrice) || '';
  if (neg) return { price: `${neg} ${NEGOTIATED_EMOJI}`, negotiated: true };
  if (isUnknownPrice(orig)) return { price: PRICE_UNKNOWN_DISPLAY, negotiated: false };
  return { price: orig, negotiated: false };
}

function depositAmount(priceStr) {
  const digits = String(priceStr == null ? '' : priceStr).replace(/[^0-9]/g, '');
  if (!digits) return null;
  return formatWon(Math.round(Number(digits) * 0.1));
}

module.exports = {
  NEGOTIATED_EMOJI, PRICE_UNKNOWN_DISPLAY,
  isUnknownPrice, formatWon, effectivePrice, priceLine, boardPrice, depositAmount,
};
```

- [ ] **Step 4: Run test, verify it passes**

Run: `node --test test/pricing.test.js`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/pricing.js test/pricing.test.js
git commit -m "feat: 가격/예약금 순수 헬퍼(pricing.js)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_018KELvmPusvN7LPndJPgD68"
```

---

## Task 2: negotiation.js — 네고 금액 파싱 + 리액션 분류

**Files:**
- Create: `scripts/lib/negotiation.js`
- Test: `test/negotiation.test.js`

**Interfaces:**
- Produces:
  - `REACTION_ACCEPT='+1'`, `REACTION_REJECT='-1'`, `REACTION_EXPIRED='confused'`
  - `parseNegotiationAmount(body: string, keyword: string): number|null` — 키워드 뒤 첫 정수(콤마/원 허용), 양의 정수만
  - `classifyReactions(reactions: Array<{content,user:{login}}>, owner: string): 'pending'|'accepted-active'|'done'`

- [ ] **Step 1: Write the failing test**

```js
// test/negotiation.test.js
const { test } = require('node:test');
const assert = require('node:assert');
const n = require('../scripts/lib/negotiation');

test('parseNegotiationAmount reads the won amount', () => {
  assert.strictEqual(n.parseNegotiationAmount('#네고희망 10000', '#네고희망'), 10000);
  assert.strictEqual(n.parseNegotiationAmount('#네고희망 120,000원 가능할까요', '#네고희망'), 120000);
  assert.strictEqual(n.parseNegotiationAmount('가격 #네고희망  50000', '#네고희망'), 50000);
});

test('parseNegotiationAmount returns null for missing/invalid amount', () => {
  assert.strictEqual(n.parseNegotiationAmount('#네고희망 깎아주세요', '#네고희망'), null);
  assert.strictEqual(n.parseNegotiationAmount('#네고희망 0', '#네고희망'), null);
  assert.strictEqual(n.parseNegotiationAmount('관심 없어요', '#네고희망'), null);
});

test('classifyReactions: pending when no relevant reaction', () => {
  assert.strictEqual(n.classifyReactions([], 'Suckzoo'), 'pending');
  assert.strictEqual(n.classifyReactions([{ content: 'heart', user: { login: 'Suckzoo' } }], 'Suckzoo'), 'pending');
});

test('classifyReactions: accepted-active when owner 👍 and no expiry', () => {
  assert.strictEqual(n.classifyReactions([{ content: '+1', user: { login: 'Suckzoo' } }], 'Suckzoo'), 'accepted-active');
});

test('classifyReactions: done when owner 👎 or any 😕', () => {
  assert.strictEqual(n.classifyReactions([{ content: '-1', user: { login: 'Suckzoo' } }], 'Suckzoo'), 'done');
  assert.strictEqual(n.classifyReactions([
    { content: '+1', user: { login: 'Suckzoo' } },
    { content: 'confused', user: { login: 'github-actions[bot]' } },
  ], 'Suckzoo'), 'done');
});

test('classifyReactions: a non-owner 👍 does not accept', () => {
  assert.strictEqual(n.classifyReactions([{ content: '+1', user: { login: 'someone' } }], 'Suckzoo'), 'pending');
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `node --test test/negotiation.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```js
// scripts/lib/negotiation.js
const REACTION_ACCEPT = '+1';
const REACTION_REJECT = '-1';
const REACTION_EXPIRED = 'confused';

function parseNegotiationAmount(body, keyword) {
  const text = String(body || '');
  const idx = text.indexOf(keyword);
  if (idx === -1) return null;
  const after = text.slice(idx + keyword.length);
  const m = after.match(/([0-9][0-9,]*)/);
  if (!m) return null;
  const won = Number(m[1].replace(/,/g, ''));
  if (!Number.isInteger(won) || won <= 0) return null;
  return won;
}

function classifyReactions(reactions, owner) {
  const list = reactions || [];
  if (list.some((r) => r.content === REACTION_EXPIRED)) return 'done';
  const ownerContents = list.filter((r) => r.user && r.user.login === owner).map((r) => r.content);
  if (ownerContents.includes(REACTION_ACCEPT)) return 'accepted-active';
  if (ownerContents.includes(REACTION_REJECT)) return 'done';
  return 'pending';
}

module.exports = { REACTION_ACCEPT, REACTION_REJECT, REACTION_EXPIRED, parseNegotiationAmount, classifyReactions };
```

- [ ] **Step 4: Run test, verify it passes**

Run: `node --test test/negotiation.test.js`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/negotiation.js test/negotiation.test.js
git commit -m "feat: 네고 금액 파싱 + 리액션 분류(negotiation.js)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_018KELvmPusvN7LPndJPgD68"
```

---

## Task 3: state.js — `네고중` 상태

**Files:**
- Modify: `scripts/lib/state.js`
- Test: `test/state.test.js`

**Interfaces:**
- Consumes: `config.labels.negotiating`.
- Produces: `deriveStatus` returns `'negotiating'` when 네고중 라벨 존재(우선순위 reserved 아래, available 위).

- [ ] **Step 1: Write the failing test** (append to `test/state.test.js`)

```js
test('negotiating when 네고중 label present (below reserved, above available)', () => {
  const config = { labels: { paid: '입금 확인 완료', reserved: '예약금 대기중', negotiating: '네고중', available: '구매 가능' } };
  assert.strictEqual(require('../scripts/lib/state').deriveStatus(['매물', '네고중'], config), 'negotiating');
  // reserved wins over negotiating
  assert.strictEqual(require('../scripts/lib/state').deriveStatus(['예약금 대기중', '네고중'], config), 'reserved');
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `node --test test/state.test.js`
Expected: FAIL — got `'available'`/`'unknown'`, expected `'negotiating'`.

- [ ] **Step 3: Implement**

```js
// scripts/lib/state.js
function deriveStatus(labelNames, config) {
  const set = new Set(labelNames || []);
  const L = config.labels;
  if (set.has(L.paid)) return 'paid';
  if (set.has(L.reserved)) return 'reserved';
  if (L.negotiating && set.has(L.negotiating)) return 'negotiating';
  if (set.has(L.available)) return 'available';
  return 'unknown';
}

module.exports = { deriveStatus };
```

- [ ] **Step 4: Run test, verify it passes**

Run: `node --test test/state.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/state.js test/state.test.js
git commit -m "feat: deriveStatus에 네고중 상태 추가

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_018KELvmPusvN7LPndJPgD68"
```

---

## Task 4: listing-model.js — 보드 가격(네고가/🤝/범례)

**Files:**
- Modify: `scripts/lib/listing-model.js`
- Test: `test/listing-model.test.js`

**Interfaces:**
- Consumes: `boardPrice`, `NEGOTIATED_EMOJI` from `pricing.js`.
- Produces: `toListingModel` 결과의 `price`는 boardPrice 결과, 네고면 `note = '🤝 = 네고로 조정된 가격'`, 미정이면 기존 PRICE_UNKNOWN note 유지.

- [ ] **Step 1: Write the failing test** (append to `test/listing-model.test.js`)

```js
const { NEGOTIATED_EMOJI } = require('../scripts/lib/pricing');

test('negotiated listing shows negotiated price with 🤝 and legend note', () => {
  const issue = {
    number: 5, title: 'Q1', html_url: 'u',
    labels: [{ name: '매물' }, { name: '예약금 대기중' }],
    body: '<!-- market-listing: {"id":"5","price":"150,000원","negotiatedPrice":"120,000원"} -->',
  };
  const m = toListingModel(issue, config);
  assert.strictEqual(m.price, `120,000원 ${NEGOTIATED_EMOJI}`);
  assert.match(m.note, /네고/);
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `node --test test/listing-model.test.js`
Expected: FAIL — `m.price` is `'150,000원'` (negotiatedPrice ignored), note empty.

- [ ] **Step 3: Implement**

```js
// scripts/lib/listing-model.js
const { deriveStatus } = require('./state');
const { readListing, readState } = require('./markers');
const { PRICE_UNKNOWN } = require('./listing-import');
const { boardPrice } = require('./pricing');

const NEGOTIATED_NOTE = '🤝 = 네고로 조정된 가격';

function toListingModel(issue, config) {
  const labelNames = (issue.labels || []).map((l) => (typeof l === 'string' ? l : l.name));
  const listing = readListing(issue.body || '');
  const state = readState(issue.body || '');
  const bp = boardPrice(listing);
  let note = '';
  if (bp.negotiated) note = NEGOTIATED_NOTE;
  else if (bp.price === '가격 미정') note = PRICE_UNKNOWN;
  return {
    number: issue.number,
    id: listing.id ? String(listing.id) : String(issue.number),
    title: issue.title,
    price: bp.price,
    note,
    status: deriveStatus(labelNames, config),
    reserver: state.reserver || null,
    url: issue.html_url,
  };
}
module.exports = { toListingModel };
```

- [ ] **Step 4: Run test, verify it passes**

Run: `node --test test/listing-model.test.js`
Expected: PASS (all, including existing 가격 미정 test — `boardPrice` returns `'가격 미정'`).

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/listing-model.js test/listing-model.test.js
git commit -m "feat: 현황판 모델에 네고가(🤝)/범례 반영

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_018KELvmPusvN7LPndJPgD68"
```

---

## Task 5: build-issue.js — priceLine 사용

**Files:**
- Modify: `scripts/lib/build-issue.js`
- Test: `test/build-issue.test.js`

**Interfaces:**
- Consumes: `priceLine` from `pricing.js`.
- Produces: 본문 가격줄을 `priceLine({ price, negotiatedPrice })`로 생성(빌드 시 negotiatedPrice 없음 → `**가격:** {price}`). listing 마커는 기존대로 `{id, name, price}` (negotiatedPrice 미설정).

- [ ] **Step 1: Write the failing test** (append to `test/build-issue.test.js`)

```js
test('buildIssue renders the 가격 line via priceLine helper', () => {
  const row = { 번호: '1', 매물명: 'Keychron Q1', 가격: '120,000', 사진: 'https://img/q1.png' };
  const out = buildIssue(row, config);
  assert.match(out.body, /\*\*가격:\*\* 120,000/);
});
```

(이미 통과할 수도 있으나, 구현이 priceLine을 거치는지 보장하기 위해 유지. 핵심 회귀 방지는 전체 스위트.)

- [ ] **Step 2: Run test, verify current suite is green, then implement change**

Run: `node --test test/build-issue.test.js` → 현재 PASS. 변경 후에도 PASS 유지가 목표.

- [ ] **Step 3: Implement** (replace the 가격 push line)

```js
// scripts/lib/build-issue.js  — top
const { setMarker, MARKER } = require('./markers');
const { priceLine } = require('./pricing');
```

`if (price) sections.push(`**가격:** ${price}`);` 를 아래로 교체:

```js
  if (price) sections.push(priceLine({ price }));
```

- [ ] **Step 4: Run full suite**

Run: `node --test`
Expected: PASS (build-issue 포함 전부).

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/build-issue.js test/build-issue.test.js
git commit -m "refactor: build-issue 가격줄을 priceLine 헬퍼로

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_018KELvmPusvN7LPndJPgD68"
```

---

## Task 6: messages.js — 네고/차단 메시지 + 예약금 액수

**Files:**
- Modify: `scripts/lib/messages.js`
- Test: `test/messages.test.js`

**Interfaces:**
- Produces:
  - `negotiateAckMessage(config, amount: number): string` — 접수 안내(금액 포함).
  - `negotiateRejectedFormatMessage(config): string` — 금액 형식 오류.
  - `negotiateNotAllowedMessage(): string` — 예약/입금 단계 네고 불가.
  - `priceUnknownReserveMessage(config): string` — 가격 미정 #구매신청 차단(네고 유도).
  - `reserveBlockedByNegotiationMessage(): string` — 승낙 네고 진행 중 차단.
  - `reserveConfirmMessage(config, issueNumber, winner, reservedAt, depositStr)` — 5번째 인자 `depositStr` 추가, `💰 예약금: {depositStr}` 줄 포함.
  - `remindReserverMessage(config, issueNumber, user, reservedAt, depositStr)` — 동일하게 depositStr 추가.

- [ ] **Step 1: Write the failing test** (append/modify `test/messages.test.js`)

```js
test('reserveConfirmMessage includes the exact deposit amount', () => {
  const msg = m.reserveConfirmMessage(cfg, 12, 'octocat', '2026-07-01T11:00:00.000Z', '15,000원');
  assert.match(msg, /15,000원/);
  assert.match(msg, /예약금/);
});

test('negotiation/blocking messages exist', () => {
  assert.match(m.negotiateAckMessage(cfg, 120000), /120,000|네고|접수/);
  assert.match(m.negotiateRejectedFormatMessage(cfg), /금액|형식|예: ?#네고희망/);
  assert.match(m.negotiateNotAllowedMessage(), /네고/);
  assert.match(m.priceUnknownReserveMessage(cfg), /네고|가격 미정/);
  assert.match(m.reserveBlockedByNegotiationMessage(), /네고/);
});
```

(기존 `reserveConfirmMessage mentions the 10% deposit`/`mentions winner, deposit, form link` 테스트는 인자 4개 호출이라 `depositStr` 없이도 통과해야 함 → 구현에서 `depositStr` 누락 시 예약금 줄을 생략한다.)

- [ ] **Step 2: Run test, verify it fails**

Run: `node --test test/messages.test.js`
Expected: FAIL — new functions undefined; deposit not in message.

- [ ] **Step 3: Implement** (edit `scripts/lib/messages.js`)

`reserveConfirmMessage`/`remindReserverMessage`에 depositStr 인자 + 예약금 줄 추가(누락 시 생략):

```js
function remindReserverMessage(config, issueNumber, user, reservedAt, depositStr) {
  return [
    `@${user}님은 이미 예약 상태입니다.`,
    `${config.reservationHours}시간 이내에 ①물품 가액의 10%를 예약금으로 송금 ②예약 폼 작성을 완료하신 뒤, 이 이슈에 \`${config.paidKeyword}\` 댓글을 남겨주시면 예약이 확정됩니다.`,
    ...(depositStr ? [`💰 예약금: **${depositStr}**`] : []),
    `💳 ${config.depositInfo}`,
    `📝 예약 폼: ${buildFormUrl(config, issueNumber, user)}`,
    `⏰ 마감: ${deadlineIso(reservedAt, config.reservationHours)}`,
  ].join('\n');
}

function reserveConfirmMessage(config, issueNumber, winner, reservedAt, depositStr) {
  return [
    `**@${winner}**님 예약 완료 ✅`,
    `${config.reservationHours}시간 이내에 ①물품 가액의 10%를 예약금으로 송금 ②예약 폼 작성을 완료하신 뒤, 이 이슈에 \`${config.paidKeyword}\` 댓글을 남겨주시면 예약이 확정됩니다.`,
    `(${config.reservationHours}시간 내 \`${config.paidKeyword}\` 댓글이 없으면 예약은 자동 취소되어 다시 구매 가능 상태로 전환됩니다.)`,
    ...(depositStr ? [`💰 예약금: **${depositStr}**`] : []),
    `💳 ${config.depositInfo}`,
    `📝 예약 폼: ${buildFormUrl(config, issueNumber, winner)}`,
    `⏰ 마감: ${deadlineIso(reservedAt, config.reservationHours)}`,
  ].join('\n');
}
```

새 메시지 함수 추가(파일 하단, expiredMessage 부근):

```js
function negotiateAckMessage(config, amount) {
  return `네고 제안(${Number(amount).toLocaleString('en-US')}원)이 접수되었습니다. 운영자가 검토 후 👍 수락 / 👎 거절로 처리합니다. 수락되면 자동으로 예약이 잡히며, 알림이 오면 3시간 이내에 예약금을 입금해 주세요.`;
}

function negotiateRejectedFormatMessage(config) {
  return `네고 금액을 인식하지 못했습니다. 예: \`${config.negotiateKeyword} 120000\` 처럼 원화 금액을 함께 적어주세요.`;
}

function negotiateNotAllowedMessage() {
  return '이미 예약/입금이 진행 중인 매물이라 네고를 받을 수 없습니다.';
}

function priceUnknownReserveMessage(config) {
  return `가격 미정 매물입니다. \`${config.negotiateKeyword} {금액}\`으로 희망 가격을 제안해 주세요. 운영자 확인 후 진행됩니다.`;
}

function reserveBlockedByNegotiationMessage() {
  return '이미 승낙된 네고 건이 진행 중이라 예약할 수 없습니다.';
}
```

module.exports에 5개 함수 추가.

- [ ] **Step 4: Run test, verify it passes**

Run: `node --test test/messages.test.js`
Expected: PASS (기존 포함).

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/messages.js test/messages.test.js
git commit -m "feat: 네고/차단 메시지 + 예약금 액수 안내

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_018KELvmPusvN7LPndJPgD68"
```

---

## Task 7: decide-negotiation.js — `#네고희망` 접수 판정

**Files:**
- Create: `scripts/lib/decide-negotiation.js`
- Test: `test/decide-negotiation.test.js`

**Interfaces:**
- Consumes: `deriveStatus`(state), `parseNegotiationAmount`(negotiation), messages.
- Produces: `decideNegotiation({ commentBody, labelNames, config }): { action, amount?, comment? }`
  - `{action:'ignore'}` — 키워드 없음.
  - `{action:'comment_only', comment}` — 금액 오류 / 예약·입금 단계.
  - `{action:'negotiate_open', amount, comment}` — available/negotiating.

- [ ] **Step 1: Write the failing test**

```js
// test/decide-negotiation.test.js
const { test } = require('node:test');
const assert = require('node:assert');
const { decideNegotiation } = require('../scripts/lib/decide-negotiation');

const config = {
  negotiateKeyword: '#네고희망',
  labels: { scope: '매물', available: '구매 가능', reserved: '예약금 대기중', negotiating: '네고중', paid: '입금 확인 완료' },
};

test('ignores comment without the keyword', () => {
  assert.strictEqual(decideNegotiation({ commentBody: '안녕', labelNames: ['매물', '구매 가능'], config }).action, 'ignore');
});

test('comment_only on bad amount', () => {
  const r = decideNegotiation({ commentBody: '#네고희망 깎아줘', labelNames: ['매물', '구매 가능'], config });
  assert.strictEqual(r.action, 'comment_only');
});

test('negotiate_open on available', () => {
  const r = decideNegotiation({ commentBody: '#네고희망 120000', labelNames: ['매물', '구매 가능'], config });
  assert.strictEqual(r.action, 'negotiate_open');
  assert.strictEqual(r.amount, 120000);
});

test('negotiate_open on already negotiating', () => {
  const r = decideNegotiation({ commentBody: '#네고희망 100000', labelNames: ['매물', '네고중'], config });
  assert.strictEqual(r.action, 'negotiate_open');
});

test('comment_only(not allowed) on reserved/paid', () => {
  assert.strictEqual(decideNegotiation({ commentBody: '#네고희망 100000', labelNames: ['매물', '예약금 대기중'], config }).action, 'comment_only');
  assert.strictEqual(decideNegotiation({ commentBody: '#네고희망 100000', labelNames: ['매물', '입금 확인 완료'], config }).action, 'comment_only');
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `node --test test/decide-negotiation.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```js
// scripts/lib/decide-negotiation.js
const { deriveStatus } = require('./state');
const { parseNegotiationAmount } = require('./negotiation');
const messages = require('./messages');

function decideNegotiation({ commentBody, labelNames, config }) {
  const body = commentBody || '';
  if (!config.negotiateKeyword || !body.includes(config.negotiateKeyword)) {
    return { action: 'ignore' };
  }
  const amount = parseNegotiationAmount(body, config.negotiateKeyword);
  if (amount === null) {
    return { action: 'comment_only', comment: messages.negotiateRejectedFormatMessage(config) };
  }
  const status = deriveStatus(labelNames, config);
  if (status === 'reserved' || status === 'paid') {
    return { action: 'comment_only', comment: messages.negotiateNotAllowedMessage() };
  }
  return { action: 'negotiate_open', amount, comment: messages.negotiateAckMessage(config, amount) };
}

module.exports = { decideNegotiation };
```

- [ ] **Step 4: Run test, verify it passes**

Run: `node --test test/decide-negotiation.test.js`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/decide-negotiation.js test/decide-negotiation.test.js
git commit -m "feat: #네고희망 접수 판정(decide-negotiation)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_018KELvmPusvN7LPndJPgD68"
```

---

## Task 8: reconcile-negotiation.js — 리액션 → accept/release/stay

**Files:**
- Create: `scripts/lib/reconcile-negotiation.js`
- Test: `test/reconcile-negotiation.test.js`

**Interfaces:**
- Produces: `reconcileNegotiation({ negotiationComments }): { action, winner?, amount?, commentId? }`
  - 입력 `negotiationComments`: `[{ id, author, amount, klass }]` (생성시각 오름차순 정렬 가정).
  - `accepted-active` 존재 → `{action:'accept', winner, amount, commentId}` (가장 이른 것).
  - 없고 `pending` 존재 → `{action:'stay_negotiating'}`.
  - 그 외 → `{action:'release'}`.

- [ ] **Step 1: Write the failing test**

```js
// test/reconcile-negotiation.test.js
const { test } = require('node:test');
const assert = require('node:assert');
const { reconcileNegotiation } = require('../scripts/lib/reconcile-negotiation');

test('accept picks the earliest accepted-active comment', () => {
  const r = reconcileNegotiation({ negotiationComments: [
    { id: 1, author: 'a', amount: 120000, klass: 'done' },
    { id: 2, author: 'b', amount: 100000, klass: 'accepted-active' },
    { id: 3, author: 'c', amount: 90000, klass: 'accepted-active' },
  ] });
  assert.deepStrictEqual(r, { action: 'accept', winner: 'b', amount: 100000, commentId: 2 });
});

test('stay_negotiating when only pending remain', () => {
  const r = reconcileNegotiation({ negotiationComments: [
    { id: 1, author: 'a', amount: 1, klass: 'done' },
    { id: 2, author: 'b', amount: 2, klass: 'pending' },
  ] });
  assert.strictEqual(r.action, 'stay_negotiating');
});

test('release when all done', () => {
  const r = reconcileNegotiation({ negotiationComments: [
    { id: 1, author: 'a', amount: 1, klass: 'done' },
  ] });
  assert.strictEqual(r.action, 'release');
});

test('release when empty', () => {
  assert.strictEqual(reconcileNegotiation({ negotiationComments: [] }).action, 'release');
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `node --test test/reconcile-negotiation.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```js
// scripts/lib/reconcile-negotiation.js
function reconcileNegotiation({ negotiationComments }) {
  const list = negotiationComments || [];
  const accepted = list.find((c) => c.klass === 'accepted-active');
  if (accepted) {
    return { action: 'accept', winner: accepted.author, amount: accepted.amount, commentId: accepted.id };
  }
  if (list.some((c) => c.klass === 'pending')) {
    return { action: 'stay_negotiating' };
  }
  return { action: 'release' };
}

module.exports = { reconcileNegotiation };
```

- [ ] **Step 4: Run test, verify it passes**

Run: `node --test test/reconcile-negotiation.test.js`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/reconcile-negotiation.js test/reconcile-negotiation.test.js
git commit -m "feat: 네고 리액션 리콘실(reconcile-negotiation)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_018KELvmPusvN7LPndJPgD68"
```

---

## Task 9: decide-comment.js — `#구매신청` 네고 인지

**Files:**
- Modify: `scripts/lib/decide-comment.js`
- Test: `test/decide-comment.test.js`

**Interfaces:**
- Consumes: `effectivePrice`, `depositAmount` from `pricing.js`; `readListing` from markers.
- Produces: `decideComment(input)` 추가 입력 `listing`(파싱된 listing 마커), `negotiationComments`(분류 배열, 기본 []).
  - 예약 가능 분기는 `status === 'available' || status === 'negotiating'`.
  - `effectivePrice(listing) === null` → `comment_only` priceUnknownReserveMessage.
  - `negotiationComments`에 `accepted-active` 존재 → `comment_only` reserveBlockedByNegotiationMessage.
  - reserve 시 `reserveConfirmMessage(..., depositAmount(effectivePrice(listing)))`.
  - reserved 분기의 remind도 deposit 포함.

- [ ] **Step 1: Write the failing test** (append to `test/decide-comment.test.js`)

```js
const PRICE = '<!-- market-listing: {"price":"150,000원"} -->';
const UNKNOWN = '<!-- market-listing: {"price":"정확한 가격 정보 확인이 어려운 키보드는 적정 가격을 제안받아 확인 후 가격을 확정할 예정입니다. 가격 제안은 해당 판매글 댓글이나 문의 이메일로 남겨 주세요."} -->';

test('reserve includes deposit amount (10% of price)', () => {
  const comments = [{ author: 'alice', body: '#구매신청', createdAt: '2026-07-01T11:00:03Z' }];
  const r = decideComment({ ...base, commentBody: '#구매신청', commenter: 'alice',
    labelNames: ['매물', '구매 가능'], issueBody: PRICE,
    listing: { price: '150,000원' }, comments, now: new Date('2026-07-01T11:00:03Z') });
  assert.strictEqual(r.action, 'reserve');
  assert.match(r.comment, /15,000원/);
});

test('price-unknown blocks #구매신청 with negotiation guidance', () => {
  const r = decideComment({ ...base, commentBody: '#구매신청', labelNames: ['매물', '구매 가능'],
    issueBody: UNKNOWN, listing: { price: '정확한 가격 정보 확인이 어려운 키보드는 적정 가격을 제안받아 확인 후 가격을 확정할 예정입니다. 가격 제안은 해당 판매글 댓글이나 문의 이메일로 남겨 주세요.' },
    comments: [], now: new Date('2026-07-01T12:00:00Z') });
  assert.strictEqual(r.action, 'comment_only');
  assert.match(r.comment, /네고|가격 미정/);
});

test('accepted-active negotiation blocks #구매신청', () => {
  const comments = [{ author: 'alice', body: '#구매신청', createdAt: '2026-07-01T11:00:03Z' }];
  const r = decideComment({ ...base, commentBody: '#구매신청', commenter: 'alice',
    labelNames: ['매물', '네고중'], issueBody: PRICE, listing: { price: '150,000원' },
    negotiationComments: [{ id: 1, author: 'bob', amount: 100000, klass: 'accepted-active' }],
    comments, now: new Date('2026-07-01T11:00:03Z') });
  assert.strictEqual(r.action, 'comment_only');
  assert.match(r.comment, /네고/);
});

test('reserves on negotiating when no accepted-active', () => {
  const comments = [{ author: 'alice', body: '#구매신청', createdAt: '2026-07-01T11:00:03Z' }];
  const r = decideComment({ ...base, commentBody: '#구매신청', commenter: 'alice',
    labelNames: ['매물', '네고중'], issueBody: PRICE, listing: { price: '150,000원' },
    negotiationComments: [{ id: 1, author: 'bob', amount: 100000, klass: 'pending' }],
    comments, now: new Date('2026-07-01T11:00:03Z') });
  assert.strictEqual(r.action, 'reserve');
});
```

(주의: `base`는 `config`를 포함한다. 기존 fixture config에 `labels.negotiating`이 없으면 이 테스트의 config에 추가 필요 → Task 13에서 fixture/`config`에 negotiating 추가. 이 태스크 진행 전 `test/decide-comment.test.js`의 `config`에 `negotiating: '네고중'`을 추가하라.)

- [ ] **Step 2: 사전 편집 + Run test, verify it fails**

`test/decide-comment.test.js` 상단 `config.labels`에 `negotiating: '예약금 대기중'`이 아니라 `negotiating: '네고중'` 추가. 그 후:
Run: `node --test test/decide-comment.test.js`
Expected: FAIL — deposit 미포함 / unknown·accepted-active 미차단 / negotiating에서 ignore.

- [ ] **Step 3: Implement** (edit `scripts/lib/decide-comment.js`)

상단 import 추가:

```js
const { effectivePrice, depositAmount } = require('./pricing');
```

함수 시그니처 입력에 `listing`, `negotiationComments` 추가, reserved remind와 available/negotiating 분기 수정. 전체 교체본:

```js
function decideComment(input) {
  const { issueNumber, commentBody, commenter, labelNames, issueBody, comments, config, now } = input;
  const listing = input.listing || {};
  const negotiationComments = input.negotiationComments || [];

  const body = commentBody || '';

  if (config.paidKeyword && body.includes(config.paidKeyword)) {
    const status = deriveStatus(labelNames, config);
    const state = readState(issueBody);
    if (status === 'reserved' && state.reserver && state.reserver === commenter) {
      return { action: 'paid_claim', comment: messages.paidClaimedMessage(config) };
    }
    return { action: 'ignore' };
  }

  if (!body.includes(config.keyword)) return { action: 'ignore' };

  const openAt = new Date(config.openAt);
  if (now < openAt) return { action: 'comment_only', comment: messages.notOpenMessage(config) };

  const status = deriveStatus(labelNames, config);
  const state = readState(issueBody);

  if (status === 'paid') return { action: 'comment_only', comment: messages.soldMessage() };

  if (status === 'reserved') {
    if (state.reserver && state.reserver === commenter) {
      const dep = depositAmount(effectivePrice(listing));
      return { action: 'comment_only', comment: messages.remindReserverMessage(config, issueNumber, commenter, state.reservedAt, dep) };
    }
    return { action: 'comment_only', comment: messages.reservedByOtherMessage() };
  }

  // reservable: available or negotiating
  if (status !== 'available' && status !== 'negotiating') return { action: 'ignore' };

  if (config.closeAt && now >= new Date(config.closeAt)) {
    return { action: 'comment_only', comment: messages.closedMessage(config) };
  }

  const effective = effectivePrice(listing);
  if (effective === null) {
    return { action: 'comment_only', comment: messages.priceUnknownReserveMessage(config) };
  }
  if (negotiationComments.some((c) => c.klass === 'accepted-active')) {
    return { action: 'comment_only', comment: messages.reserveBlockedByNegotiationMessage() };
  }

  const since = state.availableSince ? new Date(state.availableSince) : openAt;
  const candidates = (comments || [])
    .filter((c) => !isBot(c.author) && c.body && c.body.includes(config.keyword) && new Date(c.createdAt) >= since)
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

  if (candidates.length === 0) return { action: 'ignore' };

  const winner = candidates[0].author;
  const reservedAt = candidates[0].createdAt;
  return {
    action: 'reserve',
    winner,
    reservedAt,
    comment: messages.reserveConfirmMessage(config, issueNumber, winner, reservedAt, depositAmount(effective)),
  };
}
```

- [ ] **Step 4: Run full suite**

Run: `node --test`
Expected: PASS. (기존 reserve 테스트는 `listing`/`negotiationComments` 미전달 → effectivePrice({})=null이 되어 깨질 수 있음. 기존 `test/decide-comment.test.js`의 reserve/remind 테스트에 `listing: { price: '150,000원' }`를 추가하라. 해당 테스트 수정도 이 태스크에 포함.)

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/decide-comment.js test/decide-comment.test.js
git commit -m "feat: #구매신청 네고 인지(가격미정·승낙네고 차단, 예약금 명시)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_018KELvmPusvN7LPndJPgD68"
```

---

## Task 10: config.json + fixture — owner/negotiateKeyword/네고중 라벨

**Files:**
- Modify: `config.json`, `test/fixtures/config.test.json`
- Test: 전체 스위트 (`node --test`)

**Interfaces:**
- Produces: config에 `owner`, `negotiateKeyword`, `labels.negotiating` 존재.

- [ ] **Step 1: Edit config.json** (키 추가)

```jsonc
{
  "owner": "Suckzoo",
  "openAt": "...", "closeAt": "...",
  "keyword": "#구매신청",
  "paidKeyword": "#입금완료",
  "negotiateKeyword": "#네고희망",
  ...,
  "labels": { "scope": "매물", "available": "구매 가능", "reserved": "예약금 대기중", "negotiating": "네고중", "paid": "입금 확인 완료" }
}
```

- [ ] **Step 2: Edit test/fixtures/config.test.json** (동일 키 추가: `owner: "Suckzoo"`, `negotiateKeyword: "#네고희망"`, `labels.negotiating: "네고중"`)

- [ ] **Step 3: Validate**

Run: `node -e "require('./config.json'); require('./test/fixtures/config.test.json'); console.log('ok')"`
Expected: `ok`

- [ ] **Step 4: Run full suite**

Run: `node --test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add config.json test/fixtures/config.test.json
git commit -m "feat: config에 owner/네고 키워드/네고중 라벨 추가

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_018KELvmPusvN7LPndJPgD68"
```

---

## Task 11: handle-comment.js — 네고 접수 + 예약 라벨 정리 + 리액션 조회

**Files:**
- Modify: `scripts/handle-comment.js`
- Test: `test/handle-comment.test.js` (+ `test/helpers/fake-github.js` 확장)

**Interfaces:**
- Consumes: `decideNegotiation`, `readListing`, `classifyReactions`, `parseNegotiationAmount`.
- Produces: comment-handler가 (1) `#네고희망` → decideNegotiation → `negotiate_open`이면 available 제거+네고중 추가+ack, (2) `#구매신청` 등은 decideComment에 `listing`/`negotiationComments` 전달, `reserve` 시 available·네고중 라벨 모두 제거 후 reserved 추가.

- [ ] **Step 1: Extend fake-github helper** (`test/helpers/fake-github.js`)

`reactions.listForIssueComment` 목 추가, `listComments`가 `id`/reactions를 포함하도록:

```js
function makeFakeGithub({ comments = [], issue = {}, reactionsByComment = {} } = {}) {
  const calls = [];
  const rest = {
    issues: {
      listComments: async () => ({ data: comments }),
      createComment: async (p) => { calls.push(['createComment', p]); return { data: {} }; },
      addLabels: async (p) => { calls.push(['addLabels', p]); return { data: {} }; },
      removeLabel: async (p) => { calls.push(['removeLabel', p]); return { data: {} }; },
      get: async () => ({ data: issue }),
      update: async (p) => { calls.push(['update', p]); Object.assign(issue, p); return { data: {} }; },
    },
    reactions: {
      listForIssueComment: async ({ comment_id }) => ({ data: reactionsByComment[comment_id] || [] }),
      createForIssueComment: async (p) => { calls.push(['createReaction', p]); return { data: {} }; },
    },
  };
  const github = { rest, paginate: async (fn, params) => (await fn(params)).data };
  return { github, calls, issue };
}
```

- [ ] **Step 2: Write the failing tests** (append to `test/handle-comment.test.js`)

```js
test('negotiate_open: removes 구매 가능, adds 네고중, acks', async () => {
  const { github, calls } = makeFakeGithub({ comments: [] });
  const context = ctx({ body: '#네고희망 120000', login: 'bob', labels: ['매물', '구매 가능'], issueBody: '<!-- market-listing: {"price":"150,000원"} -->' });
  const r = await run({ github, context, configPath, now: new Date('2026-07-01T12:00:00Z') });
  assert.strictEqual(r.action, 'negotiate_open');
  const names = calls.map((c) => c[0]);
  assert.ok(names.includes('addLabels'));
  assert.ok(names.includes('removeLabel'));
  assert.ok(names.includes('createComment'));
});

test('reserve from 네고중 clears 네고중 + 구매 가능 labels', async () => {
  const comments = [{ id: 9, user: { login: 'bob' }, body: '#네고희망 100000', created_at: '2026-07-01T11:00:00Z' },
                    { user: { login: 'alice' }, body: '#구매신청', created_at: '2026-07-01T11:30:00Z' }];
  const { github, calls } = makeFakeGithub({ comments, reactionsByComment: { 9: [] } });
  const context = ctx({ body: '#구매신청', login: 'alice', labels: ['매물', '네고중'], issueBody: '<!-- market-listing: {"price":"150,000원"} -->' });
  const r = await run({ github, context, configPath, now: new Date('2026-07-01T11:30:00Z') });
  assert.strictEqual(r.action, 'reserve');
  const removed = calls.filter((c) => c[0] === 'removeLabel').map((c) => c[1].name);
  assert.ok(removed.includes('네고중'));
});
```

(`ctx`는 `number`를 받으므로 reactions 조회용 comment id는 fixture에서 number로 매칭. `configPath` fixture는 Task 10에서 negotiating 포함.)

- [ ] **Step 3: Run tests, verify they fail**

Run: `node --test test/handle-comment.test.js`
Expected: FAIL — negotiate_open 미처리, 네고중 라벨 미제거.

- [ ] **Step 4: Implement** (edit `scripts/handle-comment.js`)

전체 교체:

```js
const { loadConfig } = require('./lib/config');
const { decideComment } = require('./lib/decide-comment');
const { decideNegotiation } = require('./lib/decide-negotiation');
const { setMarker, MARKER, readState, readListing } = require('./lib/markers');
const { parseNegotiationAmount, classifyReactions } = require('./lib/negotiation');

async function classifiedNegotiations(github, owner, repo, issue_number, rawComments, config) {
  const out = [];
  for (const c of rawComments) {
    const author = c.user && c.user.login;
    if (!author || author.endsWith('[bot]')) continue;
    if (!c.body || !c.body.includes(config.negotiateKeyword)) continue;
    const amount = parseNegotiationAmount(c.body, config.negotiateKeyword);
    if (amount === null) continue;
    const reactions = await github.paginate(github.rest.reactions.listForIssueComment, { owner, repo, comment_id: c.id, per_page: 100 });
    out.push({ id: c.id, author, amount, createdAt: c.created_at, klass: classifyReactions(reactions, config.owner) });
  }
  return out.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
}

module.exports = async function run({ github, context, configPath = 'config.json', now = new Date() }) {
  const config = loadConfig(configPath);
  const { owner, repo } = context.repo;
  const issue = context.payload.issue;
  const issue_number = issue.number;
  const labelNames = (issue.labels || []).map((l) => (typeof l === 'string' ? l : l.name));
  const commentBody = context.payload.comment.body;

  // #네고희망 intake
  if (config.negotiateKeyword && commentBody.includes(config.negotiateKeyword)) {
    const neg = decideNegotiation({ commentBody, labelNames, config });
    if (neg.action === 'ignore') return neg;
    if (neg.action === 'comment_only') {
      await github.rest.issues.createComment({ owner, repo, issue_number, body: neg.comment });
      return neg;
    }
    // negotiate_open
    await github.rest.issues.removeLabel({ owner, repo, issue_number, name: config.labels.available }).catch(() => {});
    if (!labelNames.includes(config.labels.negotiating)) {
      await github.rest.issues.addLabels({ owner, repo, issue_number, labels: [config.labels.negotiating] });
    }
    await github.rest.issues.createComment({ owner, repo, issue_number, body: neg.comment });
    return neg;
  }

  const rawComments = await github.paginate(github.rest.issues.listComments, { owner, repo, issue_number, per_page: 100 });
  const comments = rawComments.map((c) => ({ author: c.user && c.user.login, body: c.body, createdAt: c.created_at }));
  const listing = readListing(issue.body || '');

  // accepted-active 감지를 위해 네고중일 때만 리액션 조회
  const status = labelNames.includes(config.labels.negotiating) ? 'negotiating' : '';
  const negotiationComments = status === 'negotiating'
    ? await classifiedNegotiations(github, owner, repo, issue_number, rawComments, config) : [];

  const result = decideComment({
    issueNumber: issue_number, commentBody, commenter: context.payload.comment.user.login,
    labelNames, issueBody: issue.body || '', comments, listing, negotiationComments, config, now,
  });

  if (result.action === 'ignore') return result;
  if (result.action === 'comment_only') {
    await github.rest.issues.createComment({ owner, repo, issue_number, body: result.comment });
    return result;
  }
  if (result.action === 'paid_claim') {
    const state = readState(issue.body || '');
    const newBody = setMarker(issue.body || '', MARKER.state, {
      reserver: state.reserver, reservedAt: state.reservedAt, availableSince: state.availableSince, paidClaimedAt: now.toISOString(),
    });
    await github.rest.issues.update({ owner, repo, issue_number, body: newBody });
    await github.rest.issues.createComment({ owner, repo, issue_number, body: result.comment });
    return result;
  }

  // reserve
  const state = readState(issue.body || '');
  const newBody = setMarker(issue.body || '', MARKER.state, {
    reserver: result.winner, reservedAt: result.reservedAt, availableSince: state.availableSince, paidClaimedAt: null,
  });
  await github.rest.issues.update({ owner, repo, issue_number, body: newBody });
  await github.rest.issues.removeLabel({ owner, repo, issue_number, name: config.labels.available }).catch(() => {});
  await github.rest.issues.removeLabel({ owner, repo, issue_number, name: config.labels.negotiating }).catch(() => {});
  await github.rest.issues.addLabels({ owner, repo, issue_number, labels: [config.labels.reserved] });
  await github.rest.issues.createComment({ owner, repo, issue_number, body: result.comment });
  return result;
};
```

- [ ] **Step 5: Run full suite, then commit**

Run: `node --test`
Expected: PASS.

```bash
git add scripts/handle-comment.js test/handle-comment.test.js test/helpers/fake-github.js
git commit -m "feat: comment-handler 네고 접수/예약 라벨 정리/리액션 조회

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_018KELvmPusvN7LPndJPgD68"
```

---

## Task 12: sweep-timeouts.js — 네고 리콘실 + 만료 😕 + 네고중 복귀

**Files:**
- Modify: `scripts/sweep-timeouts.js`
- Test: `test/sweep-timeouts.test.js`

**Interfaces:**
- Consumes: `reconcileNegotiation`, `classifyReactions`, `parseNegotiationAmount`, `effectivePrice`/`depositAmount`/`priceLine`/`formatWon`(pricing), `reserveConfirmMessage`(messages), `REACTION_EXPIRED`.
- Produces: sweeper가 `네고중` 이슈 리콘실(accept/release/stay) + `예약금 대기중` 이슈 만료(만료 시 acceptedNegotiationCommentId 댓글에 😕, pending 네고 있으면 네고중 복귀).

핵심 로직(글루):
- 두 목록 조회: `labels: negotiating` 와 `labels: reserved` (둘 다 state:open).
- **리콘실**(네고중): 각 이슈의 분류된 네고 댓글로 `reconcileNegotiation`.
  - `accept`: 재조회로 still 네고중 확인 → `negotiatedWon = min(기존 negotiatedPrice 숫자 ?? Infinity, amount)`; `negotiatedPrice = formatWon(negotiatedWon)`; listing 마커에 negotiatedPrice 저장 + 본문 가격줄을 `priceLine(listing')`로 교체; state 마커 `{reserver:winner, reservedAt: now.toISOString(), availableSince:null, paidClaimedAt:null, acceptedNegotiationCommentId: commentId}`; 라벨 네고중→예약금 대기중; 댓글 `reserveConfirmMessage(config, n, winner, now.toISOString(), depositAmount(negotiatedPrice))`.
  - `release`: 네고중→구매 가능.
  - `stay_negotiating`: skip.
- **만료**(예약금 대기중): `decideSweep` 만료 시 → `acceptedNegotiationCommentId` 있으면 그 댓글에 `reactions.createForIssueComment(content: REACTION_EXPIRED)` + 해당 필드 null; 그 후 네고 댓글 재분류해 `pending` 있으면 라벨 예약금 대기중→네고중, 없으면 →구매 가능; state 마커 reserver/reservedAt/paidClaimedAt/acceptedNegotiationCommentId=null, availableSince=now; negotiatedPrice는 listing 마커에 유지. 댓글 expiredMessage.

본문 가격줄 교체 정규식: `body.replace(/^\*\*가격:\*\*.*$/m, priceLine(listing'))`. listing 마커 갱신: `setMarker(body, MARKER.listing, { ...listing, negotiatedPrice })`.

- [ ] **Step 1: Write the failing tests** (`test/sweep-timeouts.test.js` — fakeGithub 확장 필요: reactions 목 + listComments)

기존 `fakeGithub`에 `listComments`/`reactions` 추가:

```js
function fakeGithub(issuesByLabel, commentsByIssue = {}, reactionsByComment = {}) {
  const calls = [];
  const rest = {
    issues: {
      listForRepo: async ({ labels }) => ({ data: issuesByLabel[labels] || [] }),
      listComments: async ({ issue_number }) => ({ data: commentsByIssue[issue_number] || [] }),
      createComment: async (p) => calls.push(['createComment', p]),
      addLabels: async (p) => calls.push(['addLabels', p]),
      removeLabel: async (p) => calls.push(['removeLabel', p]),
      update: async (p) => calls.push(['update', p]),
    },
    reactions: {
      listForIssueComment: async ({ comment_id }) => ({ data: reactionsByComment[comment_id] || [] }),
      createForIssueComment: async (p) => calls.push(['createReaction', p]),
    },
  };
  return { github: { rest, paginate: async (fn, params) => (await fn(params)).data }, calls };
}
```

테스트:

```js
test('reconcile: 👍 accepted negotiation -> reserves at negotiated price', async () => {
  const issuesByLabel = {
    '네고중': [{ number: 7, labels: [{ name: '매물' }, { name: '네고중' }],
      body: 'PID: 9\n\n**가격:** 150,000원\n\n<!-- market-listing: {"id":"9","name":"x","price":"150,000원"} -->\n<!-- market-state: {"reserver":null,"reservedAt":null,"availableSince":null} -->' }],
    '예약금 대기중': [],
  };
  const commentsByIssue = { 7: [{ id: 50, user: { login: 'bob' }, body: '#네고희망 120000', created_at: '2026-07-01T11:00:00Z' }] };
  const reactionsByComment = { 50: [{ content: '+1', user: { login: 'Suckzoo' } }] };
  const { github, calls } = fakeGithub(issuesByLabel, commentsByIssue, reactionsByComment);
  await run({ github, context, configPath, now: new Date('2026-07-01T12:00:00Z') });
  const update = calls.find((c) => c[0] === 'update')[1];
  assert.match(update.body, /"negotiatedPrice":"120,000원"/);
  assert.match(update.body, /"reserver":"bob"/);
  assert.match(update.body, /~~150,000원~~ → 120,000원/);
  assert.ok(calls.some((c) => c[0] === 'addLabels' && c[1].labels.includes('예약금 대기중')));
  assert.ok(calls.some((c) => c[0] === 'createComment' && /12,000원/.test(c[1].body)));
});

test('reconcile: all 👎 -> release to 구매 가능', async () => {
  const issuesByLabel = {
    '네고중': [{ number: 8, labels: [{ name: '매물' }, { name: '네고중' }],
      body: '<!-- market-listing: {"price":"150,000원"} -->\n<!-- market-state: {"reserver":null} -->' }],
    '예약금 대기중': [],
  };
  const commentsByIssue = { 8: [{ id: 60, user: { login: 'bob' }, body: '#네고희망 100', created_at: 't' }] };
  const reactionsByComment = { 60: [{ content: '-1', user: { login: 'Suckzoo' } }] };
  const { github, calls } = fakeGithub(issuesByLabel, commentsByIssue, reactionsByComment);
  await run({ github, context, configPath, now: new Date('2026-07-01T12:00:00Z') });
  assert.ok(calls.some((c) => c[0] === 'addLabels' && c[1].labels.includes('구매 가능')));
});

test('expiry of accepted negotiation marks the comment 😕 and reverts', async () => {
  const issuesByLabel = {
    '네고중': [],
    '예약금 대기중': [{ number: 9, labels: [{ name: '매물' }, { name: '예약금 대기중' }],
      body: '<!-- market-listing: {"price":"150,000원","negotiatedPrice":"120,000원"} -->\n<!-- market-state: {"reserver":"bob","reservedAt":"2026-07-01T11:00:00Z","availableSince":null,"paidClaimedAt":null,"acceptedNegotiationCommentId":50} -->' }],
  };
  const commentsByIssue = { 9: [{ id: 50, user: { login: 'bob' }, body: '#네고희망 120000', created_at: '2026-07-01T11:00:00Z' }] };
  const reactionsByComment = { 50: [{ content: '+1', user: { login: 'Suckzoo' } }] };
  const { github, calls } = fakeGithub(issuesByLabel, commentsByIssue, reactionsByComment);
  await run({ github, context, configPath, now: new Date('2026-07-01T20:00:00Z') });
  assert.ok(calls.some((c) => c[0] === 'createReaction' && c[1].content === 'confused' && c[1].comment_id === 50));
  // negotiatedPrice retained
  const update = calls.find((c) => c[0] === 'update')[1];
  assert.match(update.body, /"negotiatedPrice":"120,000원"/);
});
```

- [ ] **Step 2: Run tests, verify they fail**

Run: `node --test test/sweep-timeouts.test.js`
Expected: FAIL — reconcile 미구현 등. (기존 만료 테스트 2개는 `issuesByLabel`로 시그니처 변경 → 기존 테스트도 새 fakeGithub 형태로 갱신 필요. 이 태스크에 포함.)

- [ ] **Step 3: Implement** (`scripts/sweep-timeouts.js` 전체 교체)

```js
const { loadConfig } = require('./lib/config');
const { decideSweep } = require('./lib/decide-sweep');
const { reconcileNegotiation } = require('./lib/reconcile-negotiation');
const { deriveStatus } = require('./lib/state');
const { setMarker, MARKER, readState, readListing } = require('./lib/markers');
const { parseNegotiationAmount, classifyReactions, REACTION_EXPIRED } = require('./lib/negotiation');
const { effectivePrice, depositAmount, priceLine, formatWon } = require('./lib/pricing');
const { expiredMessage, reserveConfirmMessage } = require('./lib/messages');

async function classifiedNegotiations(github, owner, repo, issue_number, config) {
  const raw = await github.paginate(github.rest.issues.listComments, { owner, repo, issue_number, per_page: 100 });
  const out = [];
  for (const c of raw) {
    const author = c.user && c.user.login;
    if (!author || author.endsWith('[bot]')) continue;
    if (!c.body || !c.body.includes(config.negotiateKeyword)) continue;
    const amount = parseNegotiationAmount(c.body, config.negotiateKeyword);
    if (amount === null) continue;
    const reactions = await github.paginate(github.rest.reactions.listForIssueComment, { owner, repo, comment_id: c.id, per_page: 100 });
    out.push({ id: c.id, author, amount, createdAt: c.created_at, klass: classifyReactions(reactions, config.owner) });
  }
  return out.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
}

function priceDigits(str) { const d = String(str || '').replace(/[^0-9]/g, ''); return d ? Number(d) : Infinity; }

module.exports = async function run({ github, context, configPath = 'config.json', now = new Date() }) {
  const config = loadConfig(configPath);
  const { owner, repo } = context.repo;
  const L = config.labels;

  // ---- 네고 리콘실 (네고중) ----
  const negIssues = await github.paginate(github.rest.issues.listForRepo, { owner, repo, state: 'open', labels: L.negotiating, per_page: 100 });
  for (const issue of negIssues) {
    const issue_number = issue.number;
    const negComments = await classifiedNegotiations(github, owner, repo, issue_number, config);
    const r = reconcileNegotiation({ negotiationComments: negComments });
    if (r.action === 'stay_negotiating') continue;
    if (r.action === 'release') {
      await github.rest.issues.removeLabel({ owner, repo, issue_number, name: L.negotiating }).catch(() => {});
      await github.rest.issues.addLabels({ owner, repo, issue_number, labels: [L.available] });
      continue;
    }
    // accept — min ratchet + 본문/상태 갱신
    const listing = readListing(issue.body || '');
    const negWon = Math.min(priceDigits(listing.negotiatedPrice), r.amount);
    const negotiatedPrice = formatWon(negWon);
    const listing2 = { ...listing, negotiatedPrice };
    let body = setMarker(issue.body || '', MARKER.listing, listing2);
    body = body.replace(/^\*\*가격:\*\*.*$/m, priceLine(listing2));
    body = setMarker(body, MARKER.state, {
      reserver: r.winner, reservedAt: now.toISOString(), availableSince: null, paidClaimedAt: null, acceptedNegotiationCommentId: r.commentId,
    });
    await github.rest.issues.update({ owner, repo, issue_number, body });
    await github.rest.issues.removeLabel({ owner, repo, issue_number, name: L.negotiating }).catch(() => {});
    await github.rest.issues.addLabels({ owner, repo, issue_number, labels: [L.reserved] });
    await github.rest.issues.createComment({ owner, repo, issue_number, body: reserveConfirmMessage(config, issue_number, r.winner, now.toISOString(), depositAmount(effectivePrice(listing2))) });
  }

  // ---- 만료 (예약금 대기중) ----
  let swept = 0;
  const resIssues = await github.paginate(github.rest.issues.listForRepo, { owner, repo, state: 'open', labels: L.reserved, per_page: 100 });
  for (const issue of resIssues) {
    const issue_number = issue.number;
    const labelNames = (issue.labels || []).map((l) => (typeof l === 'string' ? l : l.name));
    const status = deriveStatus(labelNames, config);
    const state = readState(issue.body || '');
    if (!decideSweep({ status, reservedAt: state.reservedAt, paidClaimedAt: state.paidClaimedAt, config, now }).expired) continue;

    if (state.acceptedNegotiationCommentId) {
      await github.rest.reactions.createForIssueComment({ owner, repo, comment_id: state.acceptedNegotiationCommentId, content: REACTION_EXPIRED }).catch(() => {});
    }
    const negComments = await classifiedNegotiations(github, owner, repo, issue_number, config);
    const hasPending = negComments.some((c) => c.klass === 'pending');

    const newBody = setMarker(issue.body || '', MARKER.state, {
      reserver: null, reservedAt: null, availableSince: now.toISOString(), paidClaimedAt: null, acceptedNegotiationCommentId: null,
    });
    await github.rest.issues.update({ owner, repo, issue_number, body: newBody });
    await github.rest.issues.removeLabel({ owner, repo, issue_number, name: L.reserved }).catch(() => {});
    await github.rest.issues.addLabels({ owner, repo, issue_number, labels: [hasPending ? L.negotiating : L.available] });
    await github.rest.issues.createComment({ owner, repo, issue_number, body: expiredMessage(config) });
    swept += 1;
  }
  return { swept };
};
```

- [ ] **Step 4: Run full suite, then commit**

Run: `node --test`
Expected: PASS. (기존 sweep 테스트는 새 fakeGithub 시그니처/`issuesByLabel`로 갱신.)

```bash
git add scripts/sweep-timeouts.js test/sweep-timeouts.test.js
git commit -m "feat: sweeper 네고 리콘실 + 만료 😕 + 네고중 복귀

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_018KELvmPusvN7LPndJPgD68"
```

---

## Task 13: render-readme.js — owner 작성자 필터

**Files:**
- Modify: `scripts/render-readme.js`
- Test: `test/render-readme.test.js`

**Interfaces:**
- Produces: 현황판은 `issue.user.login === config.owner` 인 이슈만 포함(+ 기존 `매물` 라벨·`isTestPurpose` 필터).

- [ ] **Step 1: Write the failing test** (append to `test/render-readme.test.js`)

```js
test('excludes issues authored by non-owner', async () => {
  const issues = [
    { number: 3, title: 'Owner Item', html_url: 'u3', user: { login: 'Suckzoo' },
      labels: [{ name: '매물' }, { name: '구매 가능' }], body: '<!-- market-listing: {"price":"1"} -->' },
    { number: 4, title: 'Stranger Item', html_url: 'u4', user: { login: 'stranger' },
      labels: [{ name: '매물' }, { name: '구매 가능' }], body: '<!-- market-listing: {"price":"2"} -->' },
  ];
  const { github, calls } = fakeGithub(issues, README);
  await run({ github, context, configPath });
  const written = Buffer.from(calls.find((c) => c[0] === 'put')[1].content, 'base64').toString('utf8');
  assert.match(written, /Owner Item/);
  assert.doesNotMatch(written, /Stranger Item/);
});
```

(fixture `config.test.json`에 `owner: "Suckzoo"` 필요 — Task 10 완료 가정. 기존 render-readme 테스트의 issue 객체에 `user: { login: 'Suckzoo' }` 추가 필요 — 이 태스크에 포함.)

- [ ] **Step 2: Run test, verify it fails**

Run: `node --test test/render-readme.test.js`
Expected: FAIL — Stranger Item 포함됨.

- [ ] **Step 3: Implement** (edit filter line)

```js
  const onlyIssues = issues.filter((i) =>
    !i.pull_request && !isTestPurpose(i.title) && i.user && i.user.login === config.owner);
```

- [ ] **Step 4: Run full suite, then commit**

Run: `node --test`
Expected: PASS.

```bash
git add scripts/render-readme.js test/render-readme.test.js
git commit -m "feat: 현황판에서 owner가 작성하지 않은 이슈 제외

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_018KELvmPusvN7LPndJPgD68"
```

---

## Task 14: README 네고 안내 + footer

**Files:**
- Modify: `README.md`, `scripts/lib/messages.js`(reservationFooter에 네고 안내 한 줄), `test/messages.test.js`

**Interfaces:**
- Produces: README에 "모든 매물 네고 가능 + `#네고희망 {금액}` 방법" 섹션. reservationFooter에 네고 안내 추가.

- [ ] **Step 1: Write the failing test** (append to `test/messages.test.js`)

```js
test('reservationFooter mentions negotiation', () => {
  assert.match(m.reservationFooter(cfg), /네고|#네고희망/);
});
```

(cfg에 `negotiateKeyword: '#네고희망'` 추가.)

- [ ] **Step 2: Run, verify fail**

Run: `node --test test/messages.test.js`
Expected: FAIL.

- [ ] **Step 3: Implement** — reservationFooter에 네고 섹션 추가(예약 방법 아래):

```js
    '',
    '## 🤝 가격 협상(네고)',
    '',
    `모든 매물은 네고 가능합니다. \`${config.negotiateKeyword} {희망금액(원)}\` 댓글로 제안해 주세요. (예: \`${config.negotiateKeyword} 120000\`)`,
    '운영자가 검토 후 수락하면 자동으로 예약이 잡히며, 알림이 오면 3시간 이내에 예약금을 입금해 주세요.',
```

README.md에는 `## 📌 예약 방법` 위 또는 아래에 동일 취지의 `## 🤝 가격 협상(네고)` 섹션을 추가(정적). 본문:

```markdown
## 🤝 가격 협상(네고)

모든 매물은 가격 협상이 가능합니다. 해당 판매글에 `#네고희망 {희망 금액(원)}` 형식으로 댓글을 남겨주세요. (예: `#네고희망 120000`)

- 운영자가 검토 후 👍 수락 / 👎 거절로 처리합니다.
- 수락되면 제안하신 분께 자동으로 예약이 잡히며, 알림이 오면 3시간 이내에 예약금(가격의 10%)을 입금해 주세요.
- 가격 미정 매물은 네고로만 예약할 수 있습니다.
```

- [ ] **Step 4: Run full suite, then commit**

Run: `node --test`
Expected: PASS.

```bash
git add README.md scripts/lib/messages.js test/messages.test.js
git commit -m "docs: 네고 안내(README + 이슈 footer)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_018KELvmPusvN7LPndJPgD68"
```

---

## Task 15: 라이브 롤아웃 (운영 작업)

**Files:** 없음(운영). 코드/문서 push 후 수행.

- [ ] **Step 1: Push**

```bash
git pull --rebase origin master && git push origin master
```

- [ ] **Step 2: `네고중` 라벨 생성**

```bash
gh label create "네고중" -R Suckzoo/keyboard-market --color "d4c5f9" --description "가격 협상 중" 2>&1 || true
```

- [ ] **Step 3: 기존 이슈 업서트** (priceLine/footer 갱신 반영)

```bash
node scripts/import-listings.js keyboard.csv
```

Expected: `created 0, updated 65`.

- [ ] **Step 4: 현황판 재렌더 + 검증**

```bash
gh workflow run update-readme.yml -R Suckzoo/keyboard-market
```

`#네고희망` 1건을 [Test Purpose] 이슈(#1/#2)에서 시도 → 네고중 전환 확인 → 👍 후 다음 sweeper(또는 수동 `gh workflow run sweeper.yml`)에서 예약 전환·예약금 안내·🤝 가격 확인. 검증 후 테스트 댓글 정리.

- [ ] **Step 5: import-listings 가 priceLine 사용하도록(업서트 본문 일치) 확인**

`scripts/import-listings.js`는 `buildIssue`를 통해 본문을 생성하므로 Task 5(priceLine) 반영분이 업서트에 자동 적용된다. 별도 변경 불필요.

---

## Self-Review 결과 (작성자 점검)

- **스펙 커버리지:** 네고 접수(T7/T11), 리액션 수락·거절·만료(T2/T8/T12), 가격표기·🤝·범례(T1/T4/T5/T12), 예약금 명시(T1/T6/T9/T12), 가격미정 차단(T9), 승낙네고 보호(T9/T11), 네고중 복귀(T12), owner 필터(T13), README/footer(T14), 라벨/롤아웃(T10/T15) — 전부 매핑됨.
- **플레이스홀더:** 없음(모든 스텝 실제 코드/명령 포함).
- **타입 일관성:** `effectivePrice`/`depositAmount`/`priceLine`/`boardPrice`(pricing), `classifyReactions`/`parseNegotiationAmount`(negotiation), `reconcileNegotiation` 반환 `{action, winner, amount, commentId}`, `decideNegotiation` 반환 `{action, amount, comment}` — 태스크 간 일치.
- **주의:** 일부 기존 테스트(decide-comment reserve/remind, sweep-timeouts, render-readme)는 새 입력(listing/user/issuesByLabel) 때문에 해당 태스크에서 함께 수정해야 한다(각 태스크 Step에 명시).
