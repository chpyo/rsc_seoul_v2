import { Link } from "@tanstack/react-router";
import type { RelatedCase } from "@/lib/types";
import { formatDateKo } from "@/lib/utils";

export function RelatedCases({ cases, onOpen }: { cases: RelatedCase[]; onOpen?: () => void }) {
  if (cases.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs font-medium text-muted-foreground">
        비슷한 주제의 자료 (현장록 & 문헌록)
      </p>
      <ul className="flex flex-col gap-2">
        {cases.map((item, idx) => {
          const type = item.type || "session";
          const id = item.id || item.sessionId;
          const title = item.title || item.sessionTitle;
          const subtitle = item.subtitle || item.projectTitle;
          const date = item.date || item.sessionDate;

          if (type === "literature") {
            return (
              <li key={id || idx}>
                <Link
                  to="/literature/$literatureId"
                  params={{ literatureId: id }}
                  onClick={onOpen}
                  className="block rounded-md border border-border border-l-2 border-l-primary/40 bg-card px-3 py-2.5 pl-3 transition-colors hover:border-primary/40"
                >
                  <p className="font-serif text-sm font-semibold">{title}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    <span className="font-medium text-primary">문헌록</span>
                    {subtitle ? ` · ${subtitle}` : ""}
                    {date ? ` · ${date}` : ""}
                  </p>
                  {item.reason ? (
                    <p className="mt-1 text-xs leading-relaxed text-ink-soft">{item.reason}</p>
                  ) : null}
                </Link>
              </li>
            );
          }

          return (
            <li key={id || idx}>
              <Link
                to="/library/$sessionId"
                params={{ sessionId: id }}
                onClick={onOpen}
                className="block rounded-md border border-border border-l-2 border-l-inju bg-card px-3 py-2.5 pl-3 transition-colors hover:border-primary/40"
              >
                <p className="font-serif text-sm font-semibold">{title}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  <span className="text-inju font-medium">현장록</span>
                  {subtitle ? ` · ${subtitle}` : ""}
                  {date ? ` · ${formatDateKo(date)}` : ""}
                </p>
                {item.reason ? (
                  <p className="mt-1 text-xs leading-relaxed text-ink-soft">{item.reason}</p>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
