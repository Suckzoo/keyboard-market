# 키보드 장터 (GitHub 이슈 기반) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** GitHub 이슈로 키보드 중고 매물을 등록하고, `#구매신청` 댓글을 가장 먼저 단 사람에게 선착순 예약 권한을 주며, 3시간 입금 데드라인·자동 만료·README 현황판 자동 갱신을 GitHub Actions로 자동화한다.

**Architecture:** 순수 결정 로직은 무의존성 모듈(`scripts/lib/**`)로 분리해 `node --test`로 단위 테스트한다. GitHub과 통신하는 글루(`scripts/handle-comment.js`, `sweep-timeouts.js`, `render-readme.js`)는 `actions/github-script@v7`가 주입하는 octokit(`github`)/`context`만 사용하므로 워크플로에 npm 설치가 필요 없다. 매물 import만 로컬에서 1회 실행한다. 이슈 상태는 이슈 본문의 숨김 HTML 주석 마커(`market-listing`/`market-state`)로 자립적으로 관리한다.

**Tech Stack:** Node.js ≥ 20, `actions/github-script@v7`(내장 Octokit), `node --test`(무의존성 테스트), 로컬 import만 `@octokit/rest` + `csv-parse`.

## Global Constraints

- Node.js **≥ 20** (워크플로 런타임 및 로컬 동일).
- `scripts/lib/**` 및 워크플로가 호출하는 글루(`handle-comment.js`/`sweep-timeouts.js`/`render-readme.js`)는 **런타임 외부 의존성 0** — github-script가 주입한 `github`(octokit)/`context`만 사용.
- 외부 의존성(`@octokit/rest`, `csv-parse`)은 **로컬 전용** `scripts/import-listings.js`에서만 사용.
- 테스트는 `node --test`, 추가 의존성 없이 인메모리 fake로만 작성.
- 저장소: **`Suckzoo/keyboard-market`**, 최초 **private** 생성(런칭 시 public 전환).
- 트리거 키워드: **`#구매신청`** (정확히 이 문자열).
- 라벨 정확히: `구매 가능` / `예약금 대기중` / `입금 확인 완료` / `매물`(스코프).
- 모든 시각은 ISO 8601 문자열, 비교는 `Date`로. **순수 함수는 절대 `Date.now()`/`new Date()`(인자 없는) 호출 금지** — 호출자가 `now`를 주입.
- 후보 댓글 선정 시 작성자 login이 `[bot]`으로 끝나는 댓글은 제외(봇 자기 댓글 자가 트리거 방지).
- git 커밋 이메일은 **`tjkj555@gmail.com`**, 이름 `Suckzoo`.
- 커밋은 자주, 각 Task 끝에서.

---

### Task 1: 프로젝트 스캐폴드 + 비공개 저장소 + config 로더

**Files:**
- Create: `package.json`
- Create: `config.json`
- Create: `.gitignore`
- Create: `scripts/lib/config.js`
- Test: `test/config.test.js`

**Interfaces:**
- Produces: `loadConfig(path?) -> config`, `validateConfig(config) -> config` (throws `Error` on missing required key). Required keys: `openAt`, `keyword`, `reservationHours`, `depositInfo`, `formBaseUrl`, `labels.available`, `labels.reserved`, `labels.paid`, `labels.scope`.

- [ ] **Step 1: 비공개 저장소 생성 + 원격 연결 (1회 설정)**

로컬에는 이미 spec 커밋이 있는 git 저장소가 있다. 이를 새 비공개 원격에 연결한다.

Run:
```bash
git config user.email tjkj555@gmail.com
git config user.name Suckzoo
gh repo create Suckzoo/keyboard-market --private --source=. --remote=origin --push
```
Expected: `https://github.com/Suckzoo/keyboard-market` 생성, 기존 커밋 push 됨. 확인: `gh repo view Suckzoo/keyboard-market --json visibility -q .visibility` → `PRIVATE`.

- [ ] **Step 2: 스캐폴드 파일 작성**

`package.json`:
```json
{
  "name": "keyboard-market",
  "version": "0.1.0",
  "private": true,
  "type": "commonjs",
  "engines": { "node": ">=20" },
  "scripts": {
    "test": "node --test",
    "import": "node scripts/import-listings.js"
  },
  "devDependencies": {
    "@octokit/rest": "^21.0.0",
    "csv-parse": "^5.5.0"
  }
}
```

`.gitignore`:
```
node_modules/
listings.csv
```

`config.json` (예시값 — 운영자가 실제 값으로 교체):
```json
{
  "openAt": "2026-07-01T20:00:00+09:00",
  "keyword": "#구매신청",
  "reservationHours": 3,
  "formBaseUrl": "https://docs.google.com/forms/d/e/REPLACE_ID/viewform",
  "formIssueEntryId": "entry.111111",
  "formUserEntryId": "entry.222222",
  "depositInfo": "○○은행 123-456-7890 (예금주: 홍길동)",
  "csvMapping": {
    "id": "번호",
    "title": "매물명",
    "price": "가격",
    "image": "사진",
    "body": ["상태", "설명"]
  },
  "labels": {
    "scope": "매물",
    "available": "구매 가능",
    "reserved": "예약금 대기중",
    "paid": "입금 확인 완료"
  }
}
```

- [ ] **Step 3: 실패하는 테스트 작성**

`test/config.test.js`:
```javascript
const { test } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { loadConfig, validateConfig } = require('../scripts/lib/config');

test('loadConfig reads the repo config.json', () => {
  const cfg = loadConfig(path.join(__dirname, '..', 'config.json'));
  assert.strictEqual(cfg.keyword, '#구매신청');
  assert.strictEqual(cfg.labels.available, '구매 가능');
  assert.strictEqual(cfg.reservationHours, 3);
});

test('validateConfig throws when a required key is missing', () => {
  const bad = { keyword: '#구매신청' };
  assert.throws(() => validateConfig(bad), /openAt/);
});

test('validateConfig returns the config when valid', () => {
  const good = {
    openAt: '2026-07-01T20:00:00+09:00', keyword: '#구매신청', reservationHours: 3,
    depositInfo: 'x', formBaseUrl: 'https://f',
    labels: { scope: '매물', available: '구매 가능', reserved: '예약금 대기중', paid: '입금 확인 완료' },
  };
  assert.strictEqual(validateConfig(good), good);
});
```

- [ ] **Step 4: 테스트 실패 확인**

Run: `node --test test/config.test.js`
Expected: FAIL — `Cannot find module '../scripts/lib/config'`.

- [ ] **Step 5: 구현**

`scripts/lib/config.js`:
```javascript
const fs = require('node:fs');

const REQUIRED = ['openAt', 'keyword', 'reservationHours', 'depositInfo', 'formBaseUrl'];
const REQUIRED_LABELS = ['scope', 'available', 'reserved', 'paid'];

function validateConfig(config) {
  for (const key of REQUIRED) {
    if (config[key] === undefined || config[key] === null || config[key] === '') {
      throw new Error(`config missing required key: ${key}`);
    }
  }
  if (!config.labels) throw new Error('config missing required key: labels');
  for (const key of REQUIRED_LABELS) {
    if (!config.labels[key]) throw new Error(`config missing required key: labels.${key}`);
  }
  return config;
}

function loadConfig(configPath = 'config.json') {
  const raw = fs.readFileSync(configPath, 'utf8');
  return validateConfig(JSON.parse(raw));
}

module.exports = { loadConfig, validateConfig };
```

- [ ] **Step 6: 테스트 통과 확인**

Run: `node --test test/config.test.js`
Expected: PASS (3 tests).

- [ ] **Step 7: 커밋**

```bash
git add package.json .gitignore config.json scripts/lib/config.js test/config.test.js
git commit -m "feat: 프로젝트 스캐폴드 + config 로더"
```

---

### Task 2: 이슈 본문 마커 lib

**Files:**
- Create: `scripts/lib/markers.js`
- Test: `test/markers.test.js`

**Interfaces:**
- Consumes: 없음.
- Produces:
  - `MARKER = { listing: 'market-listing', state: 'market-state' }`
  - `parseMarker(body, name) -> object | null`
  - `setMarker(body, name, obj) -> string` (기존 마커 교체, 없으면 본문 끝에 추가)
  - `readListing(body) -> object` (없으면 `{}`)
  - `readState(body) -> { reserver, reservedAt, availableSince }` (기본값 모두 `null`)

- [ ] **Step 1: 실패하는 테스트 작성**

`test/markers.test.js`:
```javascript
const { test } = require('node:test');
const assert = require('node:assert');
const { parseMarker, setMarker, readListing, readState, MARKER } = require('../scripts/lib/markers');

test('parseMarker returns null when absent', () => {
  assert.strictEqual(parseMarker('no markers here', MARKER.state), null);
});

test('setMarker then parseMarker round-trips an object', () => {
  let body = '매물 설명\n';
  body = setMarker(body, MARKER.state, { reserver: 'octocat', reservedAt: '2026-07-01T20:00:05+09:00', availableSince: null });
  const parsed = parseMarker(body, MARKER.state);
  assert.strictEqual(parsed.reserver, 'octocat');
  assert.strictEqual(parsed.availableSince, null);
});

test('setMarker replaces an existing marker, not duplicates it', () => {
  let body = setMarker('x', MARKER.state, { reserver: 'a', reservedAt: null, availableSince: null });
  body = setMarker(body, MARKER.state, { reserver: 'b', reservedAt: null, availableSince: null });
  assert.strictEqual((body.match(/market-state/g) || []).length, 1);
  assert.strictEqual(parseMarker(body, MARKER.state).reserver, 'b');
});

test('readState supplies defaults when marker missing', () => {
  assert.deepStrictEqual(readState('plain body'), { reserver: null, reservedAt: null, availableSince: null });
});

test('readListing returns {} when marker missing', () => {
  assert.deepStrictEqual(readListing('plain body'), {});
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `node --test test/markers.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: 구현**

`scripts/lib/markers.js`:
```javascript
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
  };
}

module.exports = { MARKER, parseMarker, setMarker, readListing, readState };
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `node --test test/markers.test.js`
Expected: PASS (5 tests).

- [ ] **Step 5: 커밋**

```bash
git add scripts/lib/markers.js test/markers.test.js
git commit -m "feat: 이슈 본문 마커 파서/직렬화 lib"
```

---

### Task 3: 상태 판별 + 메시지 빌더 lib

**Files:**
- Create: `scripts/lib/state.js`
- Create: `scripts/lib/messages.js`
- Test: `test/state.test.js`
- Test: `test/messages.test.js`

**Interfaces:**
- Produces (`state.js`):
  - `deriveStatus(labelNames, config) -> 'available' | 'reserved' | 'paid' | 'unknown'` (paid > reserved > available 우선순위)
- Produces (`messages.js`, 모두 순수):
  - `buildFormUrl(config, issueNumber, user) -> string`
  - `notOpenMessage(config) -> string`
  - `soldMessage() -> string`
  - `reservedByOtherMessage() -> string`
  - `remindReserverMessage(config, issueNumber, user, reservedAt) -> string`
  - `reserveConfirmMessage(config, issueNumber, winner, reservedAt) -> string`
  - `expiredMessage(config) -> string`
  - `deadlineIso(reservedAt, reservationHours) -> string` (reservedAt + N시간 ISO)

- [ ] **Step 1: 실패하는 테스트 작성**

`test/state.test.js`:
```javascript
const { test } = require('node:test');
const assert = require('node:assert');
const { deriveStatus } = require('../scripts/lib/state');

const cfg = { labels: { scope: '매물', available: '구매 가능', reserved: '예약금 대기중', paid: '입금 확인 완료' } };

test('paid wins over reserved and available', () => {
  assert.strictEqual(deriveStatus(['매물', '구매 가능', '입금 확인 완료'], cfg), 'paid');
});
test('reserved when reserved label present', () => {
  assert.strictEqual(deriveStatus(['매물', '예약금 대기중'], cfg), 'reserved');
});
test('available by default', () => {
  assert.strictEqual(deriveStatus(['매물', '구매 가능'], cfg), 'available');
});
test('unknown when no status label', () => {
  assert.strictEqual(deriveStatus(['매물'], cfg), 'unknown');
});
```

`test/messages.test.js`:
```javascript
const { test } = require('node:test');
const assert = require('node:assert');
const m = require('../scripts/lib/messages');

const cfg = {
  keyword: '#구매신청', reservationHours: 3, depositInfo: 'BANK 123 (홍길동)',
  formBaseUrl: 'https://docs.google.com/forms/d/e/ID/viewform',
  formIssueEntryId: 'entry.111', formUserEntryId: 'entry.222',
};

test('buildFormUrl prefills issue number and user', () => {
  const url = m.buildFormUrl(cfg, 12, 'octocat');
  assert.match(url, /usp=pp_url/);
  assert.match(url, /entry\.111=12/);
  assert.match(url, /entry\.222=octocat/);
});

test('deadlineIso adds reservationHours', () => {
  const out = m.deadlineIso('2026-07-01T11:00:00.000Z', 3);
  assert.strictEqual(new Date(out).toISOString(), '2026-07-01T14:00:00.000Z');
});

test('reserveConfirmMessage mentions winner, deposit, form link', () => {
  const msg = m.reserveConfirmMessage(cfg, 12, 'octocat', '2026-07-01T11:00:00.000Z');
  assert.match(msg, /@octocat/);
  assert.match(msg, /BANK 123/);
  assert.match(msg, /entry\.111=12/);
});

test('notOpenMessage includes openAt', () => {
  assert.match(m.notOpenMessage({ ...cfg, openAt: '2026-07-01T20:00:00+09:00' }), /2026-07-01/);
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `node --test test/state.test.js test/messages.test.js`
Expected: FAIL — modules not found.

- [ ] **Step 3: 구현 (`scripts/lib/state.js`)**

```javascript
function deriveStatus(labelNames, config) {
  const set = new Set(labelNames || []);
  const L = config.labels;
  if (set.has(L.paid)) return 'paid';
  if (set.has(L.reserved)) return 'reserved';
  if (set.has(L.available)) return 'available';
  return 'unknown';
}

module.exports = { deriveStatus };
```

- [ ] **Step 4: 구현 (`scripts/lib/messages.js`)**

```javascript
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
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `node --test test/state.test.js test/messages.test.js`
Expected: PASS (state 4 + messages 4).

- [ ] **Step 6: 커밋**

```bash
git add scripts/lib/state.js scripts/lib/messages.js test/state.test.js test/messages.test.js
git commit -m "feat: 상태 판별 + 메시지 빌더 lib"
```

---

### Task 4: 댓글 결정 로직 lib (선착순 핵심)

**Files:**
- Create: `scripts/lib/decide-comment.js`
- Test: `test/decide-comment.test.js`

**Interfaces:**
- Consumes: `state.deriveStatus`, `markers.readState`, `messages.*`.
- Produces:
  - `decideComment(input) -> result`
  - `input`: `{ issueNumber, commentBody, commenter, labelNames, issueBody, comments, config, now }`
    - `comments`: `[{ author, body, createdAt }]` (해당 이슈의 모든 댓글, 트리거 댓글 포함)
    - `now`: `Date`
  - `result`(택1):
    - `{ action: 'ignore' }`
    - `{ action: 'comment_only', comment }`
    - `{ action: 'reserve', winner, reservedAt, comment }`

- [ ] **Step 1: 실패하는 테스트 작성**

`test/decide-comment.test.js`:
```javascript
const { test } = require('node:test');
const assert = require('node:assert');
const { decideComment } = require('../scripts/lib/decide-comment');

const config = {
  openAt: '2026-07-01T11:00:00.000Z', keyword: '#구매신청', reservationHours: 3,
  depositInfo: 'BANK', formBaseUrl: 'https://f', formIssueEntryId: 'entry.1', formUserEntryId: 'entry.2',
  labels: { scope: '매물', available: '구매 가능', reserved: '예약금 대기중', paid: '입금 확인 완료' },
};
const base = { issueNumber: 12, commenter: 'alice', issueBody: 'desc', config };

test('ignores comment without keyword', () => {
  const r = decideComment({ ...base, commentBody: '질문 있어요', labelNames: ['매물', '구매 가능'],
    comments: [], now: new Date('2026-07-01T12:00:00Z') });
  assert.strictEqual(r.action, 'ignore');
});

test('rejects before openAt', () => {
  const r = decideComment({ ...base, commentBody: '#구매신청', labelNames: ['매물', '구매 가능'],
    comments: [{ author: 'alice', body: '#구매신청', createdAt: '2026-07-01T10:00:00Z' }],
    now: new Date('2026-07-01T10:00:00Z') });
  assert.strictEqual(r.action, 'comment_only');
  assert.match(r.comment, /아직 열리지 않았습니다/);
});

test('rejects when already sold', () => {
  const r = decideComment({ ...base, commentBody: '#구매신청', labelNames: ['매물', '입금 확인 완료'],
    comments: [], now: new Date('2026-07-01T12:00:00Z') });
  assert.match(r.comment, /판매 완료/);
});

test('reserved + other commenter -> already reserved', () => {
  const issueBody = 'desc\n<!-- market-state: {"reserver":"bob","reservedAt":"2026-07-01T11:30:00Z","availableSince":null} -->';
  const r = decideComment({ ...base, commentBody: '#구매신청', labelNames: ['매물', '예약금 대기중'], issueBody,
    comments: [], now: new Date('2026-07-01T12:00:00Z') });
  assert.match(r.comment, /이미 예약 진행 중/);
});

test('reserved + same reserver -> remind with form link', () => {
  const issueBody = 'desc\n<!-- market-state: {"reserver":"alice","reservedAt":"2026-07-01T11:30:00Z","availableSince":null} -->';
  const r = decideComment({ ...base, commentBody: '#구매신청', labelNames: ['매물', '예약금 대기중'], issueBody,
    comments: [], now: new Date('2026-07-01T12:00:00Z') });
  assert.strictEqual(r.action, 'comment_only');
  assert.match(r.comment, /이미 예약 상태/);
});

test('available + open -> reserves earliest keyword commenter, not the trigger', () => {
  const comments = [
    { author: 'carol', body: '먼저 #구매신청 합니다', createdAt: '2026-07-01T11:00:01Z' },
    { author: 'alice', body: '#구매신청', createdAt: '2026-07-01T11:00:03Z' },
  ];
  const r = decideComment({ ...base, commenter: 'alice', commentBody: '#구매신청',
    labelNames: ['매물', '구매 가능'], comments, now: new Date('2026-07-01T11:00:03Z') });
  assert.strictEqual(r.action, 'reserve');
  assert.strictEqual(r.winner, 'carol');
  assert.strictEqual(r.reservedAt, '2026-07-01T11:00:01Z');
  assert.match(r.comment, /@carol/);
});

test('available + open -> ignores bot-authored keyword comments as candidates', () => {
  const comments = [
    { author: 'github-actions[bot]', body: `다시 #구매신청 가능`, createdAt: '2026-07-01T11:00:01Z' },
    { author: 'alice', body: '#구매신청', createdAt: '2026-07-01T11:00:03Z' },
  ];
  const r = decideComment({ ...base, commenter: 'alice', commentBody: '#구매신청',
    labelNames: ['매물', '구매 가능'], comments, now: new Date('2026-07-01T11:00:03Z') });
  assert.strictEqual(r.winner, 'alice');
});

test('reopened round uses availableSince as the first-come baseline', () => {
  const issueBody = 'desc\n<!-- market-state: {"reserver":null,"reservedAt":null,"availableSince":"2026-07-01T15:00:00Z"} -->';
  const comments = [
    { author: 'old', body: '#구매신청', createdAt: '2026-07-01T11:00:00Z' }, // 이전 라운드, 무시
    { author: 'newbie', body: '#구매신청', createdAt: '2026-07-01T15:00:05Z' },
  ];
  const r = decideComment({ ...base, commenter: 'newbie', commentBody: '#구매신청',
    labelNames: ['매물', '구매 가능'], issueBody, comments, now: new Date('2026-07-01T15:00:05Z') });
  assert.strictEqual(r.winner, 'newbie');
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `node --test test/decide-comment.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: 구현**

`scripts/lib/decide-comment.js`:
```javascript
const { deriveStatus } = require('./state');
const { readState } = require('./markers');
const messages = require('./messages');

function isBot(author) {
  return typeof author === 'string' && author.endsWith('[bot]');
}

function decideComment(input) {
  const { issueNumber, commentBody, commenter, labelNames, issueBody, comments, config, now } = input;

  if (!commentBody || !commentBody.includes(config.keyword)) {
    return { action: 'ignore' };
  }

  const openAt = new Date(config.openAt);
  if (now < openAt) {
    return { action: 'comment_only', comment: messages.notOpenMessage(config) };
  }

  const status = deriveStatus(labelNames, config);
  const state = readState(issueBody);

  if (status === 'paid') {
    return { action: 'comment_only', comment: messages.soldMessage() };
  }

  if (status === 'reserved') {
    if (state.reserver && state.reserver === commenter) {
      return {
        action: 'comment_only',
        comment: messages.remindReserverMessage(config, issueNumber, commenter, state.reservedAt),
      };
    }
    return { action: 'comment_only', comment: messages.reservedByOtherMessage() };
  }

  // status === 'available' (or 'unknown' treated as not reservable)
  if (status !== 'available') {
    return { action: 'ignore' };
  }

  const since = state.availableSince ? new Date(state.availableSince) : openAt;
  const candidates = (comments || [])
    .filter((c) => !isBot(c.author) && c.body && c.body.includes(config.keyword) && new Date(c.createdAt) >= since)
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

  if (candidates.length === 0) {
    return { action: 'ignore' };
  }

  const winner = candidates[0].author;
  const reservedAt = candidates[0].createdAt;
  return {
    action: 'reserve',
    winner,
    reservedAt,
    comment: messages.reserveConfirmMessage(config, issueNumber, winner, reservedAt),
  };
}

module.exports = { decideComment };
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `node --test test/decide-comment.test.js`
Expected: PASS (8 tests).

- [ ] **Step 5: 커밋**

```bash
git add scripts/lib/decide-comment.js test/decide-comment.test.js
git commit -m "feat: 댓글 선착순 결정 로직 lib"
```

---

### Task 5: 댓글 핸들러 글루 + 워크플로

**Files:**
- Create: `scripts/handle-comment.js`
- Create: `.github/workflows/comment-handler.yml`
- Create: `test/helpers/fake-github.js`
- Test: `test/handle-comment.test.js`

**Interfaces:**
- Consumes: `decide-comment`, `markers.setMarker`/`readState`, `config.loadConfig`.
- Produces: `module.exports = async ({ github, context, configPath?, now? }) => result` — `decideComment` 결과를 그대로 반환하고, 필요한 octokit 변이를 수행. `now`는 테스트 주입용(기본 `new Date()`).
- Fake octokit shape (`test/helpers/fake-github.js`): `github.rest.issues.{listComments, createComment, addLabels, removeLabel, get, update}` + `github.paginate(fn, params) -> array`. 호출 기록을 `calls` 배열에 남김.

- [ ] **Step 1: fake octokit 헬퍼 작성**

`test/helpers/fake-github.js`:
```javascript
function makeFakeGithub({ comments = [], issue = {} } = {}) {
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
  };
  const github = { rest, paginate: async (fn, params) => (await fn(params)).data };
  return { github, calls, issue };
}
module.exports = { makeFakeGithub };
```

- [ ] **Step 2: 실패하는 테스트 작성**

`test/handle-comment.test.js`:
```javascript
const { test } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { makeFakeGithub } = require('./helpers/fake-github');
const run = require('../scripts/handle-comment');

const configPath = path.join(__dirname, 'fixtures', 'config.test.json');

function ctx({ body, login, labels, issueBody, number = 12 }) {
  return {
    repo: { owner: 'Suckzoo', repo: 'keyboard-market' },
    payload: {
      comment: { body, user: { login } },
      issue: { number, body: issueBody, labels: labels.map((name) => ({ name })) },
    },
  };
}

test('reserve flow: adds reserved label, removes available, writes marker, comments', async () => {
  const comments = [{ user: { login: 'alice' }, body: '#구매신청', created_at: '2026-07-01T11:00:01Z' }];
  const { github, calls } = makeFakeGithub({ comments });
  const context = ctx({ body: '#구매신청', login: 'alice', labels: ['매물', '구매 가능'], issueBody: 'desc' });
  const r = await run({ github, context, configPath, now: new Date('2026-07-01T11:00:01Z') });

  assert.strictEqual(r.action, 'reserve');
  const names = calls.map((c) => c[0]);
  assert.ok(names.includes('addLabels'));
  assert.ok(names.includes('removeLabel'));
  assert.ok(names.includes('update'));      // marker written to body
  assert.ok(names.includes('createComment'));
  const update = calls.find((c) => c[0] === 'update')[1];
  assert.match(update.body, /market-state/);
  assert.match(update.body, /"reserver":"alice"/);
});

test('ignore flow: no keyword -> no octokit writes', async () => {
  const { github, calls } = makeFakeGithub({ comments: [] });
  const context = ctx({ body: '그냥 질문', login: 'alice', labels: ['매물', '구매 가능'], issueBody: 'desc' });
  const r = await run({ github, context, configPath, now: new Date('2026-07-01T12:00:00Z') });
  assert.strictEqual(r.action, 'ignore');
  assert.strictEqual(calls.length, 0);
});

test('comment_only flow: posts one comment, no label changes', async () => {
  const { github, calls } = makeFakeGithub({ comments: [] });
  const context = ctx({ body: '#구매신청', login: 'alice', labels: ['매물', '입금 확인 완료'], issueBody: 'desc' });
  await run({ github, context, configPath, now: new Date('2026-07-01T12:00:00Z') });
  assert.deepStrictEqual(calls.map((c) => c[0]), ['createComment']);
});
```

Create `test/fixtures/config.test.json` (테스트 고정 config):
```json
{
  "openAt": "2026-07-01T11:00:00.000Z",
  "keyword": "#구매신청",
  "reservationHours": 3,
  "formBaseUrl": "https://f",
  "formIssueEntryId": "entry.1",
  "formUserEntryId": "entry.2",
  "depositInfo": "BANK",
  "labels": { "scope": "매물", "available": "구매 가능", "reserved": "예약금 대기중", "paid": "입금 확인 완료" }
}
```

- [ ] **Step 3: 테스트 실패 확인**

Run: `node --test test/handle-comment.test.js`
Expected: FAIL — `Cannot find module '../scripts/handle-comment'`.

- [ ] **Step 4: 구현 (`scripts/handle-comment.js`)**

```javascript
const { loadConfig } = require('./lib/config');
const { decideComment } = require('./lib/decide-comment');
const { setMarker, MARKER, readState } = require('./lib/markers');

module.exports = async function run({ github, context, configPath = 'config.json', now = new Date() }) {
  const config = loadConfig(configPath);
  const { owner, repo } = context.repo;
  const issue = context.payload.issue;
  const issue_number = issue.number;
  const labelNames = (issue.labels || []).map((l) => (typeof l === 'string' ? l : l.name));

  const rawComments = await github.paginate(github.rest.issues.listComments, {
    owner, repo, issue_number, per_page: 100,
  });
  const comments = rawComments.map((c) => ({
    author: c.user && c.user.login, body: c.body, createdAt: c.created_at,
  }));

  const result = decideComment({
    issueNumber: issue_number,
    commentBody: context.payload.comment.body,
    commenter: context.payload.comment.user.login,
    labelNames,
    issueBody: issue.body || '',
    comments,
    config,
    now,
  });

  if (result.action === 'ignore') return result;

  if (result.action === 'comment_only') {
    await github.rest.issues.createComment({ owner, repo, issue_number, body: result.comment });
    return result;
  }

  // result.action === 'reserve'
  const state = readState(issue.body || '');
  const newBody = setMarker(issue.body || '', MARKER.state, {
    reserver: result.winner,
    reservedAt: result.reservedAt,
    availableSince: state.availableSince,
  });
  await github.rest.issues.update({ owner, repo, issue_number, body: newBody });
  await github.rest.issues.removeLabel({ owner, repo, issue_number, name: config.labels.available })
    .catch(() => {}); // label may already be absent
  await github.rest.issues.addLabels({ owner, repo, issue_number, labels: [config.labels.reserved] });
  await github.rest.issues.createComment({ owner, repo, issue_number, body: result.comment });
  return result;
};
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `node --test test/handle-comment.test.js`
Expected: PASS (3 tests).

- [ ] **Step 6: 워크플로 작성 (`.github/workflows/comment-handler.yml`)**

```yaml
name: comment-handler
on:
  issue_comment:
    types: [created]
permissions:
  issues: write
concurrency:
  group: market-issue-${{ github.event.issue.number }}
  cancel-in-progress: false
jobs:
  handle:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/github-script@v7
        with:
          script: |
            const run = require('./scripts/handle-comment.js')
            await run({ github, context })
```

- [ ] **Step 7: 전체 테스트 + 커밋**

Run: `node --test`
Expected: PASS (모든 테스트).
```bash
git add scripts/handle-comment.js .github/workflows/comment-handler.yml test/helpers/fake-github.js test/handle-comment.test.js test/fixtures/config.test.json
git commit -m "feat: 댓글 핸들러 글루 + 워크플로"
```

---

### Task 6: 만료 스위퍼 lib + 글루 + 워크플로

**Files:**
- Create: `scripts/lib/decide-sweep.js`
- Create: `scripts/sweep-timeouts.js`
- Create: `.github/workflows/sweeper.yml`
- Test: `test/decide-sweep.test.js`
- Test: `test/sweep-timeouts.test.js`

**Interfaces:**
- Produces (`decide-sweep.js`): `decideSweep({ status, reservedAt, config, now }) -> { expired: boolean }`. `expired` = `status === 'reserved' && reservedAt && (now - reservedAt) > reservationHours*3600_000`.
- Produces (`sweep-timeouts.js`): `module.exports = async ({ github, context, configPath?, now? }) => { swept: number }`. reserved 라벨 이슈를 조회→만료분에 대해 라벨 교체 + 마커 초기화(`availableSince = now`) + 만료 댓글.

- [ ] **Step 1: 실패하는 테스트 작성 (`test/decide-sweep.test.js`)**

```javascript
const { test } = require('node:test');
const assert = require('node:assert');
const { decideSweep } = require('../scripts/lib/decide-sweep');
const config = { reservationHours: 3, labels: {} };

test('expired when reserved older than 3h', () => {
  const r = decideSweep({ status: 'reserved', reservedAt: '2026-07-01T11:00:00Z', config, now: new Date('2026-07-01T14:00:01Z') });
  assert.strictEqual(r.expired, true);
});
test('not expired within 3h', () => {
  const r = decideSweep({ status: 'reserved', reservedAt: '2026-07-01T11:00:00Z', config, now: new Date('2026-07-01T13:59:00Z') });
  assert.strictEqual(r.expired, false);
});
test('not expired when not reserved', () => {
  const r = decideSweep({ status: 'available', reservedAt: null, config, now: new Date('2026-07-02T00:00:00Z') });
  assert.strictEqual(r.expired, false);
});
```

- [ ] **Step 2: 실패하는 테스트 작성 (`test/sweep-timeouts.test.js`)**

```javascript
const { test } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const run = require('../scripts/sweep-timeouts');

const configPath = path.join(__dirname, 'fixtures', 'config.test.json');

function fakeGithub(issues) {
  const calls = [];
  const rest = {
    issues: {
      listForRepo: async () => ({ data: issues }),
      createComment: async (p) => calls.push(['createComment', p]),
      addLabels: async (p) => calls.push(['addLabels', p]),
      removeLabel: async (p) => calls.push(['removeLabel', p]),
      update: async (p) => calls.push(['update', p]),
    },
  };
  return { github: { rest, paginate: async (fn, params) => (await fn(params)).data }, calls };
}

const context = { repo: { owner: 'Suckzoo', repo: 'keyboard-market' } };

test('sweeps an expired reserved issue and resets marker', async () => {
  const issues = [{
    number: 7,
    labels: [{ name: '매물' }, { name: '예약금 대기중' }],
    body: 'desc\n<!-- market-state: {"reserver":"bob","reservedAt":"2026-07-01T11:00:00Z","availableSince":null} -->',
  }];
  const { github, calls } = fakeGithub(issues);
  const r = await run({ github, context, configPath, now: new Date('2026-07-01T14:30:00Z') });
  assert.strictEqual(r.swept, 1);
  const update = calls.find((c) => c[0] === 'update')[1];
  assert.match(update.body, /"reserver":null/);
  assert.match(update.body, /"availableSince":"2026-07-01T14:30:00.000Z"/);
  assert.ok(calls.some((c) => c[0] === 'addLabels'));
  assert.ok(calls.some((c) => c[0] === 'removeLabel'));
  assert.ok(calls.some((c) => c[0] === 'createComment'));
});

test('leaves a fresh reservation untouched', async () => {
  const issues = [{
    number: 8,
    labels: [{ name: '매물' }, { name: '예약금 대기중' }],
    body: '<!-- market-state: {"reserver":"bob","reservedAt":"2026-07-01T14:00:00Z","availableSince":null} -->',
  }];
  const { github, calls } = fakeGithub(issues);
  const r = await run({ github, context, configPath, now: new Date('2026-07-01T14:30:00Z') });
  assert.strictEqual(r.swept, 0);
  assert.strictEqual(calls.length, 0);
});
```

- [ ] **Step 3: 테스트 실패 확인**

Run: `node --test test/decide-sweep.test.js test/sweep-timeouts.test.js`
Expected: FAIL — modules not found.

- [ ] **Step 4: 구현 (`scripts/lib/decide-sweep.js`)**

```javascript
function decideSweep({ status, reservedAt, config, now }) {
  if (status !== 'reserved' || !reservedAt) return { expired: false };
  const elapsed = now.getTime() - new Date(reservedAt).getTime();
  return { expired: elapsed > config.reservationHours * 3600 * 1000 };
}
module.exports = { decideSweep };
```

- [ ] **Step 5: 구현 (`scripts/sweep-timeouts.js`)**

```javascript
const { loadConfig } = require('./lib/config');
const { decideSweep } = require('./lib/decide-sweep');
const { deriveStatus } = require('./lib/state');
const { setMarker, MARKER, readState } = require('./lib/markers');
const { expiredMessage } = require('./lib/messages');

module.exports = async function run({ github, context, configPath = 'config.json', now = new Date() }) {
  const config = loadConfig(configPath);
  const { owner, repo } = context.repo;

  const issues = await github.paginate(github.rest.issues.listForRepo, {
    owner, repo, state: 'open', labels: config.labels.reserved, per_page: 100,
  });

  let swept = 0;
  for (const issue of issues) {
    const labelNames = (issue.labels || []).map((l) => (typeof l === 'string' ? l : l.name));
    const status = deriveStatus(labelNames, config);
    const state = readState(issue.body || '');
    if (!decideSweep({ status, reservedAt: state.reservedAt, config, now }).expired) continue;

    const issue_number = issue.number;
    const newBody = setMarker(issue.body || '', MARKER.state, {
      reserver: null, reservedAt: null, availableSince: now.toISOString(),
    });
    await github.rest.issues.update({ owner, repo, issue_number, body: newBody });
    await github.rest.issues.removeLabel({ owner, repo, issue_number, name: config.labels.reserved }).catch(() => {});
    await github.rest.issues.addLabels({ owner, repo, issue_number, labels: [config.labels.available] });
    await github.rest.issues.createComment({ owner, repo, issue_number, body: expiredMessage(config) });
    swept += 1;
  }
  return { swept };
};
```

- [ ] **Step 6: 테스트 통과 확인**

Run: `node --test test/decide-sweep.test.js test/sweep-timeouts.test.js`
Expected: PASS (decide 3 + sweep 2).

- [ ] **Step 7: 워크플로 작성 (`.github/workflows/sweeper.yml`)**

```yaml
name: sweeper
on:
  schedule:
    - cron: '*/10 * * * *'
  workflow_dispatch: {}
permissions:
  issues: write
concurrency:
  group: market-sweeper
  cancel-in-progress: false
jobs:
  sweep:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/github-script@v7
        with:
          script: |
            const run = require('./scripts/sweep-timeouts.js')
            const { swept } = await run({ github, context })
            core.info(`swept ${swept} expired reservation(s)`)
```

- [ ] **Step 8: 전체 테스트 + 커밋**

Run: `node --test`
Expected: PASS.
```bash
git add scripts/lib/decide-sweep.js scripts/sweep-timeouts.js .github/workflows/sweeper.yml test/decide-sweep.test.js test/sweep-timeouts.test.js
git commit -m "feat: 만료 스위퍼 lib + 글루 + 워크플로"
```

---

### Task 7: 현황판 렌더 lib (모델 + 표 + 마커 교체)

**Files:**
- Create: `scripts/lib/listing-model.js`
- Create: `scripts/lib/render-board.js`
- Test: `test/listing-model.test.js`
- Test: `test/render-board.test.js`

**Interfaces:**
- Produces (`listing-model.js`): `toListingModel(issue, config) -> { number, title, price, status, reserver, url }`.
- Produces (`render-board.js`):
  - `BOARD_START = '<!-- BOARD:START -->'`, `BOARD_END = '<!-- BOARD:END -->'`
  - `STATUS_DISPLAY = { available, reserved, paid, unknown }`
  - `sortListings(models) -> models` (available → reserved → paid, 동순위는 number 오름차순)
  - `renderTable(models) -> string` (마크다운 표)
  - `spliceBoard(readme, tableMarkdown) -> string` (마커 사이 교체; 마커 없으면 `Error`)

- [ ] **Step 1: 실패하는 테스트 작성 (`test/listing-model.test.js`)**

```javascript
const { test } = require('node:test');
const assert = require('node:assert');
const { toListingModel } = require('../scripts/lib/listing-model');

const config = { labels: { scope: '매물', available: '구매 가능', reserved: '예약금 대기중', paid: '입금 확인 완료' } };

test('builds a model from an issue', () => {
  const issue = {
    number: 12, title: 'Keychron Q1', html_url: 'https://github.com/o/r/issues/12',
    labels: [{ name: '매물' }, { name: '예약금 대기중' }],
    body: '<!-- market-listing: {"price":"120,000"} -->\n<!-- market-state: {"reserver":"octocat","reservedAt":"x","availableSince":null} -->',
  };
  const m = toListingModel(issue, config);
  assert.strictEqual(m.number, 12);
  assert.strictEqual(m.title, 'Keychron Q1');
  assert.strictEqual(m.price, '120,000');
  assert.strictEqual(m.status, 'reserved');
  assert.strictEqual(m.reserver, 'octocat');
  assert.strictEqual(m.url, 'https://github.com/o/r/issues/12');
});
```

- [ ] **Step 2: 실패하는 테스트 작성 (`test/render-board.test.js`)**

```javascript
const { test } = require('node:test');
const assert = require('node:assert');
const { sortListings, renderTable, spliceBoard, BOARD_START, BOARD_END } = require('../scripts/lib/render-board');

const models = [
  { number: 14, title: 'Tofu60', price: '70,000', status: 'paid', reserver: 'hubot', url: 'u14' },
  { number: 12, title: 'Keychron Q1', price: '120,000', status: 'available', reserver: null, url: 'u12' },
  { number: 13, title: 'NK65', price: '90,000', status: 'reserved', reserver: 'octocat', url: 'u13' },
];

test('sortListings orders available, reserved, paid', () => {
  const order = sortListings(models).map((m) => m.number);
  assert.deepStrictEqual(order, [12, 13, 14]);
});

test('renderTable shows reserver as @handle or dash', () => {
  const md = renderTable(sortListings(models));
  assert.match(md, /\| Keychron Q1 \| 120,000 \| 🟢 구매 가능 \| - \|/);
  assert.match(md, /@octocat/);
});

test('spliceBoard replaces only between markers', () => {
  const readme = `# 장터\n안내\n${BOARD_START}\nOLD\n${BOARD_END}\n끝`;
  const out = spliceBoard(readme, '새표');
  assert.match(out, /안내/);
  assert.match(out, /끝/);
  assert.match(out, new RegExp(`${BOARD_START}\\n새표\\n${BOARD_END}`));
  assert.doesNotMatch(out, /OLD/);
});

test('spliceBoard throws when markers absent', () => {
  assert.throws(() => spliceBoard('no markers', 'x'), /BOARD/);
});
```

- [ ] **Step 3: 테스트 실패 확인**

Run: `node --test test/listing-model.test.js test/render-board.test.js`
Expected: FAIL — modules not found.

- [ ] **Step 4: 구현 (`scripts/lib/listing-model.js`)**

```javascript
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
```

- [ ] **Step 5: 구현 (`scripts/lib/render-board.js`)**

```javascript
const BOARD_START = '<!-- BOARD:START -->';
const BOARD_END = '<!-- BOARD:END -->';
const STATUS_DISPLAY = {
  available: '🟢 구매 가능',
  reserved: '🟡 예약금 대기중',
  paid: '✅ 판매 완료',
  unknown: '❔',
};
const STATUS_ORDER = { available: 0, reserved: 1, paid: 2, unknown: 3 };

function sortListings(models) {
  return [...models].sort((a, b) => {
    const d = STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
    return d !== 0 ? d : a.number - b.number;
  });
}

function renderTable(models) {
  const header = '| 매물 | 가격 | 상태 | 예약자 | 이슈 |\n|---|---|---|---|---|';
  const rows = models.map((m) => {
    const reserver = m.reserver ? `@${m.reserver}` : '-';
    const price = m.price || '-';
    return `| ${m.title} | ${price} | ${STATUS_DISPLAY[m.status] || '❔'} | ${reserver} | [#${m.number}](${m.url}) |`;
  });
  return [header, ...rows].join('\n');
}

function spliceBoard(readme, tableMarkdown) {
  const start = readme.indexOf(BOARD_START);
  const end = readme.indexOf(BOARD_END);
  if (start === -1 || end === -1 || end < start) {
    throw new Error('README is missing BOARD:START/BOARD:END markers');
  }
  const before = readme.slice(0, start + BOARD_START.length);
  const after = readme.slice(end);
  return `${before}\n${tableMarkdown}\n${after}`;
}

module.exports = { BOARD_START, BOARD_END, STATUS_DISPLAY, sortListings, renderTable, spliceBoard };
```

- [ ] **Step 6: 테스트 통과 확인**

Run: `node --test test/listing-model.test.js test/render-board.test.js`
Expected: PASS (model 1 + board 4).

- [ ] **Step 7: 커밋**

```bash
git add scripts/lib/listing-model.js scripts/lib/render-board.js test/listing-model.test.js test/render-board.test.js
git commit -m "feat: 현황판 렌더 lib (모델/표/마커 교체)"
```

---

### Task 8: README 골격 + README 갱신 글루 + 워크플로

**Files:**
- Create: `README.md`
- Create: `scripts/render-readme.js`
- Create: `.github/workflows/update-readme.yml`
- Test: `test/render-readme.test.js`

**Interfaces:**
- Consumes: `listing-model`, `render-board`, `config.loadConfig`.
- Produces: `module.exports = async ({ github, context, configPath? }) => { changed: boolean }`. scope 라벨 이슈(open+closed)를 조회→모델→정렬→표→README의 현재 내용을 octokit Contents API로 읽어 마커 사이 교체→변경 시 `createOrUpdateFileContents`로 커밋.

- [ ] **Step 1: README 골격 작성 (`README.md`)**

```markdown
# ⌨️ 키보드 장터

<!-- ANNOUNCE:PLACEHOLDER — 운영자가 별도 준비한 안내 문구로 교체하세요 -->
## 📢 안내
- 오픈: (config.json의 openAt 시각 기준)
- 참여 방법: 원하는 매물 이슈에 `#구매신청` 댓글
- 오픈 전 댓글은 무효 처리됩니다
- 선착순 1명 예약 → 봇이 입금 안내 + 폼 링크 댓글
- **3시간 내 입금 + 폼 작성** 필수, 미완료 시 자동으로 다시 구매 가능 전환
- 입금 확인되면 판매 완료 처리

## 🛒 거래 규칙 / 주의사항

### 예약 & 입금
- 예약은 **선착순 1명**, `#구매신청` 댓글 시각 기준입니다.
- 봇 안내 댓글 후 **3시간 이내 입금 + 폼 작성**을 완료해야 예약이 유지됩니다.
- 3시간이 지나면 자동으로 예약이 해제되어 다시 구매 가능 상태가 되며,
  이후 `#구매신청` 댓글을 단 다음 분에게 권한이 넘어갑니다.
- 입금 확인은 운영자가 수동으로 처리하며, 확인되면 `입금 확인 완료`로 변경됩니다.

### 거래 방식
- 거래 방식(직거래/택배)과 배송비 부담은 폼에서 조율합니다.
- 폼에 남겨주신 선호 시간/연락처로 개별 안내드립니다.

### 환불 & 취소
- 입금 후 단순 변심 환불은 어렵습니다(신중히 신청해주세요).
- 매물 하자가 고지와 다를 경우에 한해 환불/조정합니다.

### 매물 상태 고지
- 모든 매물은 중고이며, 사진·설명에 상태를 최대한 고지했습니다.
- 추가 문의는 해당 이슈 댓글로 남겨주세요(예약과 무관한 질문 환영).

### 주의
- 오픈 시각 이전 `#구매신청` 댓글은 무효이며 예약으로 인정되지 않습니다.
- 한 사람이 여러 매물 예약 가능하나, 각 매물은 개별로 입금/폼 작성이 필요합니다.

<!-- BOARD:START -->
## 📋 예약 현황
| 매물 | 가격 | 상태 | 예약자 | 이슈 |
|---|---|---|---|---|
<!-- BOARD:END -->
```

- [ ] **Step 2: 실패하는 테스트 작성 (`test/render-readme.test.js`)**

```javascript
const { test } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const run = require('../scripts/render-readme');

const configPath = path.join(__dirname, 'fixtures', 'config.test.json');
const context = { repo: { owner: 'Suckzoo', repo: 'keyboard-market' } };

function fakeGithub(issues, readme) {
  const calls = [];
  const content = Buffer.from(readme, 'utf8').toString('base64');
  const rest = {
    issues: { listForRepo: async () => ({ data: issues }) },
    repos: {
      getContent: async () => ({ data: { content, sha: 'abc123', encoding: 'base64' } }),
      createOrUpdateFileContents: async (p) => { calls.push(['put', p]); return { data: {} }; },
    },
  };
  return { github: { rest, paginate: async (fn, params) => (await fn(params)).data }, calls };
}

const README = '# 장터\n<!-- BOARD:START -->\nOLD\n<!-- BOARD:END -->\n';

test('writes a new README when the board changes', async () => {
  const issues = [{
    number: 12, title: 'Keychron Q1', html_url: 'u12',
    labels: [{ name: '매물' }, { name: '구매 가능' }],
    body: '<!-- market-listing: {"price":"120,000"} -->',
  }];
  const { github, calls } = fakeGithub(issues, README);
  const r = await run({ github, context, configPath });
  assert.strictEqual(r.changed, true);
  const put = calls.find((c) => c[0] === 'put')[1];
  const written = Buffer.from(put.content, 'base64').toString('utf8');
  assert.match(written, /Keychron Q1/);
  assert.strictEqual(put.sha, 'abc123');
});

test('does not write when the board is unchanged', async () => {
  // First render to compute the stable board, then feed it back as the existing README.
  const issues = [{
    number: 12, title: 'Keychron Q1', html_url: 'u12',
    labels: [{ name: '매물' }, { name: '구매 가능' }],
    body: '<!-- market-listing: {"price":"120,000"} -->',
  }];
  const first = fakeGithub(issues, README);
  const r1 = await run({ github: first.github, context, configPath });
  const writtenReadme = Buffer.from(first.calls.find((c) => c[0] === 'put')[1].content, 'base64').toString('utf8');

  const second = fakeGithub(issues, writtenReadme);
  const r2 = await run({ github: second.github, context, configPath });
  assert.strictEqual(r2.changed, false);
  assert.strictEqual(second.calls.length, 0);
});
```

- [ ] **Step 3: 테스트 실패 확인**

Run: `node --test test/render-readme.test.js`
Expected: FAIL — module not found.

- [ ] **Step 4: 구현 (`scripts/render-readme.js`)**

```javascript
const { loadConfig } = require('./lib/config');
const { toListingModel } = require('./lib/listing-model');
const { sortListings, renderTable, spliceBoard } = require('./lib/render-board');

module.exports = async function run({ github, context, configPath = 'config.json' }) {
  const config = loadConfig(configPath);
  const { owner, repo } = context.repo;

  const issues = await github.paginate(github.rest.issues.listForRepo, {
    owner, repo, state: 'all', labels: config.labels.scope, per_page: 100,
  });
  // listForRepo can include PRs; keep only issues.
  const onlyIssues = issues.filter((i) => !i.pull_request);
  const models = sortListings(onlyIssues.map((i) => toListingModel(i, config)));
  const table = renderTable(models);

  const current = await github.rest.repos.getContent({ owner, repo, path: 'README.md' });
  const sha = current.data.sha;
  const old = Buffer.from(current.data.content, 'base64').toString('utf8'); // GitHub returns base64
  const updated = spliceBoard(old, table);

  if (updated === old) return { changed: false };

  await github.rest.repos.createOrUpdateFileContents({
    owner, repo, path: 'README.md',
    message: 'chore: update 예약 현황판',
    content: Buffer.from(updated, 'utf8').toString('base64'),
    sha,
  });
  return { changed: true };
};
```

> 참고: GitHub Contents API는 본문을 base64로 반환한다(줄바꿈 포함 가능). 테스트 fake도 동일하게 base64를 제공한다.

- [ ] **Step 5: 테스트 통과 확인**

Run: `node --test test/render-readme.test.js`
Expected: PASS (2 tests).

- [ ] **Step 6: 워크플로 작성 (`.github/workflows/update-readme.yml`)**

```yaml
name: update-readme
on:
  issues:
    types: [labeled, unlabeled, closed, reopened]
  workflow_dispatch: {}
permissions:
  contents: write
  issues: read
concurrency:
  group: update-readme
  cancel-in-progress: true
jobs:
  render:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/github-script@v7
        with:
          script: |
            const run = require('./scripts/render-readme.js')
            const { changed } = await run({ github, context })
            core.info(changed ? 'README updated' : 'README unchanged')
```

- [ ] **Step 7: 전체 테스트 + 커밋**

Run: `node --test`
Expected: PASS.
```bash
git add README.md scripts/render-readme.js .github/workflows/update-readme.yml test/render-readme.test.js
git commit -m "feat: README 골격 + 현황판 갱신 글루 + 워크플로"
```

---

### Task 9: 매물 import (CSV → 이슈, 로컬 1회)

**Files:**
- Create: `scripts/lib/build-issue.js`
- Create: `scripts/import-listings.js`
- Create: `listings.sample.csv`
- Test: `test/build-issue.test.js`

**Interfaces:**
- Produces (`build-issue.js`): `buildIssue(row, config) -> { title, body, labels }`.
  - `row`: CSV 한 행 객체(헤더→값). `config.csvMapping`으로 역할 추출.
  - body: 사진(URL이면 마크다운 이미지) + 매핑된 본문 컬럼 + `market-listing` 마커(`{id, name, price, ...}`) + 빈 `market-state` 마커.
  - labels: `[config.labels.scope, config.labels.available]`.
- `import-listings.js`(로컬, 무테스트): config 로드 → `@octokit/rest`(토큰은 `gh auth token`) → 라벨 보장 → CSV 파싱 → 기존 scope 이슈의 `market-listing.id` 수집 → 중복 아닌 행만 `buildIssue` 후 이슈 생성.

- [ ] **Step 1: 실패하는 테스트 작성 (`test/build-issue.test.js`)**

```javascript
const { test } = require('node:test');
const assert = require('node:assert');
const { buildIssue } = require('../scripts/lib/build-issue');
const { readListing, readState } = require('../scripts/lib/markers');

const config = {
  csvMapping: { id: '번호', title: '매물명', price: '가격', image: '사진', body: ['상태', '설명'] },
  labels: { scope: '매물', available: '구매 가능', reserved: '예약금 대기중', paid: '입금 확인 완료' },
};

test('buildIssue maps title, price marker, labels, image, body fields', () => {
  const row = { 번호: '1', 매물명: 'Keychron Q1', 가격: '120,000', 사진: 'https://img/q1.png', 상태: 'A급', 설명: '거의 새것' };
  const out = buildIssue(row, config);
  assert.strictEqual(out.title, 'Keychron Q1');
  assert.deepStrictEqual(out.labels, ['매물', '구매 가능']);
  assert.match(out.body, /!\[\]\(https:\/\/img\/q1\.png\)/);  // image as markdown
  assert.match(out.body, /A급/);
  assert.match(out.body, /거의 새것/);
  const listing = readListing(out.body);
  assert.strictEqual(listing.id, '1');
  assert.strictEqual(listing.price, '120,000');
  assert.strictEqual(listing.name, 'Keychron Q1');
  assert.deepStrictEqual(readState(out.body), { reserver: null, reservedAt: null, availableSince: null });
});

test('buildIssue tolerates missing optional columns', () => {
  const row = { 번호: '2', 매물명: 'NK65' };
  const out = buildIssue(row, config);
  assert.strictEqual(out.title, 'NK65');
  assert.strictEqual(readListing(out.body).id, '2');
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `node --test test/build-issue.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: 구현 (`scripts/lib/build-issue.js`)**

```javascript
const { setMarker, MARKER } = require('./markers');

function buildIssue(row, config) {
  const map = config.csvMapping || {};
  const title = (map.title && row[map.title]) || '(제목 없음)';
  const id = (map.id && row[map.id]) || title;
  const price = (map.price && row[map.price]) || '';
  const image = (map.image && row[map.image]) || '';

  const sections = [];
  if (image && /^https?:\/\//.test(image)) sections.push(`![](${image})`);
  for (const col of map.body || []) {
    if (row[col]) sections.push(`**${col}:** ${row[col]}`);
  }
  if (price) sections.push(`**가격:** ${price}`);

  let body = sections.join('\n\n');
  body = setMarker(body, MARKER.listing, { id: String(id), name: title, price });
  body = setMarker(body, MARKER.state, { reserver: null, reservedAt: null, availableSince: null });

  return { title, body, labels: [config.labels.scope, config.labels.available] };
}

module.exports = { buildIssue };
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `node --test test/build-issue.test.js`
Expected: PASS (2 tests).

- [ ] **Step 5: 샘플 CSV 작성 (`listings.sample.csv`)**

```csv
번호,매물명,가격,사진,상태,설명
1,Keychron Q1 화이트,120000,https://example.com/q1.png,A급,거의 새것 풀박스
2,NK65 Entry,90000,https://example.com/nk65.png,B급,사용감 있음
```

- [ ] **Step 6: import 러너 작성 (`scripts/import-listings.js`)**

```javascript
#!/usr/bin/env node
const fs = require('node:fs');
const { execSync } = require('node:child_process');
const { parse } = require('csv-parse/sync');
const { Octokit } = require('@octokit/rest');
const { loadConfig } = require('./lib/config');
const { buildIssue } = require('./lib/build-issue');
const { readListing } = require('./lib/markers');

const OWNER = 'Suckzoo';
const REPO = 'keyboard-market';
const LABEL_COLORS = { '매물': '5319e7', '구매 가능': '0e8a16', '예약금 대기중': 'fbca04', '입금 확인 완료': 'b60205' };

async function ensureLabels(octokit, config) {
  const want = [config.labels.scope, config.labels.available, config.labels.reserved, config.labels.paid];
  const existing = await octokit.paginate(octokit.rest.issues.listLabelsForRepo, { owner: OWNER, repo: REPO, per_page: 100 });
  const have = new Set(existing.map((l) => l.name));
  for (const name of want) {
    if (!have.has(name)) {
      await octokit.rest.issues.createLabel({ owner: OWNER, repo: REPO, name, color: LABEL_COLORS[name] || 'ededed' });
      console.log(`label created: ${name}`);
    }
  }
}

async function existingIds(octokit, config) {
  const issues = await octokit.paginate(octokit.rest.issues.listForRepo, {
    owner: OWNER, repo: REPO, state: 'all', labels: config.labels.scope, per_page: 100,
  });
  const ids = new Set();
  for (const i of issues) {
    if (i.pull_request) continue;
    const id = readListing(i.body || '').id;
    if (id) ids.add(String(id));
  }
  return ids;
}

async function main() {
  const csvPath = process.argv[2] || 'listings.csv';
  const config = loadConfig('config.json');
  const token = execSync('gh auth token', { encoding: 'utf8' }).trim();
  const octokit = new Octokit({ auth: token });

  await ensureLabels(octokit, config);
  const rows = parse(fs.readFileSync(csvPath, 'utf8'), { columns: true, skip_empty_lines: true, trim: true });
  const seen = await existingIds(octokit, config);

  let created = 0;
  for (const row of rows) {
    const issue = buildIssue(row, config);
    const id = readListing(issue.body).id;
    if (seen.has(String(id))) { console.log(`skip (dup id ${id}): ${issue.title}`); continue; }
    const res = await octokit.rest.issues.create({
      owner: OWNER, repo: REPO, title: issue.title, body: issue.body, labels: issue.labels,
    });
    console.log(`created #${res.data.number}: ${issue.title}`);
    created += 1;
  }
  console.log(`done. created ${created} issue(s).`);
}

main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 7: 의존성 설치 + 전체 테스트**

Run:
```bash
npm install
node --test
```
Expected: 설치 성공, 모든 테스트 PASS.

- [ ] **Step 8: 커밋**

```bash
git add scripts/lib/build-issue.js scripts/import-listings.js listings.sample.csv test/build-issue.test.js package-lock.json
git commit -m "feat: 매물 import (CSV → 이슈) + buildIssue lib"
```

---

### Task 10: 운영 문서(SETUP) + 수동 통합 리허설

**Files:**
- Create: `SETUP.md`

**Interfaces:** 없음(문서 + 수동 검증).

- [ ] **Step 1: 운영 셋업 문서 작성 (`SETUP.md`)**

````markdown
# 운영 셋업 가이드

## 1. config.json 채우기
- `openAt`: 전체 오픈 시각(KST, 예 `2026-07-01T20:00:00+09:00`)
- `depositInfo`: 입금 계좌 안내 문구
- `formBaseUrl`, `formIssueEntryId`, `formUserEntryId`: 아래 폼 설정에서 확보

## 2. Google Form 만들기
1. 폼 생성, 필드 추가: 매물 이슈 번호(단답), GitHub 아이디(단답), 입금자명, 연락처, 선호 거래 시간, 거래 방식.
2. 우상단 ⋮ → "미리 채워진 링크 받기" → 이슈 번호/아이디에 임시값 입력 → 링크 생성.
3. 생성된 URL에서 `entry.XXXX` 두 개를 찾아 `formIssueEntryId`(이슈 번호), `formUserEntryId`(아이디)에 기입.
4. `formBaseUrl`은 `.../viewform`까지.
5. 폼 응답을 시트에 연결(응답 탭 → 시트로 연결).

## 3. 매물 등록(로컬 1회)
1. 구글 시트를 CSV로 내보내 `listings.csv`로 저장(컬럼명은 `config.json`의 `csvMapping`과 일치).
2. `npm install` → `npm run import`(또는 `node scripts/import-listings.js listings.csv`).
3. 이슈가 `매물 + 구매 가능` 라벨로 생성됨.
4. `update-readme` 워크플로를 수동 실행(Actions 탭 → update-readme → Run)해 현황판 초기화.

## 4. 입금 확인 운영
- 폼 응답 시트로 입금자명을 대조.
- 입금 확인되면 해당 이슈에 `입금 확인 완료` 라벨을 직접 부착 → 자동으로 README 갱신.
- 판매 완료 시 이슈를 close(수동).

## 5. 런칭(공개 전환)
- 충분히 테스트한 뒤 Settings → General → Danger Zone → Change visibility → Public.
````

- [ ] **Step 2: SETUP 커밋**

```bash
git add SETUP.md
git commit -m "docs: 운영 셋업 가이드"
```

- [ ] **Step 3: 수동 통합 리허설 (비공개 repo, 보조 계정/지인 활용)**

아래 시나리오를 순서대로 직접 검증한다(각 항목 통과를 체크):

- [ ] config의 `openAt`을 **미래**로 두고 어떤 매물 이슈에 `#구매신청` 댓글 → 봇이 "아직 열리지 않았습니다" 응답, 라벨 변화 없음.
- [ ] `openAt`을 **과거**로 수정(또는 시각 도달) 후 `#구매신청` 댓글 → 봇이 "@아이디 예약 완료" + 폼 링크 응답, 라벨 `구매 가능`→`예약금 대기중`, 본문에 `market-state` 마커 기록.
- [ ] 폼 링크의 이슈 번호/아이디 prefill이 채워져 열리는지 확인.
- [ ] 같은 이슈에 **다른 사람**이 `#구매신청` → "이미 예약 진행 중" 응답, 상태 불변.
- [ ] `예약금 대기중` 이슈의 `reservedAt`을 과거로 수정 후 `sweeper` 워크플로 수동 실행 → 라벨이 `구매 가능`으로 복귀, "예약 만료" 댓글, 마커 `availableSince` 기록.
- [ ] 복귀 후 새 `#구매신청` 댓글 → 새 예약자에게 정상 부여.
- [ ] 운영자가 `입금 확인 완료` 라벨 부착 → `update-readme`가 발동해 현황판이 "✅ 판매 완료 / @예약자"로 갱신.
- [ ] 이슈 close 시에도 현황판이 유지/갱신되는지 확인.
- [ ] README의 `안내`/`거래 규칙` 정적 영역이 보드 갱신에도 보존되는지 확인.

- [ ] **Step 4: 런칭 전 마지막 점검 후 public 전환**

Run(준비 완료 시): `gh repo edit Suckzoo/keyboard-market --visibility public --accept-visibility-change-consequences`
Expected: 저장소 public 전환. 이후 외부 사용자의 `#구매신청` 댓글로 핸들러 정상 발동 확인.

---

## Self-Review (작성자 점검 결과)

**1. Spec coverage:** spec 각 절 → 구현 Task 매핑
- §3 상태머신/라벨 → Task 3(deriveStatus), Task 5/6(전이) ✅
- §4 저장소 구조/config/토큰 → Task 1 ✅
- §5 README 2영역 → Task 8(골격) + Task 7(spliceBoard) ✅
- §6 본문 마커 + availableSince → Task 2, 반영 Task 4/5/6 ✅
- §7 댓글 핸들러(시각 게이트/선착순/예약) → Task 4 + Task 5 ✅
- §8 스위퍼(만료/마커 초기화/메시지) → Task 6 ✅
- §9 README 갱신(Contents API/변경시만 커밋/scope) → Task 8 ✅
- §10 import(매핑/멱등/라벨 보장/gh 토큰) → Task 9 ✅
- §11 Google Form(prefill/엔트리/응답시트) → Task 3(buildFormUrl) + Task 10(SETUP) ✅
- §12 엣지(봇 루프/경합/공개전환/질문 무시) → Task 4(bot 필터/concurrency 워크플로) + Task 10 ✅
- §13 구현 순서 → Task 순서 정렬 ✅

**2. Placeholder scan:** 코드/테스트는 모두 실제 내용. config.json·README의 예시값/안내 플레이스홀더는 운영자 입력 항목으로 의도된 것(코드 공백 아님).

**3. Type consistency:** 마커 키(`reserver`/`reservedAt`/`availableSince`), 결과 액션(`ignore`/`comment_only`/`reserve`), 라벨 키(`scope`/`available`/`reserved`/`paid`), 함수 시그니처(`decideComment`/`decideSweep`/`toListingModel`/`spliceBoard`/`buildIssue`)가 Task 간 일치. 글루는 octokit 객체 형태(`{number, body, labels:[{name}]}`)를 lib가 기대하는 형태로 정규화해 전달.
