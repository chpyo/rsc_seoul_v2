export type CorpusDoc = {
  sessionId: string;
  sessionTitle: string;
  projectId: string;
  projectTitle: string;
  sessionDate: string | null;
  headline: string;
  corpusText: string;
  themeTitles: string[];
  embedding: number[] | null;
};

export type CorpusHit = {
  sessionId: string;
  sessionTitle: string;
  projectId: string;
  projectTitle: string;
  sessionDate: string | null;
  headline: string;
  score: number;
  reason: string;
};

export function tokenize(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2);
}

export function buildCorpusText(input: {
  title: string;
  headline?: string;
  minutesOverview?: string;
  tags?: string[];
  themes?: Array<{ title: string; summary?: string }>;
  facts?: Array<{ label: string; value: string }>;
}): string {
  const themes = input.themes ?? [];
  const parts = [
    input.title,
    input.headline ?? "",
    input.minutesOverview ?? "",
    (input.tags ?? []).join(" "),
    themes.map((t) => `${t.title} ${t.summary ?? ""}`).join(" "),
    (input.facts ?? []).map((f) => `${f.label} ${f.value}`).join(" "),
  ];
  return parts.map((p) => p.trim()).filter(Boolean).join("\n");
}

export function cosineSimilarity(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  if (n === 0) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < n; i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

export function lexicalScore(query: string, doc: CorpusDoc): number {
  const qTokens = tokenize(query);
  if (qTokens.length === 0) return 0;
  const title = new Set(tokenize(`${doc.sessionTitle} ${doc.headline}`));
  const themes = new Set(tokenize(doc.themeTitles.join(" ")));
  const rest = new Set(tokenize(doc.corpusText));
  let score = 0;
  for (const token of qTokens) {
    if (title.has(token)) score += 3;
    else if (themes.has(token)) score += 2;
    else if (rest.has(token)) score += 1;
  }
  return score / qTokens.length;
}

function overlapReason(query: string, doc: CorpusDoc): string {
  const q = new Set(tokenize(query));
  const matchedThemes = doc.themeTitles.filter((title) => tokenize(title).some((t) => q.has(t)));
  if (matchedThemes[0]) return `관련 주제: ${matchedThemes[0]}`;
  const matchedTitle = tokenize(`${doc.sessionTitle} ${doc.headline}`).find((t) => q.has(t));
  if (matchedTitle) return `질문 키워드 “${matchedTitle}”와 맞습니다.`;
  return doc.headline || "확정 회의록에서 비슷한 내용이 있습니다.";
}

export function rankCorpus(
  query: string,
  docs: CorpusDoc[],
  queryEmbedding: number[] | null,
  limit = 5,
): CorpusHit[] {
  const scored = docs
    .map((doc) => {
      const lex = lexicalScore(query, doc);
      const vec =
        queryEmbedding && doc.embedding && doc.embedding.length > 0
          ? cosineSimilarity(queryEmbedding, doc.embedding)
          : 0;
      const score = vec > 0 ? vec * 2 + lex : lex;
      return {
        sessionId: doc.sessionId,
        sessionTitle: doc.sessionTitle,
        projectId: doc.projectId,
        projectTitle: doc.projectTitle,
        sessionDate: doc.sessionDate,
        headline: doc.headline,
        score,
        reason: overlapReason(query, doc),
      };
    })
    .filter((hit) => hit.score > 0)
    .sort((a, b) => b.score - a.score);
  return scored.slice(0, limit);
}
