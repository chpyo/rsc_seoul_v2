# 현장록 (RSC_seoul)

서울지역 인적자원개발위원회 현장조사 도구.

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

- 텍스트·DOCX·HWPX 업로드, 붙여넣기, 음성 원본 보관 후 전사
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

서버 함수용 환경 변수는 `.env.local`에 둡니다 (저장소에 올리지 않음).

| 이름 | 설명 |
|---|---|
| `GEMINI_API_KEY` | 녹취 분석, 회의록 다시 쓰기, 교차 요약, 챗봇, 음성 전사, 임베딩 |

## 검사

```bash
npm run typecheck
npm run lint
npm test
npm run build        # .vercel/output 생성
npm run build:node   # 로컬 확인용 node 서버 빌드 → npm start
```

## 운영 스크립트

- `npm run backup:firestore` — Firestore 전체를 `backups/`에 JSON으로 저장 (서비스 계정 키 필요, 읽기 전용)

## 문서

- `docs/literature-prd.md` — 문헌록 기획서
- `docs/baseline-2026-09-30.md` — 원본 import 직후 검사 기준선
