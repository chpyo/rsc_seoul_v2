import type { Confidence } from "@/lib/types";

export function normalizeForMatch(value: string): string {
  return value
    .normalize("NFC")
    .replace(/[“”„‟"']/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function quoteMatchesSegment(quote: string, body: string): boolean {
  const q = normalizeForMatch(quote);
  if (q.length < 2) return false;
  return normalizeForMatch(body).includes(q);
}

function clip(text: string, max = 48): string {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length <= max ? t : `${t.slice(0, max)}…`;
}

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const t = value.trim();
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

export function verifyThemeQuotes<
  T extends {
    title?: string;
    quotes: Array<{ text: string; segmentId: string }>;
    sourceSegmentIds?: string[];
    sourceSegments?: string[];
    confidence?: Confidence;
  },
>(
  themes: T[],
  segments: Array<{ code: string; body: string }>,
  unresolved: string[] = [],
): { themes: T[]; unresolved: string[]; droppedCount: number } {
  const bodies = new Map(segments.map((s) => [s.code, s.body]));
  const extra: string[] = [];
  let droppedCount = 0;

  const nextThemes = themes.map((theme) => {
    const kept: T["quotes"] = [];
    for (const quote of theme.quotes) {
      const body = bodies.get(quote.segmentId) ?? "";
      if (quoteMatchesSegment(quote.text, body)) {
        kept.push(quote);
        continue;
      }
      droppedCount += 1;
      const where = quote.segmentId || "(구간 없음)";
      extra.push(`인용 원문을 ${where}에서 확인하지 못함: ${clip(quote.text)}`);
    }

    const sources = theme.sourceSegmentIds ?? theme.sourceSegments ?? [];
    let confidence = theme.confidence;
    if (sources.length === 0) confidence = "low";
    else if (theme.quotes.length > 0 && kept.length === 0) confidence = "low";

    return { ...theme, quotes: kept, confidence };
  });

  return {
    themes: nextThemes,
    unresolved: uniqueStrings([...unresolved, ...extra]),
    droppedCount,
  };
}
