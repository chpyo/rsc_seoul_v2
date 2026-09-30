import { getGeminiApiKey } from "@/lib/ai/gemini";
import { EMBED_BATCH, EMBED_DIM } from "@/lib/search/chunking";

export const GEMINI_EMBED_MODEL = "gemini-embedding-2-preview";

type TaskType = "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY";

/**
 * 여러 텍스트를 한 번에 임베딩한다 (최대 EMBED_BATCH 개, EMBED_DIM 차원).
 * API 키가 없으면 예외.
 */
export async function geminiEmbedMany(
  texts: string[],
  taskType: TaskType,
  title?: string,
): Promise<number[][]> {
  const key = getGeminiApiKey();
  if (!key) throw new Error("Gemini API 키가 없습니다. 백엔드 환경 변수(GEMINI_API_KEY)를 설정하세요.");
  if (texts.length === 0) return [];
  if (texts.length > EMBED_BATCH) throw new Error(`한 번에 ${EMBED_BATCH}개까지 임베딩할 수 있습니다.`);
  const { GoogleGenAI } = await import("@google/genai");
  const ai = new GoogleGenAI({ apiKey: key });
  const res = await ai.models.embedContent({
    model: GEMINI_EMBED_MODEL,
    contents: texts.map((t) => t.trim().slice(0, 8000) || " "),
    config: {
      taskType,
      outputDimensionality: EMBED_DIM,
      ...(title && taskType === "RETRIEVAL_DOCUMENT" ? { title } : {}),
    },
  });
  const out = (res.embeddings ?? []).map((e) => (e.values ?? []).map((n) => Number(n)));
  if (out.length !== texts.length || out.some((v) => v.length !== EMBED_DIM)) {
    throw new Error("임베딩 결과가 올바르지 않습니다.");
  }
  return out;
}

/** 텍스트 하나 임베딩. 키가 없거나 실패하면 null. */
export async function geminiEmbed(text: string, taskType: TaskType): Promise<number[] | null> {
  if (!text.trim() || !getGeminiApiKey()) return null;
  try {
    const [v] = await geminiEmbedMany([text], taskType);
    return v ?? null;
  } catch {
    return null;
  }
}
