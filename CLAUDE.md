# CLAUDE.md

현장록(RSC_seoul): 서울지역 인적자원개발위원회 현장조사·문헌 분석 도구. 사용자와 UI 문구는 한국어.

## 명령
- `npm run dev` (localhost:3000) · `npm run typecheck` · `npm run lint` · `npm test` · `npm run build` (Vercel 출력)
- 서버용 비밀 값은 `.env.local` (vite.config.ts가 dev 서버의 process.env로 로드)

## 구조
- `src/routes/` 파일 기반 라우트 (TanStack Router). `routeTree.gen.ts`는 자동 생성, 직접 수정 금지
- `src/lib/firebase.ts` 브라우저 Firebase(Auth/Firestore/Storage). Firestore 읽기·쓰기는 대부분 브라우저에서 `src/lib/firebase-db.ts`, `firebase-literature.ts`로 수행 → 보안은 `firestore.rules`가 담당
- `src/lib/server/*` TanStack 서버 함수. 모두 `firebaseAuthMiddleware`로 ID 토큰 검증
- `src/lib/ai/*` Gemini 호출(서버 전용). 브라우저에서 호출하면 예외
- `src/lib/ai/run.ts` 화면에서 서버 함수를 부르는 래퍼 + 한국어 오류 메시지

## 권한
- 멤버십: `members/{uid}`(role: admin/researcher/viewer, active), 초대 `invites/{email}`. 화면용 역할은 `src/lib/membership.ts`, 실제 접근 제어는 `firestore.rules`·`storage.rules`
- 서버 함수: `firebaseAuthMiddleware`(활성 멤버) / `writerAuthMiddleware`(연구원·관리자). context 의 `idToken` 으로 Firestore·Storage REST 를 사용자 권한으로 호출 — 서비스 계정 없음
- 규칙을 바꾸면 `tests/rules/rules.test.mjs` 도 고치고 `npm run test:rules`

## 검색 (B1)
- 확정된 녹취·문헌은 `chunks` 컬렉션에 발언 묶음 단위(768차원 벡터)로 색인 (`src/lib/search/*`). 확정·등록 시 자동, 관리자 설정에서 재구축
- 검색은 서버 함수 `vectorSearch` 가 사용자 토큰으로 Firestore REST `findNearest` 호출. 인덱스는 `firestore.indexes.json`
- 챗봇 답변 근거 표기: 현장록 `〔C1·S012〕`, 문헌 `〔L1〕` (`ask-corpus.ts` 가 C1/L1 → 원본 매핑 제공)

## 근거 표시 (B2)
- `src/components/evidence.tsx`: `EvidenceProvider`(원문 구간·이동·재생) 안에서 `CodeChip`/`EvidenceText`/`EvidenceInline` 이 S012 를 칩으로 표시
- 회의록 본문 ○·- 문장 끝에 `(S012, S015)` 근거 코드 (분석 프롬프트 규칙 9). 원문에 없는 코드는 `keepKnownCodes` 로 제거
- `/sessions/$id?seg=S012`, `/library/$id?seg=S012` 로 구간 이동. 답변은 `AnswerMarkdown` 이 〔C1·S012〕를 링크로 변환

## 규칙
- AI 산출물 문체: 한국 공문서 개조식(1./□/○/-/※, `~함/~임`), 마크다운 `**` 금지, 근거 구간 코드(S001) 필수
- 배포: Vercel Hobby — 요청 본문 4.5MB, 함수 최대 300초. 큰 파일은 Storage 경유(`src/lib/server/media.ts`), 긴 작업은 여러 호출로 분할. 절차는 `docs/deploy-vercel.md`
- 커밋 메시지 끝: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`
