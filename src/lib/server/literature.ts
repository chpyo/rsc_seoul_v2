import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { writerAuthMiddleware } from "@/lib/server/firebase-middleware";
import { analyzeLiterature } from "@/lib/ai/literature/analyze";

function message(err: unknown) {
  return err instanceof Error ? err.message : "문헌 분석 중 오류가 발생했습니다.";
}

/** 붙여넣은 텍스트, 또는 브라우저에서 추출한 DOCX·HWPX·TXT 본문 분석. */
export const analyzeLiteratureHandler = createServerFn({ method: "POST" })
  .middleware([writerAuthMiddleware])
  .validator(
    z.object({
      text: z.string().min(1).max(1_000_000, "텍스트가 너무 깁니다 (최대 100만 자)."),
      focusQuestions: z.string().max(2000).optional(),
    }),
  )
  .handler(async ({ data }) => {
    try {
      const literature = await analyzeLiterature(data);
      return { ok: true as const, literature };
    } catch (err) {
      console.error("[analyzeLiteratureHandler]", err);
      return { ok: false as const, error: message(err), literature: null };
    }
  });

/** prepareGeminiFile 로 올려 둔 PDF 분석. */
export const analyzeLiteratureFile = createServerFn({ method: "POST" })
  .middleware([writerAuthMiddleware])
  .validator(
    z.object({
      file: z.object({
        uri: z.string().url().startsWith("https://generativelanguage.googleapis.com/"),
        mimeType: z.string().min(1).max(100),
      }),
      focusQuestions: z.string().max(2000).optional(),
    }),
  )
  .handler(async ({ data }) => {
    try {
      const literature = await analyzeLiterature({
        focusQuestions: data.focusQuestions,
        fileData: { fileUri: data.file.uri, mimeType: data.file.mimeType },
      });
      return { ok: true as const, literature };
    } catch (err) {
      console.error("[analyzeLiteratureFile]", err);
      return { ok: false as const, error: message(err), literature: null };
    }
  });
