/**
 * 녹취(세션)의 작업 단계. 화면은 단계마다 주 버튼을 하나만 강조한다.
 *   source    원문      → 분석
 *   draft     AI 초안   → 검토할 항목 보기 (검토 필요 n건)
 *   reviewed  검토 완료 → 확정
 *   confirmed 확정      → 자료실에서 보기
 */
export type SessionStage = "source" | "draft" | "reviewed" | "confirmed";

export const STAGES: Array<{ id: SessionStage; label: string }> = [
  { id: "source", label: "원문" },
  { id: "draft", label: "AI 초안" },
  { id: "reviewed", label: "검토 완료" },
  { id: "confirmed", label: "확정" },
];

export type ReviewCounts = {
  lowConfidence: number;
  missingSource: number;
  unresolved: number;
  unverifiedQuotes: number;
};

export function reviewTotal(c: ReviewCounts): number {
  return c.lowConfidence + c.missingSource + c.unresolved + c.unverifiedQuotes;
}

export function sessionStage(input: {
  status: "uploaded" | "analyzed" | "confirmed";
  themeCount: number;
  reviewCount: number;
}): SessionStage {
  if (input.status === "confirmed") return "confirmed";
  if (input.status === "uploaded" || input.themeCount === 0) return "source";
  return input.reviewCount > 0 ? "draft" : "reviewed";
}

export function stageIndex(stage: SessionStage): number {
  return STAGES.findIndex((s) => s.id === stage);
}
