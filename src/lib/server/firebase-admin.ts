import "./polyfill.ts";
import { initializeApp, getApps } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import firebaseConfig from "../../../firebase-applet-config.json" with { type: "json" };

// ID 토큰 검증에는 프로젝트 ID만 있으면 된다(공개 인증서 사용). 서비스 계정 키는 쓰지 않는다.
if (!getApps().length) {
  initializeApp({ projectId: firebaseConfig.projectId });
}

export const adminAuth = getAuth();

export type VerifiedUser = { uid: string; email: string | null };

export async function requireAuth(bearerToken?: string): Promise<VerifiedUser> {
  if (!bearerToken) {
    throw new Error("Unauthorized: missing authentication token");
  }
  try {
    const decoded = await adminAuth.verifyIdToken(bearerToken);
    return { uid: decoded.uid, email: decoded.email ?? null };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[requireAuth] verifyIdToken failed:", msg);
    throw new Error(`Unauthorized: ${msg}`);
  }
}
