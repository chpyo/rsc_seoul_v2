export type ParsedSegment = {
  seq: number;
  speaker: string;
  ts: string;
  body: string;
};

const BRACKET = /^\[([^\]]+)]\s*(\d{1,2}:\d{2}(?::\d{2})?)?\s*(.*)$/;
const SPEAKER_TS = /^(.{1,32}?)\s+(\d{1,2}:\d{2}(?::\d{2})?)\s*$/;
const SPEAKER_COLON = /^(.{1,32}?)[:：]\s*(.*)$/;

function looksLikeSpeaker(raw: string): boolean {
  const name = raw.trim();
  if (name.length < 1 || name.length > 24) return false;
  if (/[?!.。]/.test(name)) return false;
  if (name.includes("니다") || name.includes("요.")) return false;
  const spaces = (name.match(/\s/g) ?? []).length;
  return spaces <= 3;
}

function pushBody(seg: ParsedSegment | null, line: string): void {
  if (!seg) return;
  const t = line.trim();
  if (!t) return;
  seg.body = seg.body ? `${seg.body}\n${t}` : t;
}

/** Parse a speaker-and-segment organized transcript. Does not re-cut dialogue. */
export function parseTranscript(raw: string): ParsedSegment[] {
  const text = raw.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = text.split("\n");
  const segments: ParsedSegment[] = [];
  let current: ParsedSegment | null = null;

  const start = (speaker: string, ts: string, rest: string) => {
    current = {
      seq: segments.length + 1,
      speaker: speaker.trim() || "미분류",
      ts: ts.trim(),
      body: rest.trim(),
    };
    segments.push(current);
  };

  for (const original of lines) {
    const line = original.trimEnd();
    const trimmed = line.trim();
    if (!trimmed) continue;

    const bracket = BRACKET.exec(trimmed);
    if (bracket && looksLikeSpeaker(bracket[1] ?? "")) {
      start(bracket[1] ?? "미분류", bracket[2] ?? "", bracket[3] ?? "");
      continue;
    }

    const last = segments[segments.length - 1];
    const withTs = SPEAKER_TS.exec(trimmed);
    if (withTs && looksLikeSpeaker(withTs[1] ?? "") && !last?.body.endsWith(":")) {
      start(withTs[1] ?? "미분류", withTs[2] ?? "", "");
      continue;
    }

    const colon = SPEAKER_COLON.exec(trimmed);
    if (colon && looksLikeSpeaker(colon[1] ?? "")) {
      start(colon[1] ?? "미분류", "", colon[2] ?? "");
      continue;
    }

    if (!current) {
      start("미분류", "", trimmed);
    } else {
      pushBody(current, trimmed);
    }
  }

  return segments.filter((s) => s.body.trim().length > 0);
}

export function uniqueSpeakers(segments: Array<{ speaker: string }>): string[] {
  const seen = new Set<string>();
  const list: string[] = [];
  for (const seg of segments) {
    const name = seg.speaker.trim() || "미분류";
    if (seen.has(name)) continue;
    seen.add(name);
    list.push(name);
  }
  return list;
}

export function remapSpeakers<T extends { speaker: string }>(
  segments: T[],
  map: Record<string, string>,
): T[] {
  return segments.map((seg) => {
    const next = map[seg.speaker]?.trim();
    return next && next !== seg.speaker ? { ...seg, speaker: next } : seg;
  });
}

export function serializeSegments(segments: ParsedSegment[]): string {
  return segments
    .map((seg) => {
      const head = seg.ts ? `[${seg.speaker}] ${seg.ts}` : `[${seg.speaker}]`;
      return `${head}\n${seg.body}`;
    })
    .join("\n\n");
}

export function decodeTranscriptFile(buffer: ArrayBuffer): string {
  const utf8 = new TextDecoder("utf-8", { fatal: false }).decode(buffer);
  const bad = (utf8.match(/\uFFFD/g) ?? []).length;
  if (bad === 0) return utf8;
  try {
    const korean = new TextDecoder("euc-kr", { fatal: false }).decode(buffer);
    const badKo = (korean.match(/\uFFFD/g) ?? []).length;
    if (badKo < bad) return korean;
  } catch {
    /* euc-kr not available */
  }
  return utf8;
}
