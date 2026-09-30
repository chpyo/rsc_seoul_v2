import { getGeminiApiKey } from "@/lib/ai/gemini";

export const GEMINI_EMBED_MODEL = "gemini-embedding-2-preview";

/** Gemini embeddings only. Returns null when the API key is missing or the call fails. */
export async function geminiEmbed(
  text: string,
  taskType: "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY",
): Promise<number[] | null> {
  const key = getGeminiApiKey();
  const trimmed = text.trim();
  if (!key || !trimmed) return null;
  const { GoogleGenAI } = await import("@google/genai");
  const ai = new GoogleGenAI({ apiKey: key });
  const res = await ai.models.embedContent({
    model: GEMINI_EMBED_MODEL,
    contents: trimmed.slice(0, 8000),
    config: { taskType },
  });
  const values = res.embeddings?.[0]?.values;
  return Array.isArray(values) ? values.map((n) => Number(n)) : null;
}
