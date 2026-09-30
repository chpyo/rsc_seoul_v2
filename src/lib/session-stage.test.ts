import assert from "node:assert/strict";
import { test } from "node:test";
import { reviewTotal, sessionStage, stageIndex } from "./session-stage.ts";

test("상태와 검토 항목으로 단계를 정한다", () => {
  assert.equal(sessionStage({ status: "uploaded", themeCount: 0, reviewCount: 0 }), "source");
  assert.equal(sessionStage({ status: "analyzed", themeCount: 0, reviewCount: 0 }), "source");
  assert.equal(sessionStage({ status: "analyzed", themeCount: 3, reviewCount: 2 }), "draft");
  assert.equal(sessionStage({ status: "analyzed", themeCount: 3, reviewCount: 0 }), "reviewed");
  assert.equal(sessionStage({ status: "confirmed", themeCount: 3, reviewCount: 5 }), "confirmed");
});

test("검토 항목을 모두 더하고 단계 순서를 준다", () => {
  assert.equal(reviewTotal({ lowConfidence: 1, missingSource: 2, unresolved: 0, unverifiedQuotes: 3 }), 6);
  assert.deepEqual(
    (["source", "draft", "reviewed", "confirmed"] as const).map(stageIndex),
    [0, 1, 2, 3],
  );
});
