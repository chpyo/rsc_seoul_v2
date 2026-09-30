import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { ArrowLeft, Download, LoaderCircle, Pencil, Play } from "lucide-react";
import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { CodeChip, EvidenceInline, EvidenceProvider } from "@/components/evidence";
import { ConfirmSeal } from "@/components/confirm-seal";
import { SessionAudioPlayer } from "@/components/session-audio";
import { tsToSeconds } from "@/lib/evidence/parse";
import { Button } from "@/components/ui/button";
import {
  buildMinutesHtml,
  buildMinutesMarkdown,
  downloadHtml,
  downloadText,
  downloadWordDoc,
} from "@/lib/minutes-export";
import { getSession } from "@/lib/firebase-db";
import { useAuth } from "@/lib/auth-context";
import type { SessionDetail } from "@/lib/types";
import { cn, formatDateKo } from "@/lib/utils";

export const Route = createFileRoute("/library/$sessionId")({
  // ?seg=S012 로 들어오면 원문 구간을 펼쳐 해당 구간으로 이동한다.
  validateSearch: (search: { seg?: string }): { seg?: string } => ({
    seg: typeof search.seg === "string" && /^S\d{3,4}$/.test(search.seg) ? search.seg : undefined,
  }),
  component: LibraryCasePage,
});

function LibraryCasePage() {
  const { user } = useAuth();
  const uid = user?.uid;
  const { sessionId } = Route.useParams();
  const {
    data: session,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["session", sessionId, uid],
    queryFn: () => getSession(uid!, sessionId),
    enabled: !!uid,
  });

  if (!uid) return null;
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20 text-sm text-muted-foreground">
        <LoaderCircle className="mr-2 size-5 animate-spin" />
        회의록을 불러오는 중
      </div>
    );
  }
  if (error || !session) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-card px-4 py-12 text-center text-sm text-muted-foreground">
        이 회의록을 찾을 수 없습니다.
      </div>
    );
  }
  if (session.status !== "confirmed") {
    return <Navigate to="/library" />;
  }

  return <CaseMinutes session={session} />;
}

function CaseMinutes({ session }: { session: SessionDetail }) {
  const [exportOpen, setExportOpen] = useState(false);
  const { seg: initialSeg } = Route.useSearch();
  const [sourceOpen, setSourceOpen] = useState(!!initialSeg);
  const [flashCode, setFlashCode] = useState<string | null>(null);
  const [audioAvailable, setAudioAvailable] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);

  const jumpTo = useCallback((code: string) => {
    setSourceOpen(true);
    setFlashCode(code);
    // 원문 구간 목록이 펼쳐진 뒤 스크롤
    window.setTimeout(() => {
      document
        .getElementById(`lib-seg-${code}`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 50);
  }, []);

  useEffect(() => {
    if (initialSeg) jumpTo(initialSeg);
  }, [initialSeg, jumpTo]);

  useEffect(() => {
    if (!flashCode) return;
    const t = window.setTimeout(() => setFlashCode(null), 2500);
    return () => window.clearTimeout(t);
  }, [flashCode]);

  const playAt = useCallback((seconds: number) => {
    const el = audioRef.current;
    if (!el) return;
    el.currentTime = seconds;
    void el.play().catch(() => undefined);
    el.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, []);
  const quotes = session.themes.flatMap((t) => t.quotes.map((q) => ({ theme: t.title, ...q })));

  function doExport(kind: "html" | "doc" | "md") {
    const payload = {
      session,
      themes: session.themes,
      facts: session.facts,
      tags: session.tagLabels,
    };
    if (kind === "md") {
      downloadText(`${session.title} 회의록.md`, buildMinutesMarkdown(payload));
    } else {
      const html = buildMinutesHtml(payload);
      if (kind === "html") downloadHtml(`${session.title} 회의록.html`, html);
      else downloadWordDoc(`${session.title} 회의록.doc`, html);
    }
    setExportOpen(false);
  }

  const meta = [
    session.projectTitle,
    session.sessionKind,
    formatDateKo(session.sessionDate),
    session.researcher ? `조사자 ${session.researcher}` : null,
    session.industry,
    session.district,
    session.sizeLabel,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <EvidenceProvider
      segments={session.segments}
      onJump={jumpTo}
      onPlay={audioAvailable ? playAt : undefined}
    >
      <article className="mx-auto flex max-w-3xl flex-col gap-8">
        <div className="flex flex-col gap-4">
          <Link
            to="/library"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-4" />
            자료실
          </Link>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex min-w-0 items-start gap-4">
              <ConfirmSeal
                confirmedAt={session.confirmedAt}
                className="mt-2 hidden sm:inline-flex"
              />
              <div className="min-w-0">
                <p className="text-xs font-medium tracking-wide text-inju">확정 회의록</p>
                <h1 className="mt-2 font-serif text-4xl font-semibold tracking-tight">
                  {session.title}
                </h1>
                <p className="mt-3 text-sm text-muted-foreground">{meta}</p>
                {session.headline ? (
                  <p className="mt-4 font-serif text-base leading-relaxed text-ink-soft">
                    {session.headline}
                  </p>
                ) : null}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <div className="relative">
                <Button variant="outline" onClick={() => setExportOpen((v) => !v)}>
                  <Download className="size-4" />
                  내보내기
                </Button>
                {exportOpen ? (
                  <div className="absolute right-0 z-20 mt-1 min-w-40 rounded-md border border-border bg-card p-1 shadow-[var(--shadow-panel)]">
                    <button
                      type="button"
                      className="block w-full rounded-sm px-3 py-2 text-left text-sm hover:bg-muted"
                      onClick={() => doExport("html")}
                    >
                      HTML
                    </button>
                    <button
                      type="button"
                      className="block w-full rounded-sm px-3 py-2 text-left text-sm hover:bg-muted"
                      onClick={() => doExport("doc")}
                    >
                      한글·Word
                    </button>
                    <button
                      type="button"
                      className="block w-full rounded-sm px-3 py-2 text-left text-sm hover:bg-muted"
                      onClick={() => doExport("md")}
                    >
                      마크다운
                    </button>
                  </div>
                ) : null}
              </div>
              <Button variant="outline" asChild>
                <Link to="/sessions/$sessionId" params={{ sessionId: session.id }}>
                  <Pencil className="size-4" />
                  작업대로 열기
                </Link>
              </Button>
            </div>
          </div>
        </div>

        <Section title="개요">
          <p className="font-serif text-sm leading-relaxed text-ink-soft">
            <EvidenceInline text={session.minutesOverview.trim() || "(없음)"} />
          </p>
        </Section>

        <Section title="논의 요지">
          <MinutesBody text={session.minutesBody} />
        </Section>

        <Section title="확인된 사실">
          {session.facts.length === 0 ? (
            <Empty />
          ) : (
            <ul className="flex flex-col gap-2">
              {session.facts.map((fact) => (
                <li key={fact.id} className="text-sm leading-relaxed">
                  <span className="font-medium">{fact.label}</span>
                  <span className="text-ink-soft"> : {fact.value}</span>
                  {fact.segmentCode ? (
                    <span className="ml-2 text-xs">
                      <CodeChip code={fact.segmentCode} />
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </Section>

        {session.actionItems.length > 0 ? (
          <Section title="실행 항목">
            <ul className="flex flex-col gap-2">
              {session.actionItems.map((item) => (
                <li
                  key={item.id}
                  className="rounded-lg border border-border bg-card px-3 py-2.5 text-sm"
                >
                  <p className="font-medium">{item.task || "(내용 없음)"}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {[item.assignee || "담당 미정", item.deadline || "기한 미정"].join(" · ")}
                    {item.segmentCode ? (
                      <>
                        {" · "}
                        <CodeChip code={item.segmentCode} />
                      </>
                    ) : null}
                  </p>
                </li>
              ))}
            </ul>
          </Section>
        ) : null}

        <Section title="인용">
          {quotes.length === 0 ? (
            <Empty />
          ) : (
            <div className="flex flex-col gap-3">
              {quotes.map((quote, i) => (
                <blockquote key={`${quote.segmentId}-${i}`} className="border-l-2 border-inju pl-4">
                  <p className="font-serif text-sm leading-relaxed text-ink-soft">“{quote.text}”</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {quote.theme}
                    {quote.segmentId ? (
                      <>
                        {" · "}
                        <CodeChip code={quote.segmentId} />
                      </>
                    ) : null}
                  </p>
                </blockquote>
              ))}
            </div>
          )}
        </Section>

        <Section title="후속 확인">
          {session.minutesFollowups.filter(Boolean).length === 0 ? (
            <Empty />
          ) : (
            <ul className="flex flex-col gap-1.5">
              {session.minutesFollowups.filter(Boolean).map((item, i) => (
                <li key={`${item}-${i}`} className="text-sm leading-relaxed text-ink-soft">
                  · {item}
                </li>
              ))}
            </ul>
          )}
        </Section>

        {session.tagLabels.length > 0 ? (
          <Section title="태그">
            <p className="text-sm text-muted-foreground">
              {session.tagLabels.map((t) => `#${t}`).join("  ")}
            </p>
          </Section>
        ) : null}

        <section className="flex flex-col gap-3">
          <button
            type="button"
            onClick={() => setSourceOpen((v) => !v)}
            aria-expanded={sourceOpen}
            className="flex items-center justify-between text-left"
          >
            <h2 className="font-serif text-xl font-semibold">원문 구간</h2>
            <span className="text-sm text-muted-foreground">
              {session.segments.length}개 · {sourceOpen ? "접기" : "펼치기"}
            </span>
          </button>
          {session.audio ? (
            <div className={cn("rounded-lg border border-border", !sourceOpen && "hidden")}>
              <SessionAudioPlayer
                audio={session.audio}
                playerRef={audioRef}
                onAvailableChange={setAudioAvailable}
              />
            </div>
          ) : null}
          {sourceOpen ? (
            <ol className="flex flex-col gap-1">
              {session.segments.map((seg) => {
                const seconds = seg.ts ? tsToSeconds(seg.ts) : null;
                return (
                  <li
                    key={seg.id}
                    id={`lib-seg-${seg.code}`}
                    className={cn(
                      "scroll-mt-24 rounded-lg px-3 py-2.5",
                      flashCode === seg.code ? "bg-highlight ring-2 ring-primary" : "",
                    )}
                  >
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span className="font-mono">{seg.code}</span>
                      <span className="font-medium text-foreground">{seg.speaker}</span>
                      {seg.ts ? <span className="font-mono">{seg.ts}</span> : null}
                      {audioAvailable && seconds != null ? (
                        <button
                          type="button"
                          onClick={() => playAt(seconds)}
                          className="ml-auto inline-flex size-7 items-center justify-center rounded-sm hover:bg-muted hover:text-foreground"
                          aria-label={`${seg.ts}부터 듣기`}
                        >
                          <Play className="size-3.5" />
                        </button>
                      ) : null}
                    </div>
                    <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed">{seg.body}</p>
                  </li>
                );
              })}
            </ol>
          ) : null}
        </section>
      </article>
    </EvidenceProvider>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-serif text-xl font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function Empty() {
  return <p className="text-sm text-muted-foreground">(없음)</p>;
}

function MinutesBody({ text }: { text: string }) {
  const clean = text.replace(/\*\*/g, "").replace(/__/g, "");
  const trimmed = clean.trim();
  if (!trimmed) return <Empty />;

  const blocks: ReactNode[] = [];
  let para: string[] = [];
  const flush = (key: string) => {
    if (!para.length) return;
    blocks.push(
      <p key={key} className="font-serif text-sm leading-relaxed text-ink-soft">
        <EvidenceInline text={para.join(" ")} />
      </p>,
    );
    para = [];
  };

  trimmed.split("\n").forEach((line, i) => {
    const t = line.trim();
    if (!t) {
      flush(`p-${i}`);
      return;
    }
    if (t.startsWith("## ") || t.startsWith("# ")) {
      flush(`p-${i}`);
      blocks.push(
        <h3 key={`h-${i}`} className="font-serif text-base font-bold text-foreground mt-3.5 mb-1">
          <EvidenceInline text={t.replace(/^##?\s+/, "")} />
        </h3>,
      );
      return;
    }
    // 공문서 1단계: 1. 대주제
    if (/^\d+[.)]\s+/.test(t) && !t.startsWith("-") && !t.startsWith("□") && !t.startsWith("○")) {
      flush(`p-${i}`);
      blocks.push(
        <h3 key={`h-${i}`} className="font-serif text-base font-bold text-foreground mt-3.5 mb-1">
          <EvidenceInline text={t} />
        </h3>,
      );
      return;
    }
    // 공문서 2단계: □ 중항목/핵심의제
    if (t.startsWith("□") || t.startsWith("■")) {
      flush(`p-${i}`);
      blocks.push(
        <h4
          key={`sq-${i}`}
          className="font-serif text-sm font-semibold text-foreground mt-2 mb-0.5 pl-2 border-l-2 border-primary/50"
        >
          <EvidenceInline text={t} />
        </h4>,
      );
      return;
    }
    // 공문서 3단계: ○ 주요 내용 요지
    if (t.startsWith("○") || t.startsWith("●")) {
      flush(`p-${i}`);
      blocks.push(
        <p key={`ci-${i}`} className="font-serif text-sm leading-relaxed text-ink-soft pl-4">
          <EvidenceInline text={t} />
        </p>,
      );
      return;
    }
    // 공문서 4단계: - 세부 설명
    if (t.startsWith("- ") || t.startsWith("· ") || t.startsWith("* ")) {
      flush(`p-${i}`);
      blocks.push(
        <p
          key={`li-${i}`}
          className="font-serif text-sm leading-relaxed text-muted-foreground pl-7"
        >
          <EvidenceInline text={t.startsWith("- ") ? `- ${t.slice(2)}` : t} />
        </p>,
      );
      return;
    }
    // 공문서 5단계: ※ 참고사항
    if (t.startsWith("※")) {
      flush(`p-${i}`);
      blocks.push(
        <p
          key={`note-${i}`}
          className="font-serif text-xs leading-relaxed text-muted-foreground italic pl-7"
        >
          <EvidenceInline text={t} />
        </p>,
      );
      return;
    }
    para.push(t);
  });
  flush("p-end");

  return <div className="flex flex-col gap-2">{blocks}</div>;
}
