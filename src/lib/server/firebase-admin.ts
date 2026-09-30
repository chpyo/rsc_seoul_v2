import "./polyfill.ts";
import { initializeApp, getApps } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getCookie, getRequestHeader } from "@tanstack/react-start/server";
import firebaseConfig from "../../../firebase-applet-config.json" with { type: "json" };

const apps = getApps();

if (!apps.length) {
  initializeApp({
    projectId: firebaseConfig.projectId,
    storageBucket: firebaseConfig.storageBucket,
  });
}

export const adminAuth = getAuth();

export async function downloadUserAudio(path: string): Promise<Uint8Array> {
  const { getStorage } = await import("firebase-admin/storage");
  const bucket = getStorage().bucket(firebaseConfig.storageBucket);
  const [buf] = await bucket.file(path).download();
  return new Uint8Array(buf);
}

export async function requireAuth(bearerToken?: string): Promise<string> {
  let idToken = bearerToken || getCookie("fb_token");
  
  const authHeader = getRequestHeader('authorization') || getRequestHeader('Authorization');
  if (!idToken && authHeader && authHeader.startsWith("Bearer ")) {
    idToken = authHeader.substring(7);
  }
  if (!idToken) {
    throw new Error("Unauthorized: missing authentication token");
  }
  try {
    const decodedToken = await adminAuth.verifyIdToken(idToken);
    return decodedToken.uid;
  } catch (error: any) {
    const msg = error?.message || String(error);
    console.error("[requireAuth] verifyIdToken failed:", msg);
    throw new Error(`Unauthorized: ${msg}`);
  }
}
