# 키캡 추가 · 비고 주의사항 · 카탈로그 뷰 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 새 SSoT CSV로 키캡 19종을 추가하고, 비고를 이슈 주의사항으로 렌더하며, import가 제목까지 동기화하고, 사진과 함께 보는 카탈로그 뷰(`CATALOG.md`)를 자동 렌더한다.

**Architecture:** 기존 파이프라인(CSV → `import-listings.js` → 이슈, 이슈 → `update-readme.yml` → 현황판) 확장. 순수 헬퍼(`build-issue`, `decide-*`, `render-*`)는 TDD로 단위 테스트하고, 사진 리사이즈/썸네일은 `sips` 기반 로컬 1회 스크립트(순수 플래너 + 명령 래퍼)로 분리한다.

**Tech Stack:** Node.js(`node --test`, `node:assert`), `csv-parse/sync`, `@octokit/rest`, GitHub Actions(github-script), macOS `sips`/`unzip`.

## Global Constraints

- 작업 브랜치: `feat/keycaps-catalog`. master는 머지 전까지 무영향.
- 라이브 이슈 변경(생성/제목·본문 갱신)은 코드/사진/문서 머지 **후** 운영자가 `npm run import`로 실행. 이 플랜은 라이브 import를 실행하지 않는다.
- 모든 커밋 메시지는 다음 trailer로 끝낸다: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`
- 커밋 author 이메일은 개인 메일(`tjkj555@gmail.com`) — 레포 기본값이 이미 그러함, 별도 설정 불필요.
- 이슈 라벨은 upsert 시 변경 금지(진행 중 예약/네고 상태 보존). scope/available 라벨은 신규 생성 시 1회만.
- 사진 크롭 금지(가로폭만 지정, 비율 유지). 키캡 본문 사진 가로 1600px, 카탈로그 썸네일 가로 400px.
- `keycaps.zip` 원본은 커밋 금지(`.gitignore`).
- GitHub 마크다운 표 셀 안에서는 `style`/class가 제거됨 → 카드는 `<img width>`, `<b>`, `<br>`, `<a>`만 사용.

---

## File Structure

**생성:**
- `keyboards.csv` — 단일 SSoT(기존 `keyboard-list-new.csv` 내용)
- `CATALOG.md` — 카탈로그 뷰(자동 렌더)
- `scripts/lib/decide-upsert.js` — 기존 이슈 생성/갱신 판단(순수)
- `scripts/lib/render-catalog.js` — 카탈로그 카드 렌더(순수)
- `scripts/render-catalog.js` — 카탈로그 렌더 엔트리(github-script)
- `scripts/lib/keycap-photos.js` — 키캡 사진 매핑 플래너(순수)
- `scripts/import-keycap-photos.js` — 키캡 사진 리사이즈 래퍼(로컬, sips)
- `scripts/lib/thumbs.js` — 썸네일 플래너(순수)
- `scripts/build-thumbs.js` — 썸네일 생성 래퍼(로컬, sips)
- `CLAUDE.md` — 인수인계
- 신규 테스트: `test/decide-upsert.test.js`, `test/render-catalog.test.js`, `test/keycap-photos.test.js`, `test/thumbs.test.js`

**수정:**
- `config.json` — `csvMapping`에 `notice`/`photoLinks` 추가, 미사용 `image` 제거
- `package.json` — `import` 입력 `keyboards.csv`, 신규 스크립트 추가
- `.gitignore` — `keycaps.zip`, `.superpowers/` (로컬 적용 완료, 커밋만)
- `scripts/lib/build-issue.js` — 비고 주의사항 + 마커 `thumb`
- `scripts/lib/listing-model.js` — 모델에 `thumb` 추가
- `scripts/lib/render-board.js` — `selectListingIssues` 헬퍼 추가/export
- `scripts/render-readme.js` — `selectListingIssues` 사용으로 리팩터
- `scripts/import-listings.js` — `decide-upsert` 사용, `--dry-run`, 기본 csv, thumb URL
- `.github/workflows/update-readme.yml` — 카탈로그 렌더 스텝 추가
- `test/build-issue.test.js`, `test/listing-model.test.js` — 케이스 추가

**삭제:**
- `keyboard.csv`

---

## Task 1: SSoT CSV 정규화 + config + package 배선

**Files:**
- Create: `keyboards.csv` (from `keyboard-list-new.csv`)
- Delete: `keyboard.csv`
- Modify: `config.json`, `package.json`, `.gitignore`

**Interfaces:**
- Produces: `keyboards.csv`(컬럼 `pid,storage,price,name,비고,사진 링크`), `config.csvMapping = { id, title, price, notice, photoLinks, body }`.

- [ ] **Step 1: CSV 파일 교체**

```bash
cd /Users/suckzoo/Projects/keyboards
git rm --quiet keyboard.csv
git mv keyboard-list-new.csv keyboards.csv   # 추적 안 됐으면: mv keyboard-list-new.csv keyboards.csv
git add keyboards.csv
```

- [ ] **Step 2: `config.json`의 csvMapping 수정**

`csvMapping` 블록을 아래로 교체(미사용 `image` 제거, `notice`/`photoLinks` 추가):

```json
  "csvMapping": {
    "id": "pid",
    "title": "name",
    "price": "price",
    "notice": "비고",
    "photoLinks": "사진 링크",
    "body": []
  },
```

- [ ] **Step 3: `package.json` scripts 수정**

```json
  "scripts": {
    "test": "node --test",
    "import": "node scripts/import-listings.js keyboards.csv",
    "import:dry": "node scripts/import-listings.js keyboards.csv --dry-run",
    "photos:keycaps": "node scripts/import-keycap-photos.js",
    "thumbs": "node scripts/build-thumbs.js"
  },
```

- [ ] **Step 4: `.gitignore` 확인** — 이미 `.superpowers/`, `keycaps.zip` 포함(로컬 적용됨). 누락 시 추가.

- [ ] **Step 5: 기존 테스트 통과 확인**

Run: `npm test`
Expected: 기존 42개 테스트 모두 PASS(설정 변경이 기존 테스트를 깨지 않음 — 테스트는 자체 인라인 config 사용).

- [ ] **Step 6: Commit**

```bash
git add keyboards.csv config.json package.json .gitignore
git commit -m "chore: keyboard.csv→keyboards.csv 단일 SSoT + csvMapping(notice/photoLinks)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: 비고 → 이슈 본문 주의사항 (`build-issue.js`)

**Files:**
- Modify: `scripts/lib/build-issue.js`
- Test: `test/build-issue.test.js`

**Interfaces:**
- Consumes: `config.csvMapping.notice`(컬럼명), `row[notice]`.
- Produces: 본문에 `> ⚠️ **주의사항:** {내용}` 라인(가격 다음, footer 이전).

- [ ] **Step 1: 실패 테스트 추가**

`test/build-issue.test.js`에 추가:

```js
test('buildIssue renders 비고 as a 주의사항 blockquote when notice mapping is set', () => {
  const cfg = { ...config, csvMapping: { ...config.csvMapping, notice: '비고', body: [] } };
  const row = { 번호: '9', 매물명: 'Glare', 비고: '사진으로 제보받은 모델명입니다.' };
  const out = buildIssue(row, cfg);
  assert.match(out.body, /> ⚠️ \*\*주의사항:\*\* 사진으로 제보받은 모델명입니다\./);
  // 주의사항은 숨김 마커(market-listing)보다 앞에 온다
  assert.ok(out.body.indexOf('주의사항') < out.body.indexOf('market-listing'));
});

test('buildIssue omits 주의사항 when notice column is empty', () => {
  const cfg = { ...config, csvMapping: { ...config.csvMapping, notice: '비고', body: [] } };
  const out = buildIssue({ 번호: '1', 매물명: 'X' }, cfg);
  assert.doesNotMatch(out.body, /주의사항/);
});
```

- [ ] **Step 2: 실패 확인**

Run: `node --test test/build-issue.test.js`
Expected: FAIL (주의사항 라인 없음)

- [ ] **Step 3: 구현**

`scripts/lib/build-issue.js`에서 price 처리 직후, body 컬럼 루프 앞에 notice 블록 삽입:

```js
  if (price) sections.push(priceLine({ price }));
  if (map.notice && row[map.notice]) {
    sections.push(`> ⚠️ **주의사항:** ${row[map.notice]}`);
  }
  for (const col of map.body || []) {
    if (row[col]) sections.push(`**${col}:** ${row[col]}`);
  }
```

- [ ] **Step 4: 통과 확인**

Run: `node --test test/build-issue.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/build-issue.js test/build-issue.test.js
git commit -m "feat: 비고를 이슈 본문 주의사항(⚠️ 인용블록)으로 렌더

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: 썸네일 URL 마커 + 모델 전달 (`build-issue.js`, `listing-model.js`)

**Files:**
- Modify: `scripts/lib/build-issue.js`, `scripts/lib/listing-model.js`
- Test: `test/build-issue.test.js`, `test/listing-model.test.js`

**Interfaces:**
- Consumes: `opts.thumb`(string|null) in `buildIssue`.
- Produces: `market-listing` 마커에 `thumb` 필드; `toListingModel(issue, config)` 반환에 `thumb`(string|null).

- [ ] **Step 1: 실패 테스트 추가 (build-issue)**

```js
test('buildIssue stores opts.thumb in the listing marker', () => {
  const out = buildIssue({ 번호: '100', 매물명: 'PBTFans 1984' }, config, { thumb: 'https://raw/thumbs/100.jpg' });
  assert.strictEqual(readListing(out.body).thumb, 'https://raw/thumbs/100.jpg');
});

test('buildIssue listing marker thumb is null without opts.thumb', () => {
  const out = buildIssue({ 번호: '1', 매물명: 'X' }, config);
  assert.strictEqual(readListing(out.body).thumb, null);
});
```

- [ ] **Step 2: 실패 테스트 추가 (listing-model)**

`test/listing-model.test.js`에 추가:

```js
test('passes thumb from the listing marker', () => {
  const issue = {
    number: 100, title: 'PBTFans 1984', html_url: 'u',
    labels: [{ name: '매물' }, { name: '구매 가능' }],
    body: '<!-- market-listing: {"id":"100","price":"50,000원","thumb":"https://raw/thumbs/100.jpg"} -->',
  };
  assert.strictEqual(toListingModel(issue, config).thumb, 'https://raw/thumbs/100.jpg');
});

test('thumb is null when the marker has none', () => {
  const issue = {
    number: 9, title: '9', html_url: 'u',
    labels: [{ name: '매물' }, { name: '구매 가능' }],
    body: '<!-- market-listing: {"id":"9","price":"1원"} -->',
  };
  assert.strictEqual(toListingModel(issue, config).thumb, null);
});
```

- [ ] **Step 3: 실패 확인**

Run: `node --test test/build-issue.test.js test/listing-model.test.js`
Expected: FAIL

- [ ] **Step 4: 구현 (build-issue)**

`scripts/lib/build-issue.js`의 listing 마커 작성부 수정:

```js
  body = setMarker(body, MARKER.listing, { id: String(id), name: title, price, thumb: opts.thumb || null });
```

- [ ] **Step 5: 구현 (listing-model)**

`scripts/lib/listing-model.js`의 반환 객체에 추가:

```js
  return {
    number: issue.number,
    id: listing.id ? String(listing.id) : String(issue.number),
    title: issue.title,
    price: bp.price,
    note,
    status: deriveStatus(labelNames, config),
    reserver: state.reserver || null,
    url: issue.html_url,
    thumb: listing.thumb || null,
  };
```

- [ ] **Step 6: 통과 확인**

Run: `node --test test/build-issue.test.js test/listing-model.test.js`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add scripts/lib/build-issue.js scripts/lib/listing-model.js test/build-issue.test.js test/listing-model.test.js
git commit -m "feat: listing 마커에 썸네일 URL 저장 + 모델 전달

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: upsert 판단(`decide-upsert.js`) + import 제목 동기화/dry-run

**Files:**
- Create: `scripts/lib/decide-upsert.js`
- Test: `test/decide-upsert.test.js`
- Modify: `scripts/import-listings.js`

**Interfaces:**
- Produces: `decideUpsert({ existing, title, newBody })` →
  - `{ action: 'create' }` (existing 없음)
  - `{ action: 'unchanged' }` (body·title 동일)
  - `{ action: 'update', fields: { body?, title? } }` (바뀐 것만 포함)
  - `existing` 형태: `{ number, body, title }`.

- [ ] **Step 1: 실패 테스트 작성**

`test/decide-upsert.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert');
const { decideUpsert } = require('../scripts/lib/decide-upsert');

test('create when no existing issue', () => {
  assert.deepStrictEqual(decideUpsert({ existing: null, title: 'A', newBody: 'b' }), { action: 'create' });
});

test('unchanged when title and body match', () => {
  const existing = { number: 5, title: 'A', body: 'b' };
  assert.deepStrictEqual(decideUpsert({ existing, title: 'A', newBody: 'b' }), { action: 'unchanged' });
});

test('update body only when body differs', () => {
  const existing = { number: 5, title: 'A', body: 'old' };
  assert.deepStrictEqual(decideUpsert({ existing, title: 'A', newBody: 'new' }), { action: 'update', fields: { body: 'new' } });
});

test('update title only when title differs', () => {
  const existing = { number: 5, title: 'Old', body: 'b' };
  assert.deepStrictEqual(decideUpsert({ existing, title: 'New', newBody: 'b' }), { action: 'update', fields: { title: 'New' } });
});

test('update both when both differ', () => {
  const existing = { number: 5, title: 'Old', body: 'old' };
  assert.deepStrictEqual(decideUpsert({ existing, title: 'New', newBody: 'new' }), { action: 'update', fields: { title: 'New', body: 'new' } });
});
```

- [ ] **Step 2: 실패 확인**

Run: `node --test test/decide-upsert.test.js`
Expected: FAIL (module not found)

- [ ] **Step 3: 구현**

`scripts/lib/decide-upsert.js`:

```js
// Decide whether an imported listing should create, update, or skip its issue.
// Labels are intentionally never touched here — live reservation state lives in labels.
function decideUpsert({ existing, title, newBody }) {
  if (!existing) return { action: 'create' };
  const fields = {};
  if (title !== existing.title) fields.title = title;
  if (newBody !== existing.body) fields.body = newBody;
  if (Object.keys(fields).length === 0) return { action: 'unchanged' };
  return { action: 'update', fields };
}

module.exports = { decideUpsert };
```

- [ ] **Step 4: 통과 확인**

Run: `node --test test/decide-upsert.test.js`
Expected: PASS

- [ ] **Step 5: `import-listings.js` 배선**

(a) 상단 require 추가:

```js
const { decideUpsert } = require('./lib/decide-upsert');
```

(b) 상수에 썸네일 경로 추가(`RAW_BASE` 선언 아래):

```js
const THUMB_DIR = 'assets/thumbs';
const THUMB_BASE = `https://raw.githubusercontent.com/${OWNER}/${REPO}/master/${THUMB_DIR}`;
function thumbForPid(pid) {
  return fs.existsSync(`${THUMB_DIR}/${pid}.jpg`) ? `${THUMB_BASE}/${pid}.jpg` : null;
}
```

(c) `existingByPid`가 title도 담도록 수정:

```js
    if (id) map.set(String(id), { number: i.number, body: i.body || '', title: i.title || '' });
```

(d) `main()`의 인자 파싱·dry-run·ensureLabels 가드:

```js
async function main() {
  const args = process.argv.slice(2);
  const dry = args.includes('--dry-run');
  const csvPath = args.find((a) => !a.startsWith('--')) || 'keyboards.csv';
  const config = loadConfig('config.json');
  const token = execSync('gh auth token', { encoding: 'utf8' }).trim();
  const octokit = new Octokit({ auth: token });

  if (!dry) await ensureLabels(octokit, config);
  const rows = parse(fs.readFileSync(csvPath, 'utf8'), { columns: true, skip_empty_lines: true, trim: true });
  const existing = await existingByPid(octokit, config);
  const filenames = photoFilenames();
  const footer = reservationFooter(config);
```

(e) 루프 본문을 `decideUpsert` 기반으로 교체:

```js
  let created = 0;
  let updated = 0;
  for (const row of rows) {
    const pid = String(row[config.csvMapping.id]);
    const images = imagesForPid(pid, filenames, RAW_BASE);
    prepareRow(row, config);
    const issue = buildIssue(row, config, { images, footer, thumb: thumbForPid(pid) });

    const ex = existing.get(pid);
    const newBody = ex ? setMarker(issue.body, MARKER.state, readState(ex.body)) : issue.body;
    const plan = decideUpsert({ existing: ex, title: issue.title, newBody });

    if (plan.action === 'unchanged') { console.log(`unchanged #${ex.number}: ${issue.title}`); continue; }

    if (plan.action === 'update') {
      const titleNote = plan.fields.title ? ` (제목: "${ex.title}" → "${plan.fields.title}")` : '';
      if (dry) { console.log(`[dry-run] update #${ex.number}: ${issue.title}${titleNote}`); updated += 1; continue; }
      await octokit.rest.issues.update({ owner: OWNER, repo: REPO, issue_number: ex.number, ...plan.fields });
      console.log(`updated #${ex.number}: ${issue.title}${titleNote}`);
      updated += 1;
      continue;
    }

    // create
    if (dry) { console.log(`[dry-run] create: ${issue.title}`); created += 1; continue; }
    const res = await octokit.rest.issues.create({
      owner: OWNER, repo: REPO, title: issue.title, body: issue.body, labels: issue.labels,
    });
    console.log(`created #${res.data.number}: ${issue.title}`);
    created += 1;
  }
  console.log(`${dry ? '[dry-run] ' : ''}done. created ${created}, updated ${updated} issue(s).`);
```

- [ ] **Step 6: 전체 테스트 통과 확인**

Run: `npm test`
Expected: PASS (신규 decide-upsert 포함)

- [ ] **Step 7: Commit**

```bash
git add scripts/lib/decide-upsert.js scripts/import-listings.js test/decide-upsert.test.js
git commit -m "feat: import upsert 제목 동기화 + --dry-run + 썸네일 URL 주입

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: 매물 이슈 선별 헬퍼 (`render-board.js`)

**Files:**
- Modify: `scripts/lib/render-board.js`, `scripts/render-readme.js`
- Test: `test/render-board.test.js`

**Interfaces:**
- Produces: `selectListingIssues(issues, config)` → PR/[Test Purpose]/비운영자 제외한 이슈 배열.

- [ ] **Step 1: 실패 테스트 추가**

`test/render-board.test.js`에 추가(상단 require에 `selectListingIssues` 포함하도록 수정):

```js
test('selectListingIssues drops PRs, [Test Purpose], and non-owner issues', () => {
  const cfg = { owner: 'Suckzoo' };
  const issues = [
    { title: 'Real', user: { login: 'Suckzoo' } },
    { title: 'PR', user: { login: 'Suckzoo' }, pull_request: {} },
    { title: '[Test Purpose] D', user: { login: 'Suckzoo' } },
    { title: 'Stranger', user: { login: 'x' } },
  ];
  const out = selectListingIssues(issues, cfg).map((i) => i.title);
  assert.deepStrictEqual(out, ['Real']);
});
```

require 라인 수정:

```js
const { sortListings, renderTable, renderBoard, spliceBoard, isTestPurpose, selectListingIssues, BOARD_START, BOARD_END } = require('../scripts/lib/render-board');
```

- [ ] **Step 2: 실패 확인**

Run: `node --test test/render-board.test.js`
Expected: FAIL (selectListingIssues undefined)

- [ ] **Step 3: 구현**

`scripts/lib/render-board.js`에 함수 추가 + export:

```js
// Public board scope: real owner-authored listing issues only.
function selectListingIssues(issues, config) {
  return (issues || []).filter((i) =>
    !i.pull_request && !isTestPurpose(i.title) && i.user && i.user.login === config.owner);
}
```

```js
module.exports = { BOARD_START, BOARD_END, STATUS_DISPLAY, isTestPurpose, selectListingIssues, sortListings, renderTable, renderBoard, spliceBoard };
```

- [ ] **Step 4: `render-readme.js` 리팩터(동작 동일)**

require에 추가하고 인라인 필터를 헬퍼 호출로 교체:

```js
const { sortListings, renderBoard, spliceBoard, selectListingIssues } = require('./lib/render-board');
```

```js
  const models = sortListings(selectListingIssues(issues, config).map((i) => toListingModel(i, config)));
```

- [ ] **Step 5: 통과 확인**

Run: `node --test test/render-board.test.js test/render-readme.test.js`
Expected: PASS (render-readme 동작 불변)

- [ ] **Step 6: Commit**

```bash
git add scripts/lib/render-board.js scripts/render-readme.js test/render-board.test.js
git commit -m "refactor: 매물 이슈 선별을 selectListingIssues 헬퍼로 추출

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: 카탈로그 렌더 라이브러리 (`render-catalog.js` lib)

**Files:**
- Create: `scripts/lib/render-catalog.js`
- Test: `test/render-catalog.test.js`

**Interfaces:**
- Consumes: listing 모델 배열(`{ number, id, title, price, status, reserver, url, thumb }`), `sortListings`/`STATUS_DISPLAY`(render-board).
- Produces: `renderCatalog(models)` → `<table>` HTML(3열 카드), `spliceCatalog(doc, html)`, `CATALOG_START`/`CATALOG_END`.

- [ ] **Step 1: 실패 테스트 작성**

`test/render-catalog.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert');
const { renderCatalog, spliceCatalog, CATALOG_START, CATALOG_END } = require('../scripts/lib/render-catalog');

const base = (o) => ({ number: 1, id: '1', title: 'T', price: '1원', status: 'available', reserver: null, url: 'u', thumb: null, ...o });

test('renders a card with image, name, pid·price, status, issue link', () => {
  const html = renderCatalog([base({ number: 100, id: '100', title: 'PBTFans 1984', price: '50,000원', thumb: 'https://raw/thumbs/100.jpg', url: 'https://gh/100' })]);
  assert.match(html, /<table>/);
  assert.match(html, /<img src="https:\/\/raw\/thumbs\/100\.jpg" width="200">/);
  assert.match(html, /<b>PBTFans 1984<\/b>/);
  assert.match(html, /PID 100 · 50,000원/);
  assert.match(html, /🟢 구매 가능/);
  assert.match(html, /<a href="https:\/\/gh\/100">#100<\/a>/);
});

test('omits img tag when thumb is null', () => {
  const html = renderCatalog([base({ thumb: null })]);
  assert.doesNotMatch(html, /<img/);
});

test('shows reserver when present', () => {
  const html = renderCatalog([base({ status: 'reserved', reserver: 'octocat' })]);
  assert.match(html, /🟡 예약금 대기중 · @octocat/);
});

test('groups three cards per row and sorts by status then pid', () => {
  const html = renderCatalog([
    base({ number: 3, id: '3', status: 'paid' }),
    base({ number: 1, id: '1', status: 'available' }),
    base({ number: 2, id: '2', status: 'available' }),
    base({ number: 4, id: '4', status: 'available' }),
  ]);
  const rows = html.match(/<tr>/g) || [];
  assert.strictEqual(rows.length, 2); // 4 cards → 2 rows of 3
  // available(1,2,4) before paid(3): first cell is pid 1
  assert.ok(html.indexOf('PID 1 ') < html.indexOf('PID 3 '));
});

test('empty models render a placeholder, not a table', () => {
  assert.match(renderCatalog([]), /등록된 매물이 없습니다/);
});

test('spliceCatalog replaces only between markers; throws if missing', () => {
  const doc = `# 카탈로그\n${CATALOG_START}\nOLD\n${CATALOG_END}\n끝`;
  const out = spliceCatalog(doc, '새카드');
  assert.match(out, new RegExp(`${CATALOG_START}\\n새카드\\n${CATALOG_END}`));
  assert.doesNotMatch(out, /OLD/);
  assert.match(out, /끝/);
  assert.throws(() => spliceCatalog('no markers', 'x'), /CATALOG/);
});
```

- [ ] **Step 2: 실패 확인**

Run: `node --test test/render-catalog.test.js`
Expected: FAIL (module not found)

- [ ] **Step 3: 구현**

`scripts/lib/render-catalog.js`:

```js
const { sortListings, STATUS_DISPLAY } = require('./render-board');

const CATALOG_START = '<!-- CATALOG:START -->';
const CATALOG_END = '<!-- CATALOG:END -->';
const COLUMNS = 3;

// One listing → an HTML card (table cell). GitHub strips style/class in cells,
// so only <img width>, <b>, <br>, <a> are used.
function card(m) {
  const img = m.thumb ? `<img src="${m.thumb}" width="200"><br>` : '';
  const id = m.id || String(m.number);
  const status = STATUS_DISPLAY[m.status] || '❔';
  const reserver = m.reserver ? ` · @${m.reserver}` : '';
  return `${img}<b>${m.title}</b><br>PID ${id} · ${m.price || '-'}<br>${status}${reserver}<br><a href="${m.url}">#${m.number}</a>`;
}

function renderCatalog(models) {
  const sorted = sortListings(models);
  if (sorted.length === 0) return '_등록된 매물이 없습니다._';
  const rows = [];
  for (let i = 0; i < sorted.length; i += COLUMNS) {
    const cells = sorted.slice(i, i + COLUMNS)
      .map((m) => `<td width="33%" valign="top" align="center">${card(m)}</td>`)
      .join('');
    rows.push(`<tr>${cells}</tr>`);
  }
  return `<table>\n${rows.join('\n')}\n</table>`;
}

function spliceCatalog(doc, html) {
  const start = doc.indexOf(CATALOG_START);
  const end = doc.indexOf(CATALOG_END);
  if (start === -1 || end === -1 || end < start) {
    throw new Error('CATALOG.md is missing CATALOG:START/CATALOG:END markers');
  }
  return `${doc.slice(0, start + CATALOG_START.length)}\n${html}\n${doc.slice(end)}`;
}

module.exports = { CATALOG_START, CATALOG_END, renderCatalog, spliceCatalog };
```

- [ ] **Step 4: 통과 확인**

Run: `node --test test/render-catalog.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/render-catalog.js test/render-catalog.test.js
git commit -m "feat: 카탈로그 카드 렌더 라이브러리(3열 표 셀, 200px 썸네일)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 7: 카탈로그 엔트리 + CATALOG.md + README 링크 + 워크플로

**Files:**
- Create: `scripts/render-catalog.js`(엔트리), `CATALOG.md`
- Modify: `README.md`, `.github/workflows/update-readme.yml`

**Interfaces:**
- Consumes: `selectListingIssues`(render-board), `toListingModel`(listing-model), `renderCatalog`/`spliceCatalog`(render-catalog lib).
- Produces: `run({ github, context, configPath })` → `{ changed }`, `CATALOG.md` 갱신.

- [ ] **Step 1: 카탈로그 엔트리 작성**

`scripts/render-catalog.js`:

```js
const { loadConfig } = require('./lib/config');
const { toListingModel } = require('./lib/listing-model');
const { selectListingIssues } = require('./lib/render-board');
const { renderCatalog, spliceCatalog } = require('./lib/render-catalog');

module.exports = async function run({ github, context, configPath = 'config.json' }) {
  const config = loadConfig(configPath);
  const { owner, repo } = context.repo;

  const issues = await github.paginate(github.rest.issues.listForRepo, {
    owner, repo, state: 'all', labels: config.labels.scope, per_page: 100,
  });
  const models = selectListingIssues(issues, config).map((i) => toListingModel(i, config));
  const html = renderCatalog(models);

  const current = await github.rest.repos.getContent({ owner, repo, path: 'CATALOG.md' });
  const sha = current.data.sha;
  const old = Buffer.from(current.data.content, 'base64').toString('utf8');
  const updated = spliceCatalog(old, html);

  if (updated === old) return { changed: false };

  await github.rest.repos.createOrUpdateFileContents({
    owner, repo, path: 'CATALOG.md',
    message: 'chore: update 카탈로그',
    content: Buffer.from(updated, 'utf8').toString('base64'),
    sha,
  });
  return { changed: true };
};
```

- [ ] **Step 2: `CATALOG.md` 생성**

```markdown
# 🖼 카탈로그

매물을 사진과 함께 한 눈에 볼 수 있는 카탈로그입니다. 봇이 자동으로 갱신합니다(지연 있을 수 있음).
가격·상태·예약자는 [현황판(README)](README.md#-예약-현황)과 동일하게 반영됩니다.

<!-- CATALOG:START -->
_렌더 대기 중…_
<!-- CATALOG:END -->
```

- [ ] **Step 3: `README.md`에 카탈로그 링크 추가**

`<!-- BOARD:START -->` **바로 위 줄**(마커 밖)에 삽입:

```markdown
> 🖼 사진과 함께 보려면 **[카탈로그 뷰](CATALOG.md)**를 확인하세요.

<!-- BOARD:START -->
```

- [ ] **Step 4: 워크플로에 카탈로그 렌더 스텝 추가**

`.github/workflows/update-readme.yml`의 README 렌더 스텝 다음에 추가:

```yaml
      - uses: actions/github-script@v7
        with:
          script: |
            const run = require('./scripts/render-catalog.js')
            const { changed } = await run({ github, context })
            core.info(changed ? 'CATALOG updated' : 'CATALOG unchanged')
```

- [ ] **Step 5: 로컬 스모크(픽스처)로 카탈로그 엔트리 확인**

Run:

```bash
node -e '
const run = require("./scripts/render-catalog.js");
const issues = [{ number: 100, title: "PBTFans 1984", html_url: "u", user: { login: "Suckzoo" },
  labels: [{name:"매물"},{name:"구매 가능"}],
  body: "<!-- market-listing: {\"id\":\"100\",\"price\":\"50,000원\",\"thumb\":\"https://raw/thumbs/100.jpg\"} -->" }];
const fs = require("fs"); const orig = fs.readFileSync;
fs.readFileSync = (p,e)=> String(p).endsWith("CATALOG.md") ? "X\n<!-- CATALOG:START -->\nOLD\n<!-- CATALOG:END -->\n" : orig(p,e);
const github = { paginate: async (fn,pa)=>(await fn(pa)).data,
  rest: { issues:{ listForRepo: async()=>({data:issues}) },
    repos:{ getContent: async()=>({data:{ content: Buffer.from("X\n<!-- CATALOG:START -->\nOLD\n<!-- CATALOG:END -->\n").toString("base64"), sha:"s"}}),
      createOrUpdateFileContents: async(p)=>{ console.log(Buffer.from(p.content,"base64").toString("utf8")); return {data:{}};}}}};
run({ github, context:{ repo:{ owner:"Suckzoo", repo:"keyboard-market" }}}).then(r=>console.error("changed:", r.changed));
'
```

Expected: 출력 HTML에 `<img ... width="200">`, `<b>PBTFans 1984</b>`, `#100` 포함, `changed: true`.

- [ ] **Step 6: 전체 테스트 통과 확인**

Run: `npm test`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add scripts/render-catalog.js CATALOG.md README.md .github/workflows/update-readme.yml
git commit -m "feat: 카탈로그 뷰(CATALOG.md) 자동 렌더 + README 링크 + 워크플로

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 8: 키캡 사진 매핑 플래너 + 리사이즈 래퍼

**Files:**
- Create: `scripts/lib/keycap-photos.js`, `scripts/import-keycap-photos.js`
- Test: `test/keycap-photos.test.js`

**Interfaces:**
- Produces: `planKeycapPhotos(rows, config)` → `[{ pid, source, dest }]`(pid≥100만, 셀 내 중복 dedupe, `dest = "{pid}_{n}.jpg"`).

- [ ] **Step 1: 실패 테스트 작성**

`test/keycap-photos.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert');
const { planKeycapPhotos } = require('../scripts/lib/keycap-photos');

const config = { csvMapping: { id: 'pid', photoLinks: '사진 링크' } };

test('maps pid>=100 rows to {pid}_{n}.jpg, dedupes within a cell', () => {
  const rows = [
    { pid: '100', '사진 링크': 'a.jpg' },
    { pid: '108', '사진 링크': 'b.jpg\nb.jpg' },           // 중복 → 1개
    { pid: '109', '사진 링크': 'c.jpg\nd.jpg' },           // 2개
  ];
  assert.deepStrictEqual(planKeycapPhotos(rows, config), [
    { pid: '100', source: 'a.jpg', dest: '100_1.jpg' },
    { pid: '108', source: 'b.jpg', dest: '108_1.jpg' },
    { pid: '109', source: 'c.jpg', dest: '109_1.jpg' },
    { pid: '109', source: 'd.jpg', dest: '109_2.jpg' },
  ]);
});

test('ignores keyboards (pid<100) and empty photo cells', () => {
  const rows = [
    { pid: '1', '사진 링크': '' },
    { pid: '50', '사진 링크': 'x.jpg' },
    { pid: '110', '사진 링크': '' },
  ];
  assert.deepStrictEqual(planKeycapPhotos(rows, config), []);
});
```

- [ ] **Step 2: 실패 확인**

Run: `node --test test/keycap-photos.test.js`
Expected: FAIL

- [ ] **Step 3: 플래너 구현**

`scripts/lib/keycap-photos.js`:

```js
// Map keycap rows (pid >= 100) to resized photo destinations.
// `사진 링크` cells may list multiple newline-separated source filenames; dedupe within a cell.
function planKeycapPhotos(rows, config) {
  const map = config.csvMapping || {};
  const idKey = map.id || 'pid';
  const linkKey = map.photoLinks || '사진 링크';
  const plan = [];
  for (const row of rows || []) {
    const pid = String(row[idKey] || '').trim();
    if (!/^\d+$/.test(pid) || Number(pid) < 100) continue;
    const seen = new Set();
    const files = String(row[linkKey] || '')
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean)
      .filter((f) => (seen.has(f) ? false : seen.add(f)));
    files.forEach((source, idx) => plan.push({ pid, source, dest: `${pid}_${idx + 1}.jpg` }));
  }
  return plan;
}

module.exports = { planKeycapPhotos };
```

- [ ] **Step 4: 통과 확인**

Run: `node --test test/keycap-photos.test.js`
Expected: PASS

- [ ] **Step 5: 리사이즈 래퍼 구현(로컬, sips)**

`scripts/import-keycap-photos.js`:

```js
#!/usr/bin/env node
// Local one-shot: keycaps.zip → resized assets/photos/{pid}_{n}.jpg (가로 1600px, 크롭 없음).
// macOS 전용(sips/unzip 의존).
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { parse } = require('csv-parse/sync');
const { loadConfig } = require('./lib/config');
const { planKeycapPhotos } = require('./lib/keycap-photos');

const ZIP = 'keycaps.zip';
const OUT = 'assets/photos';
const WIDTH = 1600;

function main() {
  const config = loadConfig('config.json');
  const rows = parse(fs.readFileSync('keyboards.csv', 'utf8'), { columns: true, skip_empty_lines: true, trim: true });
  const plan = planKeycapPhotos(rows, config);

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'keycaps-'));
  execFileSync('unzip', ['-j', '-o', ZIP, '-d', tmp], { stdio: 'ignore' }); // -j: 깨진 한글 폴더명 평탄화
  fs.mkdirSync(OUT, { recursive: true });

  let written = 0;
  const missing = [];
  for (const { source, dest } of plan) {
    const src = path.join(tmp, source);
    if (!fs.existsSync(src)) { missing.push(`${source} → ${dest}`); continue; }
    execFileSync('sips', ['-s', 'format', 'jpeg', '--resampleWidth', String(WIDTH), src, '--out', path.join(OUT, dest)], { stdio: 'ignore' });
    written += 1;
  }
  console.log(`keycap photos written: ${written}/${plan.length}`);
  if (missing.length) console.warn(`missing sources:\n  ${missing.join('\n  ')}`);
}

main();
```

- [ ] **Step 6: Commit**

```bash
git add scripts/lib/keycap-photos.js scripts/import-keycap-photos.js test/keycap-photos.test.js
git commit -m "feat: 키캡 사진 매핑 플래너 + 1600px 리사이즈 래퍼

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 9: 썸네일 플래너 + 생성 래퍼

**Files:**
- Create: `scripts/lib/thumbs.js`, `scripts/build-thumbs.js`
- Test: `test/thumbs.test.js`

**Interfaces:**
- Produces: `thumbPlan(filenames)` → `[{ pid, source, dest }]`(pid별 정렬상 첫 사진, `dest = "{pid}.jpg"`).

- [ ] **Step 1: 실패 테스트 작성**

`test/thumbs.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert');
const { thumbPlan } = require('../scripts/lib/thumbs');

test('picks the first sorted photo per pid', () => {
  const files = ['100_2.jpg', '100_1.jpg', '1_fb.jpg', '21_zxch3.jpg'];
  assert.deepStrictEqual(thumbPlan(files), [
    { pid: '1', source: '1_fb.jpg', dest: '1.jpg' },
    { pid: '100', source: '100_1.jpg', dest: '100.jpg' },
    { pid: '21', source: '21_zxch3.jpg', dest: '21.jpg' },
  ]);
});

test('ignores files without a {pid}_ prefix', () => {
  assert.deepStrictEqual(thumbPlan(['kakaopay-qr.jpeg', 'README']), []);
});
```

- [ ] **Step 2: 실패 확인**

Run: `node --test test/thumbs.test.js`
Expected: FAIL

- [ ] **Step 3: 플래너 구현**

`scripts/lib/thumbs.js`:

```js
// First photo (lexicographically) per pid → thumbnail source.
function thumbPlan(filenames) {
  const byPid = new Map();
  for (const f of [...(filenames || [])].sort()) {
    const m = f.match(/^(\d+)_/);
    if (!m) continue;
    if (!byPid.has(m[1])) byPid.set(m[1], f);
  }
  return [...byPid.entries()]
    .sort((a, b) => Number(a[0]) - Number(b[0]))
    .map(([pid, source]) => ({ pid, source, dest: `${pid}.jpg` }));
}

module.exports = { thumbPlan };
```

- [ ] **Step 4: 통과 확인**

Run: `node --test test/thumbs.test.js`
Expected: PASS

- [ ] **Step 5: 생성 래퍼 구현(로컬, sips)**

`scripts/build-thumbs.js`:

```js
#!/usr/bin/env node
// Local: assets/photos/{pid}_*.jpg 의 pid별 첫 사진 → assets/thumbs/{pid}.jpg (가로 400px). macOS 전용.
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { thumbPlan } = require('./lib/thumbs');

const SRC = 'assets/photos';
const OUT = 'assets/thumbs';
const WIDTH = 400;

function main() {
  const files = fs.readdirSync(SRC).filter((f) => /^\d+_.*\.jpg$/i.test(f));
  const plan = thumbPlan(files);
  fs.mkdirSync(OUT, { recursive: true });
  for (const { source, dest } of plan) {
    execFileSync('sips', ['-s', 'format', 'jpeg', '--resampleWidth', String(WIDTH), path.join(SRC, source), '--out', path.join(OUT, dest)], { stdio: 'ignore' });
  }
  console.log(`thumbnails written: ${plan.length}`);
}

main();
```

- [ ] **Step 6: Commit**

```bash
git add scripts/lib/thumbs.js scripts/build-thumbs.js test/thumbs.test.js
git commit -m "feat: pid별 썸네일(400px) 플래너 + 생성 래퍼

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 10: 로컬 에셋 생성 (키캡 사진 + 썸네일 커밋)

**Files:**
- Create: `assets/photos/{pid}_{n}.jpg`(키캡), `assets/thumbs/{pid}.jpg`(전체)

**Interfaces:**
- Consumes: `keycaps.zip`(레포 루트, 비커밋), `keyboards.csv`, Task 8·9 스크립트.

- [ ] **Step 1: 키캡 사진 생성**

Run: `npm run photos:keycaps`
Expected: `keycap photos written: N/N`(missing 0). `assets/photos`에 `100_1.jpg … 118_1.jpg` 등 생성.

- [ ] **Step 2: 결과 점검**

Run: `ls assets/photos | grep -E '^1(0|1)[0-9]_' | head; sips -g pixelWidth assets/photos/100_1.jpg`
Expected: 키캡 파일 존재, pixelWidth 1600(또는 원본이 1600 미만이면 원본폭).

- [ ] **Step 3: 썸네일 생성**

Run: `npm run thumbs`
Expected: `thumbnails written: M`. `assets/thumbs/{pid}.jpg` 다수 생성(키보드+키캡 전체).

- [ ] **Step 4: 용량 확인**

Run: `du -sh assets/thumbs assets/photos`
Expected: thumbs 합계 수 MB 이하(장당 ~30KB).

- [ ] **Step 5: Commit**

```bash
git add assets/photos assets/thumbs
git commit -m "assets: 키캡 사진 리사이즈본 + 전체 썸네일 생성

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 11: CLAUDE.md 인수인계

**Files:**
- Create: `CLAUDE.md`

- [ ] **Step 1: 작성** — 아래 내용으로 `CLAUDE.md` 생성

```markdown
# CLAUDE.md

GitHub 이슈 기반 키보드/키캡 중고장터 자동화. 매물 1건 = 이슈 1개. 선착순 예약·네고·입금확인을
GitHub Actions로 무인 처리하고 README 현황판 + CATALOG 카탈로그를 자동 렌더한다.

- 라이브 레포: `Suckzoo/keyboard-market`. 설계/계획: `docs/superpowers/specs`, `docs/superpowers/plans`.

## 상태 머신

`구매 가능` →(`#구매신청` 선착순) `예약금 대기중` →(`#입금완료`) `예약금 확인중` →(운영자 `#입금확인`) `입금 확인 완료`(close).
3시간 미입금 시 스위퍼가 `구매 가능` 복귀. 네고는 `#네고희망 {금액}` → 운영자 👍/👎. 예약자·시각은
이슈 본문 숨김 마커 `<!-- market-state: {...} -->`, 매물 메타는 `<!-- market-listing: {...} -->`(id/name/price/thumb).

## 데이터 파이프라인

- SSoT: `keyboards.csv` (`pid,storage,price,name,비고,사진 링크`). 컬럼 역할은 `config.json.csvMapping`.
  - pid < 100 = 키보드, pid ≥ 100 = 키캡.
  - `비고` → 이슈 본문 `> ⚠️ 주의사항`. `사진 링크` → 키캡 사진 importer 입력(키캡만).
- 사진: `assets/photos/{pid}_*.jpg`(본문, 가로 1600px). pid 프리픽스로 이슈에 매칭.
- 썸네일: `assets/thumbs/{pid}.jpg`(카탈로그, 가로 400px). import 시 마커 `thumb`에 raw URL 저장.
- import: `npm run import`(= `keyboards.csv`). 기존 pid는 upsert(본문+제목 동기화, **라벨 불변**).
  - 사전 점검: `npm run import:dry`(API 호출 없이 생성/갱신 미리보기).

## 렌더

- 현황판: `scripts/render-readme.js` → `README.md`의 `BOARD:START/END` 사이 표.
- 카탈로그: `scripts/render-catalog.js` → `CATALOG.md`의 `CATALOG:START/END` 사이 3열 카드.
- 워크플로 `update-readme.yml`이 issues/스케줄 이벤트에 둘 다 렌더·커밋.
  - 주의: issues/schedule 워크플로는 항상 **기본 브랜치(master)** 버전으로 실행됨.

## 사진/썸네일 재생성 (macOS 로컬, sips 의존)

```bash
npm run photos:keycaps   # keycaps.zip → assets/photos/{pid}_{n}.jpg (1600px)
npm run thumbs           # assets/photos → assets/thumbs/{pid}.jpg (400px)
```

`keycaps.zip`은 비커밋(.gitignore). 결과물만 커밋. 크롭 금지(가로폭만, 비율 유지).

## 런칭 절차

1. 코드/CSV/사진/썸네일/문서를 PR 브랜치에서 구현·테스트(`npm test`, `npm run import:dry`).
2. master 머지(워크플로가 master 버전으로 도므로 카탈로그 렌더가 master에 있어야 함).
3. `npm run import` 실행 → 키캡 이슈 생성 + 이름/가격 바뀐 이슈 갱신.
4. `update-readme` 워크플로가 README 현황판 + CATALOG 자동 렌더.

## 테스트

`npm test`(`node --test`). 순수 헬퍼는 모두 단위 테스트: `build-issue`, `decide-*`, `render-*`,
`keycap-photos`, `thumbs`, `listing-model` 등.

## 디렉터리

- `scripts/lib/*` 순수 로직, `scripts/*.js` 엔트리(import/render/사진).
- `.github/workflows/` comment-handler(예약/네고/입금) · sweeper(만료) · update-readme(렌더).
```

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: CLAUDE.md 인수인계 작성

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 12: 최종 검증 (테스트 + dry-run 미리보기)

**Files:** (없음 — 검증 전용)

- [ ] **Step 1: 전체 테스트**

Run: `npm test`
Expected: 기존 42 + 신규(decide-upsert 5, render-catalog 6, keycap-photos 2, thumbs 2, build-issue +4, listing-model +2, render-board +1) 모두 PASS.

- [ ] **Step 2: dry-run 미리보기(부작용 0)**

Run: `npm run import:dry`
Expected: API write 없이 `[dry-run] create: …`(키캡 19종), `[dry-run] update #N: … (제목: "9번 키보드" → "Glare tkl 추정")` 등 제목 변경 목록 출력. 마지막 줄 `[dry-run] done. created 19, updated …`.

- [ ] **Step 3: 로컬 렌더 미리보기 확인** — Task 7 Step 5 스모크 재실행 또는 픽스처로 CATALOG/README 표 출력이 의도대로인지 확인.

- [ ] **Step 4: 푸시 + PR 생성**

```bash
git push -u origin feat/keycaps-catalog
gh pr create --fill --base master
```

- [ ] **Step 5: 운영자 인계** — PR 머지 후 `npm run import` 실행은 운영자가 수행(이 플랜 범위 밖). dry-run 출력으로 제목 변경/생성 목록을 먼저 검토.

---

## Self-Review (작성자 체크)

- **Spec coverage:** SSoT 교체(T1) · 비고 주의사항(T2) · 제목 동기화/dry-run(T4) · 키캡 사진 리사이즈(T8,T10) · 키캡 이슈+현황판(T4 import + 기존 파이프라인) · 카탈로그 뷰(T6,T7) · README 링크(T7) · CLAUDE.md(T11) — 전부 매핑됨.
- **Placeholder scan:** 모든 코드 스텝에 실제 코드/명령/기대출력 포함. TBD 없음.
- **Type consistency:** `decideUpsert`/`planKeycapPhotos`/`thumbPlan`/`renderCatalog`/`selectListingIssues` 시그니처가 호출부와 일치. listing 마커 `thumb` 키가 build-issue(쓰기)·listing-model(읽기)·render-catalog(사용)에서 동일.
