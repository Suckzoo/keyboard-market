# 운영 셋업 가이드

일상 운영(입금확인·네고·sweeper 등) 런북은 `CLAUDE.md`의 "운영자 운영" 섹션을 참고하세요.
이 문서는 **최초 1회 셋업**과 **공개 전환**을 다룹니다.

## 1. config.json 채우기
- `openAt` / `closeAt`: 접수 기간(KST, 예 `2026-06-24T12:00:00+09:00` ~ `2026-07-01T12:00:00+09:00`). 기간 밖에서는 `#구매신청`/`#네고희망`을 자동 거절.
- `depositInfo`: 입금 안내 문구(카카오페이 QR 이미지 등).
- `formBaseUrl`, `formIssueEntryId`, `formUserEntryId`: 아래 폼 설정에서 확보.
- `reservationHours`: 미입금 자동취소 시간(기본 3).
- 키워드(`keyword`/`paidKeyword`/`paidConfirmKeyword`/`negotiateKeyword`)는 기본값(#구매신청/#입금완료/#입금확인/#네고희망) 사용.

## 2. Google Form 만들기
1. 폼 생성, 필드 추가: 매물 이슈 번호(단답), GitHub 아이디(단답), 입금자명, 연락처, 선호 거래 시간, 거래 방식.
2. 우상단 ⋮ → "미리 채워진 링크 받기" → 이슈 번호/아이디에 임시값 입력 → 링크 생성.
3. 생성된 URL에서 `entry.XXXX` 두 개를 찾아 `formIssueEntryId`(이슈 번호), `formUserEntryId`(아이디)에 기입.
4. `formBaseUrl`은 `.../viewform`까지.
5. 폼 응답을 시트에 연결(응답 탭 → 시트로 연결).

## 3. 매물 등록(로컬 1회)
1. SSoT는 `keyboards.csv`(컬럼 `pid,storage,price,name,비고,사진 링크`, 역할 매핑은 `config.json.csvMapping`).
   - pid < 100 = 키보드, pid ≥ 100 = 키캡. `비고` → 이슈 본문 `> ⚠️ 주의사항`.
2. 사진/썸네일 준비(macOS, sips 의존):
   - `npm run photos:keycaps` — `keycaps.zip` → `assets/photos/{pid}_{n}.jpg`(가로 1600px).
   - `npm run thumbs` — `assets/photos` → `assets/thumbs/{pid}.jpg`(가로 400px, 카탈로그용).
3. `npm install` → **`npm run import:dry`로 생성/갱신 내용을 먼저 점검** → `npm run import`.
   - 신규 pid는 `매물 + 구매 가능` 라벨로 이슈 생성. 기존 pid는 upsert(본문 + 제목 동기화, **라벨 불변**).
4. `update-readme` 워크플로를 수동 실행(Actions 탭 → update-readme → Run)해 현황판 + 카탈로그(`CATALOG.md`) 초기화.

## 4. 입금/네고 운영 (요약 — 자세한 내용은 CLAUDE.md)
- **입금**: 구매자 `#입금완료` → `예약금 확인중`. 폼 시트로 입금자명 대조 후, 해당 이슈에 운영자가 `#입금확인` 댓글 → `입금 확인 완료`(현황판 ✅ 판매 완료). **이슈 close는 자동이 아니므로 필요 시 수동으로** 닫는다.
- **네고**: 구매자 `#네고희망 {금액}` 댓글에 운영자가 👍(수락)/👎(거절) 리액션. 수락분은 sweeper(10분 cron)가 반영하며, 즉시 반영하려면 `gh workflow run sweeper.yml`.
- **만료**: 3시간 미입금 예약은 sweeper가 `구매 가능`으로 자동 복귀.

## 5. 런칭(공개 전환)
- 충분히 테스트한 뒤 Settings → General → Danger Zone → Change visibility → Public.
- 또는 CLI: `gh repo edit Suckzoo/keyboard-market --visibility public --accept-visibility-change-consequences`

## 6. 수동 통합 리허설 체크리스트(런칭 전 검증)
- [ ] `openAt`을 미래로 두고 `#구매신청` → "아직 열리지 않았습니다" 응답, 라벨 불변
- [ ] `openAt`을 과거로 수정 후 `#구매신청` → "예약 완료" + 폼 링크, 라벨 `구매 가능`→`예약금 대기중`, 본문 `market-state` 기록
- [ ] 폼 링크의 이슈번호/아이디 prefill 확인
- [ ] 다른 사람이 `#구매신청` → "이미 예약 진행 중", 상태 불변
- [ ] 예약자가 `#입금완료` → `예약금 대기중`→`예약금 확인중`, `paidClaimedAt` 기록
- [ ] 운영자가 `#입금확인` → `입금 확인 완료`(현황판 ✅ 판매 완료)
- [ ] `#네고희망 {금액}` → `네고중`, 운영자 👍 후 sweeper 실행 → 제안자에게 네고가로 예약(👎는 거절)
- [ ] `reservedAt`을 과거로 수정 후 `sweeper` 수동 실행 → `구매 가능` 복귀 + "예약 만료" 댓글 + `availableSince` 기록
- [ ] `update-readme` 발동 시 현황판 + `CATALOG.md` 갱신, README 정적 영역(안내/거래 규칙)·헤더 보존
