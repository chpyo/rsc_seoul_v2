import {
  deleteObject,
  getBytes,
  getDownloadURL,
  ref,
  uploadBytesResumable,
} from "firebase/storage";
import { audioStoragePath, normalizeAudioMime, safeAudioFilename } from "./audio-path";
import { storage } from "./firebase";
import type { SessionAudio } from "./types";
import { newId } from "./utils";

export {
  AUDIO_INLINE_MAX_BYTES,
  audioStoragePath,
  formatAudioBytes,
  formatDurationSec,
  isOwnedAudioPath,
  normalizeAudioMime,
  safeAudioFilename,
} from "./audio-path";

export async function uploadUserAudio(
  uid: string,
  file: Blob,
  filename: string,
  extra?: { durationSec?: number | null; onProgress?: (pct: number) => void },
): Promise<SessionAudio> {
  const audioId = newId("aud");
  const safeName = safeAudioFilename(filename);
  const storagePath = audioStoragePath(uid, audioId, safeName);
  const mimeType = normalizeAudioMime(file.type);
  const storageRef = ref(storage, storagePath);

  await new Promise<void>((resolve, reject) => {
    const task = uploadBytesResumable(storageRef, file, { contentType: mimeType });
    task.on(
      "state_changed",
      (snap) => {
        if (!snap.totalBytes) return;
        extra?.onProgress?.(Math.round((snap.bytesTransferred / snap.totalBytes) * 100));
      },
      reject,
      () => resolve(),
    );
  });

  return {
    storagePath,
    mimeType,
    filename: safeName,
    sizeBytes: file.size,
    durationSec: extra?.durationSec ?? null,
  };
}

export async function getAudioDownloadUrl(path: string): Promise<string> {
  return getDownloadURL(ref(storage, path));
}

export async function getAudioBlob(path: string, mimeType: string): Promise<Blob> {
  const bytes = await getBytes(ref(storage, path));
  return new Blob([bytes], { type: normalizeAudioMime(mimeType) });
}

export async function deleteUserAudio(path: string): Promise<void> {
  try {
    await deleteObject(ref(storage, path));
  } catch (err) {
    const code = typeof err === "object" && err && "code" in err ? String((err as { code: string }).code) : "";
    if (code === "storage/object-not-found") return;
    throw err;
  }
}
