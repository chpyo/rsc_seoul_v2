# 서울인자위 조사록

*Seoul HRD Field Records* — 서울지역 인적자원개발위원회 현장조사·문헌 분석 도구.
모듈: **현장록**(녹취) · **문헌록**(연구) · **자료실**(검색). 저장소·코드 이름은 `rsc-seoul`.

화자와 구간이 정리된 녹취를 올리면 이번 대화에서 나온 주제로 구조화하고 회의록 초안을 만든 뒤, 확정된 회의록만 자료실에 회의(case)별로 쌓습니다. 연구 문헌(문헌록)도 구조화해 현장록과 교차 검색합니다.

## 구성

| 영역 | 사용 기술 |
|---|---|
| 화면·서버 | React 19, TanStack Start(서버 함수), Tailwind v4 |
| 인증 | Firebase Auth (Google 로그인) |
| 데이터 | Firestore, Firebase Storage(음성 원본) |
| AI | Gemini (`@google/genai`) — 서버에서만 호출 |
| 배포 | Vercel (Nitro `vercel` 프리셋) |

AI 호출은 모두 서버 함수에서 이뤄지므로 **`GEMINI_API_KEY`가 반드시 필요합니다.** 브라우저에서 Gemini를 직접 부르는 경로는 없습니다.

## 할 수 있는 일

- 텍스트·DOCX·HWPX 업로드, 붙여넣기, 음성 원본 보관 후 전사 (긴 녹음은 15분 단위로 나눠 전사)
- 화자 이름 교정, 조사 정보 수정
- Gemini로 주제·사실·인용·회의록 초안 (근거 구간 S001 연결)
- 주제 편집·병합, 확정 / 확정 해제
- 회의록 HTML / 한글·Word / 마크다운 내보내기
- 확정된 회의록을 자료실에 보관하고 질문으로 비슷한 회의·문헌 찾기
- 프로젝트 교차 요약(확정본만)
- 문헌록: 논문·보고서 구조화, 서울 HRD 시사점, 관련 현장록 매칭

구형 `.hwp`는 한글에서 HWPX 또는 TXT로 저장해 올리세요.

## 로컬 개발

```bash
npm install
npm run dev          # http://localhost:3000
```

`.env.example`을 `.env.local`로 복사해 값을 채웁니다 (저장소에 올리지 않음).

| 이름 | 설명 |
|---|---|
| `GEMINI_API_KEY` | 녹취 분석, 회의록 다시 쓰기, 교차 요약, 챗봇, 음성 전사, 임베딩 |
| `VITE_FIREBASE_AUTH_DOMAIN` | 선택. 배포 도메인을 로그인 도메인으로 쓸 때 |

## 권한

승인된 멤버만 사용할 수 있습니다. 관리자가 설정 화면에서 이메일과 역할을 정해 초대합니다.

| 역할 | 할 수 있는 일 |
|---|---|
| 관리자 | 모든 기록 수정·삭제, 멤버 초대·역할 변경 |
| 연구원 | 기록 작성, 본인 기록 수정·삭제, AI 분석·전사 |
| 열람자 | 모든 기록 읽기, 자료실 질문 |

접근 제어는 `firestore.rules`·`storage.rules`와 서버 미들웨어가 담당합니다. 서버는 서비스 계정 없이 **로그인한 사용자 본인의 토큰**으로 Firestore·Storage를 호출합니다.

## 배포

Vercel(Hobby) 기준 절차는 `docs/deploy-vercel.md`를 따르세요. 규칙 변경 전에 기존 사용자를 멤버로 등록해야 합니다.

## 검사

```bash
npm run typecheck
npm run lint
npm test
npm run test:rules   # 보안 규칙 (Firebase 에뮬레이터, Java 필요)
npm run build        # .vercel/output 생성
npm run build:node   # 로컬 확인용 node 서버 빌드 → npm start
```

## 운영 스크립트

- `npm run backup:firestore` — Firestore 전체를 `backups/`에 JSON으로 저장 (서비스 계정 키 필요, 읽기 전용)
- `npm run migrate:membership` — 기존 사용자 멤버 등록·첫 관리자 지정 (기본 점검만, `--apply`로 반영)

## 문서

- `docs/deploy-vercel.md` — Vercel 배포·권한 전환 절차
- `docs/literature-prd.md` — 문헌록 기획서
- `docs/baseline-2026-09-30.md` — 원본 import 직후 검사 기준선
