# 키캡 추가 · 비고 주의사항 · 카탈로그 뷰 — 설계 (2026-06-23)

## 배경

GitHub 이슈 기반 키보드 중고장터 자동화 레포(`Suckzoo/keyboard-market`). 매물 1건 = 이슈 1개,
선착순 예약·네고·입금확인을 GitHub Actions로 무인 처리하고 README 현황판을 자동 갱신한다.

물품 재검품 결과를 새 SSoT CSV(`keyboard-list-new.csv`)에 반영했고, **키캡 19종(pid 100–118)**을
새로 추가했다. 이 작업은 (1) SSoT CSV 교체, (2) 비고 → 이슈 주의사항, (3) import 제목 동기화,
(4) 키캡 사진 리사이즈/압축, (5) 키캡 이슈+현황판 반영, (6) 카탈로그 뷰 신설, (7) 인수인계 문서를 다룬다.

오늘 기준 `openAt = 2026-06-24`, 즉 공개 직전이며 키보드 이슈 #3–#67은 이미 라이브다.

## 목표 / 비목표

**목표**
- `keyboard.csv` 삭제, 신규 CSV를 `keyboards.csv`로 단일 SSoT 커밋.
- CSV `비고` 컬럼을 각 이슈 본문의 "주의사항"으로 렌더.
- 이름/가격이 바뀐 기존 매물이 현황판·이슈에 반영되도록 import upsert가 **제목까지** 동기화.
- 키캡 사진을 배포 가능하도록 리사이즈/압축(크롭 없음), 키캡 이슈 생성 + 현황판 자동 반영.
- README와 별개 파일 `CATALOG.md`로 3열 카드 "카탈로그 뷰" 신설, 현황판 위에서 링크.
- 인수인계용 `CLAUDE.md` 작성.

**비목표**
- 예약/네고/스위퍼/입금확인 상태머신 로직 변경(기존 그대로 유지).
- config.json 운영값(openAt/계좌/폼) 변경.
- 키캡 사진 크롭, 키캡 원본 zip의 레포 커밋.

## 결정 사항 (확정)

| 주제 | 결정 |
|---|---|
| 실행 주체/시점 | 레포 준비·커밋은 PR 브랜치에서. **라이브 import는 스펙 승인 + 머지 후 직접 실행.** |
| CSV 파일명 | `keyboards.csv`로 정규화. |
| 비고 표기 | 이슈 본문에 `> ⚠️ **주의사항:** {내용}` 인용블록. |
| 카탈로그 | 별도 파일 `CATALOG.md`, 3열 카드, 사진 가로 200px, 상태순·PID순. README 현황판 바로 위에 링크. |
| 키캡 원본 | `keycaps.zip`은 `.gitignore`, 리사이즈 결과물만 커밋. |
| 격리/테스트 | 레포 변경은 PR 브랜치에서 완전 격리. 라이브 이슈 변경만 전역 → `--dry-run` + 머지 후 import. |

## 아키텍처 개요

데이터 흐름은 기존 파이프라인을 그대로 확장한다.

```
keyboards.csv ─┐
keycaps.zip ───┤ (로컬 1회 준비)
               ├─ import-keycap-photos.js → assets/photos/{pid}_{n}.jpg (리사이즈)
               ├─ build-thumbs.js         → assets/thumbs/{pid}.jpg     (썸네일)
               └─ import-listings.js ──(Octokit)──▶ GitHub 이슈 생성/갱신
                                                          │
                       issues 이벤트 → update-readme.yml ─┤
                                                          ├─ render-readme.js  → README.md (현황판)
                                                          └─ render-catalog.js → CATALOG.md (카탈로그)
```

이슈 본문의 숨김 마커가 SSoT 런타임 상태를 담는다.
- `listing` 마커: `{ id, name, price, thumb }` — **`thumb` 신규 추가**(카탈로그 썸네일 URL, 없으면 null).
- `state` 마커: 예약자/시각(기존 그대로).

## 컴포넌트별 설계

### 1. SSoT CSV (`keyboards.csv`)
- `keyboard-list-new.csv` → `keyboards.csv`로 git mv 의미의 교체, 기존 `keyboard.csv` 삭제.
- 컬럼: `pid, storage, price, name, 비고, 사진 링크`.
- `config.json.csvMapping`: `{ id: "pid", title: "name", price: "price", notice: "비고", body: [] }`.
  - `사진 링크`는 build-issue가 쓰지 않는다(사진은 pid 프리픽스 매칭). 키캡 사진 importer만 참조.
- `package.json` `import` 스크립트 기본 입력을 `keyboards.csv`로.

### 2. 비고 → 이슈 본문 주의사항 (`build-issue.js`)
- `config.csvMapping.notice` 컬럼 값이 있으면 본문에 `> ⚠️ **주의사항:** {내용}` 블록 추가.
  - 위치: 가격 라인 다음, footer 이전.
- 재import 시 기존 라이브 이슈 본문도 갱신(예: 추정 모델 면책 문구, 키캡 "미사용/개봉/누렇게 변함" 등).

### 3. import upsert 제목 동기화 (`import-listings.js`)
- 현 동작: 기존 pid면 **본문만** `issues.update`. → 이름 바뀐 항목이 현황판(제목 출처=issue.title)에 반영 안 됨.
- 변경: upsert 시 `issue.title !== csv.title`이면 `title`도 함께 update.
- **라벨은 건드리지 않음**(라이브 예약/네고 상태 보존). scope/available 라벨은 신규 생성 시 1회만.

### 4. 키캡 사진 리사이즈/압축 (`scripts/import-keycap-photos.js`, 로컬 1회)
- `keycaps.zip`을 평탄 추출(zip 내부 폴더명이 깨진 한글이라 `unzip -j` 필요).
- CSV `사진 링크`(셀 내 다중·따옴표 줄바꿈) 파싱 → pid별 사진 목록. **셀 내 중복 dedupe**(108·112), 미참조 6장 무시.
- 각 사진을 가로 ~1600px JPEG로 리사이즈(`sips`, macOS 로컬). **크롭 없음**(비율 유지). 기존 키보드 사진 규격과 동일.
- `assets/photos/{pid}_{n}.jpg`로 저장. 한 원본을 여러 pid가 공유하면 각 pid 프리픽스로 복제.
- 재현 가능하도록 스크립트로 남기되, `sips` 의존(로컬 전용)임을 `CLAUDE.md`에 명시.

### 5. 키캡 이슈 + 현황판
- import가 pid≥100도 동일 경로로 처리(`매물`/`구매 가능` 라벨, 예약·네고 동일 플로우). 추가 분기 불필요.
- 기존 현황판 렌더가 자동 포함.

### 6. 카탈로그 뷰 (`CATALOG.md`, `scripts/lib/render-catalog.js`, `scripts/render-catalog.js`)
- 카드 = 테두리 표 셀: 사진(`<img width=200>`) + 이름(`<b>`) + `PID · 가격` + 상태(+예약자) + 이슈 링크.
  - GitHub 마크다운은 셀 내 `style`/class 제거 → `<img width>`, `<b>`, `<br>`, `<sub>`, `<a>`만 사용.
- 3열 그리드, 정렬은 현황판과 동일(상태순: 구매가능→네고중→예약→확인중→판매완료, 그다음 PID순).
- 썸네일: 각 pid **첫 사진**을 가로 ~400px로 줄인 `assets/thumbs/{pid}.jpg`(장당 ~30KB). raw URL을 listing 마커 `thumb`에 저장 → render-catalog가 순수 함수로 사용. 사진 없으면 이미지 생략(텍스트 카드).
- `CATALOG.md`는 `<!-- CATALOG:START -->`/`END` 마커 사이를 렌더(README의 BOARD 마커와 동형).
- 썸네일 생성기 `scripts/build-thumbs.js`(로컬, `sips`): `assets/photos`의 pid별 첫 사진 → `assets/thumbs/{pid}.jpg`.

### 7. README 링크
- 현황판(`## 📋 예약 현황`) 바로 위에 `🖼 **[한 눈에 보기 (카탈로그)](CATALOG.md)**` 한 줄 추가.
- (선택) HANDOVER 버그 #2: `## 📋 예약 현황` 헤더가 `BOARD:START` 안에 있어 렌더 시 사라지는 문제 — 헤더를 마커 위로 이동해 보존.

### 8. 워크플로 (`.github/workflows/update-readme.yml`)
- 기존 README 렌더 후 `render-catalog.js`도 실행, README·CATALOG **둘 다 커밋**.
- 트리거/권한(`contents: write`) 동일.

### 9. CLAUDE.md (인수인계)
- 시스템 개요·상태머신, 파이프라인(이 문서 요약), CSV 포맷, 사진/썸네일 규칙(sips 로컬 의존),
  import(`--dry-run` 포함)·워크플로, 운영 절차(머지→import 순서), 디렉터리 맵.

## 테스트 / 검증

**브랜치에서 격리 가능(master 무영향):**
- `node --test` — 기존 42개 + 신규: build-issue(주의사항·thumb 마커), render-catalog(카드/정렬/이미지 유무), listing-model(thumb), 키캡 사진 매핑 순수 로직(파싱·dedupe).
- `import-listings.js --dry-run` — API 호출 없이 생성/갱신될 제목·본문 출력으로 내용 검증.
- 로컬 렌더 미리보기 — 더미/픽스처 이슈로 README·CATALOG 출력 확인.

**브랜치로 격리 불가(라이브 이슈는 레포 전역):**
- 실제 이슈 생성/제목 갱신은 머지 후 라이브 import 단계에서만.
- (선택) 스크래치 레포 end-to-end 리허설.

## 실행 순서 (스펙 승인 후)

1. PR 브랜치에서 코드/CSV/사진/썸네일/문서 구현, `node --test` 통과, `--dry-run`으로 이슈 diff 확인, 로컬 렌더 확인.
2. PR 머지(이슈/스케줄 워크플로는 master 버전으로 도므로 카탈로그 렌더가 master에 있어야 함).
3. 라이브 `import` 실행 → 키캡 이슈 생성 + 이름/가격 바뀐 이슈 갱신.
4. `update-readme` 워크플로가 README 현황판 + CATALOG 자동 렌더·커밋.

## 리스크 / 완화

- **라이브 이슈 오변경**: `--dry-run` 선검증 + 머지 후 단일 실행. 라벨 미변경으로 진행 중 예약 보존.
- **sips 로컬 의존**: 사진/썸네일 생성은 운영자 macOS 로컬 1회. 결과물만 커밋, 절차는 CLAUDE.md에.
- **카탈로그 페이지 길이**(매물 ~90): 3열로 완화. 필요 시 향후 키보드/키캡 섹션 분리.
- **GitHub HTML 새니타이즈**: 카드에 `style` 미사용, 허용 태그만으로 렌더(목업으로 확인됨).
