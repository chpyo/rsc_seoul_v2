import firebaseConfig from "../../../firebase-applet-config.json" with { type: "json" };

/**
 * 사용자 본인의 ID 토큰으로 Firebase Storage 객체를 내려받는다.
 * 서비스 계정 없이 동작하며, 접근 권한은 storage.rules 가 판단한다.
 */
export async function downloadStorageObject(path: string, idToken: string): Promise<Uint8Array> {
  const url =
    `https://firebasestorage.googleapis.com/v0/b/${firebaseConfig.storageBucket}` +
    `/o/${encodeURIComponent(path)}?alt=media`;
  const res = await fetch(url, { headers: { Authorization: `Firebase ${idToken}` } });
  if (res.status === 403 || res.status === 401) {
    throw new Error("저장된 파일에 접근할 권한이 없습니다.");
  }
  if (res.status === 404) {
    throw new Error("저장된 파일을 찾을 수 없습니다.");
  }
  if (!res.ok) {
    throw new Error(`저장된 파일을 내려받지 못했습니다 (${res.status}).`);
  }
  return new Uint8Array(await res.arrayBuffer());
}
