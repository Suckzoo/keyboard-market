# 키보드 장터 (GitHub 이슈 기반) — 설계 문서

- **작성일:** 2026-06-21
- **저장소:** `Suckzoo/keyboard-market` (최초 **private**로 생성·테스트 → 런칭 시 **public** 전환)
- **아키텍처:** 순수 GitHub Actions (외부 인프라/호스팅 없음)

## 1. 개요

키보드 중고 매물을 GitHub 이슈로 1건씩 등록하고, 각 이슈에서 **특정 키워드 댓글을 가장 먼저 단 사람**이 구매(예약) 권한을 얻는 선착순 장터.

흐름 요약:

1. Google Sheet의 매물 목록을 1회성 스크립트로 이슈화(이슈 1개 = 매물 1건).
2. 전체 동시 오픈 시각(`openAt`) 이전 구매 댓글은 거절 안내.
3. 오픈 후 `#구매신청` 댓글을 최초로 단 사람을 예약 확정 → 봇이 입금 안내 + 폼 링크 댓글, `예약금 대기중` 라벨.
4. 예약자는 **3시간 내 입금 + Google Form 작성**.
5. 운영자가 입금을 수동 확인하면 `입금 확인 완료` 라벨 → 이슈 close(판매 완료).
6. 3시간 내 미완료 시 자동으로 `구매 가능`으로 복귀(다음 사람을 자동 지정하지 않음).
7. 상태 변화 시 GitHub Action이 README의 예약 현황판을 자동 갱신·커밋.

## 2. 핵심 결정 사항 (확정)

| 항목 | 결정 |
|---|---|
| 접근 모델 | 런칭 시 **public repo** (누구나 GitHub 계정으로 댓글). 개발/테스트는 **private**에서 시작 |
| 동기화 | **1회성 일괄 import** (로컬 스크립트). 재실행 시 새 행만 추가(멱등) |
| 오픈 시각 | **전체 동시 오픈**, 전역 설정값 1개(`openAt`) |
| 트리거 키워드 | **`#구매신청`** |
| 폼 | **Google Form** (연락처·선호시간 등 수집, 개인정보 비공개) |
| 만료 처리 | 3시간 초과 시 **자동으로 `구매 가능` 복귀** (다음 사람 자동 지정 X) |
| 라벨 모델 | **`오픈 전` 라벨 없음.** 생성 시 `구매 가능`, 댓글 핸들러가 시각 게이트 |
| 필드 | **미정** → import 스키마/렌더 유연하게 설계 |

## 3. 상태 머신 / 라벨

라벨 3개: `구매 가능` · `예약금 대기중` · `입금 확인 완료` (+ 매물 스코프용 `매물` 라벨)

```
[구매 가능]  ──#구매신청(첫 번째, now≥openAt)──▶  [예약금 대기중]
   ▲                                                  │ 운영자 입금확인 ▼
   └────────── 3시간 만료 (스위퍼) ──────────────────  [입금 확인 완료] → 이슈 close
```

- 이슈는 생성 시 `구매 가능`. `now < openAt` 댓글은 핸들러가 거절(액션 미수행).
- `입금 확인 완료`는 **운영자 수동 라벨**로만 진입. 진입 시 이슈 close.

## 4. 저장소 구조

```
keyboard-market/
├── README.md                      # 안내(정적) + 거래규칙(정적) + 예약 현황판(자동)
├── config.json                    # 장터 운영 설정
├── listings.csv                   # 시트 → CSV 내보내기 (import 입력)
├── package.json                   # 로컬 import 스크립트 의존성
├── scripts/
│   ├── import-listings.js         # 로컬 1회: CSV → 이슈 생성
│   ├── handle-comment.js          # 댓글 핸들러 로직 (github-script가 호출)
│   ├── sweep-timeouts.js          # 3시간 만료 스위퍼 로직
│   └── render-readme.js           # 이슈 상태 → README 현황판 렌더
└── .github/workflows/
    ├── comment-handler.yml        # on: issue_comment
    ├── sweeper.yml                # on: schedule (cron ~10분)
    └── update-readme.yml          # on: issues (labeled/unlabeled/closed/reopened)
```

워크플로는 **3개** (오프너 없음). 로컬 스크립트 1개(import) + 워크플로 공용 로직 스크립트.

### config.json

```json
{
  "openAt": "2026-07-01T20:00:00+09:00",
  "keyword": "#구매신청",
  "reservationHours": 3,
  "formBaseUrl": "https://docs.google.com/forms/d/e/<ID>/viewform",
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

### 인증 / 봇 정체성

- 모든 워크플로는 내장 `GITHUB_TOKEN` 사용. 권한은 워크플로별로 선언(`issues: write`, `contents: write`).
- `GITHUB_TOKEN`이 만든 댓글/라벨/커밋은 **다른 워크플로를 재트리거하지 않음** → 무한루프 자동 방지.
- 반대로 **사람**이 `입금 확인 완료` 라벨을 달면 워크플로 정상 발동.
- 별도 봇 계정/PAT 불필요. 운영자가 직접 만지는 것은 `config.json`과 라벨 수동 조작뿐.

## 5. README 구조

정적 영역(안내·거래규칙) + 자동 영역(현황판). 렌더 스크립트는 **마커 사이만** 교체.

```markdown
# ⌨️ 키보드 장터

## 📢 안내                ← 정적, 운영자가 직접 작성(별도 준비됨, 나중에 교체)

## 🛒 거래 규칙 / 주의사항  ← 정적, 본 스펙의 초안 사용

<!-- BOARD:START -->
## 📋 예약 현황            ← 자동 갱신 (render-readme.js가 교체)
| 매물 | 가격 | 상태 | 예약자 | 이슈 |
|---|---|---|---|---|
<!-- BOARD:END -->
```

- `<!-- BOARD:START -->` ~ `<!-- BOARD:END -->` 사이만 자동 교체. 위쪽 정적 영역은 보존.
- 안내 문구는 운영자가 별도 준비 → 플레이스홀더로 두고 나중에 교체.

### 거래 규칙 초안 (README에 포함)

```markdown
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
```

(문의 채널·환불 정책 세부는 운영자가 정책에 맞게 보완)

## 6. 예약자/시각 추적 — 이슈 본문 마커

봇이 이슈 본문에 숨김 마커를 심어 상태를 자립적으로 관리(공개 repo에서 임의 유저 assignee 불가하므로 assignee 미사용, cron이 타임라인 API에 의존하지 않게 함):

```
<!-- market-listing: {"id":"1","price":"120,000","grade":"A","name":"Keychron Q1"} -->
<!-- market-state:   {"reserver":"octocat","reservedAt":"2026-07-01T20:00:05+09:00","availableSince":null} -->
```

- `market-listing`: import가 기록하는 매물 메타(가격 등). 렌더러가 README에 사용.
- `market-state`: 런타임 예약 상태. 예약 시 `reserver`/`reservedAt` 기록, 만료/복귀 시 비우고 `availableSince`에 복귀 시각 기록.
- `availableSince`: 이슈가 마지막으로 `구매 가능`이 된 시각. 핸들러의 선착순 기준시각(`since`)으로 사용. 초기값 `null`(= `openAt` 사용).
- 스위퍼는 `reservedAt`으로 만료를 정확히 계산. 렌더러는 `reserver`로 예약자 표시.
- **타임라인 API 불필요** — `since`/만료 모두 마커로만 계산.

## 7. 댓글 핸들러 (`comment-handler.yml`)

- **트리거:** `on: issue_comment: [created]`
- **동시성:** `concurrency: group: market-issue-<이슈번호>, cancel-in-progress: false` (이슈별 직렬 처리 → 선착순 경합 방지)
- **권한:** `issues: write`

처리 순서(위→아래, 먼저 매칭되면 종료):

| 조건 | 동작 |
|---|---|
| 댓글에 `#구매신청` 없음 | 무시(즉시 종료) |
| `now < openAt` | 💬 "아직 열리지 않았습니다. {openAt}부터 구매 가능합니다." → 종료 |
| 상태 = `입금 확인 완료` | 💬 "이미 판매 완료된 매물입니다." → 종료 |
| 상태 = `예약금 대기중`, 댓글자 = 현재 예약자 | 💬 "이미 예약하셨습니다. 입금/폼 작성 부탁드립니다." + 폼 링크 재전송 |
| 상태 = `예약금 대기중`, 댓글자 ≠ 예약자 | 💬 "이미 예약 진행 중입니다." → 종료 |
| 상태 = `구매 가능` & `now ≥ openAt` | **예약 처리 ↓** |

### 예약 처리 (선착순 확정)

1. 이슈가 `구매 가능`이 된 기준시각 `since` 계산
   - `since = market-state.availableSince ?? openAt` (1라운드는 `availableSince`가 `null`이라 `openAt`, 재오픈 이후는 스위퍼가 기록한 복귀 시각)
2. `since` 이후의 `#구매신청` 댓글들을 `created_at` 오름차순 정렬 → **가장 빠른 댓글 작성자 = 당첨자**
   (트리거된 댓글이 당첨자가 아닐 수 있음 → 항상 진짜 선착순에게 부여)
3. 라벨: `구매 가능` 제거 → `예약금 대기중` 추가
4. 본문 `market-state` 마커에 `reserver` + `reservedAt`(=당첨 댓글 `created_at`) 기록
5. 확정 댓글 게시:
   > **@당첨자**님 예약 완료 ✅
   > 3시간 내 아래 계좌로 입금 + 폼 작성 부탁드립니다.
   > 💳 {depositInfo}
   > 📝 폼: {formBaseUrl}?usp=pp_url&{formIssueEntryId}=12&{formUserEntryId}=당첨자
   > ⏰ 마감: {reservedAt + reservationHours}

README는 별도 `update-readme` 워크플로(라벨 변경 트리거)로 자동 갱신.

## 8. 스위퍼 (`sweeper.yml`)

- **트리거:** `on: schedule` (약 10분 cron) + `workflow_dispatch`
- **권한:** `issues: write`
- 로직: `예약금 대기중` 라벨 이슈 전체 조회 → 각 본문 `reservedAt` 확인 →
  `now - reservedAt > reservationHours` 이고 `입금 확인 완료` 아님이면:
  - `예약금 대기중` 제거 → `구매 가능` 추가
  - `market-state`의 `reserver`/`reservedAt` 비우고 `availableSince`에 현재 시각 기록 (다음 라운드 선착순 기준)
  - 💬 "예약이 만료되어 다시 구매 가능 상태가 되었습니다. 원하시면 `#구매신청` 댓글을 남겨주세요."

### 알려진 트레이드오프 (수용)

상태는 운영자 입금 확인으로만 판매 완료로 진행. 구매자가 입금했으나 운영자가 3시간 내 확인을 못 하면 조기 해제 가능.
- cron 10분 간격 → 실제 유효 창 3:00~3:10
- 운영자는 입금 확인 시 **데드라인 전에 `입금 확인 완료` 라벨** 부착 권장
- 연장 필요 시 운영자가 본문 `reservedAt` 수정으로 연장
- MVP에서는 "입금 신고됨" 중간 상태를 두지 않음

## 9. README 갱신 (`update-readme.yml` + `render-readme.js`)

- **트리거:** `on: issues: [labeled, unlabeled, closed, reopened]` + `workflow_dispatch`
- **권한:** `contents: write`, `issues: read`
- **동시성:** `concurrency: update-readme, cancel-in-progress: true` (연속 변경 시 마지막만 반영)

`render-readme.js`:

1. `매물` 라벨 이슈 전체 조회(열림+닫힘)
2. 각 이슈에서 매물명(제목), 가격(`market-listing`), 상태(라벨), 예약자(`market-state.reserver`), 이슈 링크 추출
3. 정렬(구매 가능 → 예약금 대기중 → 판매 완료) 후 표 생성

   | 매물 | 가격 | 상태 | 예약자 | 이슈 |
   |---|---|---|---|---|
   | Keychron Q1 | 120,000 | 🟢 구매 가능 | - | [#12](...) |
   | NK65 | 90,000 | 🟡 예약금 대기중 | @octocat | [#13](...) |
   | Tofu60 | 70,000 | ✅ 판매 완료 | @hubot | [#14](...) |

4. README의 `BOARD:START`~`BOARD:END` 사이만 교체
5. 변경 있을 때만 `GITHUB_TOKEN`으로 커밋(`chore: update 예약 현황판`)

## 10. import 스크립트 (`import-listings.js`, 로컬 1회)

- **입력:** `listings.csv`(시트 내보내기). 헤더 동적 인식. `config.json`의 `csvMapping`으로 역할 매핑(`title`만 필수).
- **실행 순서:**
  1. 라벨 보장 — `매물 / 구매 가능 / 예약금 대기중 / 입금 확인 완료`가 없으면 색상과 함께 생성(멱등)
  2. CSV 각 행마다 이슈 생성
     - 제목 = `title` 컬럼
     - 본문 = 사진(URL이면 마크다운 이미지) + 가격/상태/설명 + 메타 마커 2개(`market-listing`, 빈 `market-state`)
     - 라벨 = `[매물, 구매 가능]`
     - **멱등 가드:** `market-listing.id` 기준으로 기존 `매물` 이슈와 대조해 중복 skip
  3. 완료 후 `update-readme` 워크플로 dispatch(또는 로컬 렌더)로 현황판 초기화
- **구현:** Node 스크립트. 토큰은 `gh auth token`에서 가져와 octokit 호출. CSV는 `csv-parse`. (워크플로 쪽은 `actions/github-script` 내장 octokit이라 설치 불필요)

## 11. Google Form 연동

폼 필드:

| 필드 | 용도 | prefill |
|---|---|---|
| 매물 이슈 번호 | 매물 연결 | ✅ 봇 자동 |
| GitHub 아이디 | 예약자 매칭 | ✅ 봇 자동 |
| 입금자명 | 입금 대조 | 사용자 입력 |
| 연락처(전화/카톡) | 개별 안내(비공개) | 사용자 입력 |
| 선호 거래 시간 | 선호 시간 조사 | 사용자 입력 |
| 거래 방식(직거래/택배) | 선택 | 사용자 입력 |

- 봇이 확정 댓글에서 이슈번호 + 아이디를 prefill한 폼 링크 제공 → 응답 시트에 매물·예약자가 채워진 채 수집.
- 운영자 1회 설정(코드 밖): 폼 생성 → 이슈번호·아이디 단답형 → "미리 채워진 링크 받기"로 `entry.xxxx` id 확보 → config 기입 → 응답 시트 연결.
- 개인정보: 연락처는 공개 댓글이 아닌 폼(비공개 시트)에만 수집. prefill 값은 변조 가능하나 입금 확인이 수동이라 운영자가 예약자(상태 마커)와 대조하며 자연 검증.

## 12. 엣지 케이스 / 보안

- **봇 무한루프:** `GITHUB_TOKEN` 작성물은 재트리거 안 됨 → 자동 차단.
- **선착순 경합:** 이슈별 `concurrency` 직렬화 + "since 이후 최빠른 댓글" 판정.
- **public 전환:** private 테스트 후 런칭 시 public 전환. `issue_comment`(이슈 댓글)는 외부 유저 댓글도 우리가 선언한 권한으로 워크플로를 정상 발동(포크 PR 토큰 제한과 무관).
- **질문 댓글:** 키워드 없으면 무시 → 매물 문의 자유.
- **예약자가 당첨 댓글을 수정/삭제:** 상태 마커가 예약자를 보존하므로 영향 없음.
- **스위퍼 조기 해제:** §8 트레이드오프로 수용.

## 13. 구현 순서 (개략)

1. `Suckzoo/keyboard-market` **private** repo 생성
2. `config.json`, README 골격(안내 플레이스홀더 + 거래규칙 + 보드 마커), 라벨 정의
3. import 스크립트 + 샘플 CSV로 테스트 이슈 생성
4. 댓글 핸들러 워크플로 → 오픈 게이트/예약/선착순 검증
5. 스위퍼 워크플로 → 만료 복귀 검증
6. update-readme 워크플로 + 렌더러 → 현황판 검증
7. Google Form 제작 + config 연결
8. 전체 시나리오 리허설(오픈 전/예약/만료/입금확인/판매완료) → 런칭 시 public 전환

## 14. 범위 밖 (YAGNI)

- 외부 봇 서비스/DB, 주기적 시트 자동 동기화, "입금 신고됨" 중간 상태, 폼 제출→이슈 자동 코멘트 연동(추후 Google Apps Script로 선택적 추가 가능), 다국어/결제 자동화.
