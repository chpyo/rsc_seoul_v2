import { FileSearch, Play } from "lucide-react";
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { splitEvidence, tsToSeconds } from "@/lib/evidence/parse";
import type { Segment } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * 근거 구간(S012) 표시.
 * EvidenceProvider 가 원문 구간과 "원문으로 이동"·"이 시점부터 듣기" 동작을 내려 준다.
 */

type EvidenceContextValue = {
  segments: Map<string, Segment>;
  onJump?: (code: string) => void;
  /** 녹음을 들을 수 있을 때만 */
  onPlay?: (seconds: number) => void;
};

const EvidenceContext = createContext<EvidenceContextValue>({ segments: new Map() });

export function EvidenceProvider({
  segments,
  onJump,
  onPlay,
  children,
}: {
  segments: Segment[];
  onJump?: (code: string) => void;
  onPlay?: (seconds: number) => void;
  children: ReactNode;
}) {
  const value = useMemo(
    () => ({ segments: new Map(segments.map((s) => [s.code, s])), onJump, onPlay }),
    [segments, onJump, onPlay],
  );
  return <EvidenceContext.Provider value={value}>{children}</EvidenceContext.Provider>;
}

export function useEvidence() {
  return useContext(EvidenceContext);
}

export function CodeChip({ code, className }: { code: string; className?: string }) {
  const { segments, onJump, onPlay } = useEvidence();
  const seg = segments.get(code);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const seconds = seg?.ts ? tsToSeconds(seg.ts) : null;

  return (
    <span ref={wrapRef} className="relative inline-block align-baseline">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        title={seg ? `${seg.speaker}${seg.ts ? ` · ${seg.ts}` : ""}` : "원문에 없는 구간 코드입니다"}
        className={cn(
          "rounded-sm border px-1 font-mono text-[0.8em] leading-snug",
          seg
            ? "border-inju/30 bg-card text-inju hover:bg-inju/10"
            : "border-dashed border-muted-foreground/40 text-muted-foreground",
          className,
        )}
      >
        {code}
      </button>
      {open ? (
        <span
          role="dialog"
          className="absolute left-0 top-full z-40 mt-1 block w-72 max-w-[80vw] rounded-md border border-border bg-card p-3 text-left font-sans shadow-[var(--shadow-panel)]"
        >
          {seg ? (
            <>
              <span className="flex items-baseline gap-2 text-xs text-muted-foreground">
                <span className="font-mono">{seg.code}</span>
                <span className="font-medium text-foreground">{seg.speaker}</span>
                {seg.ts ? <span className="font-mono">{seg.ts}</span> : null}
              </span>
              <span className="mt-1 line-clamp-6 block whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                {seg.body}
              </span>
              <span className="mt-2 flex flex-wrap gap-1.5">
                {onJump ? (
                  <button
                    type="button"
                    className="inline-flex h-8 items-center gap-1 rounded-sm border border-border px-2 text-xs hover:bg-muted"
                    onClick={() => {
                      setOpen(false);
                      onJump(code);
                    }}
                  >
                    <FileSearch className="size-3.5" />
                    원문에서 보기
                  </button>
                ) : null}
                {onPlay && seconds != null ? (
                  <button
                    type="button"
                    className="inline-flex h-8 items-center gap-1 rounded-sm border border-border px-2 text-xs hover:bg-muted"
                    onClick={() => onPlay(seconds)}
                  >
                    <Play className="size-3.5" />
                    {seg.ts}부터 듣기
                  </button>
                ) : null}
              </span>
            </>
          ) : (
            <span className="text-xs text-muted-foreground">
              이 녹취의 원문에 {code} 구간이 없습니다.
            </span>
          )}
        </span>
      ) : null}
    </span>
  );
}

/** 문단 속 구간 코드를 칩으로 바꿔 보여 준다. 줄바꿈과 들여쓰기는 그대로 둔다. */
export function EvidenceText({ text, className }: { text: string; className?: string }) {
  const tokens = useMemo(() => splitEvidence(text), [text]);
  return (
    <div className={cn("whitespace-pre-wrap", className)}>
      {tokens.map((t, i) =>
        t.type === "code" ? (
          <CodeChip key={i} code={t.code} />
        ) : t.type === "cite" ? (
          <span key={i}>{t.raw}</span>
        ) : (
          <span key={i}>{t.value}</span>
        ),
      )}
    </div>
  );
}

/** 한 줄(인라인)용. 블록 요소 없이 텍스트와 칩만 내보낸다. */
export function EvidenceInline({ text }: { text: string }) {
  const tokens = useMemo(() => splitEvidence(text), [text]);
  return (
    <>
      {tokens.map((t, i) =>
        t.type === "code" ? (
          <CodeChip key={i} code={t.code} />
        ) : t.type === "cite" ? (
          <span key={i}>{t.raw}</span>
        ) : (
          <span key={i}>{t.value}</span>
        ),
      )}
    </>
  );
}
