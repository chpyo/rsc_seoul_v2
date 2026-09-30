import assert from "node:assert/strict";
import { test } from "node:test";
import { quoteMatchesSegment, verifyThemeQuotes } from "./evidence.ts";

test("quoteMatchesSegment ignores whitespace and quotes", () => {
  const body = "경력 MLOps가 비어 있습니다.\n주말 집체는 가능합니다.";
  assert.equal(quoteMatchesSegment("경력 MLOps가 비어 있습니다.", body), true);
  assert.equal(quoteMatchesSegment("“주말 집체는 가능합니다.”", body), true);
  assert.equal(quoteMatchesSegment("없는 문장입니다.", body), false);
});

test("verifyThemeQuotes drops quotes not in the source segment", () => {
  const themes = [
    {
      title: "인력",
      quotes: [
        { text: "경력 MLOps가 비어 있습니다.", segmentId: "S001" },
        { text: "없는 인용", segmentId: "S001" },
        { text: "다른 구간 문장", segmentId: "S002" },
      ],
      sourceSegmentIds: ["S001"],
      confidence: "high" as const,
    },
  ];
  const segments = [
    { code: "S001", body: "경력 MLOps가 비어 있습니다." },
    { code: "S002", body: "훈련은 주말에 합니다." },
  ];
  const result = verifyThemeQuotes(themes, segments, []);
  assert.equal(result.droppedCount, 2);
  assert.equal(result.themes[0]?.quotes.length, 1);
  assert.equal(result.themes[0]?.quotes[0]?.text, "경력 MLOps가 비어 있습니다.");
  assert.equal(result.themes[0]?.confidence, "high");
  assert.equal(result.unresolved.length, 2);
});

test("verifyThemeQuotes lowers confidence when every quote is dropped", () => {
  const result = verifyThemeQuotes(
    [
      {
        title: "빈 근거",
        quotes: [{ text: "지어낸 말", segmentId: "S001" }],
        sourceSegmentIds: ["S001"],
        confidence: "high" as const,
      },
    ],
    [{ code: "S001", body: "실제 발화입니다." }],
  );
  assert.equal(result.themes[0]?.quotes.length, 0);
  assert.equal(result.themes[0]?.confidence, "low");
});
