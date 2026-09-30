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

## 규칙
- AI 산출물 문체: 한국 공문서 개조식(1./□/○/-/※, `~함/~임`), 마크다운 `**` 금지, 근거 구간 코드(S001) 필수
- 배포: Vercel Hobby — 요청 본문 4.5MB, 함수 최대 300초. 큰 파일은 Storage 경유, 긴 작업은 여러 호출로 분할
- 커밋 메시지 끝: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`
