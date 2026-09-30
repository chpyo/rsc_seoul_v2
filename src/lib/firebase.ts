import { initializeApp, getApps } from "firebase/app";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signOut as firebaseSignOut,
} from "firebase/auth";
import { getFirestore, initializeFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import firebaseConfigRaw from "../../firebase-applet-config.json";

const firebaseConfig = {
  apiKey: firebaseConfigRaw.apiKey,
  // 배포 도메인에서는 VITE_FIREBASE_AUTH_DOMAIN 에 앱 도메인을 넣는다 (/__/auth 는 vite.config 에서 프록시).
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || firebaseConfigRaw.authDomain,
  projectId: firebaseConfigRaw.projectId,
  storageBucket: firebaseConfigRaw.storageBucket,
  messagingSenderId: firebaseConfigRaw.messagingSenderId,
  appId: firebaseConfigRaw.appId,
};

export const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0]!;
export const auth = getAuth(app);

const databaseId = firebaseConfigRaw.firestoreDatabaseId || "(default)";
export const db = (() => {
  try {
    return initializeFirestore(
      app,
      {
        experimentalForceLongPolling: true,
      },
      databaseId
    );
  } catch {
    return getFirestore(app, databaseId);
  }
})();

export const storage = getStorage(app);

if (typeof window !== "undefined") {
  void getRedirectResult(auth).catch(() => undefined);
}

export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: "select_account" });

function authCode(err: unknown): string {
  return typeof err === "object" && err && "code" in err ? String((err as { code: string }).code) : "";
}

export async function loginWithGoogle() {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    return result.user;
  } catch (err) {
    const code = authCode(err);
    if (
      code === "auth/popup-blocked" ||
      code === "auth/cancelled-popup-request" ||
      code === "auth/operation-not-supported-in-this-environment"
    ) {
      await signInWithRedirect(auth, googleProvider);
      return null;
    }
    if (code === "auth/unauthorized-domain") {
      throw new Error("이 미리보기 주소가 Firebase 승인된 도메인에 없습니다.");
    }
    if (code === "auth/popup-closed-by-user") {
      throw new Error("로그인 창이 닫혔습니다. 다시 시도해 주세요.");
    }
    throw err instanceof Error ? err : new Error("Google 로그인에 실패했습니다.");
  }
}

export async function logout() {
  await firebaseSignOut(auth);
}
