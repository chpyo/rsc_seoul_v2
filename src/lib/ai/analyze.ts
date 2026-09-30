import { verifyThemeQuotes } from "@/lib/ai/evidence";
import { keepKnownCodes } from "@/lib/evidence/parse";
import { geminiJson } from "@/lib/ai/gemini";
import { cleanOfficialDocumentText } from "@/lib/ai/official-format";
import { ANALYSIS_JSON_SCHEMA, MINUTES_JSON_SCHEMA } from "@/lib/ai/schema";
import type { ParsedSegment } from "@/lib/parse-transcript";
import type { Confidence } from "@/lib/types";

export type AnalysisResult = {
  headline: string;
  themes: Array<{
    title: string;
    summary: string;
    bullets: string[];
    sourceSegments: string[];
    quotes: Array<{ text: string; segmentId: string }>;
    confidence: Confidence;
  }>;
  facts: Array<{ label: string; value: string; segmentId: string }>;
  tags: string[];
  minutes: { overview: string; body: string; followups: string[] };
  unresolved: string[];
  actionItems: Array<{ assignee: string; deadline: string; task: string; segmentId: string }>;
};

const SYSTEM = `당신은 서울지역 인적자원개발위원회의 수석 조사 연구원입니다.
기업 현장조사·FGI·분과위·포럼 녹취를 읽고, 이번 대화에서 실제로 나온 내용만 공문서 보고서 표준으로 정리합니다.

[핵심 작성 원칙 - 한국 공문서 개조식(箇條式) 문체 준수]:
1. AI 특유의 마크다운 볼드 구문('**')을 절대 사용하지 마십시오. (예: '**단어**:' 절대 금지)
2. 글머리기호는 한국 공문서 표준 계층 체계를 엄격히 따르십시오:
   1. 대주제/안건 (숫자 번호)
     □ 핵심 의제 또는 발표/논의 소제목
       ○ 주요 발언 및 현황 요지
         - 세부 설명, 구체적 데이터, 사례 또는 근거
         ※ 참고사항 또는 특이점
3. 모든 문장은 '~함', '~임', '~됨', '~추진', '~계획', '~제기', '~논의' 등 명사형/개조식 어미로 깔끔하고 명확하게 종결하십시오. (서술형 평서문 '~했습니다', '~합니다' 금지)
4. 원문에 없는 수치·결론·기업 사정을 절대 날조하거나 추가하지 마십시오.
5. 모든 요지·사실·인용은 source_segments / segment_id로 구간 코드를 적으십시오. 코드는 S001 형식입니다.
6. 주제 제목은 대화의 실제 언어를 쓰십시오. 미리 정한 조사표 항목명으로 억지 매칭하지 마십시오.
7. 안 나온 항목을 "해당 없음" 섹션으로 만들지 마십시오.
8. quotes.text는 해당 구간 원문을 그대로 복사하십시오. 말을 바꾸거나 요약하지 마십시오.
9. 회의록 본문(minutes.body)의 ○ 요지와 - 세부 문장 끝에는 근거 구간 코드를 괄호로 붙이십시오.
   예: ○ 청년층 생산직 채용 기피 현상 심화 제기함 (S012, S015)
   제공된 녹취·주제에 있는 구간 코드만 쓰고, 근거를 특정할 수 없으면 코드를 붙이지 마십시오.`;

function formatSegments(segments: Array<ParsedSegment & { code: string }>): string {
  return segments
    .map((s) => `[${s.code}] ${s.speaker}${s.ts ? ` (${s.ts})` : ""}\n${s.body}`)
    .join("\n\n");
}

function asArr(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function normalizeConfidence(v: unknown): Confidence {
  if (v === "high" || v === "low" || v === "medium") return v;
  return "medium";
}

function normalizeAnalysis(raw: unknown, validCodes: Set<string>): AnalysisResult {
  let target = raw;
  while (target && typeof target === "object" && !Array.isArray(target)) {
    const r = target as Record<string, unknown>;
    if (r.headline || r.themes || r.minutes) break;
    if (r.analysis && typeof r.analysis === "object") {
      target = r.analysis;
    } else if (r.result && typeof r.result === "object") {
      target = r.result;
    } else {
      break;
    }
  }
  const obj = target && typeof target === "object" ? (target as Record<string, unknown>) : {};
  const keepCode = (code: string) => (validCodes.has(code) ? code : "");

  const themes = asArr(obj.themes)
    .map((item) => {
      const t = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
      const sources = asArr(t.source_segments ?? t.sourceSegments)
        .map((c) => keepCode(str(c)))
        .filter(Boolean);
      const quotes = asArr(t.quotes)
        .map((q) => {
          const rec = q && typeof q === "object" ? (q as Record<string, unknown>) : {};
          const segmentId = keepCode(str(rec.segment_id ?? rec.segmentId));
          return { text: str(rec.text), segmentId };
        })
        .filter((q) => q.text && q.segmentId);
      return {
        title: str(t.title) || "제목 없는 주제",
        summary: str(t.summary),
        bullets: asArr(t.bullets).map((b) => str(b)).filter(Boolean),
        sourceSegments: sources,
        quotes,
        confidence: normalizeConfidence(t.confidence),
      };
    })
    .filter((t) => t.title);

  const minutesObj =
    obj.minutes && typeof obj.minutes === "object"
      ? (obj.minutes as Record<string, unknown>)
      : {};

  return {
    headline: str(obj.headline),
    themes,
    facts: asArr(obj.facts)
      .map((item) => {
        const f = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
        return {
          label: str(f.label),
          value: str(f.value),
          segmentId: keepCode(str(f.segment_id ?? f.segmentId)),
        };
      })
      .filter((f) => f.label && f.value),
    tags: asArr(obj.tags)
      .map((t) => str(t))
      .filter(Boolean)
      .slice(0, 16),
    minutes: {
      overview: str(minutesObj.overview),
      body: keepKnownCodes(cleanOfficialDocumentText(str(minutesObj.body)), validCodes),
      followups: asArr(minutesObj.followups).map((x) => str(x)).filter(Boolean),
    },
    unresolved: asArr(obj.unresolved).map((x) => str(x)).filter(Boolean),
    actionItems: asArr(obj.actionItems ?? obj.action_items)
      .map((item) => {
        const a = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
        return {
          assignee: str(a.assignee),
          deadline: str(a.deadline),
          task: str(a.task),
          segmentId: keepCode(str(a.segment_id ?? a.segmentId)),
        };
      })
      .filter((a) => a.task),
  };
}

function applyEvidence(
  result: AnalysisResult,
  segments: Array<{ code: string; body: string }>,
): AnalysisResult {
  const checked = verifyThemeQuotes(result.themes, segments, result.unresolved);
  return { ...result, themes: checked.themes, unresolved: checked.unresolved };
}

const MAX_CHUNK_CHARS = 14000;

function chunkBySize(segments: Array<ParsedSegment & { code: string }>) {
  const chunks: Array<Array<ParsedSegment & { code: string }>> = [];
  let current: Array<ParsedSegment & { code: string }> = [];
  let size = 0;
  for (const seg of segments) {
    const n = seg.body.length + 48;
    if (current.length && size + n > MAX_CHUNK_CHARS) {
      chunks.push(current);
      current = [];
      size = 0;
    }
    current.push(seg);
    size += n;
  }
  if (current.length) chunks.push(current);
  return chunks;
}

export async function analyzeTranscript(input: {
  meta: {
    title: string;
    sessionKind: string;
    sessionDate: string | null;
    industry: string;
    district: string;
    sizeLabel: string;
    projectTitle: string;
  };
  segments: Array<ParsedSegment & { code: string }>;
}): Promise<AnalysisResult> {
  const validCodes = new Set(input.segments.map((s) => s.code));
  const metaBlock = [
    `프로젝트: ${input.meta.projectTitle}`,
    `대상: ${input.meta.title}`,
    `유형: ${input.meta.sessionKind}`,
    `일자: ${input.meta.sessionDate ?? "미기재"}`,
    `업종: ${input.meta.industry || "미기재"}`,
    `지역: ${input.meta.district || "미기재"}`,
    `규모: ${input.meta.sizeLabel || "미기재"}`,
  ].join("\n");

  const isForum = input.meta.sessionKind === "포럼";
  const analysisInstruction = isForum
    ? `다음 포럼 녹취를 심층 분석하여 주제와 회의록(minutes)을 작성하십시오.
[회의록 본문(minutes.body) 작성 필수 규칙 - 한국 공문서 개조식(箇條式) 준수]:
- '**' 마크다운 볼드 구문을 절대 쓰지 마십시오.
- 공문서 글머리기호 체계를 준수하십시오:
  1. 발제 주요 내용
    □ 발표 핵심 주제
      ○ 발언 핵심 요지 (~설명, ~발표)
        - 구체적 근거, 현황 데이터 또는 사례
  2. 토론 핵심 쟁점
    □ 주요 쟁점 사항
      ○ 패널 논의 요지 및 현장 문제의식 (~제기, ~지적)
        - 토론자 의견 및 세부 대안
  3. 시사점 및 과제
    □ 정책적 시사점
      ○ 향후 대응 및 직업능력개발 정책 과제 (~필요, ~도출)
- 모든 문장은 '~함', '~임', '~됨', '~제시' 등 개조식 어미로 간결하게 종결하십시오. quotes.text는 구간 원문 그대로 복사하십시오.`
    : `다음 녹취를 분석하여 주제와 회의록(minutes)을 작성하십시오.
[회의록 본문(minutes.body) 작성 필수 규칙 - 한국 공문서 개조식(箇條式) 준수]:
- '**' 마크다운 볼드 구문을 절대 쓰지 마십시오.
- 공문서 글머리기호 체계를 준수하십시오:
  1. [주제/안건 1]
    □ 핵심 논의 사항
      ○ 주요 발언 및 현황 요지 (~함, ~임)
        - 세부 근거, 현장 애로사항 또는 통계치
  2. [주제/안건 2]
    ...
- 모든 문장은 '~함', '~임', '~됨', '~건의' 등 개조식 어미로 명확하게 종결하십시오. quotes.text는 구간 원문 그대로 복사하십시오.`;

  if (!input.segments || input.segments.length === 0) {
    throw new Error("분석할 대화/발화 구간(세그먼트)이 없습니다. 먼저 녹취를 등록해주세요.");
  }

  const chunks = chunkBySize(input.segments);

  if (chunks.length === 1) {
    const raw = await geminiJson({
      system: SYSTEM,
      schema: ANALYSIS_JSON_SCHEMA,
      user: `${analysisInstruction}\n\n${metaBlock}\n\n녹취:\n${formatSegments(chunks[0] ?? [])}`,
    });
    return applyEvidence(normalizeAnalysis(raw, validCodes), input.segments);
  }

  const partials: unknown[] = [];
  for (const [i, chunk] of chunks.entries()) {
    const raw = await geminiJson({
      system: SYSTEM,
      schema: ANALYSIS_JSON_SCHEMA,
      user: `긴 녹취의 ${i + 1}/${chunks.length} 부분입니다. 이 구간의 주제·사실·인용만 추출하십시오. minutes는 비워 두어도 됩니다. quotes.text는 구간 원문 그대로입니다.\n\n${metaBlock}\n\n녹취:\n${formatSegments(chunk)}`,
    });
    partials.push(raw);
  }

  const mergeInstruction = isForum
    ? `아래는 같은 포럼 녹취를 나눈 부분 분석입니다. 주제를 발제와 토론으로 병합하고 포럼 회의록 초안(minutes.body)을 한국 공문서 개조식(箇條式) 표준(1. 발제 주요 내용 / 2. 토론 핵심 쟁점 / 3. 시사점)으로 작성하십시오. '**' 볼드 기호를 일절 쓰지 말고 1. / □ / ○ / - 기호와 '~함', '~됨' 어미를 사용하십시오. 원문에 없는 내용을 보태지 마십시오. 인용 원문을 바꾸지 마십시오.`
    : `아래는 같은 인터뷰를 나눈 부분 분석입니다. 주제를 중복 없이 병합하고 회의록 초안(minutes.body)을 한국 공문서 개조식(箇條式) 표준으로 작성하십시오. '**' 볼드 기호를 일절 쓰지 말고 1. / □ / ○ / - 기호와 '~함', '~됨' 어미를 사용하십시오. 원문에 없는 내용을 보태지 마십시오. 인용 원문을 바꾸지 마십시오.`;

  const merged = await geminiJson({
    system: SYSTEM,
    schema: ANALYSIS_JSON_SCHEMA,
    user: `${mergeInstruction}\n\n${metaBlock}\n\n부분 분석 JSON:\n${JSON.stringify(partials)}`,
  });
  return applyEvidence(normalizeAnalysis(merged, validCodes), input.segments);
}

/** 다시 쓰기에서 쓸 수 있는 구간 코드: 주제 근거·인용·사실에 나온 코드 */
function rewriteCodes(input: {
  themes: AnalysisResult["themes"];
  facts: AnalysisResult["facts"];
}): Set<string> {
  const codes = new Set<string>();
  for (const t of input.themes) {
    t.sourceSegments.forEach((c) => codes.add(c));
    t.quotes.forEach((q) => q.segmentId && codes.add(q.segmentId));
  }
  input.facts.forEach((f) => f.segmentId && codes.add(f.segmentId));
  return codes;
}

export async function rewriteMinutesFromThemes(input: {
  meta: {
    title: string;
    sessionKind: string;
    sessionDate: string | null;
    projectTitle: string;
  };
  themes: AnalysisResult["themes"];
  facts: AnalysisResult["facts"];
  unresolved: string[];
}): Promise<AnalysisResult["minutes"]> {
  const isForum = input.meta.sessionKind === "포럼";
  const rewriteInstruction = isForum
    ? `검수된 주제 카드를 바탕으로 포럼 전용 회의록 초안을 한국 공문서 개조식(箇條式) 표준으로 작성하십시오. overview, body, followups를 채우되, body는 반드시 다음 공문서 개조식 계층 구조를 따르십시오:
1. 행사 개요
  □ 포럼 개최 배경 및 목적
    ○ 개최 취지 및 주요 논의 방향 (~개최, ~논의)
2. 발제 주요 내용
  □ [발제 주제 1]
    ○ 핵심 발표 요지 (~발표, ~설명)
      - 구체적 근거 및 세부 통계/사례
3. 토론 핵심 쟁점
  □ [토론 쟁점 1]
    ○ 패널별 논의 요지 및 현장 문제의식 (~제기, ~지적)
      - 토론자 의견 및 세부 대안
4. 시사점 및 향후 과제
  □ 정책적 시사점
    ○ 서울시 HRD 및 교육훈련 연계 방안 (~필요, ~제언)

[원칙]:
- '**' 마크다운 볼드 구문을 절대 사용하지 마십시오.
- 문장은 '~함', '~임', '~됨', '~제시' 등 개조식 어미로 깔끔하게 종결하십시오.
- 없는 사실을 날조하지 마십시오.`
    : `검수된 주제 카드를 바탕으로 회의록 초안을 한국 공문서 개조식(箇條式) 표준으로 작성하십시오. overview, body, followups를 채우되, body는 반드시 다음 공문서 개조식 계층 구조를 따르십시오:
1. [첫 번째 주요 안건/주제]
  □ 논의 배경 및 현황
    ○ 인터뷰 대상 기업/기관 현황 및 핵심 발언 요지 (~함, ~임)
      - 현장 애로사항 및 구체적 사실관계
  □ 주요 건의 및 요구사항
    ○ 지원 필요 분야 및 정책 건의 사항 (~요청, ~제안)
2. [두 번째 주요 안건/주제]
  ...

[원칙]:
- '**' 마크다운 볼드 구문을 절대 사용하지 마십시오.
- 문장은 '~함', '~임', '~됨', '~제시' 등 개조식 어미로 깔끔하게 종결하십시오.
- 없는 사실을 날조하지 마십시오.`;

  const raw = await geminiJson({
    system: SYSTEM,
    schema: MINUTES_JSON_SCHEMA,
    user: `${rewriteInstruction}\n\n프로젝트: ${input.meta.projectTitle}\n대상: ${input.meta.title}\n유형: ${input.meta.sessionKind}\n일자: ${input.meta.sessionDate ?? "미기재"}\n\nthemes: ${JSON.stringify(input.themes)}\nfacts: ${JSON.stringify(input.facts)}\nunresolved: ${JSON.stringify(input.unresolved)}`,
  });
  const obj = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const nested =
    obj.minutes && typeof obj.minutes === "object" ? (obj.minutes as Record<string, unknown>) : obj;
  return {
    overview: str(nested.overview),
    body: keepKnownCodes(cleanOfficialDocumentText(str(nested.body)), rewriteCodes(input)),
    followups: asArr(nested.followups).map((x) => str(x)).filter(Boolean),
  };
}
