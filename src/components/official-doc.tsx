import type { ReactNode } from "react";
import { CodeChip, EvidenceInline } from "@/components/evidence";
import { ConfirmSeal } from "@/components/confirm-seal";
import { APP_NAME, APP_ORG } from "@/lib/brand";
import {
  ROMAN,
  indentStyle,
  minutesMetaRows,
  officialDate,
  parseOfficialLines,
} from "@/lib/official-doc";
import type { SessionDetail } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * 확정 회의록을 A4 공문서 양식으로 그린다(열람 = 문서 방식: 명조, 개조식 내어쓰기).
 * 근거 구간 코드는 EvidenceProvider 안에서 칩으로, 인쇄하면 괄호 속 코드로 나온다.
 */
export function OfficialMinutesDoc({ session }: { session: SessionDetail }) {
  const quotes = session.themes.flatMap((t) => t.quotes.map((q) => ({ theme: t.title, ...q })));
  const followups = session.minutesFollowups.filter(Boolean);
  const bodyLines = parseOfficialLines(session.minutesBody);

  const sections: Array<{ title: string; content: ReactNode }> = [];
  sections.push({
    title: "개요",
    content: (
      <p className="leading-[1.85]">
        <EvidenceInline text={session.minutesOverview.trim() || "(없음)"} />
      </p>
    ),
  });
  sections.push({
    title: "논의 요지",
    content:
      bodyLines.length === 0 ? (
        <p>(없음)</p>
      ) : (
        <div className="flex flex-col gap-1">
          {bodyLines.map((line, i) => (
            <p
              key={i}
              style={indentStyle(line.kind)}
              className={cn(
                "leading-[1.85]",
                line.kind === "l1" && "mt-3 font-bold first:mt-0",
                line.kind === "heading" && "mt-3 font-bold",
                line.kind === "l2" && "mt-1.5 font-semibold",
                line.kind === "note" && "text-[0.92em] text-ink-soft",
              )}
            >
              <EvidenceInline text={line.text} />
            </p>
          ))}
        </div>
      ),
  });
  if (session.facts.length > 0) {
    sections.push({
      title: "확인된 사실",
      content: (
        <DocTable
          head={["항목", "내용", "근거"]}
          widths={["24%", "auto", "5.5rem"]}
          rows={session.facts.map((f) => [
            f.label,
            f.value,
            f.segmentCode ? <CodeChip code={f.segmentCode} /> : "—",
          ])}
        />
      ),
    });
  }
  if (session.actionItems.length > 0) {
    sections.push({
      title: "실행 항목",
      content: (
        <DocTable
          head={["할 일", "담당", "기한", "근거"]}
          widths={["auto", "16%", "16%", "5.5rem"]}
          rows={session.actionItems.map((a) => [
            a.task || "(내용 없음)",
            a.assignee || "미정",
            a.deadline || "미정",
            a.segmentCode ? <CodeChip code={a.segmentCode} /> : "—",
          ])}
        />
      ),
    });
  }
  if (quotes.length > 0) {
    sections.push({
      title: "주요 발언",
      content: (
        <div className="flex flex-col gap-2">
          {quotes.map((q, i) => (
            <p key={`${q.segmentId}-${i}`} style={indentStyle("l3")} className="leading-[1.85]">
              ○ “{q.text}”
              <span className="ml-1 font-sans text-[0.85em] text-muted-foreground">
                {q.theme}
                {q.segmentId ? (
                  <>
                    {" "}
                    (<CodeChip code={q.segmentId} />)
                  </>
                ) : null}
              </span>
            </p>
          ))}
        </div>
      ),
    });
  }
  if (followups.length > 0) {
    sections.push({
      title: "후속 확인",
      content: (
        <div className="flex flex-col gap-1">
          {followups.map((f, i) => (
            <p key={i} style={indentStyle("l3")} className="leading-[1.85]">
              ○ <EvidenceInline text={f} />
            </p>
          ))}
        </div>
      ),
    });
  }

  return (
    <article className="doc-page mx-auto w-full max-w-[210mm] rounded-sm border border-border bg-sheet px-6 py-8 font-serif text-[0.95rem] text-foreground shadow-[0_1px_3px_rgb(0_0_0/0.06)] sm:px-[18mm] sm:py-[16mm]">
      <header className="relative border-b-2 border-foreground pb-4">
        <p className="font-sans text-sm tracking-wide text-muted-foreground">{APP_ORG}</p>
        <h1 className="mt-3 pr-20 text-center font-serif text-2xl font-bold tracking-tight sm:text-[1.7rem]">
          {session.title} 회의록
        </h1>
        <ConfirmSeal confirmedAt={session.confirmedAt} className="absolute top-0 right-0" />
      </header>

      <table className="mt-5 w-full border-collapse font-sans text-sm">
        <tbody>
          {minutesMetaRows(session).map((row, i) => (
            <tr key={i} className="border-b border-border">
              <th className="w-[5.5rem] bg-muted/60 px-2 py-1.5 text-center font-medium">
                {row[0]}
              </th>
              <td className="px-3 py-1.5" colSpan={row[2] ? 1 : 3}>
                {row[1]}
              </td>
              {row[2] ? (
                <>
                  <th className="w-[5.5rem] bg-muted/60 px-2 py-1.5 text-center font-medium">
                    {row[2]}
                  </th>
                  <td className="px-3 py-1.5">{row[3]}</td>
                </>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-6 flex flex-col gap-6">
        {sections.map((sec, i) => (
          <section key={sec.title} className="break-inside-avoid-page">
            <h2 className="mb-2 font-serif text-lg font-bold">
              {ROMAN[i]}. {sec.title}
            </h2>
            {sec.content}
          </section>
        ))}
      </div>

      <footer className="mt-10 border-t border-border pt-3 font-sans text-xs leading-relaxed text-muted-foreground">
        {session.tagLabels.length > 0 ? (
          <p className="mb-1">주제어: {session.tagLabels.join(", ")}</p>
        ) : null}
        <p>
          ※ 괄호 속 S000은 원문 녹취의 발언 번호이며, {APP_NAME}에서 해당 원문과 녹음을 확인할 수
          있음.
        </p>
        <p className="mt-1">
          {APP_ORG} · {officialDate(session.confirmedAt?.slice(0, 10) ?? null)} 확정
        </p>
      </footer>
    </article>
  );
}

function DocTable({
  head,
  widths,
  rows,
}: {
  head: string[];
  widths: string[];
  rows: ReactNode[][];
}) {
  return (
    <table className="w-full border-collapse border-t-2 border-foreground font-sans text-sm">
      <colgroup>
        {widths.map((w, i) => (
          <col key={i} style={w === "auto" ? undefined : { width: w }} />
        ))}
      </colgroup>
      <thead>
        <tr className="border-b border-foreground/60 bg-muted/60">
          {head.map((h) => (
            <th key={h} className="px-2 py-1.5 text-center font-medium">
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} className="border-b border-border align-top">
            {r.map((c, j) => (
              <td key={j} className={cn("px-2 py-1.5", j === r.length - 1 && "text-center")}>
                {c}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
