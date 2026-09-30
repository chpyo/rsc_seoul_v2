import { analyzeTranscript, rewriteMinutesFromThemes } from "@/lib/ai/analyze";
import { chatWithConfirmedCases } from "@/lib/ai/chat";
import { synthesizeProject } from "@/lib/ai/cross";
import { embedText } from "@/lib/server/embed";
import {
  analyzeSession,
  askProjectAssistant,
  generateCrossSummary,
  rewriteMinutes,
} from "@/lib/server/sessions";
import type { RelatedCase } from "@/lib/types";
import { transcribeAudio, uploadAudioChunk } from "@/lib/server/stt";
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
    return { ok: false as const, error: "AI 분석 결과 형식이 올바르지 않습니다. 다시 시도해 주세요." };
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

export async function runEmbedText(
  text: string,
  taskType: "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY",
): Promise<number[] | null> {
  try {
    const res = await embedText({ data: { text, taskType } });
    if (res.embedding) return res.embedding;
    return null;
  } catch (err) {
    return null;
  }
}

export async function runProjectAssistant(payload: Parameters<typeof chatWithConfirmedCases>[0]): Promise<
  { ok: true; answer: string; relatedCases: RelatedCase[] } | { ok: false; error: string; answer: string; relatedCases: RelatedCase[] }
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

export async function runTranscribeAudio(
  payload: {
    blob: Blob;
    mimeType: string;
    filename?: string;
    storagePath?: string;
  },
  onProgress?: (pct: number, stage: "uploading" | "transcribing") => void,
) {
  try {
    const { blob, mimeType, filename } = payload;
    const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB chunks (Cloud Run limit is 32MB)
    const totalBytes = blob.size;
    const totalChunks = Math.max(1, Math.ceil(totalBytes / CHUNK_SIZE));
    const uploadId = `stt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
      const start = chunkIndex * CHUNK_SIZE;
      const end = Math.min(totalBytes, start + CHUNK_SIZE);
      const chunkBlob = blob.slice(start, end, mimeType);

      const pct = Math.round(((chunkIndex + 1) / totalChunks) * 90);
      onProgress?.(pct, chunkIndex === totalChunks - 1 ? "transcribing" : "uploading");

      const formData = new FormData();
      formData.append("file", chunkBlob, filename || "audio.m4a");
      formData.append("uploadId", uploadId);
      formData.append("chunkIndex", String(chunkIndex));
      formData.append("totalChunks", String(totalChunks));
      formData.append("filename", filename || "audio.m4a");
      formData.append("mimeType", mimeType);

      let res: { ok: boolean; done: boolean; text?: string; error?: string } | null = null;
      let attempts = 0;
      while (attempts < 3) {
        try {
          res = (await uploadAudioChunk({ data: formData })) as any;
          break;
        } catch (postErr) {
          attempts++;
          if (attempts >= 3) throw postErr;
          await new Promise((r) => setTimeout(r, 1000));
        }
      }

      if (!res || !res.ok) {
        return {
          ok: false as const,
          error: res?.error ? failMessage(res.error, "음성 인식에 실패했습니다.") : "오디오 전송에 실패했습니다.",
        };
      }

      if (res.done) {
        onProgress?.(100, "transcribing");
        return { ok: true as const, text: res.text || "" };
      }
    }

    return { ok: false as const, error: "음성 전사 결과를 수신하지 못했습니다." };
  } catch (err) {
    return { ok: false as const, error: failMessage(err, "음성 인식에 실패했습니다.") };
  }
}
