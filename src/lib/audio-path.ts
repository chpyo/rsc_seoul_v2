export function normalizeAudioMime(mime: string, filename?: string): string {
  if (filename) {
    const ext = filename.split(".").pop()?.toLowerCase();
    if (ext === "m4a") return "audio/mp4";
    if (ext === "mp3") return "audio/mpeg";
    if (ext === "wav") return "audio/wav";
    if (ext === "webm") return "audio/webm";
    if (ext === "aac") return "audio/aac";
    if (ext === "ogg" || ext === "opus") return "audio/ogg";
    if (ext === "flac") return "audio/flac";
  }
  const base = (mime || "audio/webm").split(";")[0]!.trim().toLowerCase();
  if (base === "audio/mp3") return "audio/mpeg";
  if (base === "audio/x-m4a" || base === "audio/m4a") return "audio/mp4";
  if (base === "audio/x-wav") return "audio/wav";
  return base || "audio/webm";
}

export function safeAudioFilename(name: string): string {
  const trimmed = name.trim() || "recording.webm";
  return trimmed.replace(/[/\\?%*:|"<>]/g, "_").slice(0, 120);
}

export function audioStoragePath(uid: string, audioId: string, filename: string): string {
  return `users/${uid}/audio/${audioId}/${safeAudioFilename(filename)}`;
}

export function isOwnedAudioPath(uid: string, path: string): boolean {
  const prefix = `users/${uid}/audio/`;
  if (!path.startsWith(prefix) || path.includes("..")) return false;
  const rest = path.slice(prefix.length);
  const parts = rest.split("/");
  return parts.length === 2 && !!parts[0] && !!parts[1];
}

export function formatAudioBytes(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(0)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatDurationSec(sec: number | null): string {
  if (sec == null || !Number.isFinite(sec) || sec < 0) return "";
  const total = Math.round(sec);
  const m = Math.floor(total / 60)
    .toString()
    .padStart(2, "0");
  const s = (total % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}
