import { vectorSearch } from "@/lib/server/search";
import { groupHitsBySource, mergedCodes, type ChunkHit, type SourceGroup } from "./chunking";

export type EvidenceSearchResult =
  | { ok: true; sessionGroups: SourceGroup[]; literatureGroups: SourceGroup[] }
  | { ok: false; error: string; sessionGroups: []; literatureGroups: [] };

/**
 * 현장록 발언 묶음과 문헌록 묶음을 함께 찾는다.
 * projectId 가 있으면 현장록은 그 프로젝트 안에서만 찾는다(문헌록은 프로젝트에 속하지 않음).
 */
export async function searchEvidence(
  query: string,
  opts: { projectId?: string; sessionLimit: number; literatureLimit: number },
): Promise<EvidenceSearchResult> {
  const q = query.trim();
  if (!q) return { ok: true, sessionGroups: [], literatureGroups: [] };
  const scopes: Array<{ sourceType?: "session" | "literature"; projectId?: string; limit: number }> =
    [];
  if (opts.sessionLimit > 0) {
    scopes.push(
      opts.projectId
        ? { projectId: opts.projectId, limit: opts.sessionLimit }
        : { sourceType: "session", limit: opts.sessionLimit },
    );
  }
  if (opts.literatureLimit > 0) scopes.push({ sourceType: "literature", limit: opts.literatureLimit });
  if (scopes.length === 0) return { ok: true, sessionGroups: [], literatureGroups: [] };

  try {
    const res = await vectorSearch({ data: { query: q, scopes } });
    if (!res.ok) return { ok: false, error: res.error, sessionGroups: [], literatureGroups: [] };
    const all = res.results.flat();
    return {
      ok: true,
      sessionGroups: groupHitsBySource(all.filter((h) => h.sourceType === "session")),
      literatureGroups: groupHitsBySource(all.filter((h) => h.sourceType === "literature")),
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "검색에 실패했습니다.",
      sessionGroups: [],
      literatureGroups: [],
    };
  }
}

/** 검색 결과 카드에 보여 줄 한 줄 이유. */
export function evidenceReason(hits: ChunkHit[]): string {
  const codes = mergedCodes(hits);
  const first = hits[0];
  if (!first) return "";
  const snippet = first.text
    .split("\n")[0]!
    .replace(/^\[[^\]]+\]\s*/, "")
    .slice(0, 80);
  if (codes.length > 0) return `관련 발언 ${codes.slice(0, 4).join(", ")} · ${snippet}`;
  return `${first.label} · ${snippet}`;
}
