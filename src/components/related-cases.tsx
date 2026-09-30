import { Link } from "@tanstack/react-router";
import { BookOpen, FileText } from "lucide-react";
import type { RelatedCase } from "@/lib/types";
import { cn, formatDateKo } from "@/lib/utils";

/**
 * 질문의 근거가 된 자료. 회의 제목보다 "무슨 말이 있었는지"를 먼저 보여 준다.
 * 현장록 카드를 누르면 가장 가까운 발언 구간으로 이동한다.
 */
export function RelatedCases({ cases, onOpen }: { cases: RelatedCase[]; onOpen?: () => void }) {
  if (cases.length === 0) return null;

  return (
    <div className="@container flex flex-col gap-2">
      <p className="text-xs font-medium text-muted-foreground">근거 자료 {cases.length}건</p>
      <ul className="grid gap-2 @xl:grid-cols-2">
        {cases.map((item, idx) => {
          const type = item.type || "session";
          const id = item.id || item.sessionId;
          const title = item.title || item.sessionTitle;
          const subtitle = item.subtitle || item.projectTitle;
          const date = item.date || item.sessionDate;
          const ev = item.evidence;
          const quote = ev?.text || item.headline || item.reason;

          const body = (
            <>
              {quote ? (
                <p className="line-clamp-3 font-serif text-sm leading-relaxed text-foreground">
                  {type === "session" && ev ? "“" : ""}
                  {quote}
                  {type === "session" && ev ? "”" : ""}
                </p>
              ) : null}
              <p className="mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-muted-foreground">
                {type === "session" && ev?.codes.length ? (
                  <span className="rounded-sm border border-inju/30 px-1 font-mono text-inju">
                    {ev.codes.slice(0, 3).join(", ")}
                  </span>
                ) : null}
                {type === "session" && ev?.speaker ? (
                  <span>
                    {ev.speaker}
                    {ev.ts ? ` ${ev.ts}` : ""}
                  </span>
                ) : null}
                {type === "literature" && ev?.label ? <span>{ev.label}</span> : null}
              </p>
              <p className="mt-2 flex items-center gap-1.5 border-t border-border pt-2 text-xs">
                {type === "literature" ? (
                  <BookOpen className="size-3.5 shrink-0 text-primary" aria-hidden />
                ) : (
                  <FileText className="size-3.5 shrink-0 text-inju" aria-hidden />
                )}
                <span className="truncate font-medium text-foreground">{title}</span>
                <span className="truncate text-muted-foreground">
                  {subtitle ? ` · ${subtitle}` : ""}
                  {date ? ` · ${type === "session" ? formatDateKo(date) : date}` : ""}
                </span>
              </p>
            </>
          );

          const cls = cn(
            "block h-full rounded-md border border-border border-l-2 bg-card px-3 py-2.5 transition-colors hover:border-primary/40",
            type === "literature" ? "border-l-primary/40" : "border-l-inju",
          );

          return (
            <li key={id || idx}>
              {type === "literature" ? (
                <Link
                  to="/literature/$literatureId"
                  params={{ literatureId: id }}
                  onClick={onOpen}
                  className={cls}
                >
                  {body}
                </Link>
              ) : (
                <Link
                  to="/library/$sessionId"
                  params={{ sessionId: id }}
                  search={{ seg: ev?.codes[0] }}
                  onClick={onOpen}
                  className={cls}
                >
                  {body}
                </Link>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
