import {
  collection,
  doc,
  getDocs,
  query,
  updateDoc,
  vector,
  where,
  writeBatch,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { embedDocuments } from "@/lib/server/search";
import type { SessionDetail } from "@/lib/types";
import type { LiteratureDoc } from "@/lib/firebase-literature";
import { newId } from "@/lib/utils";
import { EMBED_BATCH, chunkSegments, literatureChunks, type ChunkDraft } from "./chunking";

/**
 * 검색 색인(chunks 컬렉션) 쓰기. 브라우저에서 사용자 권한으로 실행되며
 * firestore.rules 가 원본 소유자·관리자만 쓸 수 있게 막는다.
 */

async function embedAll(drafts: ChunkDraft[], title: string): Promise<number[][]> {
  const out: number[][] = [];
  for (let i = 0; i < drafts.length; i += EMBED_BATCH) {
    const batch = drafts.slice(i, i + EMBED_BATCH);
    const res = await embedDocuments({ data: { texts: batch.map((d) => d.text), title } });
    out.push(...res.embeddings);
  }
  return out;
}

export async function deleteChunksFor(sourceId: string): Promise<void> {
  const snap = await getDocs(query(collection(db, "chunks"), where("source_id", "==", sourceId)));
  for (let i = 0; i < snap.docs.length; i += 400) {
    const batch = writeBatch(db);
    for (const d of snap.docs.slice(i, i + 400)) batch.delete(d.ref);
    await batch.commit();
  }
}

async function writeChunks(input: {
  sourceType: "session" | "literature";
  sourceId: string;
  ownerUid: string;
  projectId: string;
  drafts: ChunkDraft[];
  embeddings: number[][];
}) {
  const now = new Date().toISOString();
  for (let i = 0; i < input.drafts.length; i += 400) {
    const batch = writeBatch(db);
    input.drafts.slice(i, i + 400).forEach((d, j) => {
      const id = newId("chk");
      batch.set(doc(db, "chunks", id), {
        owner_uid: input.ownerUid,
        source_type: input.sourceType,
        source_id: input.sourceId,
        project_id: input.projectId,
        label: d.label,
        segment_codes: d.segmentCodes,
        ts_start: d.tsStart,
        text: d.text,
        embedding: vector(input.embeddings[i + j]!),
        created_at: now,
      });
    });
    await batch.commit();
  }
}

/** 확정된 녹취를 색인한다. 기존 색인은 지우고 새로 만든다. 만든 묶음 수를 돌려준다. */
export async function indexSession(session: SessionDetail): Promise<number> {
  if (!session.ownerUid) throw new Error("소유자가 없는 녹취는 색인할 수 없습니다.");
  const ownerUid = session.ownerUid;
  const drafts = chunkSegments(session.segments);
  // 임베딩을 먼저 만들어 두고, 성공했을 때만 기존 색인을 바꾼다.
  const embeddings = drafts.length ? await embedAll(drafts, session.title) : [];
  await deleteChunksFor(session.id);
  if (drafts.length) {
    await writeChunks({
      sourceType: "session",
      sourceId: session.id,
      ownerUid,
      projectId: session.projectId,
      drafts,
      embeddings,
    });
  }
  await updateDoc(doc(db, "sessions", session.id), { indexed_at: new Date().toISOString() });
  return drafts.length;
}

export async function indexLiterature(lit: LiteratureDoc): Promise<number> {
  const drafts = literatureChunks(lit);
  const embeddings = drafts.length ? await embedAll(drafts, lit.document_metadata?.title || "") : [];
  await deleteChunksFor(lit.id);
  if (drafts.length) {
    await writeChunks({
      sourceType: "literature",
      sourceId: lit.id,
      ownerUid: lit.uid,
      projectId: "",
      drafts,
      embeddings,
    });
  }
  await updateDoc(doc(db, "literatures", lit.id), { indexed_at: new Date().toISOString() });
  return drafts.length;
}
