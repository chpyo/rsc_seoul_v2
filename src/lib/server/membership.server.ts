import firebaseConfig from "../../../firebase-applet-config.json" with { type: "json" };

export type ServerRole = "admin" | "researcher" | "viewer";
export type ServerMember = { role: ServerRole; active: boolean };

const CACHE_TTL_MS = 60_000;
const cache = new Map<string, { member: ServerMember | null; expires: number }>();

type FirestoreValue = { stringValue?: string; booleanValue?: boolean };

/**
 * 사용자 본인의 ID 토큰으로 Firestore REST API 에서 members/{uid} 를 읽는다.
 * 서비스 계정 없이 동작하며, 읽기 권한은 firestore.rules(본인 문서 get 허용)가 보장한다.
 * 문서가 없으면 null.
 */
export async function fetchMember(uid: string, idToken: string): Promise<ServerMember | null> {
  const hit = cache.get(uid);
  if (hit && hit.expires > Date.now()) return hit.member;

  const database = firebaseConfig.firestoreDatabaseId || "(default)";
  const url =
    `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}` +
    `/databases/${encodeURIComponent(database)}/documents/members/${encodeURIComponent(uid)}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${idToken}` },
    signal: AbortSignal.timeout(8000),
  });

  let member: ServerMember | null = null;
  if (res.ok) {
    const body = (await res.json()) as { fields?: Record<string, FirestoreValue> };
    const role = body.fields?.role?.stringValue;
    member = {
      role: role === "admin" || role === "researcher" ? role : "viewer",
      active: body.fields?.active?.booleanValue === true,
    };
  } else if (res.status !== 404) {
    throw new Error(`멤버 정보를 확인하지 못했습니다 (${res.status}).`);
  }

  cache.set(uid, { member, expires: Date.now() + CACHE_TTL_MS });
  return member;
}
