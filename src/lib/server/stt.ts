import fs from "node:fs";
import path from "node:path";
import { createServerFn } from "@tanstack/react-start";
import { firebaseAuthMiddleware } from "@/lib/server/firebase-middleware";
import { geminiTranscribeMedia } from "@/lib/ai/gemini";
import { isOwnedAudioPath, normalizeAudioMime } from "@/lib/audio-path";
import { downloadUserAudio } from "@/lib/server/firebase-admin";

const CHUNKS_BASE_DIR = "/tmp/stt-chunks";

async function cleanupStaleChunks() {
  try {
    if (!fs.existsSync(CHUNKS_BASE_DIR)) return;
    const entries = await fs.promises.readdir(CHUNKS_BASE_DIR, { withFileTypes: true });
    const now = Date.now();
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const full = path.join(CHUNKS_BASE_DIR, entry.name);
        const stat = await fs.promises.stat(full).catch(() => null);
        // Clean up uploads older than 30 minutes
        if (stat && now - stat.mtimeMs > 30 * 60 * 1000) {
          await fs.promises.rm(full, { recursive: true, force: true }).catch(() => undefined);
        }
      }
    }
  } catch {
    /* ignore */
  }
}

export const uploadAudioChunk = createServerFn({ method: "POST" })
  .middleware([firebaseAuthMiddleware])
  .validator((input: unknown) => {
    if (input instanceof FormData) {
      const file = input.get("file");
      if (!file || !(file instanceof Blob)) {
        throw new Error("오디오 청크가 누락되었습니다.");
      }
      const rawUploadId = String(input.get("uploadId") || "");
      const uploadId = rawUploadId.replace(/[^a-zA-Z0-9_-]/g, "") || "default";
      const chunkIndex = parseInt(String(input.get("chunkIndex") || "0"), 10);
      const totalChunks = parseInt(String(input.get("totalChunks") || "1"), 10);
      const filename = (input.get("filename") as string) || "audio.m4a";
      const mimeType = (input.get("mimeType") as string) || file.type || "audio/mp4";
      return { file, uploadId, chunkIndex, totalChunks, filename, mimeType };
    }
    throw new Error("오디오 데이터 형식이 올바르지 않습니다.");
  })
  .handler(async ({ data }) => {
    void cleanupStaleChunks();
    const { file, uploadId, chunkIndex, totalChunks, filename, mimeType } = data;
    const normalizedMime = normalizeAudioMime(mimeType, filename);

    // If only a single chunk (file is already small < 5MB), process in-memory directly
    if (totalChunks === 1 && chunkIndex === 0) {
      try {
        const buf = Buffer.from(await file.arrayBuffer());
        const blob = new Blob([buf], { type: normalizedMime });
        const text = await geminiTranscribeMedia({ blob, mimeType: normalizedMime });
        return { ok: true as const, done: true as const, text };
      } catch (err) {
        const message = err instanceof Error ? err.message : "음성 인식에 실패했습니다.";
        return { ok: false as const, done: true as const, error: message };
      }
    }

    const uploadDir = path.join(CHUNKS_BASE_DIR, uploadId);

    try {
      await fs.promises.mkdir(uploadDir, { recursive: true });
      const chunkBuf = Buffer.from(await file.arrayBuffer());
      const chunkFile = path.join(uploadDir, `chunk_${chunkIndex}`);
      await fs.promises.writeFile(chunkFile, chunkBuf);

      // Not the final chunk yet
      if (chunkIndex < totalChunks - 1) {
        return {
          ok: true as const,
          done: false as const,
          chunkIndex,
          totalChunks,
        };
      }

      // Final chunk reached: check all chunks exist and assemble
      const chunkBuffers: Buffer[] = [];
      for (let i = 0; i < totalChunks; i++) {
        const p = path.join(uploadDir, `chunk_${i}`);
        if (!fs.existsSync(p)) {
          throw new Error(`청크 ${i + 1}/${totalChunks}가 누락되었습니다. 다시 시도해 주세요.`);
        }
        chunkBuffers.push(await fs.promises.readFile(p));
      }

      const mergedBuffer = Buffer.concat(chunkBuffers);
      const completeBlob = new Blob([mergedBuffer], { type: normalizedMime });

      const text = await geminiTranscribeMedia({ blob: completeBlob, mimeType: normalizedMime });

      // Clean up after successful transcription
      await fs.promises.rm(uploadDir, { recursive: true, force: true }).catch(() => undefined);

      return {
        ok: true as const,
        done: true as const,
        text,
      };
    } catch (err) {
      if (chunkIndex === totalChunks - 1) {
        await fs.promises.rm(uploadDir, { recursive: true, force: true }).catch(() => undefined);
      }
      const message = err instanceof Error ? err.message : "음성 인식에 실패했습니다.";
      return { ok: false as const, done: true as const, error: message };
    }
  });

export const transcribeAudio = createServerFn({ method: "POST" })
  .middleware([firebaseAuthMiddleware])
  .validator((input: unknown) => {
    if (input instanceof FormData) {
      const file = input.get("file");
      if (!file || !(file instanceof Blob)) {
        throw new Error("오디오 파일이 누락되었습니다.");
      }
      const filename =
        (input.get("filename") as string) || (file instanceof File ? file.name : "audio.webm");
      const mimeType = (input.get("mimeType") as string) || file.type || "audio/webm";
      const storagePath = (input.get("storagePath") as string) || "";
      return { file, mimeType, filename, storagePath };
    }
    if (typeof input === "object" && input !== null) {
      const obj = input as Record<string, unknown>;
      return {
        file: obj.file instanceof Blob ? obj.file : undefined,
        mimeType: String(obj.mimeType ?? "audio/webm"),
        filename: String(obj.filename ?? ""),
        storagePath: String(obj.storagePath ?? ""),
      };
    }
    throw new Error("오디오 데이터 형식이 올바르지 않습니다.");
  })
  .handler(async ({ data, context }) => {
    try {
      let blob: Blob | null = data.file ?? null;
      const mimeType = normalizeAudioMime(data.mimeType, data.filename);

      if (!blob && data.storagePath) {
        const uid = context.userId;
        if (!isOwnedAudioPath(uid, data.storagePath)) {
          return { ok: false as const, error: "오디오 경로가 올바르지 않습니다." };
        }
        const bytes = await downloadUserAudio(data.storagePath);
        const copy = new Uint8Array(bytes.byteLength);
        copy.set(bytes);
        blob = new Blob([copy], { type: mimeType });
      }

      if (!blob) {
        return { ok: false as const, error: "전사할 오디오 파일이 없습니다." };
      }

      const text = await geminiTranscribeMedia({ blob, mimeType });
      return { ok: true as const, text };
    } catch (err) {
      const message = err instanceof Error ? err.message : "음성 인식에 실패했습니다.";
      return { ok: false as const, error: message };
    }
  });

