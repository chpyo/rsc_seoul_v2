import assert from "node:assert/strict";
import { test } from "node:test";
import { buildWorkQueue } from "./work-queue.ts";

const now = new Date("2026-09-30T12:00:00Z");
const s = (
  id: string,
  status: "uploaded" | "analyzed" | "confirmed",
  isOwner: boolean,
  updatedAt: string,
  confirmedAt: string | null = null,
) => ({ id, status, isOwner, updatedAt, confirmedAt });

test("내 녹취를 단계별로 나누고 팀 확정본을 센다", () => {
  const q = buildWorkQueue(
    [
      s("a", "uploaded", true, "2026-09-29"),
      s("b", "analyzed", true, "2026-09-28"),
      s("c", "analyzed", true, "2026-09-30"),
      s("d", "analyzed", false, "2026-09-30"),
      s("e", "confirmed", true, "2026-09-29", "2026-09-29T00:00:00Z"),
      s("f", "confirmed", true, "2026-09-01", "2026-09-01T00:00:00Z"),
      s("g", "confirmed", false, "2026-09-30", "2026-09-30T00:00:00Z"),
    ],
    now,
  );
  assert.deepEqual(q.toAnalyze.map((x) => x.id), ["a"]);
  assert.deepEqual(q.inReview.map((x) => x.id), ["c", "b"]);
  assert.equal(q.confirmedThisWeek, 1);
  assert.equal(q.teamConfirmed, 3);
  assert.deepEqual(q.recentConfirmed.map((x) => x.id), ["g", "e", "f"]);
});

test("빈 목록", () => {
  const q = buildWorkQueue([], now);
  assert.equal(q.toAnalyze.length + q.inReview.length + q.teamConfirmed, 0);
});
