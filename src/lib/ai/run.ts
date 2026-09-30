import { analyzeTranscript, rewriteMinutesFromThemes } from "@/lib/ai/analyze";
import { chatWithConfirmedCases } from "@/lib/ai/chat";
import { synthesizeProject } from "@/lib/ai/cross";
import {
  analyzeSession,
  askProjectAssistant,
  generateCrossSummary,
  rewriteMinutes,
} from "@/lib/server/sessions";
import type { RelatedCase } from "@/lib/types";
import { prepareGeminiFile, releaseGeminiFile, transcribeRange } from "@/lib/server/media";
import type { CrossSummary } from "@/lib/types";

function failMessage(err: unknown, fallback: string) {
  let msg = "";
  if (typeof err === "string") {
    msg = err;
  } else if (err instanceof Error) {
    msg = err.message;
  } else if (err && typeof err === "object") {
    const o = err as Record<string, unknown>;
    if (typeof o.error === "string") msg = o.error;
    else if (typeof o.message === "string") msg = o.message;
    else if (o.error && typeof o.error === "object") {
      const inner = o.error as Record<string, unknown>;
      if (typeof inner.message === "string") msg = inner.message;
    }
  }
  msg = msg.trim();
  try {
    const parsed = JSON.parse(msg);
    if (parsed?.error?.message) {
      msg = parsed.error.message;
    }
  } catch {
    // not json
  }

  if (
    msg.includes("prepayment credits are depleted") ||
    msg.includes("credits are depleted") ||
    msg.includes("billing#prepay")
  ) {
    return "Google AI Studio API 크레딧(Prepayment credits)이 모두 소진되었습니다. AI Studio 프로젝트 설정(https://ai.studio/projects)에서 결제 수단 또는 크레딧 잔액을 확인해 주세요.";
  }
  if (msg.includes("no longer available to new users")) {
    return "해당 Gemini AI 모델이 Google API에서 지원 종료되었습니다. 최신 모델(Gemini 3.5 Flash-Lite / 3.8 Flash)로 전환되었습니다. 다시 시도해 주세요.";
  }
  if (
    msg.includes("503") ||
    msg.includes("high demand") ||
    msg.includes("UNAVAILABLE") ||
    msg.includes("Spikes in demand")
  ) {
    return "Gemini AI 모델 서버가 일시적인 이용량 급증(503) 상태입니다. 잠시 후 다시 시도해 주세요.";
  }
  if (msg.includes("429") || msg.includes("RESOURCE_EXHAUSTED") || msg.includes("quota")) {
    return "API 요청 한도(429 Quota Exceeded)에 도달했습니다. 잠시 후 다시 시도해 주세요.";
  }
  if (msg.includes("413") || msg.includes("Request Entity Too Large")) {
    return "파일 또는 데이터 크기가 네트워크 전송 한도를 초과했습니다. 다시 시도해 주세요.";
  }
  if (
    msg.includes("Unauthorized") ||
    msg.includes("missing authentication token") ||
    msg.includes("invalid token") ||
    msg.includes("auth/id-token-expired")
  ) {
    return "로그인 세션이 만료되었거나 인증 정보를 확인하지 못했습니다. 페이지를 새로고침하거나 다시 로그인 후 시도해 주세요.";
  }
  if (msg.includes("<html") || msg.includes("<!DOCTYPE") || msg.includes("<title>")) {
    return "서버 통신 중 일시적인 오류가 발생했습니다. 다시 시도해 주세요.";
  }
  return msg || fallback;
}

function extractSessionAnalysis(data: any): any {
  if (!data || typeof data !== "object") return null;
  if (Array.isArray(data.themes) || data.headline || data.minutes) return data;
  if (data.analysis && typeof data.analysis === "object") {
    const nested = extractSessionAnalysis(data.analysis);
    if (nested) return nested;
  }
  if (data.result && typeof data.result === "object") {
    const nested = extractSessionAnalysis(data.result);
    if (nested) return nested;
  }
  return null;
}

export async function runAnalyzeSession(payload: Parameters<typeof analyzeTranscript>[0]) {
  try {
    const res = (await analyzeSession({ data: payload })) as any;
    if (!res || typeof res !== "object") {
      return {
        ok: false as const,
        error: "분석 서버 응답이 비었습니다. 잠시 후 다시 시도해 주세요.",
      };
    }
    const analysisData = extractSessionAnalysis(res);
    if (analysisData) {
      return { ok: true as const, result: analysisData };
    }
    if (res.ok === false || res.error) {
      return { ok: false as const, error: failMessage(res.error, "분석 중 오류가 발생했습니다.") };
    }
    return {
      ok: false as const,
      error: "AI 분석 결과 형식이 올바르지 않습니다. 다시 시도해 주세요.",
    };
  } catch (err) {
    return { ok: false as const, error: failMessage(err, "분석 중 오류가 발생했습니다.") };
  }
}

export async function runRewriteMinutes(payload: Parameters<typeof rewriteMinutesFromThemes>[0]) {
  try {
    const res = await rewriteMinutes({ data: payload });
    if (!res.ok) {
      return { ok: false as const, error: failMessage(res.error, "회의록 생성 실패") };
    }
    return res;
  } catch (err) {
    return { ok: false as const, error: failMessage(err, "회의록 생성 실패") };
  }
}

export async function runCrossSummary(payload: Parameters<typeof synthesizeProject>[0]) {
  try {
    const res = await generateCrossSummary({ data: payload });
    if (!res.ok) {
      return {
        ok: false as const,
        error: failMessage(res.error, "교차 요약에 실패했습니다."),
        summary: null as CrossSummary | null,
      };
    }
    return res;
  } catch (err) {
    return {
      ok: false as const,
      error: failMessage(err, "교차 요약에 실패했습니다."),
      summary: null as CrossSummary | null,
    };
  }
}

export async function runProjectAssistant(
  payload: Parameters<typeof chatWithConfirmedCases>[0],
): Promise<
  | { ok: true; answer: string; relatedCases: RelatedCase[] }
  | { ok: false; error: string; answer: string; relatedCases: RelatedCase[] }
> {
  const empty = { answer: "", relatedCases: [] as RelatedCase[] };
  try {
    const res = await askProjectAssistant({ data: payload });
    if (res.ok) return res;
    return { ok: false as const, error: res.error, ...empty };
  } catch (err) {
    return { ok: false as const, error: failMessage(err, "답변 생성 실패"), ...empty };
  }
}

/** 음성 전사 한 번에 처리하는 길이(초). Vercel 함수 300초 안에 끝나도록 잡는다. */
export const TRANSCRIBE_PART_SEC = 15 * 60;
/** 길이를 모를 때 최대 몇 구간까지 이어서 전사할지 (15분 × 24 = 6시간). */
const MAX_PARTS_UNKNOWN = 24;
const END_MARKER = "[[END]]";

export type TranscribeProgress = {
  stage: "preparing" | "transcribing";
  part: number;
  totalParts: number | null;
};

async function withRetry<T>(fn: () => Promise<T>, attempts = 2): Promise<T> {
  let last: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      last = err;
      if (i < attempts - 1) await new Promise((r) => setTimeout(r, 2000));
    }
  }
  throw last;
}

/**
 * Storage 에 올라간 음성을 전사한다.
 * 서버가 파일을 Gemini 에 한 번 올린 뒤, 15분 단위로 나눠 차례로 전사하고 이어 붙인다.
 */
export async function runTranscribeAudio(
  payload: { storagePath: string; mimeType: string; durationSec?: number | null },
  onProgress?: (p: TranscribeProgress) => void,
): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  let fileName: string | null = null;
  try {
    onProgress?.({ stage: "preparing", part: 0, totalParts: null });
    const file = await prepareGeminiFile({
      data: { storagePath: payload.storagePath, mimeType: payload.mimeType },
    });
    fileName = file.name;

    const duration = payload.durationSec && payload.durationSec > 0 ? payload.durationSec : null;
    const knownParts = duration ? Math.max(1, Math.ceil(duration / TRANSCRIBE_PART_SEC)) : null;
    const texts: string[] = [];

    if (knownParts === 1) {
      onProgress?.({ stage: "transcribing", part: 1, totalParts: 1 });
      const res = await withRetry(() =>
        transcribeRange({ data: { file, startSec: null, endSec: null } }),
      );
      texts.push(res.text.replace(END_MARKER, "").trim());
    } else {
      const limit = knownParts ?? MAX_PARTS_UNKNOWN;
      for (let i = 0; i < limit; i++) {
        onProgress?.({ stage: "transcribing", part: i + 1, totalParts: knownParts });
        const previousTail = texts.length ? texts[texts.length - 1].slice(-1500) : undefined;
        const res = await withRetry(() =>
          transcribeRange({
            data: {
              file,
              startSec: i * TRANSCRIBE_PART_SEC,
              endSec: (i + 1) * TRANSCRIBE_PART_SEC,
              previousTail,
            },
          }),
        );
        const reachedEnd = res.text.includes(END_MARKER);
        const text = res.text.replace(END_MARKER, "").trim();
        if (text) texts.push(text);
        if (reachedEnd || (!knownParts && !text)) break;
      }
    }

    const text = texts.join("\n\n").trim();
    if (!text) return { ok: false, error: "음성에서 전사할 내용을 찾지 못했습니다." };
    return { ok: true, text };
  } catch (err) {
    return { ok: false, error: failMessage(err, "음성 인식에 실패했습니다.") };
  } finally {
    if (fileName) void releaseGeminiFile({ data: { name: fileName } }).catch(() => undefined);
  }
}
