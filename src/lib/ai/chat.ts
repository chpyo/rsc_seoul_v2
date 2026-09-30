import { geminiJson } from "@/lib/ai/gemini";
import { CHAT_JSON_SCHEMA } from "@/lib/ai/schema";
import type {
  ChatCaseContext,
  ChatGroundedReply,
  ChatLiteratureContext,
  RelatedCase,
} from "@/lib/types";

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

export async function chatWithConfirmedCases(input: {
  projectTitle?: string;
  query: string;
  cases: ChatCaseContext[];
  literatures?: ChatLiteratureContext[];
  ranked: RelatedCase[];
}): Promise<ChatGroundedReply> {
  const literatures = input.literatures ?? [];
  if (input.cases.length === 0 && literatures.length === 0) {
    return {
      answer: "질문과 비슷한 확정 회의록이 없습니다. 세션을 확정하면 자료실에서 찾을 수 있습니다.",
      relatedCases: [],
    };
  }

  const catalog = input.cases.map((c) => ({
    근거표기: c.ref,
    session_id: c.sessionId,
    회의: c.title,
    프로젝트: c.projectTitle,
    일자: c.sessionDate,
    한줄: c.headline,
    개요: c.minutesOverview,
    주제: c.themes.map((t) => ({
      제목: t.title,
      요지: t.summary,
      인용: t.quotes.slice(0, 3),
    })),
    사실: c.facts.slice(0, 12),
    관련발언: (c.evidence ?? []).map((e) => e.text),
  }));
  const litCatalog = literatures.map((l) => ({
    근거표기: l.ref,
    제목: l.title,
    저자: l.authors,
    연도: l.year,
    관련내용: l.excerpts.map((e) => `[${e.label}] ${e.text}`),
  }));

  const raw = await geminiJson({
    schema: CHAT_JSON_SCHEMA,
    temperature: 0.2,
    system: `당신은 서울지역 인적자원개발위원회의 리서치 어시스턴트입니다.
제공된 확정 회의록(현장록)과 문헌록만 근거로 답합니다. 없는 수치·기업 사정을 만들지 마십시오.
근거는 문장 끝에 다음 형식으로 표기하십시오.
- 현장록: 〔C1·S012〕 또는 여러 구간이면 〔C1·S012, S015〕 (C1 은 근거표기, S012 는 관련발언·인용·사실에 적힌 구간 코드)
- 문헌록: 〔L1〕
제공되지 않은 근거표기나 구간 코드는 쓰지 마십시오. 현장의 목소리와 문헌의 결론이 다르면 그 차이를 밝히십시오.
relatedCases에는 질문과 주제가 비슷한 회의만 넣고, session_id는 제공된 값 그대로 쓰십시오.`,
    user: `${input.projectTitle ? `프로젝트: ${input.projectTitle}\n` : ""}질문: ${input.query}

확정 회의록(현장록):
${JSON.stringify(catalog)}

문헌록:
${JSON.stringify(litCatalog)}`,
  });

  const obj = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const byId = new Map(input.ranked.map((r) => [r.sessionId, r]));
  const allowed = new Set(input.cases.map((c) => c.sessionId));
  const fromModel = Array.isArray(obj.relatedCases) ? obj.relatedCases : [];
  const related: RelatedCase[] = [];
  const seen = new Set<string>();

  for (const item of fromModel) {
    const rec = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
    const sessionId = str(rec.session_id ?? rec.sessionId);
    if (!sessionId || !allowed.has(sessionId) || seen.has(sessionId)) continue;
    seen.add(sessionId);
    const meta = byId.get(sessionId);
    const ctx = input.cases.find((c) => c.sessionId === sessionId);
    related.push({
      sessionId,
      sessionTitle: str(rec.session_title ?? rec.sessionTitle) || meta?.sessionTitle || ctx?.title || "",
      projectTitle: meta?.projectTitle || ctx?.projectTitle || "",
      sessionDate: meta?.sessionDate ?? ctx?.sessionDate ?? null,
      headline: meta?.headline || ctx?.headline || "",
      reason: str(rec.reason) || meta?.reason || "",
    });
  }

  if (related.length === 0) related.push(...input.ranked);

  return {
    answer: str(obj.answer) || "제공된 확정 회의록만으로는 답하기 어렵습니다.",
    relatedCases: related.slice(0, 5),
  };
}
