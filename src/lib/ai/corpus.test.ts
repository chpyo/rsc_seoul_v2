import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildCorpusText,
  cosineSimilarity,
  lexicalScore,
  rankCorpus,
  tokenize,
  type CorpusDoc,
} from "./corpus.ts";

const docs: CorpusDoc[] = [
  {
    sessionId: "sess_a",
    sessionTitle: "하린랩 인터뷰",
    projectId: "proj_1",
    projectTitle: "AI 심층조사",
    sessionDate: "2026-03-01",
    headline: "경력 MLOps 공석",
    corpusText: "하린랩 인터뷰\n경력 MLOps 공석\n재직자훈련 주말 집체",
    themeTitles: ["MLOps 인력", "재직자훈련"],
    embedding: [1, 0, 0],
  },
  {
    sessionId: "sess_b",
    sessionTitle: "분과위 회의",
    projectId: "proj_1",
    projectTitle: "AI 심층조사",
    sessionDate: "2026-03-08",
    headline: "예산 일정",
    corpusText: "분과위 회의\n예산 일정\n운영 규정",
    themeTitles: ["예산"],
    embedding: [0, 1, 0],
  },
];

test("tokenize keeps korean and latin tokens", () => {
  assert.deepEqual(tokenize("MLOps 인력, 재직자훈련"), ["mlops", "인력", "재직자훈련"]);
});

test("lexicalScore prefers title and theme matches", () => {
  const q = "MLOps 인력";
  assert.ok(lexicalScore(q, docs[0]!) > lexicalScore(q, docs[1]!));
});

test("rankCorpus returns similar meetings first", () => {
  const hits = rankCorpus("MLOps 재직자훈련", docs, null, 5);
  assert.equal(hits[0]?.sessionId, "sess_a");
  assert.match(hits[0]?.reason ?? "", /MLOps|재직자/);
});

test("rankCorpus uses embeddings when present", () => {
  const hits = rankCorpus("예산", docs, [0, 1, 0], 5);
  assert.equal(hits[0]?.sessionId, "sess_b");
});

test("buildCorpusText includes themes and facts", () => {
  const text = buildCorpusText({
    title: "A사",
    headline: "한 줄",
    tags: ["훈련"],
    themes: [{ title: "채용", summary: "공석" }],
    facts: [{ label: "인원", value: "12명" }],
  });
  assert.match(text, /채용/);
  assert.match(text, /12명/);
});

test("cosineSimilarity is 1 for the same vector", () => {
  assert.equal(cosineSimilarity([1, 0], [1, 0]), 1);
});
