import assert from "node:assert/strict";
import { test } from "node:test";
import {
  parseTranscript,
  remapSpeakers,
  serializeSegments,
  uniqueSpeakers,
} from "./parse-transcript.ts";
import { mergeThemes } from "./types.ts";

test("parse and serialize round-trip keeps speakers", () => {
  const raw = `[대표] 00:01:10
경력 MLOps가 비어 있습니다.

조사원: 훈련은 어떤 방식이 가능하신가요.`;
  const segs = parseTranscript(raw);
  assert.equal(segs.length, 2);
  assert.equal(segs[0]?.speaker, "대표");
  const again = parseTranscript(serializeSegments(segs));
  assert.equal(again[0]?.speaker, "대표");
  assert.equal(again[1]?.speaker, "조사원");
});

test("speaker remap", () => {
  const segs = parseTranscript("[A]\n하나\n[B]\n둘");
  const names = uniqueSpeakers(segs);
  assert.deepEqual(names, ["A", "B"]);
  const next = remapSpeakers(segs, { A: "조사원" });
  assert.equal(next[0]?.speaker, "조사원");
});

test("merge themes keeps sources", () => {
  const a = {
    id: "thm_a",
    sortOrder: 0,
    title: "채용",
    summary: "공석",
    bullets: ["MLOps"],
    sourceSegmentIds: ["S004"],
    quotes: [{ text: "인용", segmentId: "S004" }],
    confidence: "high" as const,
  };
  const b = {
    ...a,
    id: "thm_b",
    title: "훈련",
    summary: "주말",
    bullets: ["토요"],
    sourceSegmentIds: ["S011"],
    quotes: [],
    confidence: "low" as const,
  };
  const m = mergeThemes([a, b]);
  assert.equal(m.confidence, "low");
  assert.deepEqual(m.sourceSegmentIds, ["S004", "S011"]);
  assert.match(m.title, /채용/);
});
