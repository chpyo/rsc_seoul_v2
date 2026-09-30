import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { ArrowLeft, LoaderCircle, ScanText, Download, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TagChart } from "@/components/tag-chart";
import { ChatModal } from "@/components/chat-modal";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { runCrossSummary } from "@/lib/ai/run";
import { listSessions, getCrossAnalysis, saveCrossSummary, deleteProject } from "@/lib/firebase-db";
import { listLiteratures } from "@/lib/firebase-literature";
import type { CrossSummary } from "@/lib/types";
import { formatDateKo } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";

function downloadMarkdown(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function buildCrossSummaryMarkdown(crossSummary: CrossSummary, projectTitle: string) {
  let md = `# ${projectTitle} - 교차 요약 리포트\n\n`;
  md += `## 개요\n${crossSummary.overview}\n\n`;

  if (crossSummary.repeated.length > 0) {
    md += `## 공통된 의견\n`;
    for (const r of crossSummary.repeated) {
      md += `### ${r.claim}\n`;
      md += `출처: ${r.sessionTitles.join(", ")}\n\n`;
      if (r.evidence) md += `${r.evidence}\n\n`;
    }
  }

  if (crossSummary.tensions.length > 0) {
    md += `## 서로 다른 점\n`;
    for (const t of crossSummary.tensions) {
      md += `### ${t.point}\n`;
      md += `- ${t.detail}\n\n`;
    }
  }

  if (crossSummary.followups.length > 0) {
    md += `## 후속 확인\n`;
    for (const f of crossSummary.followups) {
      md += `- ${f}\n`;
    }
  }

  return md;
}

export const Route = createFileRoute("/projects/$projectId")({
  component: ProjectPage,
});

function ProjectPage() {
  const { user } = useAuth();
  const uid = user?.uid;
  const { projectId } = Route.useParams();
  const qc = useQueryClient();
  const router = useRouter();
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  const { data: sessions = [] } = useQuery({
    queryKey: ["sessions", uid, projectId],
    queryFn: () => listSessions(uid!, projectId),
    enabled: !!uid,
  });
  const { data: cross } = useQuery({
    queryKey: ["cross", uid, projectId],
    queryFn: () => getCrossAnalysis(uid!, projectId),
    enabled: !!uid,
  });

    const { data: literatures = [] } = useQuery({
    queryKey: ["literatures", uid],
    queryFn: () => listLiteratures(uid!),
    enabled: !!uid,
  });

const combinedTagCounts = (() => {
    const counts = [...(cross?.tagCounts || [])];
    
    // Add keywords from literatures (categories and target industries)
    const litCounts: Record<string, number> = {};
    for (const lit of literatures.slice(0, 5)) {
      if (lit.seoul_hrd_insights?.target_beneficiary_or_industry) {
        const ind = lit.seoul_hrd_insights.target_beneficiary_or_industry;
        litCounts[ind] = (litCounts[ind] || 0) + 1;
      }
      for (const act of lit.seoul_hrd_insights?.recommended_actions || []) {
        if (act.category) {
          litCounts[act.category] = (litCounts[act.category] || 0) + 1;
        }
      }
    }

    for (const [label, count] of Object.entries(litCounts)) {
      const existing = counts.find(c => c.label === label);
      if (existing) {
        existing.count += count;
      } else {
        counts.push({ label, count });
      }
    }
    
    return counts.sort((a, b) => b.count - a.count);
  })();


  const p = cross?.project || {
    title: "프로젝트",
    year: null,
    kind: "",
    description: "",
    confirmedCount: 0,
    sessionCount: 0,
    draftCount: 0,
  };

  const summaryMut = useMutation({
    mutationFn: async () => {
      if (!uid) throw new Error("로그인이 필요합니다.");
      const data = await getCrossAnalysis(uid, projectId);
      const allLits = await listLiteratures(uid);
      const relatedLits = allLits.slice(0, 5); // Use up to 5 recent literatures for cross analysis
      const confirmed = (await listSessions(uid, projectId)).filter((s) => s.status === "confirmed");
      const payload = {
        projectTitle: data.project.title,
        literatures: relatedLits.map(l => ({
          title: l.document_metadata?.title,
          authors: l.document_metadata?.authors?.join(", "),
          core_implication: l.seoul_hrd_insights?.core_implication,
          findings: l.question_driven_analysis?.map(q => ({
            question: q.research_question,
            summary: q.findings_summary
          })) || []
        })),
        sessions: confirmed.map((s) => ({
          title: s.title,
          sessionDate: s.sessionDate,
          industry: s.industry,
          district: s.district,
          headline: s.headline,
          tags: s.tagLabels,
          themes: data.themes
            .filter((t) => t.sessionId === s.id)
            .map((t) => ({ title: t.title, summary: t.summary, bullets: [] as string[] })),
          facts: data.facts
            .filter((f) => f.sessionId === s.id)
            .map((f) => ({ label: f.label, value: f.value })),
          quotes: data.quotes
            .filter((q) => q.sessionId === s.id)
            .map((q) => ({ text: q.text, themeTitle: q.themeTitle })),
        })),
      };
      const res = await runCrossSummary(payload);
      if (!res.ok || !res.summary) throw new Error(res.error || "교차 요약에 실패했습니다.");
      await saveCrossSummary(uid, projectId, res.summary);
      return res;
    },
    onSuccess: async () => {
      toast.success("확정본에서 반복된 주장을 정리했습니다.");
      await qc.invalidateQueries({ queryKey: ["cross", uid, projectId] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteMut = useMutation({
    mutationFn: () => deleteProject(uid!, projectId),
    onSuccess: async () => {
      setDeleteConfirmOpen(false);
      toast.success("프로젝트를 삭제했습니다.");
      await qc.invalidateQueries({ queryKey: ["projects"] });
      await qc.invalidateQueries({ queryKey: ["sessions"] });
      await router.navigate({ to: "/" });
    },
    onError: (err: Error) => {
      setDeleteConfirmOpen(false);
      toast.error(err.message || "삭제 중 오류가 발생했습니다.");
    },
  });

  return (
    <div className="flex flex-col gap-6">
      {summaryMut.isPending ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/70">
          <div className="flex items-center gap-3 rounded-xl border border-border bg-card px-5 py-4 shadow-[var(--shadow-panel)]">
            <LoaderCircle className="size-5 animate-spin text-primary" />
            <p className="text-sm">확정된 인터뷰를 비교하고 있습니다.</p>
          </div>
        </div>
      ) : null}

      <div>
        <Link
          to="/"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          조사
        </Link>
        <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs text-muted-foreground">
              {p.year ?? "연도 미정"} · {p.kind}
            </p>
            <h1 className="font-serif text-3xl font-semibold tracking-tight">{p.title}</h1>
            {p.description ? (
              <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{p.description}</p>
            ) : null}
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <ChatModal projectId={projectId} projectTitle={p.title || ""} />
            <Button asChild>
              <Link to="/upload" search={{ projectId }}>
                녹취 추가
              </Link>
            </Button>
            <Button
              variant="ghost"
              onClick={() => setDeleteConfirmOpen(true)}
              disabled={deleteMut.isPending || !uid}
              title="프로젝트 삭제"
              className="text-muted-foreground hover:text-destructive hover:bg-destructive/10"
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
        </div>
      </div>

      <Tabs defaultValue="sessions">
        <TabsList>
          <TabsTrigger value="sessions">인터뷰 {sessions.length}</TabsTrigger>
          <TabsTrigger value="cross">교차 보기</TabsTrigger>
        </TabsList>
        <TabsContent value="sessions">
          {sessions.length === 0 ? (
            <div className="py-8 text-sm leading-relaxed text-muted-foreground">
              이 프로젝트에 올린 녹취가 없습니다. 새 녹취로 올리세요.
            </div>
          ) : (
            <ul className="divide-y divide-border border-y border-border">
              {sessions.map((s) => (
                <li key={s.id}>
                  <Link
                    to="/sessions/$sessionId"
                    params={{ sessionId: s.id }}
                    className="flex flex-col gap-1 px-4 py-3.5 hover:bg-muted/60 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-medium">{s.title}</p>
                        {s.isOwner ? (
                          <span className="shrink-0 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                            내 자료
                          </span>
                        ) : (
                          <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                            {s.researcher ? `${s.researcher} 연구원` : "공동자료"}
                          </span>
                        )}
                      </div>
                      <p className="truncate text-xs text-muted-foreground">
                        {s.sessionKind} · {formatDateKo(s.sessionDate)}
                        {s.researcher && s.isOwner ? ` · 담당: ${s.researcher}` : ""}
                        {s.district ? ` · ${s.district}` : ""}
                        {s.headline ? ` · ${s.headline}` : ""}
                      </p>
                    </div>
                    <StatusBadge status={s.status} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </TabsContent>
        <TabsContent value="cross" className="flex flex-col gap-6">
          {p.confirmedCount === 0 ? (
            <div className="rounded-xl border border-dashed border-border bg-card px-4 py-10 text-center text-sm text-muted-foreground">
              확정된 인터뷰가 있어야 교차 보기를 채웁니다.
            </div>
          ) : (
            <>
              <section className="rounded-xl border border-border bg-card p-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h2 className="font-serif text-lg font-semibold">반복된 주장</h2>
                    <p className="mt-1 text-xs text-muted-foreground">
                      확정본만 읽습니다. 한 건에서만 나온 이야기는 넣지 않습니다.
                      {cross?.crossSummaryAt
                        ? ` · 마지막 정리 ${formatDateKo(cross.crossSummaryAt)}`
                        : ""}
                    </p>
                  </div>

                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      disabled={!cross?.crossSummary}
                      onClick={() => {
                        if (!cross?.crossSummary) return;
                        const md = buildCrossSummaryMarkdown(cross.crossSummary, p.title);
                        downloadMarkdown(`${p.title}-교차요약.md`, md);
                      }}
                    >
                      <Download className="size-4 mr-2" />
                      내보내기 (MD)
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => summaryMut.mutate()}
                      disabled={summaryMut.isPending}
                    >
                      <ScanText className="size-4" />
                      {cross?.crossSummary ? "다시 정리" : "교차 요약"}
                    </Button>
                  </div>
                </div>
                {cross?.crossSummary ? (
                  <div className="mt-4 flex flex-col gap-4">
                    <p className="text-sm leading-relaxed text-ink-soft">
                      {cross.crossSummary.overview}
                    </p>
                    {cross.crossSummary.repeated.map((r) => (
                      <article key={r.claim} className="rounded-lg bg-muted/50 p-3">
                        <h3 className="font-medium">{r.claim}</h3>
                        {r.sessionTitles.length > 0 ? (
                          <p className="mt-1 text-xs text-muted-foreground">
                            {r.sessionTitles.join(" · ")}
                          </p>
                        ) : null}
                        {r.evidence ? (
                          <p className="mt-2 text-sm text-ink-soft">{r.evidence}</p>
                        ) : null}
                      </article>
                    ))}
                    {cross.crossSummary.tensions.length > 0 ? (
                      <div>
                        <h3 className="text-sm font-medium">서로 다른 점</h3>
                        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
                          {cross.crossSummary.tensions.map((t) => (
                            <li key={t.point}>
                              <span className="font-medium">{t.point}</span>
                              {t.detail ? ` — ${t.detail}` : ""}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                    {cross.crossSummary.followups.length > 0 ? (
                      <div>
                        <h3 className="text-sm font-medium">후속 확인</h3>
                        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
                          {cross.crossSummary.followups.map((f) => (
                            <li key={f}>{f}</li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <p className="mt-4 text-sm text-muted-foreground">
                    확정된 인터뷰가 두 건 이상이면 반복된 주장을 한 번에 정리할 수 있습니다. 한
                    건이어도 개요는 만들 수 있습니다.
                  </p>
                )}
              </section>
              <section>
                <h2 className="font-serif text-lg font-semibold">태그 분석</h2>
                <p className="mt-1 mb-4 text-xs text-muted-foreground">
                  전체 세션에서 가장 자주 등장한 상위 10개 키워드입니다.
                </p>
                <TagChart data={combinedTagCounts} />
                <div className="mt-4 flex flex-wrap gap-2">
                  {combinedTagCounts.map((t) => (
                    <span
                      key={t.label}
                      className="inline-flex h-9 items-center gap-2 rounded-full border border-border bg-muted/50 px-3 text-sm"
                    >
                      {t.label}
                      <span className="tabular-nums text-muted-foreground">{t.count}</span>
                    </span>
                  ))}
                </div>
              </section>
              <section>
                <h2 className="font-serif text-lg font-semibold">주제</h2>
                <div className="mt-3 grid gap-3">
                  {(cross?.themes ?? []).map((t, i) => (
                    <Card key={`${t.sessionId}-${i}`} className="rounded-lg">
                      <CardContent className="p-4">
                        <p className="text-xs text-muted-foreground">{t.sessionTitle}</p>
                        <h3 className="mt-1 font-serif font-semibold">{t.title}</h3>
                        <p className="mt-1 text-sm leading-relaxed text-ink-soft">{t.summary}</p>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </section>
              <section>
                <h2 className="font-serif text-lg font-semibold">인용</h2>
                <ul className="mt-3 flex flex-col gap-3">
                  {(cross?.quotes ?? []).map((q, i) => (
                    <li
                      key={`${q.sessionId}-${i}`}
                      className="rounded-lg border border-border bg-card p-4"
                    >
                      <p className="text-xs text-muted-foreground">
                        {q.sessionTitle} · {q.themeTitle} · {q.segmentCode}
                      </p>
                      <blockquote className="mt-2 font-serif text-sm leading-relaxed">
                        {q.text}
                      </blockquote>
                    </li>
                  ))}
                </ul>
              </section>
            </>
          )}
        </TabsContent>
      </Tabs>

      <ConfirmDialog
        open={deleteConfirmOpen}
        onOpenChange={setDeleteConfirmOpen}
        title="프로젝트 삭제"
        description={`‘${p.title || "이 프로젝트"}’를 삭제하시겠습니까?\n포함된 모든 인터뷰 녹취록(${sessions.length}건)과 분석 내용도 함께 영구적으로 삭제됩니다.`}
        confirmText="프로젝트 삭제"
        cancelText="취소"
        variant="destructive"
        isLoading={deleteMut.isPending}
        onConfirm={() => deleteMut.mutate()}
      />
    </div>
  );
}
