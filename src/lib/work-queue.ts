/**
 * 홈 화면의 할 일 목록 (순수 함수).
 *   분석 대기: 내가 올린 원문 상태 녹취
 *   검토 중:   내가 올린 AI 초안 (검토 후 확정)
 *   이번 주 확정: 최근 7일 안에 내가 확정한 수
 *   팀 확정 누적: 자료실에 쌓인 확정본 수
 */
type QueueItem = {
  id: string;
  status: "uploaded" | "analyzed" | "confirmed";
  isOwner?: boolean;
  updatedAt: string;
  confirmedAt: string | null;
};

export type WorkQueue<T extends QueueItem> = {
  toAnalyze: T[];
  inReview: T[];
  confirmedThisWeek: number;
  teamConfirmed: number;
  recentConfirmed: T[];
};

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

function byUpdatedDesc(a: QueueItem, b: QueueItem) {
  return (b.updatedAt || "").localeCompare(a.updatedAt || "");
}

export function buildWorkQueue<T extends QueueItem>(sessions: T[], now = new Date()): WorkQueue<T> {
  const mine = sessions.filter((s) => s.isOwner);
  const confirmed = sessions.filter((s) => s.status === "confirmed");
  const since = now.getTime() - WEEK_MS;
  return {
    toAnalyze: mine.filter((s) => s.status === "uploaded").sort(byUpdatedDesc),
    inReview: mine.filter((s) => s.status === "analyzed").sort(byUpdatedDesc),
    confirmedThisWeek: mine.filter(
      (s) => s.status === "confirmed" && s.confirmedAt && Date.parse(s.confirmedAt) >= since,
    ).length,
    teamConfirmed: confirmed.length,
    recentConfirmed: [...confirmed]
      .sort((a, b) => (b.confirmedAt || "").localeCompare(a.confirmedAt || ""))
      .slice(0, 6),
  };
}
