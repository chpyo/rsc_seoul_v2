import assert from "node:assert/strict";
import { test } from "node:test";
import {
  chunkSegments,
  codeNumber,
  groupHitsBySource,
  literatureChunks,
  mergedCodes,
  type ChunkHit,
} from "./chunking.ts";

const seg = (seq: number, body: string, ts = "") => ({
  code: `S${String(seq).padStart(3, "0")}`,
  seq,
  speaker: seq % 2 ? "화자1" : "화자2",
  ts,
  body,
});

test("연속 발언을 최대 길이 안에서 묶고 구간 코드를 기록한다", () => {
  const segments = [
    seg(1, "가".repeat(300), "00:00:05"),
    seg(2, "나".repeat(300)),
    seg(3, "다".repeat(300), "00:01:10"),
    seg(4, "라".repeat(100)),
  ];
  const chunks = chunkSegments(segments, 800);
  assert.equal(chunks.length, 2);
  assert.deepEqual(chunks[0]!.segmentCodes, ["S001", "S002"]);
  assert.equal(chunks[0]!.label, "S001–S002");
  assert.equal(chunks[0]!.tsStart, "00:00:05");
  assert.deepEqual(chunks[1]!.segmentCodes, ["S003", "S004"]);
  assert.equal(chunks[1]!.tsStart, "00:01:10");
  assert.match(chunks[0]!.text, /^\[S001\] 화자1 \(00:00:05\): 가/);
});

test("순서가 섞여 있어도 seq 순으로 묶고, 빈 발언은 건너뛴다", () => {
  const chunks = chunkSegments([seg(3, "셋"), seg(1, "하나"), seg(2, "  ")]);
  assert.equal(chunks.length, 1);
  assert.deepEqual(chunks[0]!.segmentCodes, ["S001", "S003"]);
  assert.equal(chunks[0]!.label, "S001–S003");
});

test("아주 긴 발언 하나는 잘라서 한 묶음이 된다", () => {
  const chunks = chunkSegments([seg(1, "가".repeat(10_000)), seg(2, "짧음")], 800);
  assert.equal(chunks.length, 2);
  assert.ok(chunks[0]!.text.length <= 800 * 3 + 1);
  assert.deepEqual(chunks[1]!.segmentCodes, ["S002"]);
});

test("발언이 없으면 묶음도 없다", () => {
  assert.deepEqual(chunkSegments([]), []);
});

test("문헌은 개요·방법·연구 질문·정책 제언으로 나눈다", () => {
  const chunks = literatureChunks({
    document_metadata: {
      title: "청년 일자리 보고서",
      authors: ["김연구"],
      year: "2025",
      institution_or_journal: "서울연구원",
      literature_type: "연구보고서",
    },
    methodological_framework: {
      data_source: "실태조사",
      sample_and_scope: "N=500",
      methodology: "회귀분석",
      methodological_caveats: "",
    },
    question_driven_analysis: [
      { question_id: "Q1", research_question: "왜?", findings_summary: "이유", empirical_evidence: "" },
      { question_id: "", research_question: "어떻게?", findings_summary: "방법", empirical_evidence: "" },
    ],
    seoul_hrd_insights: {
      core_implication: "핵심",
      target_beneficiary_or_industry: "청년",
      recommended_actions: [{ category: "훈련", action_detail: "과정 신설", ncs_or_curriculum_linkage: "" }],
    },
    tags: ["청년"],
  });
  assert.deepEqual(
    chunks.map((c) => c.label),
    ["개요", "연구 방법", "Q1 연구 질문", "Q2 연구 질문", "정책 제언"],
  );
  assert.ok(chunks.every((c) => c.segmentCodes.length === 0));
  assert.match(chunks[0]!.text, /서울연구원 · 2025 · 연구보고서/);
});

const hit = (sourceId: string, codes: string[], distance: number | null = null): ChunkHit => ({
  id: `${sourceId}-${codes.join("")}`,
  sourceType: "session",
  sourceId,
  projectId: "p",
  label: codes.join(","),
  segmentCodes: codes,
  tsStart: "",
  text: "t",
  distance,
});

test("검색 결과를 원본 단위로 묶고, 가장 가까운 순서를 유지한다", () => {
  const groups = groupHitsBySource(
    [hit("b", ["S010"], 0.1), hit("a", ["S001"], 0.2), hit("b", ["S012"], 0.3), hit("a", ["S002"])],
    3,
  );
  assert.deepEqual(
    groups.map((g) => [g.sourceId, g.bestRank, g.hits.length]),
    [
      ["b", 0, 2],
      ["a", 1, 2],
    ],
  );
  assert.equal(groups[0]!.bestDistance, 0.1);
});

test("원본당 묶음 수를 제한한다", () => {
  const groups = groupHitsBySource([hit("a", ["S1"]), hit("a", ["S2"]), hit("a", ["S3"])], 2);
  assert.equal(groups[0]!.hits.length, 2);
});

test("구간 코드는 숫자 순으로 합친다", () => {
  assert.deepEqual(mergedCodes([hit("a", ["S1000", "S012"]), hit("a", ["S002", "S012"])]), [
    "S002",
    "S012",
    "S1000",
  ]);
  assert.equal(codeNumber("S045"), 45);
});
