export const GEMINI_TEXT_MODEL = "gemini-3.6-flash";
export const GEMINI_STT_MODEL = "gemini-3.6-flash";

export function getGeminiApiKey(): string {
  if (typeof process === "undefined" || !process.env) return "";
  return (
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_GENAI_API_KEY ||
    process.env.GOOGLE_API_KEY ||
    ""
  );
}

export function isGeminiKeyError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err ?? "");
  return /API 키|api key|GEMINI_API_KEY|API_KEY_INVALID|PERMISSION_DENIED|blocked/i.test(message);
}

export function parseJsonContent(text: string): unknown {
  const trimmed = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```$/i, "")
    .trim();
  return JSON.parse(trimmed) as unknown;
}

type GenerateInput = {
  system?: string;
  user?: string;
  temperature?: number;
  json?: boolean;
  schema?: { [key: string]: unknown };
  model?: string;
  inlineData?: { mimeType: string; data: string };
  fileData?: { fileUri: string; mimeType: string };
};

async function generateViaApiKey(input: GenerateInput): Promise<string> {
  const key = getGeminiApiKey();
  if (!key)
    throw new Error("Gemini API 키가 없습니다. 백엔드 환경 변수(GEMINI_API_KEY)를 설정하세요.");
  const { GoogleGenAI } = await import("@google/genai");
  const ai = new GoogleGenAI({ apiKey: key });
  const parts: Array<
    | { text: string }
    | { inlineData: { mimeType: string; data: string } }
    | { fileData: { fileUri: string; mimeType: string } }
  > = [];
  if (input.fileData) {
    parts.push({ fileData: input.fileData });
  }
  if (input.inlineData) {
    parts.push({ inlineData: input.inlineData });
  }
  if (input.user) parts.push({ text: input.user });

  const candidateModels = [
    input.model || GEMINI_TEXT_MODEL,
    "gemini-3.6-flash",
    "gemini-3.5-flash-lite",
    "gemini-3.8-flash",
  ].filter((m, idx, arr) => arr.indexOf(m) === idx);

  let lastError: unknown = null;

  for (const model of candidateModels) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await ai.models.generateContent({
          model,
          contents: [{ role: "user", parts }],
          config: {
            systemInstruction: input.system || undefined,
            temperature: input.temperature ?? 0.2,
            ...(input.json
              ? {
                  responseMimeType: "application/json" as const,
                  ...(input.schema ? { responseJsonSchema: input.schema } : {}),
                }
              : {}),
          },
        });
        const content = res.text?.trim();
        if (content) return content;
      } catch (err) {
        lastError = err;
        const msg = err instanceof Error ? err.message : String(err ?? "");
        const isTransient =
          msg.includes("503") ||
          msg.includes("high demand") ||
          msg.includes("UNAVAILABLE") ||
          msg.includes("429") ||
          msg.includes("RESOURCE_EXHAUSTED");
        if (!isTransient) break;
        await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
      }
    }
  }

  if (lastError) throw lastError;
  throw new Error("Gemini 응답이 비어 있습니다.");
}

async function generate(input: GenerateInput): Promise<string> {
  if (typeof window !== "undefined") {
    throw new Error("보안을 위해 AI 요청은 백엔드 프록시를 통해서만 수행되어야 합니다.");
  }
  return await generateViaApiKey(input);
}

export async function geminiJson(input: {
  system?: string;
  user?: string;
  model?: string;
  temperature?: number;
  schema?: { [key: string]: unknown };
  inlineData?: { mimeType: string; data: string };
  fileData?: { fileUri: string; mimeType: string };
}): Promise<unknown> {
  const run = async () =>
    parseJsonContent(await generate({ ...input, json: true, schema: input.schema }));
  try {
    return await run();
  } catch (err) {
    if (err instanceof SyntaxError) return await run();
    throw err;
  }
}

export async function geminiText(input: {
  system?: string;
  user: string;
  model?: string;
  temperature?: number;
}): Promise<string> {
  return generate({ ...input, json: false, temperature: input.temperature ?? 0.3 });
}

// ---------- Gemini Files API (대용량 음성·PDF) ----------

export type GeminiFileRef = { name: string; uri: string; mimeType: string };

async function filesClient() {
  const key = getGeminiApiKey();
  if (!key)
    throw new Error("Gemini API 키가 없습니다. 백엔드 환경 변수(GEMINI_API_KEY)를 설정하세요.");
  const { GoogleGenAI } = await import("@google/genai");
  return new GoogleGenAI({ apiKey: key });
}

/** 파일을 Gemini Files API 에 올리고 ACTIVE 가 될 때까지 기다린다. 파일은 48시간 뒤 자동 삭제된다. */
export async function uploadGeminiFile(
  bytes: Uint8Array,
  mimeType: string,
  displayName?: string,
): Promise<GeminiFileRef> {
  const ai = await filesClient();
  const blob = new Blob([bytes as BlobPart], { type: mimeType });
  let file = await ai.files.upload({ file: blob, config: { mimeType, displayName } });
  const name = file.name;
  if (!name) throw new Error("Gemini 파일 업로드에 실패했습니다.");
  for (let i = 0; i < 80 && String(file.state ?? "") !== "ACTIVE"; i++) {
    if (String(file.state ?? "") === "FAILED")
      throw new Error("Gemini가 파일을 처리하지 못했습니다.");
    await new Promise((r) => setTimeout(r, 1500));
    file = await ai.files.get({ name });
  }
  if (String(file.state ?? "") !== "ACTIVE" || !file.uri) {
    throw new Error("Gemini 파일 처리가 너무 오래 걸립니다. 잠시 후 다시 시도해 주세요.");
  }
  return { name, uri: file.uri, mimeType: file.mimeType || mimeType };
}

export async function deleteGeminiFile(name: string): Promise<void> {
  const ai = await filesClient();
  await ai.files.delete({ name }).catch(() => undefined);
}

function clock(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  return [h, m, r].map((n) => String(n).padStart(2, "0")).join(":");
}

/**
 * 올려 둔 음성 파일의 한 구간을 전사한다.
 * 구간은 "발화 시작 시각" 기준으로 나눈다: startSec 이상에서 시작해 endSec 전에 시작한 발화까지.
 * 앞 구간 끝부분(previousTail)을 넘겨 화자 표기를 이어서 쓰게 한다.
 */
export async function transcribeGeminiFileRange(input: {
  file: { uri: string; mimeType: string };
  startSec?: number | null;
  endSec?: number | null;
  previousTail?: string;
}): Promise<string> {
  const ranged = input.startSec != null && input.endSec != null;
  const lines = [
    "당신은 전문 전사(Transcription) AI입니다. 제공된 오디오를 빠짐없이 글로 옮기세요.",
    "화자를 구분하고(예: 화자1, 화자2) 발화 시작 시각을 녹음 시작 기준 HH:MM:SS 로 적어",
    '"[화자1] 00:00:15\n발화내용" 형식으로 작성하세요. 설명이나 머리말은 넣지 마세요.',
  ];
  if (ranged) {
    lines.push(
      "",
      `이번에는 녹음 중 ${clock(input.startSec!)} 이상에서 시작하는 발화부터 ${clock(input.endSec!)} 전에 시작하는 발화까지만 전사하세요.`,
      "마지막 발화는 끝 시각을 넘더라도 끝까지 적으세요. 범위 밖 발화는 적지 마세요.",
      "시각은 이 구간이 아니라 녹음 전체의 시작을 기준으로 적으세요.",
      "이 범위에서 녹음이 끝나면 전사 마지막 줄에 [[END]] 를 적으세요. 범위에 발화가 하나도 없으면 [[END]] 만 적으세요.",
    );
  }
  if (input.previousTail?.trim()) {
    lines.push(
      "",
      "바로 앞 구간 전사의 끝부분입니다. 같은 사람에게는 같은 화자 표기를 계속 쓰고, 이 내용을 다시 적지 마세요.",
      "---",
      input.previousTail.trim(),
      "---",
    );
  }
  return generate({
    model: GEMINI_STT_MODEL,
    user: lines.join("\n"),
    fileData: { fileUri: input.file.uri, mimeType: input.file.mimeType },
    temperature: 0.1,
  });
}

export async function* geminiStreamText(input: {
  system?: string;
  user: string;
  model?: string;
  temperature?: number;
}): AsyncGenerator<string, void, unknown> {
  const model = input.model || GEMINI_TEXT_MODEL;
  const temperature = input.temperature ?? 0.3;
  const parts = [{ text: input.user }];

  if (typeof window !== "undefined") {
    throw new Error("보안을 위해 AI 요청은 백엔드 프록시를 통해서만 수행되어야 합니다.");
  }

  const { GoogleGenAI } = await import("@google/genai");
  const key = getGeminiApiKey();
  if (!key)
    throw new Error("Gemini API 키가 없습니다. 백엔드 환경 변수(GEMINI_API_KEY)를 설정하세요.");

  const ai = new GoogleGenAI({ apiKey: key });
  const res = await ai.models.generateContentStream({
    model,
    contents: [{ role: "user", parts }],
    config: {
      systemInstruction: input.system || undefined,
      temperature,
    },
  });

  for await (const chunk of res) {
    if (chunk.text) yield chunk.text;
  }
}
