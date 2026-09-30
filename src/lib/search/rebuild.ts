import { collection, deleteField, doc, getDocs, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { getSession } from "@/lib/firebase-db";
import { normalizeLiteratureDoc } from "@/lib/firebase-literature";
import { indexLiterature, indexSession } from "./index-store";

export type RebuildProgress = {
  done: number;
  total: number;
  current: string;
};

export type RebuildResult = {
  indexed: number;
  skipped: number;
  failed: Array<{ title: string; error: string }>;
};

/**
 * 관리자용: 확정된 녹취와 문헌 전체의 검색 색인을 다시 만든다.
 * 예전 방식의 문서 단위 임베딩(corpus_embedding)도 함께 지운다.
 */
export async function rebuildSearchIndex(
  uid: string,
  opts: { onlyMissing: boolean },
  onProgress?: (p: RebuildProgress) => void,
): Promise<RebuildResult> {
  const [sessionSnap, litSnap] = await Promise.all([
    getDocs(collection(db, "sessions")),
    getDocs(collection(db, "literatures")),
  ]);
  const sessions = sessionSnap.docs.filter((d) => d.get("status") === "confirmed");
  const literatures = litSnap.docs;
  const total = sessions.length + literatures.length;
  const result: RebuildResult = { indexed: 0, skipped: 0, failed: [] };
  let done = 0;

  for (const d of sessions) {
    const title = String(d.get("title") ?? d.id);
    onProgress?.({ done, total, current: title });
    try {
      if (d.get("corpus_embedding") !== undefined) {
        await updateDoc(doc(db, "sessions", d.id), { corpus_embedding: deleteField() });
      }
      if (opts.onlyMissing && d.get("indexed_at")) {
        result.skipped++;
      } else {
        await indexSession(await getSession(uid, d.id));
        result.indexed++;
      }
    } catch (err) {
      result.failed.push({ title, error: err instanceof Error ? err.message : String(err) });
    }
    done++;
  }

  for (const d of literatures) {
    const lit = normalizeLiteratureDoc(d.id, d.data(), uid);
    const title = lit.document_metadata?.title || d.id;
    onProgress?.({ done, total, current: title });
    try {
      if (opts.onlyMissing && d.get("indexed_at")) {
        result.skipped++;
      } else {
        await indexLiterature(lit);
        result.indexed++;
      }
    } catch (err) {
      result.failed.push({ title, error: err instanceof Error ? err.message : String(err) });
    }
    done++;
  }
  onProgress?.({ done, total, current: "" });
  return result;
}
