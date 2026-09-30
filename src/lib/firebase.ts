import { initializeApp, getApps } from "firebase/app";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signOut as firebaseSignOut,
  onIdTokenChanged,
} from "firebase/auth";
import { getFirestore, initializeFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import firebaseConfigRaw from "../../firebase-applet-config.json";

const firebaseConfig = {
  apiKey: firebaseConfigRaw.apiKey,
  authDomain: firebaseConfigRaw.authDomain,
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

let memToken: string | null = null;

if (typeof window !== "undefined") {
  onIdTokenChanged(auth, async (user) => {
    if (user) {
      const token = await user.getIdToken();
      document.cookie = `fb_token=${token}; path=/; max-age=3600; SameSite=None; Secure`;
      memToken = token;
      try {
        localStorage.setItem("fb_token", token);
      } catch {
        /* ignore */
      }
    } else {
      document.cookie = `fb_token=; path=/; max-age=0; SameSite=None; Secure`;
      memToken = null;
      try {
        localStorage.removeItem("fb_token");
      } catch {
        /* ignore */
      }
    }
  });
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

if (typeof window !== "undefined") {
  const originalFetch = window.fetch;
  try {
    Object.defineProperty(window, "fetch", {
      value: async (input: RequestInfo | URL, init?: RequestInit) => {
        init = init || {};
        const headers = new Headers(init.headers);
        let token = memToken;
        if (!token) {
          try {
            token = localStorage.getItem("fb_token");
          } catch {
            token = null;
          }
        }
        if (token) headers.set("Authorization", `Bearer ${token}`);
        init.headers = headers;
        return originalFetch(input, init);
      },
      writable: true,
      configurable: true,
    });
  } catch {
    /* fetch already patched */
  }
}
