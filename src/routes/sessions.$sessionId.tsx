import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import {
  ArrowLeft,
  Download,
  LoaderCircle,
  Pencil,
  Play,
  Plus,
  ScanText,
  Sparkles,
  Trash2,
  Users,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { StatusBadge } from "@/components/status-badge";
import { ThemeCard } from "@/components/theme-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  buildMinutesHtml,
  buildMinutesMarkdown,
  downloadHtml,
  downloadText,
  downloadWordDoc,
} from "@/lib/minutes-export";
import { parseTranscript, uniqueSpeakers } from "@/lib/parse-transcript";
import { SessionAudioPlayer } from "@/components/session-audio";
import { CodeChip, EvidenceProvider, EvidenceText } from "@/components/evidence";
import { tsToSeconds } from "@/lib/evidence/parse";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { verifyThemeQuotes } from "@/lib/ai/evidence";
import { cleanOfficialDocumentText } from "@/lib/ai/official-format";
import { runAnalyzeSession, runRewriteMinutes } from "@/lib/ai/run";
import {
  getSession,
  saveSessionDraft,
  confirmSession,
  reopenSession,
  deleteSession,
  updateSegments,
  updateSessionAnalysis,
  updateSessionMeta,
  setSessionAnalysisError,
} from "@/lib/firebase-db";
import { mergeThemes, SESSION_KINDS, type Fact, type ActionItem, type SessionDetail, type Theme } from "@/lib/types";
import { useAuth } from "@/lib/auth-context";
import { cn, formatDateKo, newId, padCode } from "@/lib/utils";
import { NativeSelect } from "@/components/native-select";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/sessions/$sessionId")({
  // ?seg=S012 로 들어오면 해당 원문 구간으로 이동해 강조한다.
  validateSearch: (search: { seg?: string }): { seg?: string } => ({
    seg: typeof search.seg === "string" && /^S\d{3,4}$/.test(search.seg) ? search.seg : undefined,
  }),
  component: SessionWorkbench,
});

function cloneSession(s: SessionDetail) {
  return {
    headline: s.headline,
    minutesOverview: s.minutesOverview,
    minutesBody: s.minutesBody,
    minutesFollowups: [...s.minutesFollowups],
    unresolved: [...s.unresolved],
    tags: [...s.tagLabels],
    actionItems: s.actionItems.map((a) => ({ ...a })),
    themes: s.themes.map((t) => ({
      ...t,
      bullets: [...t.bullets],
      sourceSegmentIds: [...t.sourceSegmentIds],
      quotes: t.quotes.map((q) => ({ ...q })),
    })),
    facts: s.facts.map((f) => ({ ...f })),
  };
}

function SessionWorkbench() {
  const { user } = useAuth();
  const uid = user?.uid;
  const { sessionId } = Route.useParams();
  const { data: session, isLoading, error } = useQuery({
    queryKey: ["session", sessionId, uid],
    queryFn: () => getSession(uid!, sessionId),
    enabled: !!uid,
  });

  if (!uid) return null;
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20 text-sm text-muted-foreground">
        <LoaderCircle className="mr-2 size-5 animate-spin" />
        세션을 불러오는 중
      </div>
    );
  }
  if (error || !session) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-card px-4 py-12 text-center text-sm text-muted-foreground">
        세션을 찾을 수 없습니다.
      </div>
    );
  }
  return <SessionEditor key={session.updatedAt} session={session} uid={uid} />;
}

function SessionEditor({ session, uid }: { session: SessionDetail; uid: string }) {
  const router = useRouter();
  const qc = useQueryClient();
  const [draft, setDraft] = useState(() => cloneSession(session));
  const [selectedThemeId, setSelectedThemeId] = useState<string | null>(
    session.themes[0]?.id ?? null,
  );
  const [mobilePane, setMobilePane] = useState<"transcript" | "themes" | "minutes">("themes");
  const [workTab, setWorkTab] = useState<"themes" | "minutes">("themes");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [checkedIds, setCheckedIds] = useState<string[]>([]);
  const [sourceOnly, setSourceOnly] = useState(false);
  const [speakerEdits, setSpeakerEdits] = useState<Record<string, string>>({});
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [evidenceConfirmOpen, setEvidenceConfirmOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [metaOpen, setMetaOpen] = useState(false);
  const [flashCode, setFlashCode] = useState<string | null>(null);
  const [audioAvailable, setAudioAvailable] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  const { seg: initialSeg } = Route.useSearch();

  useEffect(() => {
    setDraft(cloneSession(session));
    setSelectedThemeId(session.themes[0]?.id ?? null);
    setEditingId(null);
    setCheckedIds([]);
    setSpeakerEdits({});
  }, [session]);

  const isOwner = session.isOwner ?? (session.ownerUid ? session.ownerUid === uid : true);
  const canEdit = session.canEdit ?? isOwner;
  const canDelete = session.canDelete ?? isOwner;
  const isReadOnly = !canEdit;
  const locked = session.status === "confirmed" || isReadOnly;
  const selected = draft.themes.find((t) => t.id === selectedThemeId) ?? null;
  const speakers = uniqueSpeakers(session.segments);

  const payload = useMemo(
    () => ({
      id: session.id,
      headline: draft.headline,
      minutesOverview: draft.minutesOverview,
      minutesBody: draft.minutesBody,
      minutesFollowups: draft.minutesFollowups,
      unresolved: draft.unresolved,
      tags: draft.tags,
      facts: draft.facts,
      actionItems: draft.actionItems,
      themes: draft.themes,
    }),
    [session.id, draft],
  );

  const exportSession = {
    ...session,
    ...draft,
    tagLabels: draft.tags,
  };

  const refresh = async () => {
    await qc.invalidateQueries({ queryKey: ["session", session.id, uid] });
    await qc.invalidateQueries({ queryKey: ["sessions"] });
    await qc.invalidateQueries({ queryKey: ["projects"] });
    await qc.invalidateQueries({ queryKey: ["cross"] });
    await qc.invalidateQueries({ queryKey: ["library"] });
    await qc.invalidateQueries({ queryKey: ["tags"] });
  };

  const analyzeMut = useMutation({
    mutationFn: () => {
      if (!session.segments || session.segments.length === 0) {
        throw new Error("분석할 대화/발화 내용(세그먼트)이 없습니다. 먼저 녹취를 등록해주세요.");
      }
      return runAnalyzeSession({
        meta: {
          title: session.title,
          sessionKind: session.sessionKind,
          sessionDate: session.sessionDate,
          industry: session.industry,
          district: session.district,
          sizeLabel: session.sizeLabel,
          projectTitle: session.projectTitle,
        },
        segments: session.segments.map((s) => ({
          seq: s.seq,
          speaker: s.speaker,
          ts: s.ts,
          body: s.body,
          code: s.code,
        })),
      });
    },
    onSuccess: async (res) => {
      if (res.ok) {
        try {
          await updateSessionAnalysis(uid, session.id, res.result);
          toast.success("주제 구조와 회의록 초안을 만들었습니다.");
          await refresh();
        } catch (saveErr) {
          const errMsg = saveErr instanceof Error ? saveErr.message : String(saveErr);
          await setSessionAnalysisError(uid, session.id, errMsg);
          toast.error(`분석 결과 저장 실패: ${errMsg}`);
          await refresh();
        }
      } else {
        await setSessionAnalysisError(uid, session.id, res.error);
        toast.error(res.error);
        await refresh();
      }
    },
    onError: async (err: Error) => {
      await setSessionAnalysisError(uid, session.id, err.message);
      toast.error(err.message);
      await refresh();
    },
  });

  const saveMut = useMutation({
    mutationFn: () => saveSessionDraft(uid, payload),
    onSuccess: async () => {
      toast.success("초안을 저장했습니다.");
      await refresh();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const evidence = useMemo(
    () => verifyThemeQuotes(draft.themes, session.segments, draft.unresolved),
    [draft.themes, session.segments, draft.unresolved],
  );
  const lowThemeCount = draft.themes.filter((t) => t.confidence === "low").length;
  const missingSourceCount = draft.themes.filter((t) => t.sourceSegmentIds.length === 0).length;
  const unresolvedCount = draft.unresolved.filter(Boolean).length;
  const needsEvidenceReview =
    lowThemeCount > 0 ||
    missingSourceCount > 0 ||
    unresolvedCount > 0 ||
    evidence.droppedCount > 0;

  const confirmMut = useMutation({
    mutationFn: async () => {
      const checked = verifyThemeQuotes(draft.themes, session.segments, draft.unresolved);
      await saveSessionDraft(uid, {
        ...payload,
        themes: checked.themes,
        unresolved: checked.unresolved,
      });
      return confirmSession(uid, session.id);
    },
    onSuccess: async (res) => {
      if (res.indexed) toast.success("자료실에 회의록을 올렸습니다.");
      else
        toast.warning(
          "자료실에 올렸지만 검색 색인을 만들지 못했습니다. 관리자가 설정에서 색인을 다시 만들 수 있습니다.",
        );
      await refresh();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const reopenMut = useMutation({
    mutationFn: () => reopenSession(uid, session.id),
    onSuccess: async () => {
      toast.success("확정을 해제했습니다.");
      await refresh();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const rewriteMut = useMutation({
    mutationFn: () =>
      runRewriteMinutes({
        meta: {
          title: session.title,
          sessionKind: session.sessionKind,
          sessionDate: session.sessionDate,
          projectTitle: session.projectTitle,
        },
        themes: draft.themes.map((t) => ({
          title: t.title,
          summary: t.summary,
          bullets: t.bullets,
          sourceSegments: t.sourceSegmentIds,
          quotes: t.quotes,
          confidence: t.confidence,
        })),
        facts: draft.facts.map((f) => ({
          label: f.label,
          value: f.value,
          segmentId: f.segmentCode,
        })),
        unresolved: draft.unresolved,
      }),
    onSuccess: async (res) => {
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      const min = (res as any)?.minutes || (res as any)?.result?.minutes || res;
      setDraft((d) => ({
        ...d,
        minutesOverview: typeof min?.overview === "string" ? min.overview : "",
        minutesBody: cleanOfficialDocumentText(typeof min?.body === "string" ? min.body : ""),
        minutesFollowups: Array.isArray(min?.followups) ? min.followups : [],
      }));
      toast.success("공문서 개조식 회의록 초안을 다시 썼습니다. 저장을 눌러 보관하세요.");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteMut = useMutation({
    mutationFn: () => deleteSession(uid, session.id),
    onSuccess: async () => {
      setDeleteConfirmOpen(false);
      toast.success("녹취 인터뷰를 삭제했습니다.");
      await qc.invalidateQueries({ queryKey: ["sessions"] });
      await qc.invalidateQueries({ queryKey: ["projects"] });
      if (session.projectId) {
        await router.navigate({ to: "/projects/$projectId", params: { projectId: session.projectId } });
      } else {
        await router.navigate({ to: "/" });
      }
    },
    onError: (err: Error) => {
      setDeleteConfirmOpen(false);
      toast.error(err.message || "삭제 중 오류가 발생했습니다.");
    },
  });

  const speakerMut = useMutation({
    mutationFn: () =>
      updateSegments(uid, {
        id: session.id,
        segments: session.segments.map((seg) => ({
          seq: seg.seq,
          speaker: speakerEdits[seg.speaker] ?? seg.speaker,
          ts: seg.ts,
          body: seg.body,
          code: seg.code,
        })),
      }),
    onSuccess: async () => {
      toast.success("화자 이름을 고쳤습니다.");
      await refresh();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  function patchTheme(id: string, patch: Partial<Theme>) {
    setDraft((d) => ({
      ...d,
      themes: d.themes.map((t) => (t.id === id ? { ...t, ...patch } : t)),
    }));
  }

  function toggleSource(code: string) {
    if (!selected || locked) return;
    const has = selected.sourceSegmentIds.includes(code);
    patchTheme(selected.id, {
      sourceSegmentIds: has
        ? selected.sourceSegmentIds.filter((c) => c !== code)
        : [...selected.sourceSegmentIds, code],
    });
  }

  function addTheme() {
    const theme: Theme = {
      id: newId("thm"),
      sortOrder: draft.themes.length,
      title: "새 주제",
      summary: "",
      bullets: [],
      sourceSegmentIds: [],
      quotes: [],
      confidence: "medium",
    };
    setDraft((d) => ({ ...d, themes: [...d.themes, theme] }));
    setSelectedThemeId(theme.id);
    setEditingId(theme.id);
    setMobilePane("themes");
    setWorkTab("themes");
  }

  function removeTheme(id: string) {
    setDraft((d) => ({ ...d, themes: d.themes.filter((t) => t.id !== id) }));
    setCheckedIds((ids) => ids.filter((x) => x !== id));
    if (selectedThemeId === id) setSelectedThemeId(null);
    if (editingId === id) setEditingId(null);
  }

  function mergeSelected() {
    const picked = draft.themes.filter((t) => checkedIds.includes(t.id));
    if (picked.length < 2) {
      toast.error("병합할 주제를 두 개 이상 고르세요.");
      return;
    }
    const merged = mergeThemes(picked);
    const keepId = picked[0]!.id;
    const drop = new Set(picked.slice(1).map((t) => t.id));
    setDraft((d) => ({
      ...d,
      themes: d.themes
        .filter((t) => !drop.has(t.id))
        .map((t) => (t.id === keepId ? merged : t)),
    }));
    setCheckedIds([]);
    setSelectedThemeId(keepId);
    setEditingId(keepId);
    toast.success("주제를 한 장으로 합쳤습니다. 제목을 다듬고 저장하세요.");
  }

  function doExport(kind: "html" | "doc" | "md") {
    const html = buildMinutesHtml({
      session: exportSession,
      themes: draft.themes,
      facts: draft.facts,
      tags: draft.tags,
    });
    if (kind === "html") downloadHtml(`${session.title}-회의록.html`, html);
    else if (kind === "doc") downloadWordDoc(`${session.title}-회의록.doc`, html);
    else
      downloadText(
        `${session.title}-회의록.md`,
        buildMinutesMarkdown({
          session: exportSession,
          themes: draft.themes,
          facts: draft.facts,
          tags: draft.tags,
        }),
      );
    setExportOpen(false);
  }

  const visibleSegments =
    sourceOnly && selected
      ? session.segments.filter((s) => selected.sourceSegmentIds.includes(s.code))
      : session.segments;

  const jumpTo = useCallback((code: string) => {
    setSourceOnly(false);
    setMobilePane("transcript");
    setFlashCode(code);
    requestAnimationFrame(() => {
      document.getElementById(`seg-${code}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }, []);

  useEffect(() => {
    if (!flashCode) return;
    const t = window.setTimeout(() => setFlashCode(null), 2500);
    return () => window.clearTimeout(t);
  }, [flashCode]);

  // 주소의 ?seg= 로 들어온 경우 한 번 이동
  useEffect(() => {
    if (initialSeg) jumpTo(initialSeg);
  }, [initialSeg, jumpTo]);

  const playAt = useCallback((seconds: number) => {
    const el = audioRef.current;
    if (!el) return;
    el.currentTime = seconds;
    void el.play().catch(() => undefined);
    el.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, []);

  const busy = analyzeMut.isPending || rewriteMut.isPending;
  const speakerDirty = speakers.some((n) => speakerEdits[n] && speakerEdits[n] !== n);

  return (
    <EvidenceProvider
      segments={session.segments}
      onJump={jumpTo}
      onPlay={audioAvailable ? playAt : undefined}
    >
    <div className="flex flex-col gap-4">
      {busy ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/70">
          <div className="flex items-center gap-3 rounded-xl border border-border bg-card px-5 py-4 shadow-[var(--shadow-panel)]">
            <LoaderCircle className="size-5 animate-spin text-primary" />
            <p className="text-sm">
              {analyzeMut.isPending
                ? "구간을 읽고 주제를 나누고 있습니다."
                : "회의록 초안을 다시 쓰는 중입니다."}
            </p>
          </div>
        </div>
      ) : null}

      <div className="flex flex-col gap-3 border-b border-border pb-4">
        <Link
          to="/projects/$projectId"
          params={{ projectId: session.projectId }}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          {session.projectTitle}
        </Link>
        {isReadOnly ? (
          <div className="flex items-center justify-between rounded-md border border-primary/20 bg-primary/5 px-3.5 py-2 text-xs text-foreground">
            <div className="flex items-center gap-2">
              <Users className="size-4 text-primary shrink-0" />
              <span>
                <strong>공동 열람 모드</strong>: {session.researcher ? `${session.researcher} 연구원` : "동료 연구원"}이 등록한 자료입니다.
              </span>
            </div>
            <span className="rounded bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
              읽기 및 내보내기 전용
            </span>
          </div>
        ) : null}

        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-serif text-2xl font-semibold tracking-tight sm:text-3xl">
                {session.title}
              </h1>
              <StatusBadge status={session.status} />
              {!locked ? (
                <Button size="sm" variant="ghost" onClick={() => setMetaOpen(true)}>
                  <Pencil className="size-4" />
                  정보
                </Button>
              ) : null}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {session.sessionKind} · {formatDateKo(session.sessionDate)}
              {session.researcher ? ` · ${session.researcher}` : ""}
              {session.district ? ` · ${session.district}` : ""}
              {session.industry ? ` · ${session.industry}` : ""}
              {session.sizeLabel ? ` · ${session.sizeLabel}` : ""}
            </p>
            {session.headline ? (
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-soft">
                {session.headline}
              </p>
            ) : null}
          </div>
          <div className="no-print flex flex-wrap gap-2">
            {!locked ? (
              <>
                <Button variant="outline" onClick={() => analyzeMut.mutate()} disabled={busy}>
                  <ScanText className="size-4" />
                  {session.themes.length ? "다시 분석" : "분석"}
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => saveMut.mutate()}
                  disabled={saveMut.isPending}
                >
                  초안 저장
                </Button>
                <Button
                  className="min-w-24"
                  onClick={() => {
                    if (needsEvidenceReview) {
                      setEvidenceConfirmOpen(true);
                      return;
                    }
                    confirmMut.mutate();
                  }}
                  disabled={confirmMut.isPending}
                >
                  확정
                </Button>
              </>
            ) : (
              <>
                {session.status === "confirmed" ? (
                  <Button variant="outline" asChild>
                    <Link to="/library/$sessionId" params={{ sessionId: session.id }}>
                      자료실에서 보기
                    </Link>
                  </Button>
                ) : null}
                {canEdit && session.status === "confirmed" ? (
                  <Button variant="outline" onClick={() => reopenMut.mutate()}>
                    확정 해제
                  </Button>
                ) : null}
              </>
            )}
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
            {canDelete ? (
              <Button
                variant="ghost"
                onClick={() => setDeleteConfirmOpen(true)}
                disabled={deleteMut.isPending}
                title="인터뷰 삭제"
                className="text-muted-foreground hover:text-destructive hover:bg-destructive/10"
              >
                <Trash2 className="size-4" />
              </Button>
            ) : null}
          </div>
        </div>
        {session.analysisError ? (
          <p className="rounded-md border border-destructive/30 bg-card px-3 py-2 text-sm text-destructive">
            {session.analysisError}
          </p>
        ) : null}
        {!locked && needsEvidenceReview ? (
          <p className="rounded-md border border-review/30 bg-review-soft px-3 py-2 text-sm text-review">
            확정 전에 확인하세요.
            {lowThemeCount > 0 ? ` 확신 낮음 ${lowThemeCount}개.` : ""}
            {missingSourceCount > 0 ? ` 근거 없는 주제 ${missingSourceCount}개.` : ""}
            {unresolvedCount > 0 ? ` 미해소 ${unresolvedCount}건.` : ""}
            {evidence.droppedCount > 0
              ? ` 원문에서 확인되지 않은 인용 ${evidence.droppedCount}개(확정 시 제외).`
              : ""}
          </p>
        ) : null}
      </div>

      <div className="no-print sticky top-14 z-30 flex gap-1 rounded-lg bg-muted p-1 lg:hidden">
        {(
          [
            ["transcript", "원문"],
            ["themes", "주제"],
            ["minutes", "회의록"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={cn(
              "h-9 flex-1 rounded-md text-sm font-medium",
              mobilePane === id ? "bg-card shadow-sm" : "",
            )}
            onClick={() => {
              setMobilePane(id);
              if (id === "themes") setWorkTab("themes");
              if (id === "minutes") setWorkTab("minutes");
            }}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section
          className={cn(
            "min-h-[50vh] rounded-xl border border-border bg-card",
            mobilePane === "transcript" ? "" : "hidden lg:block",
          )}
        >
          <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
            <div>
              <h2 className="text-sm font-medium">원문 구간</h2>
              <p className="text-xs text-muted-foreground">
                주제를 고른 뒤 구간을 누르면 근거로 연결됩니다.
              </p>
            </div>
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <input
                type="checkbox"
                className="size-4 accent-primary"
                checked={sourceOnly}
                onChange={(e) => setSourceOnly(e.target.checked)}
                disabled={!selected}
              />
              근거만
            </label>
          </div>
          {session.audio ? (
            <SessionAudioPlayer
              audio={session.audio}
              playerRef={audioRef}
              onAvailableChange={setAudioAvailable}
              canRetranscribe={!locked}
              onRetranscribe={async (text) => {
                const parsed = parseTranscript(text);
                if (parsed.length === 0) throw new Error("전사 결과가 비어 있습니다.");
                await updateSegments(uid, {
                  id: session.id,
                  segments: parsed.map((seg, i) => ({
                    seq: i + 1,
                    speaker: seg.speaker,
                    ts: seg.ts,
                    body: seg.body,
                    code: padCode(i + 1),
                  })),
                });
                await refresh();
              }}
            />
          ) : null}
          {!locked && speakers.length > 0 ? (
            <div className="flex flex-wrap items-end gap-2 border-b border-border px-4 py-3">
              {speakers.map((name) => (
                <label key={name} className="flex min-w-28 flex-1 flex-col gap-1">
                  <span className="text-xs text-muted-foreground">{name}</span>
                  <Input
                    value={speakerEdits[name] ?? name}
                    onChange={(e) =>
                      setSpeakerEdits((m) => ({ ...m, [name]: e.target.value }))
                    }
                  />
                </label>
              ))}
              <Button
                size="sm"
                variant="outline"
                disabled={!speakerDirty || speakerMut.isPending}
                onClick={() => speakerMut.mutate()}
              >
                화자 반영
              </Button>
            </div>
          ) : null}
          <ol className="p-2 lg:max-h-[70vh] lg:overflow-auto">
            {visibleSegments.length === 0 ? (
              <li className="px-3 py-8 text-center text-sm text-muted-foreground">
                {session.segments.length === 0 && session.audio
                  ? "원본은 보관되어 있습니다. 위에서 다시 전사하세요."
                  : "이 주제에 연결된 구간이 없습니다."}
              </li>
            ) : (
              visibleSegments.map((seg) => {
                const active = selected?.sourceSegmentIds.includes(seg.code);
                const seconds = seg.ts ? tsToSeconds(seg.ts) : null;
                return (
                  <li key={seg.id} id={`seg-${seg.code}`} className="relative scroll-mt-24">
                    {audioAvailable && seconds != null ? (
                      <button
                        type="button"
                        onClick={() => playAt(seconds)}
                        className="absolute right-2 top-2 z-10 inline-flex size-8 items-center justify-center rounded-sm text-muted-foreground hover:bg-muted hover:text-foreground"
                        aria-label={`${seg.ts}부터 듣기`}
                        title={`${seg.ts}부터 듣기`}
                      >
                        <Play className="size-3.5" />
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => toggleSource(seg.code)}
                      className={cn(
                        "w-full rounded-lg px-3 py-3 text-left transition-colors",
                        active ? "bg-highlight" : "hover:bg-muted/70",
                        flashCode === seg.code && "ring-2 ring-primary ring-offset-1",
                      )}
                    >
                      <div className="flex items-baseline gap-2 text-xs text-muted-foreground">
                        <span className="font-mono">{seg.code}</span>
                        <span className="font-medium text-foreground">{seg.speaker}</span>
                        {seg.ts ? <span className="font-mono">{seg.ts}</span> : null}
                      </div>
                      <p className="mt-1 text-sm leading-relaxed whitespace-pre-wrap">
                        {seg.body}
                      </p>
                    </button>
                  </li>
                );
              })
            )}
          </ol>
        </section>

        <section
          className={cn(
            "min-h-[50vh] rounded-xl border border-border bg-card",
            mobilePane === "transcript" ? "hidden lg:block" : "",
          )}
        >
          <Tabs
            value={workTab}
            onValueChange={(v) => {
              const tab = v as "themes" | "minutes";
              setWorkTab(tab);
              setMobilePane(tab === "themes" ? "themes" : "minutes");
            }}
            className="p-4"
          >
            <TabsList className="hidden lg:flex w-full justify-start overflow-x-auto">
              <TabsTrigger value="themes">주제 {draft.themes.length}</TabsTrigger>
              <TabsTrigger value="minutes">회의록</TabsTrigger>
              
            </TabsList>
            <TabsContent value="themes" className="flex flex-col gap-3">
              <div className="flex flex-wrap justify-end gap-2">
                {!locked ? (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={checkedIds.length < 2}
                    onClick={mergeSelected}
                  >
                    선택 병합
                  </Button>
                ) : null}
                <Button size="sm" variant="outline" disabled={locked} onClick={addTheme}>
                  <Plus className="size-4" />
                  주제 추가
                </Button>
              </div>
              {draft.themes.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  아직 주제가 없습니다. 분석을 누르면 대화에서 주제를 찾아 옵니다.
                </p>
              ) : (
                draft.themes.map((theme) => (
                  <ThemeCard
                    key={theme.id}
                    theme={theme}
                    selected={theme.id === selectedThemeId}
                    checked={checkedIds.includes(theme.id)}
                    editing={editingId === theme.id}
                    locked={locked}
                    onSelect={() => setSelectedThemeId(theme.id)}
                    onToggleCheck={() =>
                      setCheckedIds((ids) =>
                        ids.includes(theme.id)
                          ? ids.filter((x) => x !== theme.id)
                          : [...ids, theme.id],
                      )
                    }
                    onStartEdit={() => {
                      setSelectedThemeId(theme.id);
                      setEditingId(theme.id);
                    }}
                    onChange={(patch) => patchTheme(theme.id, patch)}
                    onRemove={() => removeTheme(theme.id)}
                    onJump={jumpTo}
                  />
                ))
              )}
            </TabsContent>
            <TabsContent value="minutes" className="flex flex-col gap-3">
              {!locked ? (
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/50 pb-2">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span className="font-semibold text-foreground">공문서 개조식 서식:</span>
                    <span>1. 대주제 → □ 중의제 → ○ 주요요지 → - 세부근거</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      type="button"
                      onClick={() => {
                        if (!draft.minutesBody) return;
                        const cleaned = cleanOfficialDocumentText(draft.minutesBody);
                        setDraft((d) => ({ ...d, minutesBody: cleaned }));
                        toast.success("한국 공문서 개조식(箇條式) 문체로 정제되었습니다.");
                      }}
                      disabled={busy || !draft.minutesBody || isReadOnly}
                      className="gap-1.5 text-xs"
                      title="AI 마크다운 볼드(**) 기호를 제거하고 공문서 개조식(1./□/○/-)으로 정제합니다"
                    >
                      <Sparkles className="size-3.5 text-primary" />
                      개조식 문체로 정제
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => rewriteMut.mutate()}
                      disabled={busy || draft.themes.length === 0 || isReadOnly}
                      className="text-xs"
                    >
                      회의록 다시 쓰기
                    </Button>
                  </div>
                </div>
              ) : null}
              <label className="text-xs font-medium text-muted-foreground">개요</label>
              {locked ? (
                <EvidenceText
                  text={draft.minutesOverview || "(없음)"}
                  className="rounded-md border border-border bg-muted/20 px-3 py-2 text-sm leading-relaxed"
                />
              ) : (
                <Textarea
                  rows={4}
                  value={draft.minutesOverview}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, minutesOverview: e.target.value }))
                  }
                />
              )}
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-muted-foreground">
                  본문 (한국 공문서 표준 개조식)
                </label>
                {!locked && !isReadOnly && draft.minutesBody ? (
                  <button
                    type="button"
                    onClick={() => {
                      const cleaned = cleanOfficialDocumentText(draft.minutesBody);
                      setDraft((d) => ({ ...d, minutesBody: cleaned }));
                      toast.success("한국 공문서 개조식(箇條式) 문체로 정제되었습니다.");
                    }}
                    className="text-xs text-primary hover:underline flex items-center gap-1"
                  >
                    <Sparkles className="size-3" />
                    마크다운(**) 제거 및 개조식 정제
                  </button>
                ) : null}
              </div>
              {locked ? (
                <EvidenceText
                  text={draft.minutesBody || "(없음)"}
                  className="rounded-md border border-border bg-muted/20 px-3 py-2 font-serif text-sm leading-relaxed"
                />
              ) : (
                <>
                <Textarea
                  rows={16}
                  className="font-serif leading-relaxed text-sm"
                  value={draft.minutesBody}
                  onChange={(e) => setDraft((d) => ({ ...d, minutesBody: e.target.value }))}
                  placeholder="1. 대주제&#10;  □ 핵심 안건 및 논의 사항&#10;    ○ 주요 발언 및 현황 요지 (~함, ~임)&#10;      - 세부 근거 및 통계 데이터"
                />
                  {/\bS\d{3,4}\b/.test(draft.minutesBody) ? (
                    <details className="rounded-md border border-border bg-muted/20 px-3 py-2">
                      <summary className="cursor-pointer text-xs text-muted-foreground">
                        근거 구간 연결 미리보기
                      </summary>
                      <EvidenceText
                        text={draft.minutesBody}
                        className="mt-2 font-serif text-sm leading-relaxed"
                      />
                    </details>
                  ) : null}
                </>
              )}
              <label className="text-xs font-medium text-muted-foreground">후속 확인</label>
              <Textarea
                rows={4}
                disabled={locked}
                value={draft.minutesFollowups.join("\n")}
                onChange={(e) =>
                  setDraft((d) => ({
                    ...d,
                    minutesFollowups: e.target.value.split("\n"),
                  }))
                }
              />
            </TabsContent>
            
          </Tabs>
        </section>
      </div>
      <SessionMetaDialog
        open={metaOpen}
        onOpenChange={setMetaOpen}
        session={session}
        uid={uid}
        onSaved={refresh}
      />
      <ConfirmDialog
        open={deleteConfirmOpen}
        onOpenChange={setDeleteConfirmOpen}
        title="녹취 인터뷰 삭제"
        description={`‘${session.title || "이 인터뷰"}’를 삭제하시겠습니까?\n등록된 오디오 파일, 전사 본문, 추출된 주제와 인용구가 영구적으로 삭제됩니다.`}
        confirmText="인터뷰 삭제"
        cancelText="취소"
        variant="destructive"
        isLoading={deleteMut.isPending}
        onConfirm={() => deleteMut.mutate()}
      />
      <ConfirmDialog
        open={evidenceConfirmOpen}
        onOpenChange={setEvidenceConfirmOpen}
        title="인터뷰 확정"
        description={"확신 낮음·미해소·원문에서 확인되지 않은 인용이 있습니다.\n확인되지 않은 인용은 제외하고 확정을 진행할까요?"}
        confirmText="계속 확정하기"
        cancelText="취소"
        variant="default"
        isLoading={confirmMut.isPending}
        onConfirm={() => {
          setEvidenceConfirmOpen(false);
          confirmMut.mutate();
        }}
      />
    </div>
    </EvidenceProvider>
  );
}

function FactRow({
  fact,
  locked,
  onChange,
  onRemove,
}: {
  fact: Fact;
  locked: boolean;
  onChange: (f: Fact) => void;
  onRemove: () => void;
}) {
  return (
    <div className="grid grid-cols-[1fr_1fr_72px_40px] gap-2">
      <Input
        disabled={locked}
        value={fact.label}
        placeholder="항목"
        onChange={(e) => onChange({ ...fact, label: e.target.value })}
      />
      <Input
        disabled={locked}
        value={fact.value}
        placeholder="값"
        onChange={(e) => onChange({ ...fact, value: e.target.value })}
      />
      {locked ? (
        <span className="flex items-center justify-center">
          {fact.segmentCode ? <CodeChip code={fact.segmentCode} /> : null}
        </span>
      ) : (
        <Input
          value={fact.segmentCode}
          className="font-mono text-xs"
          placeholder="S001"
          onChange={(e) => onChange({ ...fact, segmentCode: e.target.value })}
        />
      )}
      {!locked ? (
        <Button size="icon" variant="ghost" onClick={onRemove} aria-label="사실 삭제">
          <Trash2 className="size-4" />
        </Button>
      ) : (
        <span />
      )}
    </div>
  );
}

function ActionItemRow({
  item,
  locked,
  onChange,
  onRemove,
}: {
  item: ActionItem;
  locked: boolean;
  onChange: (a: ActionItem) => void;
  onRemove: () => void;
}) {
  return (
    <div className="grid grid-cols-[1fr_1fr_2fr_72px_40px] gap-2 items-center bg-muted/40 p-2 rounded-lg border border-border/50">
      <Input
        disabled={locked}
        value={item.assignee}
        placeholder="담당자"
        className="h-8 text-sm"
        onChange={(e) => onChange({ ...item, assignee: e.target.value })}
      />
      <Input
        disabled={locked}
        value={item.deadline}
        placeholder="기한"
        className="h-8 text-sm"
        onChange={(e) => onChange({ ...item, deadline: e.target.value })}
      />
      <Input
        disabled={locked}
        value={item.task}
        placeholder="무엇을"
        className="h-8 text-sm"
        onChange={(e) => onChange({ ...item, task: e.target.value })}
      />
      {locked ? (
        <span className="flex items-center justify-center">
          {item.segmentCode ? <CodeChip code={item.segmentCode} /> : null}
        </span>
      ) : (
        <Input
          value={item.segmentCode}
          className="font-mono text-xs h-8"
          placeholder="S001"
          onChange={(e) => onChange({ ...item, segmentCode: e.target.value })}
        />
      )}
      {!locked ? (
        <Button size="icon" variant="ghost" onClick={onRemove} aria-label="삭제" className="size-8">
          <Trash2 className="size-4 text-muted-foreground hover:text-destructive" />
        </Button>
      ) : (
        <span />
      )}
    </div>
  );
}

function SessionMetaDialog({
  open,
  onOpenChange,
  session,
  uid,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  session: SessionDetail;
  uid: string;
  onSaved: () => Promise<void>;
}) {
  const [title, setTitle] = useState(session.title);
  const [sessionDate, setSessionDate] = useState(session.sessionDate ?? "");
  const [sessionKind, setSessionKind] = useState(session.sessionKind);
  const [industry, setIndustry] = useState(session.industry);
  const [sizeLabel, setSizeLabel] = useState(session.sizeLabel);
  const [district, setDistrict] = useState(session.district);
  const [researcher, setResearcher] = useState(session.researcher);

  useEffect(() => {
    setTitle(session.title);
    setSessionDate(session.sessionDate ?? "");
    setSessionKind(session.sessionKind);
    setIndustry(session.industry);
    setSizeLabel(session.sizeLabel);
    setDistrict(session.district);
    setResearcher(session.researcher);
  }, [session]);

  const mutation = useMutation({
    mutationFn: () =>
      updateSessionMeta(uid, {
        id: session.id,
        title,
        sessionDate: sessionDate || null,
        sessionKind,
        industry,
        sizeLabel,
        district,
        researcher,
      }),
    onSuccess: async () => {
      toast.success("조사 정보를 저장했습니다.");
      onOpenChange(false);
      await onSaved();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>조사 정보</DialogTitle>
          <DialogDescription>대상명과 현장 메타를 고칩니다.</DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            mutation.mutate();
          }}
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="stitle">대상</Label>
            <Input id="stitle" value={title} onChange={(e) => setTitle(e.target.value)} required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="sdate">일자</Label>
              <Input
                id="sdate"
                type="date"
                value={sessionDate}
                onChange={(e) => setSessionDate(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="skind">유형</Label>
              <NativeSelect
                id="skind"
                value={sessionKind}
                onChange={(e) => setSessionKind(e.target.value)}
              >
                {SESSION_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
              </NativeSelect>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="sind">업종</Label>
              <Input id="sind" value={industry} onChange={(e) => setIndustry(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ssize">규모</Label>
              <Input id="ssize" value={sizeLabel} onChange={(e) => setSizeLabel(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="sdist">지역</Label>
              <Input id="sdist" value={district} onChange={(e) => setDistrict(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="sres">조사자</Label>
              <Input id="sres" value={researcher} onChange={(e) => setResearcher(e.target.value)} />
            </div>
          </div>
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? "저장 중" : "저장"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
