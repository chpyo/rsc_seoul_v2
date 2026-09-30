import assert from "node:assert/strict";
import { test } from "node:test";
import { indentStyle, minutesMetaRows, officialDate, parseOfficialLines } from "./official-doc.ts";

test("개조식 기호로 단계를 나누고, 이어지는 문장은 한 문단으로 묶는다", () => {
  const lines = parseOfficialLines(
    [
      "1. 인력 수요",
      "  □ **청년 채용**",
      "    ○ 생산직 기피 제기함 (S012)",
      "      - 교대근무 부담",
      "      · 주말 교육 곤란",
      "      ※ 일부 기업은 예외",
      "",
      "일반 문장 하나",
      "이어지는 문장",
      "## 부록",
    ].join("\n"),
  );
  assert.deepEqual(lines, [
    { kind: "l1", text: "1. 인력 수요" },
    { kind: "l2", text: "□ 청년 채용" },
    { kind: "l3", text: "○ 생산직 기피 제기함 (S012)" },
    { kind: "l4", text: "- 교대근무 부담" },
    { kind: "l4", text: "- 주말 교육 곤란" },
    { kind: "note", text: "※ 일부 기업은 예외" },
    { kind: "para", text: "일반 문장 하나 이어지는 문장" },
    { kind: "heading", text: "부록" },
  ]);
});

test("내어쓰기: 기호 폭만큼 들여 시작하고 줄바꿈은 기호 뒤에 맞춘다", () => {
  assert.deepEqual(indentStyle("l3"), { paddingLeft: "3em", textIndent: "-1.2em" });
  assert.deepEqual(indentStyle("para"), { paddingLeft: "0em", textIndent: "0em" });
  assert.deepEqual(indentStyle("l4"), { paddingLeft: "3.7em", textIndent: "-0.9em" });
});

test("공문서 날짜와 개요 표", () => {
  assert.equal(officialDate("2026-09-04"), "2026. 9. 4.");
  assert.equal(officialDate(null), "미기재");
  const rows = minutesMetaRows({
    title: "A사 대표",
    projectTitle: "청년 조사",
    sessionKind: "기업 인터뷰",
    sessionDate: "2026-09-12",
    researcher: "",
    district: "금천구",
    industry: "제조",
    sizeLabel: "50인",
  });
  assert.deepEqual(rows[0], ["일 시", "2026. 9. 12.", "유 형", "기업 인터뷰"]);
  assert.equal(rows[1]![3], "—");
  assert.equal(rows[2]![3], "제조 · 50인");
});
