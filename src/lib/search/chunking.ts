import type { LiteratureAnalysisResult } from "../types";

/**
 * 검색 색인 단위(chunk) 만들기. 브라우저·서버·테스트에서 함께 쓰는 순수 함수만 둔다.
 *
 * - 현장록: 연속된 발언을 약 800자씩 묶는다. 묶음마다 포함된 구간 코드(S012…)를 기록해
 *   검색 결과에서 곧바로 원문 구간으로 이동할 수 있게 한다.
 * - 문헌록: 개요·방법론·연구 질문별 발견·정책 제언을 각각 한 묶음으로 만든다.
 */

/** 임베딩 차원. Firestore 벡터 한도(2048) 안에서 Gemini 임베딩을 줄여 저장한다. */
export const EMBED_DIM = 768;
/** 한 번에 임베딩할 최대 개수 (Gemini batchEmbedContents 한도). */
export const EMBED_BATCH = 100;
export const CHUNK_MAX_CHARS = 800;

export type ChunkDraft = {
  /** 화면 표시용 짧은 이름 (예: "S012–S015", "Q1 연구 질문") */
  label: string;
  segmentCodes: string[];
  /** 첫 발언 시각 (현장록만) */
  tsStart: string;
  text: string;
};

type SegmentLike = { code: string; seq: number; speaker: string; ts: string; body: string };

function segmentLine(s: SegmentLike): string {
  return `[${s.code}] ${s.speaker}${s.ts ? ` (${s.ts})` : ""}: ${s.body.trim()}`;
}

function codeLabel(codes: string[]): string {
  if (codes.length === 0) return "";
  return codes.length === 1 ? codes[0]! : `${codes[0]}–${codes[codes.length - 1]}`;
}

export function chunkSegments(segments: SegmentLike[], maxChars = CHUNK_MAX_CHARS): ChunkDraft[] {
  const ordered = [...segments]
    .filter((s) => s.body.trim())
    .sort((a, b) => a.seq - b.seq);
  const chunks: ChunkDraft[] = [];
  let lines: string[] = [];
  let codes: string[] = [];
  let tsStart = "";
  let size = 0;

  const flush = () => {
    if (lines.length === 0) return;
    chunks.push({ label: codeLabel(codes), segmentCodes: codes, tsStart, text: lines.join("\n") });
    lines = [];
    codes = [];
    tsStart = "";
    size = 0;
  };

  for (const seg of ordered) {
    let line = segmentLine(seg);
    // 한 발언이 너무 길면 잘라서 따로 묶는다(임베딩 입력 한도 보호).
    if (line.length > maxChars * 3) line = `${line.slice(0, maxChars * 3)}…`;
    if (size > 0 && size + line.length > maxChars) flush();
    if (lines.length === 0) tsStart = seg.ts || "";
    lines.push(line);
    codes.push(seg.code);
    size += line.length + 1;
  }
  flush();
  return chunks;
}

function clean(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

export function literatureChunks(lit: Partial<LiteratureAnalysisResult>): ChunkDraft[] {
  const meta = lit.document_metadata;
  const method = lit.methodological_framework;
  const hrd = lit.seoul_hrd_insights;
  const chunks: ChunkDraft[] = [];
  const push = (label: string, parts: string[]) => {
    const text = parts.map(clean).filter(Boolean).join("\n");
    if (text) chunks.push({ label, segmentCodes: [], tsStart: "", text });
  };

  push("개요", [
    meta?.title ?? "",
    [meta?.institution_or_journal, meta?.year, meta?.literature_type].map(clean).filter(Boolean).join(" · "),
    hrd?.core_implication ?? "",
    hrd?.target_beneficiary_or_industry ? `대상: ${hrd.target_beneficiary_or_industry}` : "",
    (lit.tags ?? []).join(", "),
  ]);
  push("연구 방법", [
    method?.data_source ? `자료: ${method.data_source}` : "",
    method?.sample_and_scope ? `표본·범위: ${method.sample_and_scope}` : "",
    method?.methodology ? `방법: ${method.methodology}` : "",
  ]);
  (lit.question_driven_analysis ?? []).forEach((q, i) => {
    push(`${clean(q.question_id) || `Q${i + 1}`} 연구 질문`, [
      q.research_question,
      q.findings_summary,
      q.empirical_evidence,
    ]);
  });
  const actions = hrd?.recommended_actions ?? [];
  if (actions.length > 0) {
    push(
      "정책 제언",
      actions.map((a) =>
        [a.category, a.action_detail, a.ncs_or_curriculum_linkage].map(clean).filter(Boolean).join(" — "),
      ),
    );
  }
  return chunks;
}

// ---------- 검색 결과 묶기 ----------

export type ChunkHit = {
  id: string;
  sourceType: "session" | "literature";
  sourceId: string;
  projectId: string;
  label: string;
  segmentCodes: string[];
  tsStart: string;
  text: string;
  /** 코사인 거리 (작을수록 가깝다). 알 수 없으면 null */
  distance: number | null;
};

export type SourceGroup = {
  sourceType: "session" | "literature";
  sourceId: string;
  /** 가장 가까운 묶음의 순위(0부터) */
  bestRank: number;
  bestDistance: number | null;
  hits: ChunkHit[];
};

/** 검색 결과(가까운 순)를 원본 문서 단위로 묶는다. 순서는 원본의 가장 가까운 묶음 기준. */
export function groupHitsBySource(hits: ChunkHit[], perSource = 3): SourceGroup[] {
  const groups = new Map<string, SourceGroup>();
  hits.forEach((hit, rank) => {
    const key = `${hit.sourceType}:${hit.sourceId}`;
    const g = groups.get(key);
    if (!g) {
      groups.set(key, {
        sourceType: hit.sourceType,
        sourceId: hit.sourceId,
        bestRank: rank,
        bestDistance: hit.distance,
        hits: [hit],
      });
    } else if (g.hits.length < perSource) {
      g.hits.push(hit);
    }
  });
  return [...groups.values()].sort((a, b) => a.bestRank - b.bestRank);
}

/** 여러 묶음의 구간 코드를 순서대로 합친다 (중복 제거). */
export function mergedCodes(hits: ChunkHit[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const h of hits) {
    for (const c of h.segmentCodes) {
      if (!seen.has(c)) {
        seen.add(c);
        out.push(c);
      }
    }
  }
  return out.sort((a, b) => codeNumber(a) - codeNumber(b));
}

export function codeNumber(code: string): number {
  const n = Number.parseInt(code.replace(/^\D+/, ""), 10);
  return Number.isFinite(n) ? n : 0;
}
