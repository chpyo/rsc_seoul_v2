import { createMiddleware } from "@tanstack/react-start";

export const firebaseAuthMiddleware = createMiddleware({ type: "function" })
  .client(async ({ next }) => {
    let token: string | undefined = undefined;
    if (typeof window !== "undefined") {
      try {
        const { auth } = await import("@/lib/firebase");
        if (!auth.currentUser) {
          await auth.authStateReady();
        }
        if (auth.currentUser) {
          token = await auth.currentUser.getIdToken();
        }
      } catch (err) {
        console.warn("[firebaseAuthMiddleware] Failed to get fresh token from auth:", err);
      }
      if (!token && typeof localStorage !== "undefined") {
        token = localStorage.getItem("fb_token") || undefined;
      }
    }
    return next({ sendContext: { bearerToken: token } });
  })
  .server(async ({ next, context }) => {
    try {
      const { requireAuth } = await import("./firebase-admin");
      const userId = await requireAuth(context.bearerToken);
      return next({ context: { userId } });
    } catch (error: any) {
      console.error("[firebaseAuthMiddleware] Auth error:", error);
      throw new Error(error instanceof Error ? error.message : String(error));
    }
  });
