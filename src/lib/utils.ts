import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function newId(prefix = ""): string {
  const id = crypto.randomUUID().replace(/-/g, "").slice(0, 16);
  return prefix ? `${prefix}_${id}` : id;
}

export function padCode(seq: number): string {
  return `S${String(seq).padStart(3, "0")}`;
}

export function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string");
  }
  if (typeof value === "string" && value.trim()) {
    try {
      return asStringArray(JSON.parse(value) as unknown);
    } catch {
      return [];
    }
  }
  return [];
}

export function formatDateKo(value: string | null | undefined): string {
  if (!value) return "일자 미정";
  const d = value.slice(0, 10);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d);
  if (!m) return d;
  return `${m[1]}.${m[2]}.${m[3]}`;
}
