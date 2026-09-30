import { geminiJson } from "@/lib/ai/gemini";
import { CHAT_JSON_SCHEMA } from "@/lib/ai/schema";
import type { ChatCaseContext, ChatGroundedReply, RelatedCase } from "@/lib/types";

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

export async function chatWithConfirmedCases(input: {
  projectTitle?: string;
  query: string;
  cases: ChatCaseContext[];
  ranked: RelatedCase[];
}): Promise<ChatGroundedReply> {
  if (input.cases.length === 0) {
    return {
      answer: "질문과 비슷한 확정 회의록이 없습니다. 세션을 확정하면 자료실에서 찾을 수 있습니다.",
      relatedCases: [],
    };
  }

  const catalog = input.cases.map((c) => ({
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
  }));

  const raw = await geminiJson({
    schema: CHAT_JSON_SCHEMA,
    temperature: 0.2,
    system: `당신은 서울지역 인적자원개발위원회의 리서치 어시스턴트입니다.
제공된 확정 회의록만 근거로 답합니다. 없는 수치·기업 사정을 만들지 마십시오.
답변에 회의 제목을 밝히고, 가능하면 구간 코드(S001)를 적으십시오.
relatedCases에는 질문과 주제가 비슷한 회의만 넣고, session_id는 제공된 값 그대로 쓰십시오.`,
    user: `${input.projectTitle ? `프로젝트: ${input.projectTitle}\n` : ""}질문: ${input.query}

확정 회의록:
${JSON.stringify(catalog)}`,
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
