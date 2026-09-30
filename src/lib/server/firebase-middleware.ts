import { createMiddleware } from "@tanstack/react-start";

export const NOT_MEMBER_MESSAGE = "승인된 멤버만 사용할 수 있습니다. 관리자에게 초대를 요청하세요.";
export const VIEWER_MESSAGE = "열람자 계정은 이 기능을 사용할 수 없습니다.";

/**
 * 모든 서버 함수의 기본 인증: Firebase ID 토큰 검증 + 활성 멤버 확인.
 * context: userId, role, idToken(사용자 권한으로 Firestore/Storage 를 호출할 때 사용)
 */
export const firebaseAuthMiddleware = createMiddleware({ type: "function" })
  .client(async ({ next }) => {
    let token: string | undefined;
    if (typeof window !== "undefined") {
      const { auth } = await import("@/lib/firebase");
      if (!auth.currentUser) await auth.authStateReady();
      token = auth.currentUser ? await auth.currentUser.getIdToken() : undefined;
    }
    return next({ sendContext: { bearerToken: token } });
  })
  .server(async ({ next, context }) => {
    const { requireAuth } = await import("./firebase-admin");
    const { fetchMember } = await import("./membership.server");
    const idToken = context.bearerToken;
    const user = await requireAuth(idToken);
    const member = await fetchMember(user.uid, idToken!);
    if (!member || !member.active) {
      throw new Error(NOT_MEMBER_MESSAGE);
    }
    return next({ context: { userId: user.uid, role: member.role, idToken: idToken! } });
  });

/** 연구원·관리자 전용 (AI 분석·전사처럼 데이터를 만들거나 비용이 드는 기능). */
export const writerAuthMiddleware = createMiddleware({ type: "function" })
  .middleware([firebaseAuthMiddleware])
  .server(async ({ next, context }) => {
    if (context.role === "viewer") {
      throw new Error(VIEWER_MESSAGE);
    }
    return next();
  });
