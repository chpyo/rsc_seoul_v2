import assert from "node:assert/strict";
import { test } from "node:test";
import {
  citationsToMarkdownLinks,
  keepKnownCodes,
  parseCiteHref,
  splitEvidence,
  tsToSeconds,
} from "./parse.ts";

test("본문 속 구간 코드를 나눈다", () => {
  assert.deepEqual(splitEvidence("○ 채용 어려움 제기함 (S012, S015)"), [
    { type: "text", value: "○ 채용 어려움 제기함 (" },
    { type: "code", code: "S012" },
    { type: "text", value: ", " },
    { type: "code", code: "S015" },
    { type: "text", value: ")" },
  ]);
});

test("코드처럼 보이는 다른 문자열은 건너뛴다", () => {
  assert.deepEqual(splitEvidence("ABS012 와 S12 와 S00123"), [
    { type: "text", value: "ABS012 와 S12 와 S00123" },
  ]);
});

test("답변 근거 표기를 읽는다", () => {
  assert.deepEqual(splitEvidence("인력난 호소함〔C1·S012, S015〕 문헌도 같음〔L2〕."), [
    { type: "text", value: "인력난 호소함" },
    { type: "cite", ref: "C1", codes: ["S012", "S015"], raw: "〔C1·S012, S015〕" },
    { type: "text", value: " 문헌도 같음" },
    { type: "cite", ref: "L2", codes: [], raw: "〔L2〕" },
    { type: "text", value: "." },
  ]);
  const [, cite] = splitEvidence("x〔 C3 ㆍ S001 〕");
  assert.deepEqual(cite, { type: "cite", ref: "C3", codes: ["S001"], raw: "〔 C3 ㆍ S001 〕" });
});

test("시각을 초로 바꾼다", () => {
  assert.equal(tsToSeconds("00:01:15"), 75);
  assert.equal(tsToSeconds("01:15"), 75);
  assert.equal(tsToSeconds("1:02:03"), 3723);
  assert.equal(tsToSeconds("12:75"), null);
  assert.equal(tsToSeconds(""), null);
  assert.equal(tsToSeconds("오전 10시"), null);
});

test("답변 근거를 Markdown 링크로 바꾸고 되읽는다", () => {
  const md = citationsToMarkdownLinks("A〔C1·S012, S015〕 B〔L1〕 C〔C9·S001〕", new Set(["C1", "L1"]));
  assert.equal(md, "A[C1·S012, S015](#cite:C1:S012,S015) B[L1](#cite:L1:) C〔C9·S001〕");
  assert.deepEqual(parseCiteHref("#cite:C1:S012,S015"), { ref: "C1", codes: ["S012", "S015"] });
  assert.deepEqual(parseCiteHref("#cite:L1:"), { ref: "L1", codes: [] });
  assert.equal(parseCiteHref("https://example.com"), null);
});

test("원문에 없는 구간 코드는 지운다", () => {
  const valid = new Set(["S001", "S002"]);
  assert.equal(keepKnownCodes("○ 요지 (S001, S099)", valid), "○ 요지 (S001)");
  assert.equal(keepKnownCodes("○ 요지 (S099, S001)", valid), "○ 요지 (S001)");
  assert.equal(keepKnownCodes("○ 요지 (S098, S099)", valid), "○ 요지");
  assert.equal(keepKnownCodes("- 세부 S002 확인함\n○ 다음 (S777)", valid), "- 세부 S002 확인함\n○ 다음");
});
