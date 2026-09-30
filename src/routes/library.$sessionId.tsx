import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { ArrowLeft, Download, LoaderCircle, Pencil, Play, Printer } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { EvidenceProvider } from "@/components/evidence";
import { DropMenu } from "@/components/drop-menu";
import { OfficialMinutesDoc } from "@/components/official-doc";
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
import { cn } from "@/lib/utils";

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
  }

  return (
    <EvidenceProvider
      segments={session.segments}
      onJump={jumpTo}
      onPlay={audioAvailable ? playAt : undefined}
    >
      <div className="mx-auto flex max-w-[calc(210mm+2rem)] flex-col gap-6">
        <div className="no-print flex flex-wrap items-center justify-between gap-3">
          <Link
            to="/library"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-4" />
            자료실
          </Link>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => window.print()}>
              <Printer className="size-4" />
              인쇄
            </Button>
            <DropMenu
              trigger={
                <>
                  <Download className="size-4" />
                  내보내기
                </>
              }
              items={[
                { label: "한글·Word", onSelect: () => doExport("doc") },
                { label: "HTML", onSelect: () => doExport("html") },
                { label: "마크다운", onSelect: () => doExport("md") },
              ]}
            />
            <Button variant="outline" asChild>
              <Link
                to="/sessions/$sessionId"
                params={{ sessionId: session.id }}
                search={{ seg: undefined }}
              >
                <Pencil className="size-4" />
                작업대로 열기
              </Link>
            </Button>
          </div>
        </div>

        <OfficialMinutesDoc session={session} />

        <section className="no-print flex flex-col gap-3">
          <button
            type="button"
            onClick={() => setSourceOpen((v) => !v)}
            aria-expanded={sourceOpen}
            className="flex items-center justify-between text-left"
          >
            <h2 className="font-sans text-base font-semibold">원문 구간</h2>
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
            <ol className="flex flex-col gap-1 rounded-lg border border-border bg-card p-2">
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
      </div>
    </EvidenceProvider>
  );
}
