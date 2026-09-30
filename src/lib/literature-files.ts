import { deleteObject, getDownloadURL, ref, uploadBytesResumable } from "firebase/storage";
import { storage } from "./firebase";
import { newId } from "./utils";

/** 문헌 원본(PDF) 최대 크기. storage.rules 와 같게 유지한다. */
export const MAX_LITERATURE_FILE_BYTES = 50 * 1024 * 1024;

export type StoredLiteratureFile = {
  storagePath: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
};

function safeName(name: string): string {
  return (name.trim() || "document.pdf").replace(/[/\\?%*:|"<>]/g, "_").slice(0, 120);
}

export async function uploadLiteratureFile(
  uid: string,
  file: File,
  onProgress?: (pct: number) => void,
): Promise<StoredLiteratureFile> {
  if (file.size >= MAX_LITERATURE_FILE_BYTES) {
    throw new Error("문헌 파일은 50MB보다 작아야 합니다.");
  }
  const filename = safeName(file.name);
  const mimeType = file.type || "application/pdf";
  const storagePath = `users/${uid}/literature/${newId("lit")}/${filename}`;
  await new Promise<void>((resolve, reject) => {
    const task = uploadBytesResumable(ref(storage, storagePath), file, { contentType: mimeType });
    task.on(
      "state_changed",
      (snap) => {
        if (snap.totalBytes)
          onProgress?.(Math.round((snap.bytesTransferred / snap.totalBytes) * 100));
      },
      reject,
      () => resolve(),
    );
  });
  return { storagePath, filename, mimeType, sizeBytes: file.size };
}

export function getLiteratureFileUrl(storagePath: string): Promise<string> {
  return getDownloadURL(ref(storage, storagePath));
}

export async function deleteLiteratureFile(storagePath: string): Promise<void> {
  try {
    await deleteObject(ref(storage, storagePath));
  } catch (err) {
    const code =
      typeof err === "object" && err && "code" in err ? String((err as { code: string }).code) : "";
    if (code !== "storage/object-not-found") throw err;
  }
}
