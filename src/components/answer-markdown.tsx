import { Link } from "@tanstack/react-router";
import { BookOpen, FileText } from "lucide-react";
import { useMemo } from "react";
import Markdown from "react-markdown";
import { citationsToMarkdownLinks, parseCiteHref } from "@/lib/evidence/parse";
import type { Citation } from "@/lib/types";

function shortTitle(title: string, max = 14) {
  return title.length > max ? `${title.slice(0, max)}…` : title;
}

/**
 * AI 답변 Markdown. 〔C1·S012〕·〔L1〕 근거를 원본으로 가는 링크 칩으로 바꾼다.
 * - 현장록: 자료실 회의록의 해당 구간 (/library/{id}?seg=S012)
 * - 문헌록: 문헌 상세
 */
export function AnswerMarkdown({
  text,
  citations,
  onNavigate,
}: {
  text: string;
  citations: Record<string, Citation>;
  /** 링크를 눌렀을 때 (예: 대화창 닫기) */
  onNavigate?: () => void;
}) {
  const source = useMemo(
    () => citationsToMarkdownLinks(text, new Set(Object.keys(citations))),
    [text, citations],
  );

  return (
    <Markdown
      components={{
        a: ({ href, children }) => {
          const cite = href ? parseCiteHref(href) : null;
          const target = cite ? citations[cite.ref] : undefined;
          if (!cite || !target) {
            return (
              <a href={href} target="_blank" rel="noreferrer noopener">
                {children}
              </a>
            );
          }
          const chipClass =
            "mx-0.5 inline-flex items-center gap-1 rounded-sm border border-inju/30 bg-card px-1.5 align-baseline text-[0.8em] font-medium text-inju no-underline hover:bg-inju/10";
          if (target.type === "literature") {
            return (
              <Link
                to="/literature/$literatureId"
                params={{ literatureId: target.id }}
                className={chipClass}
                title={target.title}
                onClick={onNavigate}
              >
                <BookOpen className="size-3" />
                {shortTitle(target.title)}
              </Link>
            );
          }
          return (
            <Link
              to="/library/$sessionId"
              params={{ sessionId: target.id }}
              search={{ seg: cite.codes[0] }}
              className={chipClass}
              title={`${target.title}${cite.codes.length ? ` · ${cite.codes.join(", ")}` : ""}`}
              onClick={onNavigate}
            >
              <FileText className="size-3" />
              {shortTitle(target.title)}
              {cite.codes.length ? (
                <span className="font-mono">{cite.codes.join(", ")}</span>
              ) : null}
            </Link>
          );
        },
      }}
    >
      {source}
    </Markdown>
  );
}
