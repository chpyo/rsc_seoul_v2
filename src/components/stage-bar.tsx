import { Check } from "lucide-react";
import { STAGES, stageIndex, type SessionStage } from "@/lib/session-stage";
import { cn } from "@/lib/utils";

/** 원문 → AI 초안 → 검토 완료 → 확정. 지금 단계와 검토 필요 건수를 보여 준다. */
export function StageBar({
  stage,
  reviewCount,
  className,
}: {
  stage: SessionStage;
  reviewCount: number;
  className?: string;
}) {
  const current = stageIndex(stage);
  return (
    <ol className={cn("flex flex-wrap items-center gap-x-1 gap-y-1 text-xs", className)} aria-label="작업 단계">
      {STAGES.map((s, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <li key={s.id} className="flex items-center gap-1">
            {i > 0 ? (
              <span
                aria-hidden
                className={cn("h-px w-4 sm:w-6", done || active ? "bg-primary/50" : "bg-border")}
              />
            ) : null}
            <span
              aria-current={active ? "step" : undefined}
              className={cn(
                "inline-flex h-7 items-center gap-1 rounded-full border px-2.5 font-medium",
                active && s.id === "confirmed" && "border-inju/40 bg-inju-soft text-inju",
                active && s.id === "draft" && "border-review/30 bg-review-soft text-review",
                active && (s.id === "source" || s.id === "reviewed") && "border-primary/30 bg-primary/5 text-primary",
                done && "border-transparent text-primary",
                !active && !done && "border-transparent text-muted-foreground",
              )}
            >
              {done ? <Check className="size-3.5" aria-hidden /> : null}
              {s.label}
              {active && s.id === "draft" && reviewCount > 0 ? (
                <span className="tabular-nums">· 검토 필요 {reviewCount}건</span>
              ) : null}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
