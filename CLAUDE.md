# CLAUDE.md

GitHub 이슈 기반 키보드/키캡 중고장터 자동화. 매물 1건 = 이슈 1개. 선착순 예약·네고·입금확인을
GitHub Actions로 무인 처리하고 README 현황판 + CATALOG 카탈로그를 자동 렌더한다.

- 라이브 레포: `Suckzoo/keyboard-market`. 설계/계획: `docs/superpowers/specs`, `docs/superpowers/plans`.

## 상태 머신

`구매 가능` →(`#구매신청` 선착순) `예약금 대기중` →(`#입금완료`) `예약금 확인중` →(운영자 `#입금확인`) `입금 확인 완료`(라벨만 부착, 이슈 close는 선택·수동).
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

## 운영자 운영 (런북)

봇이 대부분 자동 처리하고, 운영자(=`config.owner`)가 직접 하는 일은 다음과 같다.

- **입금 확인**: 구매자가 `#입금완료` 댓글을 남기면 `예약금 확인중`으로 전환된다. 폼 응답 시트로 입금자명을
  대조한 뒤 해당 이슈에 `#입금확인` 댓글을 남기면 `입금 확인 완료` 라벨이 붙어 현황판에 ✅ 판매 완료로 표기된다.
  (운영자만 유효, `예약금 대기중`/`예약금 확인중` 상태에서만. **이슈 close는 자동이 아니며, 원하면 수동으로** 닫는다.)
- **네고 처리**: 구매자의 `#네고희망 {금액}` 댓글에 **👍(+1) 리액션 = 수락**, **👎(-1) = 거절**.
  가장 이른 수락이 당첨되어 그 사람에게 네고가로 예약이 잡힌다. 리액션은 워크플로를 트리거하지 못하므로
  **sweeper(10분 cron)**가 반영한다. 즉시 반영하려면 sweeper 수동 실행.
- **만료/네고 반영(sweeper)**: 10분 cron으로 3시간 미입금 예약을 `구매 가능`으로 복귀시키고 네고 리액션을
  reconcile 한다. 즉시 실행: `gh workflow run sweeper.yml`.
- **현황판/카탈로그 강제 갱신**: `gh workflow run update-readme.yml`.
- **매물 등록/수정**: `npm run import:dry`로 점검 후 `npm run import`. 폼/시트 1회 셋업은 `SETUP.md` 참고
  (단, SETUP.md의 "입금 확인 완료 라벨 직접 부착" 절차는 현재 `#입금확인` 키워드 방식으로 대체됨).
- **공개 전환**: `gh repo edit Suckzoo/keyboard-market --visibility public --accept-visibility-change-consequences`.

### config.json 운영값
- `openAt`/`closeAt`: 접수 기간(KST). 기간 밖에서는 `#구매신청`/`#네고희망`을 거절한다.
- `depositInfo`: 입금 안내(카카오페이 QR). `formBaseUrl`/`formIssueEntryId`/`formUserEntryId`: 예약 구글폼
  (이슈번호·GitHub 아이디 prefill).
- `reservationHours`: 미입금 자동취소 시간(기본 3시간).
- 키워드: `keyword`(#구매신청) · `paidKeyword`(#입금완료) · `paidConfirmKeyword`(#입금확인) · `negotiateKeyword`(#네고희망).

## 사진/썸네일 재생성 (macOS 로컬, sips 의존)

```bash
npm run photos:keycaps   # keycaps.zip → assets/photos/{pid}_{n}.jpg (1600px)
npm run thumbs           # assets/photos → assets/thumbs/{pid}.jpg (400px)
```

`keycaps.zip`은 비커밋(.gitignore). 결과물만 커밋. 크롭 금지(가로폭만, 비율 유지).

## 배포 / 매물 갱신 절차

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
