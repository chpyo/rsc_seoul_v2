import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { writerAuthMiddleware } from "@/lib/server/firebase-middleware";

/**
 * 대용량 파일(음성·PDF) 처리.
 *
 * Vercel 함수는 요청 본문 4.5MB, 실행 300초(Hobby) 제한이 있으므로 파일을 직접 받지 않는다.
 *   1) 브라우저가 Firebase Storage 에 올린다.
 *   2) prepareGeminiFile: 서버가 사용자 권한으로 Storage 에서 받아 Gemini Files API 에 올린다.
 *   3) transcribeRange / analyzeLiteratureFile: 올려 둔 파일을 참조해 짧은 호출로 나눠 처리한다.
 *   4) releaseGeminiFile: Gemini 쪽 파일을 지운다(안 지워도 48시간 뒤 자동 삭제).
 */

// users/{uid}/audio/{id}/{name} 또는 users/{uid}/literature/{id}/{name}
const STORAGE_PATH = /^users\/[^/]+\/(audio|literature)\/[^/]+\/[^/]+$/;

const prepareInput = z.object({
  storagePath: z.string().regex(STORAGE_PATH, "허용되지 않은 파일 경로입니다."),
  mimeType: z.string().min(1).max(100),
});

export const prepareGeminiFile = createServerFn({ method: "POST" })
  .middleware([writerAuthMiddleware])
  .validator(prepareInput)
  .handler(async ({ data, context }) => {
    const { downloadStorageObject } = await import("@/lib/server/storage.server");
    const { uploadGeminiFile } = await import("@/lib/ai/gemini");
    // 접근 권한은 storage.rules 가 사용자 토큰으로 판단한다.
    const bytes = await downloadStorageObject(data.storagePath, context.idToken);
    const file = await uploadGeminiFile(bytes, data.mimeType, data.storagePath.split("/").pop());
    return { ...file, sizeBytes: bytes.byteLength };
  });

const fileRef = z.object({
  uri: z.string().url().startsWith("https://generativelanguage.googleapis.com/"),
  mimeType: z.string().min(1).max(100),
});

export const transcribeRange = createServerFn({ method: "POST" })
  .middleware([writerAuthMiddleware])
  .validator(
    z.object({
      file: fileRef,
      startSec: z.number().min(0).nullable(),
      endSec: z.number().positive().nullable(),
      previousTail: z.string().max(4000).optional(),
    }),
  )
  .handler(async ({ data }) => {
    const { transcribeGeminiFileRange } = await import("@/lib/ai/gemini");
    const text = await transcribeGeminiFileRange(data);
    return { text };
  });

export const releaseGeminiFile = createServerFn({ method: "POST" })
  .middleware([writerAuthMiddleware])
  .validator(z.object({ name: z.string().regex(/^files\/[A-Za-z0-9_-]+$/) }))
  .handler(async ({ data }) => {
    const { deleteGeminiFile } = await import("@/lib/ai/gemini");
    await deleteGeminiFile(data.name);
    return { ok: true as const };
  });
