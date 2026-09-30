# Vercel 배포 가이드

현장록을 Vercel(Hobby)에 배포하고 새 권한 체계(A1)로 전환하는 절차입니다.
**순서가 중요합니다.** 기존 사용자를 멤버로 먼저 등록한 뒤 규칙을 바꿔야 끊김이 없습니다.

> Vercel Hobby 는 개인·비상업용 플랜입니다. 기관 업무로 정식 운영하기 전에 Pro 전환을 검토하세요.
> Pro 로 바꾸면 `vite.config.ts` 의 `VERCEL_MAX_DURATION` 을 800 까지 올릴 수 있습니다.

## 0. 준비물

| 항목 | 용도 | 어디서 |
|---|---|---|
| Gemini API 키 | 서버의 모든 AI 호출 | Google AI Studio |
| 서비스 계정 키(JSON) | **로컬 운영 스크립트 전용** (백업·멤버 이전). Vercel 에는 넣지 않습니다 | Firebase 콘솔 → 프로젝트 설정 → 서비스 계정 → 새 비공개 키 생성 |
| Firebase CLI | 규칙 배포 | `npx firebase-tools` (설치 불필요) |

서비스 계정 키 파일은 저장소 **밖**(예: `~/keys/rsc-seoul-admin.json`)에 두세요.

## 1. 백업

```bash
GOOGLE_APPLICATION_CREDENTIALS=~/keys/rsc-seoul-admin.json npm run backup:firestore
```

`backups/<시각>/` 에 컬렉션별 JSON 이 생깁니다 (git 에는 올라가지 않습니다).

## 2. 기존 사용자 멤버 등록 · 첫 관리자 지정

먼저 점검만 합니다 (아무것도 쓰지 않음):

```bash
GOOGLE_APPLICATION_CREDENTIALS=~/keys/rsc-seoul-admin.json npm run migrate:membership -- --enroll-owners=researcher --admin=관리자1@gmail.com,관리자2@gmail.com
```

출력에서 확인할 것:
- 기록을 올린 계정 목록 → 모두 `researcher` 로 등록됩니다. 관리자로 지정한 이메일은 `admin`.
- 소유자 없는 문서가 있으면 `--assign-orphans-to=<uid>` 로 주인을 정합니다.
- 하위 문서 소유자 불일치가 있으면 `--fix-children` 을 붙입니다.

내용이 맞으면 같은 명령에 `--apply` 를 붙여 반영합니다.

## 3. 보안 규칙 배포

```bash
npx firebase-tools@15 login
npx firebase-tools@15 deploy --only firestore:rules,storage
```

- Storage 규칙이 Firestore 의 멤버 문서를 읽으므로, 처음 배포할 때 **"Storage 가 Firestore 에 접근하도록 권한 부여"** 확인 창이 뜨면 승인합니다.
- 이 시점부터 멤버가 아닌 계정은 기록을 읽을 수 없습니다. 2단계에서 등록된 사용자는 기존 앱으로도 계속 쓸 수 있습니다.

## 4. Vercel 프로젝트 만들기

1. 저장소를 GitHub 에 올리고 Vercel 에서 **Add New → Project** 로 가져옵니다.
   (Git 없이 하려면 `npx vercel` 로 CLI 배포도 가능합니다.)
2. 빌드 설정은 기본값 그대로 둡니다. `npm run build` 가 `.vercel/output` 을 만들고 Vercel 이 그대로 씁니다.
3. **Settings → Environment Variables**

   | 이름 | 값 | 환경 |
   |---|---|---|
   | `GEMINI_API_KEY` | Gemini API 키 | Production, Preview |
   | `VITE_FIREBASE_AUTH_DOMAIN` | 앱 도메인 (예: `rsc-seoul.vercel.app`) | Production |

   `VITE_FIREBASE_AUTH_DOMAIN` 은 빌드 시점에 들어가므로, 값을 바꾸면 다시 배포해야 합니다.
4. **Settings → Functions → Function Region**: Firestore 위치와 가까운 곳을 고릅니다.
   Firestore 위치는 Firebase 콘솔 → Firestore → 데이터베이스 상세에서 확인합니다. `asia-northeast3`(서울)이면 `icn1`.

## 5. Firebase · Google Cloud 설정

1. **Firebase 콘솔 → Authentication → 설정 → 승인된 도메인**에 앱 도메인 추가
   (예: `rsc-seoul.vercel.app`, 사용자 지정 도메인). 프리뷰 배포에서 로그인하려면 고정 별칭 하나를 정해 추가합니다.
2. `VITE_FIREBASE_AUTH_DOMAIN` 을 앱 도메인으로 설정했다면
   **Google Cloud 콘솔 → API 및 서비스 → 사용자 인증 정보 → OAuth 2.0 클라이언트(Web client, Firebase 자동 생성)**의
   승인된 리디렉션 URI 에 `https://<앱 도메인>/__/auth/handler` 를 추가합니다.
3. (권장) 같은 화면의 **브라우저 API 키** 에 HTTP 리퍼러 제한을 겁니다:
   `https://<앱 도메인>/*`, `http://localhost:3000/*`, `https://<프로젝트>.firebaseapp.com/*`.
   이 키로 Gemini(Generative Language API)가 호출되지 않도록 API 제한도 확인하세요.

## 6. 배포 후 점검

- [ ] 관리자 계정으로 로그인 → 헤더에 "관리자" 표시, 설정 화면에 멤버 관리가 보인다
- [ ] 설정 → "AI 서버: 연결됨"
- [ ] 초대하지 않은 Google 계정으로 로그인 → "승인 대기" 화면
- [ ] 설정에서 그 이메일을 초대 → "다시 확인" → 사용 가능
- [ ] 녹취 업로드(텍스트) → 분석 → 확정 → 자료실 검색
- [ ] 음성 업로드(짧은 것, 40분 이상 긴 것) → 원본이 세션 화면에서 재생되고 전사가 이어진다
- [ ] 문헌록 PDF 업로드 → 분석 → "원문 PDF" 열기
- [ ] 열람자 계정 → 새 녹취·새 문헌 버튼이 없다

## 7. 기존 배포 정리

새 배포가 확인되면 AI Studio(Cloud Run) 등 예전 배포를 내립니다.
