const KEY = "hyunjang-researcher";

export function getStoredResearcher(): string {
  if (typeof window === "undefined") return "";
  try {
    return localStorage.getItem(KEY)?.trim() ?? "";
  } catch {
    return "";
  }
}

export function setStoredResearcher(name: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(KEY, name.trim());
  } catch {
    /* ignore quota */
  }
}
