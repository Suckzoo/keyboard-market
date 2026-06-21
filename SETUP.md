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
- 또는 CLI: `gh repo edit Suckzoo/keyboard-market --visibility public --accept-visibility-change-consequences`

## 6. 수동 통합 리허설 체크리스트(런칭 전 검증)
- [ ] `openAt`을 미래로 두고 `#구매신청` → "아직 열리지 않았습니다" 응답, 라벨 불변
- [ ] `openAt`을 과거로 수정 후 `#구매신청` → "예약 완료" + 폼 링크, 라벨 `구매 가능`→`예약금 대기중`, 본문 `market-state` 기록
- [ ] 폼 링크의 이슈번호/아이디 prefill 확인
- [ ] 다른 사람이 `#구매신청` → "이미 예약 진행 중", 상태 불변
- [ ] `reservedAt`을 과거로 수정 후 `sweeper` 수동 실행 → `구매 가능` 복귀 + "예약 만료" 댓글 + `availableSince` 기록
- [ ] 복귀 후 새 `#구매신청` → 새 예약자에게 정상 부여
- [ ] `입금 확인 완료` 라벨 부착 → `update-readme` 발동, 현황판 "✅ 판매 완료 / @예약자"
- [ ] README 정적 영역(안내/거래 규칙)이 보드 갱신에도 보존
