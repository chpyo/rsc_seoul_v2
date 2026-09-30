import { loadChatCaseContext, searchConfirmedCases } from "@/lib/firebase-db";
import { getLiterature, listLiteratures } from "@/lib/firebase-literature";
import { tokenize } from "@/lib/ai/corpus";
import { runProjectAssistant } from "@/lib/ai/run";
import type { SourceGroup } from "@/lib/search/chunking";
import { evidenceReason, searchEvidence } from "@/lib/search/search";
import type { ChatCaseContext, ChatLiteratureContext, Citation, RelatedCase } from "@/lib/types";

export type AskCorpusChunk = {
  text: string;
  relatedCases: RelatedCase[];
  /** 답변 속 근거표기(C1, L1 …) → 원본 */
  citations: Record<string, Citation>;
};

const MAX_CASES = 5;
const MAX_LITERATURES = 3;

type Gathered = {
  cases: ChatCaseContext[];
  literatures: ChatLiteratureContext[];
  sessionRelated: RelatedCase[];
  litRelated: RelatedCase[];
};

/** 벡터 검색으로 근거를 모은다. */
async function gatherByVector(
  uid: string,
  question: string,
  projectId: string | undefined,
): Promise<Gathered | null> {
  const found = await searchEvidence(question, {
    projectId,
    sessionLimit: 30,
    literatureLimit: 12,
  });
  if (!found.ok) return null;

  const groupsById = new Map<string, SourceGroup>(
    found.sessionGroups.map((g) => [g.sourceId, g]),
  );
  const candidateIds = found.sessionGroups.slice(0, MAX_CASES * 2).map((g) => g.sourceId);
  const loaded = await loadChatCaseContext(uid, candidateIds); // 확정본만 남는다
  const cases = loaded.slice(0, MAX_CASES).map((c, i) => {
    const g = groupsById.get(c.sessionId);
    return {
      ...c,
      ref: `C${i + 1}`,
      evidence: (g?.hits ?? []).map((h) => ({ codes: h.segmentCodes, text: h.text })),
    };
  });
  const sessionRelated: RelatedCase[] = cases.map((c) => ({
    type: "session",
    id: c.sessionId,
    sessionId: c.sessionId,
    title: c.title,
    sessionTitle: c.title,
    projectTitle: c.projectTitle,
    sessionDate: c.sessionDate,
    headline: c.headline,
    reason: evidenceReason(groupsById.get(c.sessionId)?.hits ?? []),
  }));

  const literatures: ChatLiteratureContext[] = [];
  const litRelated: RelatedCase[] = [];
  for (const g of found.literatureGroups) {
    if (literatures.length >= MAX_LITERATURES) break;
    const lit = await getLiterature(g.sourceId, uid).catch(() => null);
    if (!lit) continue;
    const ref = `L${literatures.length + 1}`;
    const title = lit.document_metadata?.title || "문헌 자료";
    const authors = (lit.document_metadata?.authors || []).join(", ");
    literatures.push({
      ref,
      literatureId: lit.id,
      title,
      authors,
      year: String(lit.document_metadata?.year || ""),
      excerpts: g.hits.map((h) => ({ label: h.label, text: h.text })),
    });
    litRelated.push({
      type: "literature",
      id: lit.id,
      sessionId: lit.id,
      title,
      sessionTitle: title,
      subtitle: authors,
      projectTitle: authors,
      date: lit.document_metadata?.year || null,
      sessionDate: lit.document_metadata?.year || null,
      headline: lit.seoul_hrd_insights?.core_implication || "",
      reason: `관련 문헌: ${g.hits.map((h) => h.label).join(", ")}`,
    });
  }
  return { cases, literatures, sessionRelated, litRelated };
}

/** 벡터 검색을 쓸 수 없을 때: 예전 키워드 방식. */
async function gatherByKeyword(
  uid: string,
  question: string,
  projectId: string | undefined,
): Promise<Gathered> {
  const hits = await searchConfirmedCases(uid, question, { projectId, limit: MAX_CASES });
  const loaded = await loadChatCaseContext(
    uid,
    hits.map((h) => h.sessionId),
  );
  const cases = loaded.map((c, i) => ({
    ...c,
    ref: `C${i + 1}`,
    evidence: (hits.find((h) => h.sessionId === c.sessionId)?.evidence ?? []).map((h) => ({
      codes: h.segmentCodes,
      text: h.text,
    })),
  }));
  const sessionRelated: RelatedCase[] = hits.map((h) => ({
    type: "session",
    id: h.sessionId,
    sessionId: h.sessionId,
    title: h.sessionTitle,
    sessionTitle: h.sessionTitle,
    subtitle: h.projectTitle,
    projectTitle: h.projectTitle,
    date: h.sessionDate,
    sessionDate: h.sessionDate,
    headline: h.headline,
    reason: h.reason,
  }));

  const qTokens = tokenize(question);
  const matched: Array<{ lit: Awaited<ReturnType<typeof listLiteratures>>[number]; score: number }> =
    [];
  try {
    for (const lit of await listLiteratures(uid)) {
      const text = [
        lit.document_metadata?.title || "",
        (lit.document_metadata?.authors || []).join(" "),
        lit.document_metadata?.literature_type || "",
        lit.seoul_hrd_insights?.core_implication || "",
        ...(lit.tags || []),
      ].join(" ");
      const tokens = new Set(tokenize(text));
      const score = qTokens.filter((t) => tokens.has(t)).length;
      if (score > 0) matched.push({ lit, score });
    }
  } catch {
    // 문헌을 못 읽어도 현장록 답변은 계속한다.
  }
  matched.sort((a, b) => b.score - a.score);
  const top = matched.slice(0, MAX_LITERATURES);
  const literatures: ChatLiteratureContext[] = top.map(({ lit }, i) => ({
    ref: `L${i + 1}`,
    literatureId: lit.id,
    title: lit.document_metadata?.title || "문헌 자료",
    authors: (lit.document_metadata?.authors || []).join(", "),
    year: String(lit.document_metadata?.year || ""),
    excerpts: [{ label: "핵심 시사점", text: lit.seoul_hrd_insights?.core_implication || "" }],
  }));
  const litRelated: RelatedCase[] = top.map(({ lit }) => ({
    type: "literature",
    id: lit.id,
    sessionId: lit.id,
    title: lit.document_metadata?.title || "문헌 자료",
    sessionTitle: lit.document_metadata?.title || "문헌 자료",
    subtitle: (lit.document_metadata?.authors || []).join(", "),
    projectTitle: (lit.document_metadata?.authors || []).join(", "),
    date: lit.document_metadata?.year || null,
    sessionDate: lit.document_metadata?.year || null,
    headline: lit.seoul_hrd_insights?.core_implication || "",
    reason: `관련 문헌: ${lit.document_metadata?.literature_type || "연구보고서"}`,
  }));
  return { cases, literatures, sessionRelated, litRelated };
}

export async function* askConfirmedCorpusStream(
  uid: string,
  question: string,
  options?: { projectId?: string; projectTitle?: string },
): AsyncGenerator<AskCorpusChunk, void, unknown> {
  const gathered =
    (await gatherByVector(uid, question, options?.projectId)) ??
    (await gatherByKeyword(uid, question, options?.projectId));
  const { cases, literatures, sessionRelated, litRelated } = gathered;

  const citations: Record<string, Citation> = {};
  for (const c of cases) citations[c.ref!] = { type: "session", id: c.sessionId, title: c.title };
  for (const l of literatures) citations[l.ref] = { type: "literature", id: l.literatureId, title: l.title };

  const allRelated: RelatedCase[] = [...sessionRelated, ...litRelated].slice(0, MAX_CASES);
  yield { text: "", relatedCases: allRelated, citations };

  if (cases.length === 0 && literatures.length === 0) {
    yield {
      text: "질문과 가까운 확정 회의록이나 문헌을 찾지 못했습니다. 녹취를 확정하거나 문헌을 등록하면 이곳에서 찾을 수 있습니다.",
      relatedCases: [],
      citations,
    };
    return;
  }

  const res = await runProjectAssistant({
    projectTitle: options?.projectTitle,
    query: question,
    cases,
    literatures,
    ranked: sessionRelated,
  });

  const finalRelated =
    res.relatedCases && res.relatedCases.length > 0
      ? [...res.relatedCases, ...litRelated].slice(0, MAX_CASES)
      : allRelated;

  if (res.ok && res.answer) {
    const tokens = res.answer.split(/(?<=\s|[\n])/);
    let accumulated = "";
    for (const token of tokens) {
      accumulated += token;
      yield { text: accumulated, relatedCases: finalRelated, citations };
      await new Promise((r) => setTimeout(r, 20));
    }
  } else {
    yield {
      text: res.answer || ("error" in res ? res.error : "") || "답변을 생성할 수 없습니다.",
      relatedCases: finalRelated,
      citations,
    };
  }
}

