import { searchConfirmedCases, loadChatCaseContext } from "@/lib/firebase-db";
import { listLiteratures } from "@/lib/firebase-literature";
import { tokenize } from "@/lib/ai/corpus";
import { runProjectAssistant } from "@/lib/ai/run";
import type { RelatedCase } from "@/lib/types";

export type AskCorpusChunk = {
  text: string;
  relatedCases: RelatedCase[];
};

export async function* askConfirmedCorpusStream(
  uid: string,
  question: string,
  options?: { projectId?: string; projectTitle?: string },
): AsyncGenerator<AskCorpusChunk, void, unknown> {
  const hits = await searchConfirmedCases(uid, question, {
    projectId: options?.projectId,
    limit: 5,
  });

  const sessionCases: RelatedCase[] = hits.map((h) => ({
    type: "session" as const,
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
  const matchedLits: Array<{ lit: any; score: number }> = [];

  try {
    const lits = await listLiteratures(uid);
    for (const lit of lits) {
      const text = [
        lit.document_metadata?.title || "",
        (lit.document_metadata?.authors || []).join(" "),
        lit.document_metadata?.literature_type || "",
        lit.seoul_hrd_insights?.core_implication || "",
        ...(lit.tags || []),
      ].join(" ");
      const tokens = new Set(tokenize(text));
      const overlap = qTokens.filter((t) => tokens.has(t));
      if (overlap.length > 0) {
        matchedLits.push({ lit, score: overlap.length });
      }
    }
    matchedLits.sort((a, b) => b.score - a.score);
  } catch {
    // ignore literature fetch failure in offline/restricted state
  }

  const litCases: RelatedCase[] = matchedLits.slice(0, 3).map(({ lit }) => ({
    type: "literature" as const,
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

  const allRelated: RelatedCase[] = [...sessionCases, ...litCases].slice(0, 5);

  yield { text: "", relatedCases: allRelated };

  const sessionIds = hits.map((h) => h.sessionId);
  const cases = sessionIds.length > 0 ? await loadChatCaseContext(uid, sessionIds) : [];

  const res = await runProjectAssistant({
    projectTitle: options?.projectTitle,
    query: question,
    cases,
    ranked: sessionCases,
  });

  const finalRelated =
    res.relatedCases && res.relatedCases.length > 0
      ? [...res.relatedCases, ...litCases].slice(0, 5)
      : allRelated;

  if (res.ok && res.answer) {
    const tokens = res.answer.split(/(?<=\s|[\n])/);
    let accumulated = "";
    for (const token of tokens) {
      accumulated += token;
      yield { text: accumulated, relatedCases: finalRelated };
      await new Promise((r) => setTimeout(r, 20));
    }
  } else {
    yield {
      text: res.answer || (res as any).error || "답변을 생성할 수 없습니다.",
      relatedCases: finalRelated,
    };
  }
}
