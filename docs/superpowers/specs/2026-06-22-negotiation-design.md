# 키보드 장터 — 네고(가격 협상) 기능 설계

- 날짜: 2026-06-22
- 상태: 승인됨 (구현 대기)
- 관련 스펙: `2026-06-21-keyboard-market-design.md`

## 1. 개요 / 목표

구매자가 매물 이슈에 가격을 제안(`#네고희망 {금액}`)하고, 운영자가 댓글 리액션(👍/👎)으로 수락/거절하는 협상 기능을 추가한다. 수락 시 제안자에게 예약이 잡히고(기존 3시간 입금 룰 동일), 가격이 네고가로 갱신된다. 모든 매물은 네고 가능함을 README에 명시한다.

부수적으로, public repo 특성상 외부 유저의 이슈 생성을 막을 수 없으므로 현황판에서 **작성자가 운영자(owner)가 아닌 이슈를 무시**한다.

## 2. 핵심 제약 (기술적 사실)

- **GitHub Actions에는 리액션 이벤트가 없다.** 댓글 리액션은 워크플로를 트리거하지 못하므로, 수락/거절은 **폴링**으로 처리한다. 기존 `sweeper.yml`(10분 cron)에 얹는다 → 최대 ~10분 지연.
- **GitHub 리액션에 ✅/❌는 없다.** 가능한 값: `+1 👍, -1 👎, laugh, hooray, confused, heart, rocket, eyes`. → **👍(`+1`)=수락, 👎(`-1`)=거절** 로 매핑.
- public repo는 이슈 생성을 협력자로 제한할 수 없다(이슈 비활성화 외). → 현황판 owner 필터로 대응.

## 3. 결정 사항 (합의됨)

- 수락/거절: 👍 / 👎 리액션 (owner의 리액션만 유효), sweeper 폴링 처리.
- "가격 미정" 매물은 **네고 필수**: `#구매신청`으로는 예약 불가(예약금 10% 계산 불가). `#네고희망`으로 가격 확정 후에만 예약 가능.
- 네고 댓글 다수일 때: ❌(👎) 처리해도 **미리뷰(리액션 없는) 네고 댓글이 남아있으면 `네고중` 유지**, 전부 리뷰되면 `구매 가능` 복귀.
- 가격 표기: 이슈 본문은 원가 취소선 + 네고가 + 🤝, 현황판은 네고가 + 🤝, 표 아래 범례.
- 판매가는 **수락된 네고 금액 중 최소가로 고정(sticky)**.

## 4. Config 추가

```jsonc
{
  "owner": "Suckzoo",
  "negotiateKeyword": "#네고희망",
  "labels": { "negotiating": "네고중" }   // 기존 labels에 추가
}
```

- 네고가 표시 이모지는 상수 `NEGOTIATED_EMOJI = '🤝'` (lib).
- 리액션 매핑 상수: `REACTION_ACCEPT = '+1'`, `REACTION_REJECT = '-1'`.

## 5. 데이터 모델 (마커)

`market-listing` 마커 확장:

```jsonc
{ "id": "9", "name": "...", "price": "150,000원", "negotiatedPrice": "120,000원" }
```

- `price`: 최초가(원가). 변경하지 않는다.
- `negotiatedPrice`: 확정 네고가(없으면 키 부재/null). 한 번 정해지면 sticky, 더 낮은 수락 시에만 갱신(최소가).
- 표시 가격 = `negotiatedPrice ?? price`.

`market-state` 마커는 그대로(reserver/reservedAt/availableSince/paidClaimedAt). 예약은 기존 흐름 재사용.

## 6. 상태 / 라벨

- 라벨 추가: `네고중`.
- `deriveStatus` 우선순위: `paid > reserved > negotiating > available > unknown`.
- 현황판 상태 표기: `🟠 네고중` 추가.

## 7. 컴포넌트

### 7-1. 네고 접수 (즉시) — `decide-negotiation.js` + comment-handler

순수함수 `decideNegotiation({ commentBody, commenter, labelNames, issueBody, config })`:
- `commentBody`에 `negotiateKeyword` 없으면 `{ action: 'ignore' }`.
- 금액 파싱: 키워드 뒤 숫자(콤마/원 제거). 유효한 양의 정수 아니면 `{ action: 'comment_only', comment: 안내(형식) }`.
- 상태가 `reserved`/`paid`(또는 paidClaimed)면 `{ action: 'comment_only', comment: 네고 불가 안내 }`.
- 그 외(available/negotiating)면 `{ action: 'negotiate_open', amount, comment: 접수 안내 }`.

comment-handler 글루: `negotiate_open`이면 `available`→제거, `네고중` 라벨 추가, ack 댓글. (이미 `네고중`이면 라벨 변화 없이 ack만.)

decide-comment(기존 `#구매신청`)도 보강:
- 대상이 가격 미정(negotiatedPrice 없고 price가 PRICE_UNKNOWN)인데 `#구매신청` → `comment_only`로 "네고 필요" 안내(예약 차단).
- `네고중` 상태에서 `#구매신청` → 정상 예약(선착순), `네고중` 라벨은 글루에서 제거.

### 7-2. 리액션 리콘실 (폴링) — `reconcile-negotiation.js` + sweeper

순수함수 `reconcileNegotiation({ status, issueBody, negotiationComments, now, config })`:
- 입력 `negotiationComments`: `[{ id, author, amount, ownerReaction: 'accept'|'reject'|null }]` (글루가 reactions API로 채움; ownerReaction은 owner의 👍/👎; 둘 다면 accept 우선).
- 규칙:
  - accept된 댓글이 있으면(여럿이면 **가장 이른 댓글**): `action: 'accept'`, `winner`, `amount`(min ratchet 위해 raw), `reservedAt=now`.
  - accept 없고 **미리뷰(ownerReaction=null) 댓글 존재** → `action: 'stay_negotiating'`.
  - accept 없고 전부 reject → `action: 'release'`(→ 구매 가능).
- sweeper 글루: `네고중` 라벨 이슈만 대상. 각 이슈의 네고 댓글 + owner 리액션 조회 후 위 함수 호출.
  - `accept`: `negotiatedPrice = min(기존 negotiatedPrice ?? Infinity, amount)` → 마커 갱신 + 본문 가격줄 재렌더, 라벨 `네고중`→`예약금 대기중`, state(reserver/reservedAt/paidClaimedAt=null) 기록, **예약금(=표시가의 10%) 명시 예약 안내 댓글**.
  - `release`: `네고중`→`구매 가능`.
  - `stay_negotiating`: 변화 없음.
- 멱등성: accept 후엔 라벨이 `예약금 대기중`이라 다음 폴링에서 `네고중` 스캔 대상에서 빠짐.

### 7-3. 예약 만료 시 네고 복귀 — sweep-timeouts 확장

기존 만료 처리에서, 만료된 예약 이슈에 **미리뷰 네고 댓글이 있으면** `구매 가능` 대신 `네고중`으로 복귀. (글루가 네고 댓글/리액션 조회) `negotiatedPrice`는 유지(sticky).

### 7-4. 가격 렌더 — `listing-import`/`build-issue`/`render-board`

- 표시가 헬퍼 `displayPrice(listing)` = `negotiatedPrice ?? price`.
- 이슈 본문 가격줄 헬퍼 `priceLine(listing)`:
  - 네고 전: `**가격:** 150,000원`
  - 네고 후: `**가격:** ~~150,000원~~ → 120,000원 🤝`
  - 가격 미정: `**가격:** 가격 미정` (네고 안내는 footer/README)
  - build-issue와 리콘실이 동일 헬퍼로 가격줄 생성, 리콘실은 본문에서 기존 가격줄(정규식)로 교체.
- listing-model: `price = displayPrice`, 네고면 `negotiated = true` → 보드에 `🤝` 접미 + 범례 노트.
- render-board: 네고가에 `🤝` 표시, 표 아래 범례 `🤝 = 네고로 조정된 가격` (기존 비고 섹션과 함께).

### 7-5. 예약금 명시 — messages

- `reserveConfirmMessage`에 **예약금 액수(표시가 × 10%, 원화)** 포함. 네고 수락 안내는 즉시 입금 주의 강조.
- 예약금 계산 헬퍼 `depositAmount(displayPriceStr)` → 숫자 파싱 후 10% (원 단위, 정수 반올림), `"12,000원"` 포맷. 표시가가 "가격 미정"이면 예약 불가 경로라 호출되지 않음.

### 7-6. 접근 제어 — render-readme

- `render-readme`에서 `issue.user.login !== config.owner`면 보드 제외(기존 `isTestPurpose`, `매물` 라벨 필터에 추가).

## 8. 상태 머신 (요약)

```
구매가능 --#네고희망--> 네고중 --운영자 👍--> 예약금대기중(네고가) --#입금완료--> (운영자) 입금확인완료
   |                      |  --운영자 👎(전부)--> 구매가능
   |                      |  --#구매신청--> 예약금대기중(원가/네고가), 네고중 해제
   --#구매신청--> 예약금대기중 --3h 만료--> (미리뷰 네고 있으면) 네고중 / (없으면) 구매가능
가격미정 --#구매신청--> (차단, 네고 안내)
```

## 8.5 순서 / 동시성 보장 (중요)

세 액터(comment-handler 즉시, sweeper 폴링: 리콘실+만료)가 상태를 바꾸므로 다음 규칙으로 꼬임을 방지한다.

1. **스위퍼는 한 실행에서 이슈 목록 스냅샷 1개로 처리.** 각 이슈는 그 실행에서 정확히 한 갈래로만 처리된다: `네고중`이면 네고 리콘실, `예약금 대기중`이면 만료 판정. (한 이슈가 같은 실행에서 양쪽으로 전이되지 않음)
2. **스위퍼 네고 리콘실은 `네고중` 라벨 이슈에만 적용.** 이슈가 이미 `예약금 대기중`/`입금 확인 완료`로 떠났으면 네고 리액션은 적용하지 않는다.
3. **comment-handler의 예약은 현재 상태 기준.** `#구매신청`은 available/네고중에서만 예약 생성(→`예약금 대기중`, `네고중` 해제). `가격 미정`은 차단.
4. **선착 규칙: 먼저 `예약금 대기중`에 도달한 쪽이 이긴다.** (즉시 예약이 지연된 👍보다 우선)
5. **"잃어버린 👍" 허용 시맨틱:** 👍가 적용되기 전 `#구매신청`이 예약을 가져가면 그 👍는 적용되지 않는다(상태 손상 아님, 승자만 결정). 운영자는 필요 시 다시 👍.
6. **재확인 가드:** 스위퍼가 accept를 쓰기 직전 이슈 라벨을 재조회하여 여전히 `네고중`일 때만 적용 → 워크플로 동시 실행 창 최소화. (GitHub에 원자적 CAS 없음, last-write-wins이나 10분 주기 대비 충돌 확률 낮음)

## 9. 메시지 (신규/수정)

- `negotiateAckMessage(config, amount)`: 네고 접수 안내.
- `negotiateRejectedFormatMessage(config)`: 금액 파싱 실패 안내.
- `negotiateNotAllowedMessage()`: 예약/입금 단계라 네고 불가.
- `priceUnknownReserveMessage(config)`: 가격 미정 매물 #구매신청 차단 안내(네고 유도).
- `reserveConfirmMessage`/`remindReserverMessage`: 예약금 정확 액수 포함.
- 네고 수락 예약 안내: `reserveConfirmMessage` 재사용 + 즉시 입금 주의 문구.

## 10. 파일 영향

- 신규: `scripts/lib/decide-negotiation.js`, `scripts/lib/reconcile-negotiation.js` (+ 테스트).
- 수정: `config.json`, `scripts/lib/markers.js`(negotiatedPrice 무관, 마커는 자유 JSON이라 변경 최소), `scripts/lib/state.js`(네고중 우선순위), `scripts/lib/listing-model.js`(displayPrice/negotiated), `scripts/lib/render-board.js`(🤝/범례, 상태표기), `scripts/render-readme.js`(owner 필터), `scripts/lib/build-issue.js`(priceLine), `scripts/lib/listing-import.js`(priceLine/displayPrice 헬퍼), `scripts/lib/messages.js`, `scripts/handle-comment.js`(네고 접수/가격미정 차단/네고중 예약 글루), `scripts/sweep-timeouts.js`(리콘실 + 만료 시 네고 복귀 글루), `.github/workflows/sweeper.yml`(권한/주석).
- README: 네고 안내 섹션.

## 11. 테스트 전략

- 순수함수 단위 TDD: `decideNegotiation`, `reconcileNegotiation`, `priceLine`/`displayPrice`, `depositAmount`, `deriveStatus`(네고중), `toListingModel`(네고), `renderBoard`(🤝/범례), 금액 파싱.
- 글루(handle-comment/sweep)는 fake-github로 동작 테스트.

## 12. 리스크 / 비고

- **지연**: 수락/거절은 최대 ~10분(cron). 네고 수락 안내 댓글이 알림 → 즉시 입금 유도.
- **API 호출량**: `네고중` 이슈만 댓글+리액션 폴링 → 소규모로 한정. 만료 복귀 판정도 예약 이슈에 한해 네고 댓글 조회.
- **멱등성**: 라벨 전이로 재처리 방지. accept 후 `예약금 대기중`이라 재스캔 안 됨.
- **다중 👍**: 가장 이른 네고 댓글이 당첨, 금액은 최소가. 운영자는 보통 하나만 👍 권장.
- **가격 미정 + 네고 만료**: negotiatedPrice 미설정이면 다시 가격 미정으로 (네고 재유도).
