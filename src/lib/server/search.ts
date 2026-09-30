import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import firebaseConfig from "../../../firebase-applet-config.json" with { type: "json" };
import { firebaseAuthMiddleware, writerAuthMiddleware } from "@/lib/server/firebase-middleware";
import { EMBED_BATCH, type ChunkHit } from "@/lib/search/chunking";
import {
  buildVectorQuery,
  decodeFields,
  docIdFromName,
  type EqualityFilter,
  type RestValue,
} from "@/lib/search/firestore-rest";

/** 색인용: 여러 묶음을 한 번에 임베딩 (연구원·관리자). */
export const embedDocuments = createServerFn({ method: "POST" })
  .middleware([writerAuthMiddleware])
  .validator(
    z.object({
      texts: z.array(z.string().max(8000)).min(1).max(EMBED_BATCH),
      title: z.string().max(300).optional(),
    }),
  )
  .handler(async ({ data }) => {
    const { geminiEmbedMany } = await import("@/lib/ai/embed");
    const embeddings = await geminiEmbedMany(data.texts, "RETRIEVAL_DOCUMENT", data.title);
    return { embeddings };
  });

const HIT_FIELDS = [
  "source_type",
  "source_id",
  "project_id",
  "label",
  "segment_codes",
  "ts_start",
  "text",
];
const DISTANCE_FIELD = "vector_distance";

async function runVectorQuery(
  idToken: string,
  queryVector: number[],
  filters: EqualityFilter[],
  limit: number,
): Promise<ChunkHit[]> {
  const database = firebaseConfig.firestoreDatabaseId || "(default)";
  const url =
    `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}` +
    `/databases/${encodeURIComponent(database)}/documents:runQuery`;

  const post = (select?: string[]) =>
    fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${idToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(
        buildVectorQuery({
          collection: "chunks",
          vectorField: "embedding",
          queryVector,
          limit,
          filters,
          select,
          distanceField: DISTANCE_FIELD,
        }),
      ),
      signal: AbortSignal.timeout(20_000),
    });

  // 임베딩 배열을 돌려받지 않도록 필요한 필드만 고른다. 거절되면 전체 필드로 다시 묻는다.
  let res = await post([...HIT_FIELDS, DISTANCE_FIELD]);
  if (res.status === 400) res = await post();
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    if (res.status === 400 && /index/i.test(body)) {
      throw new Error("검색 색인(벡터 인덱스)이 아직 준비되지 않았습니다. 관리자에게 문의하세요.");
    }
    throw new Error(`검색에 실패했습니다 (${res.status}).`);
  }

  const rows = (await res.json()) as Array<{
    document?: { name: string; fields?: Record<string, RestValue> };
  }>;
  const hits: ChunkHit[] = [];
  for (const row of rows) {
    if (!row.document) continue;
    const f = decodeFields(row.document.fields);
    const sourceType = f.source_type === "literature" ? "literature" : "session";
    hits.push({
      id: docIdFromName(row.document.name),
      sourceType,
      sourceId: String(f.source_id ?? ""),
      projectId: String(f.project_id ?? ""),
      label: String(f.label ?? ""),
      segmentCodes: Array.isArray(f.segment_codes) ? f.segment_codes.map(String) : [],
      tsStart: String(f.ts_start ?? ""),
      text: String(f.text ?? ""),
      distance: typeof f[DISTANCE_FIELD] === "number" ? (f[DISTANCE_FIELD] as number) : null,
    });
  }
  return hits.filter((h) => h.sourceId);
}

/**
 * 벡터 검색. 질문을 임베딩한 뒤 사용자 본인 토큰으로 Firestore findNearest 를 호출한다.
 * 한 번에 여러 범위(예: 현장록 20개 + 문헌록 8개)를 물을 수 있다.
 */
export const vectorSearch = createServerFn({ method: "POST" })
  .middleware([firebaseAuthMiddleware])
  .validator(
    z.object({
      query: z.string().min(1).max(2000),
      scopes: z
        .array(
          z.object({
            sourceType: z.enum(["session", "literature"]).optional(),
            projectId: z.string().max(100).optional(),
            limit: z.number().int().min(1).max(50),
          }),
        )
        .min(1)
        .max(3),
    }),
  )
  .handler(async ({ data, context }) => {
    try {
      const { geminiEmbedMany } = await import("@/lib/ai/embed");
      const [queryVector] = await geminiEmbedMany([data.query], "RETRIEVAL_QUERY");
      const results = await Promise.all(
        data.scopes.map((scope) => {
          // 인덱스: (project_id, embedding), (source_type, embedding)
          const filters: EqualityFilter[] = scope.projectId
            ? [{ field: "project_id", value: scope.projectId }]
            : scope.sourceType
              ? [{ field: "source_type", value: scope.sourceType }]
              : [];
          return runVectorQuery(context.idToken, queryVector!, filters, scope.limit);
        }),
      );
      return { ok: true as const, results };
    } catch (err) {
      console.error("[vectorSearch]", err);
      return {
        ok: false as const,
        error: err instanceof Error ? err.message : "검색에 실패했습니다.",
        results: [] as ChunkHit[][],
      };
    }
  });
