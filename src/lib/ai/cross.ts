import { geminiJson } from "@/lib/ai/gemini";
import type { CrossSummary } from "@/lib/types";

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function asArr(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

export async function synthesizeProject(input: {
  projectTitle: string;
  sessions: Array<{
    title: string;
    researcher?: string;
    sessionDate: string | null;
    industry: string;
    district: string;
    headline: string;
    tags: string[];
    themes: Array<{ title: string; summary: string; bullets: string[] }>;
    // literatures was here

    facts: Array<{ label: string; value: string }>;
    quotes: Array<{ text: string; themeTitle: string }>;
  }>;
  literatures?: Array<{
    title: string;
    authors: string;
    core_implication: string;
    findings: Array<{ question: string; summary: string }>;
  }>;
}): Promise<CrossSummary> {
  const sessionPayload = input.sessions.map((s) => ({
    대상: s.title,
    일자: s.sessionDate,
    업종: s.industry,
    지역: s.district,
    한줄: s.headline,
    태그: s.tags,
    주제: s.themes,
    사실: s.facts,
    인용: s.quotes.slice(0, 8),
  }));
  const litPayload = (input.literatures || []).map(l => ({
    문헌제목: l.title,
    저자: l.authors,
    핵심시사점: l.core_implication,
    연구발견: l.findings
  }));
  const payload = { 현장록: sessionPayload, 문헌록: litPayload };

  const raw = await geminiJson({
    system: `당신은 서울지역 인적자원개발위원회의 조사 연구원입니다.
현장록(인터뷰)과 문헌록(연구/보고서)을 교차 분석하여 통합 리포트를 작성합니다. 현장의 목소리와 문헌의 거시적 시각을 비교 분석하여 반복된 주장과 간극(긴장)을 도출합니다.
원문에 없는 수치·기업 사정을 만들지 마십시오. JSON 객체만 출력하십시오.`,
    user: `프로젝트: ${input.projectTitle}
현장록 ${input.sessions.length}건, 문헌록 ${input.literatures?.length || 0}건입니다. 한 건에서만 나온 이야기는 repeated에 넣지 마십시오. 출처에 '문헌: [제목]' 또는 '현장: [대상명]' 식으로 구분하여 명시해주십시오.

출력:
{
  "overview": "교차 요약 한 문단",
  "repeated": [{"claim":"반복된 주장","sessionTitles":["대상명"],"evidence":"근거 한 줄"}],
  "tensions": [{"point":"서로 다른 점","detail":"설명"}],
  "followups": ["후속 확인"]
}

자료:
${JSON.stringify(payload)}`,
  });

  const obj = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    overview: str(obj.overview),
    repeated: asArr(obj.repeated)
      .map((item) => {
        const rec = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
        return {
          claim: str(rec.claim),
          sessionTitles: asArr(rec.sessionTitles ?? rec.session_titles)
            .map((x) => str(x))
            .filter(Boolean),
          evidence: str(rec.evidence),
        };
      })
      .filter((r) => r.claim),
    tensions: asArr(obj.tensions)
      .map((item) => {
        const rec = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
        return { point: str(rec.point), detail: str(rec.detail) };
      })
      .filter((t) => t.point),
    followups: asArr(obj.followups).map((x) => str(x)).filter(Boolean),
  };
}
