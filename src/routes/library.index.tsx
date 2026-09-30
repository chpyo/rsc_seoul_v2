import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { LoaderCircle, Search, FileText, ChevronDown, Check } from "lucide-react";
import { useRef, useEffect } from "react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { EmptyState } from "@/components/empty-state";
import { NativeSelect } from "@/components/native-select";
import { RelatedCases } from "@/components/related-cases";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { askConfirmedCorpusStream } from "@/lib/ai/ask-corpus";
import { AnswerMarkdown } from "@/components/answer-markdown";
import { listLibraryCases, listProjects, listTags } from "@/lib/firebase-db";
import { listLiteratures } from "@/lib/firebase-literature";
import { useAuth } from "@/lib/auth-context";
import type { ChatGroundedReply, Citation, SessionSummary } from "@/lib/types";
import type { LiteratureDoc } from "@/lib/firebase-literature";
import { formatDateKo } from "@/lib/utils";

export const Route = createFileRoute("/library/")({
  component: LibraryPage,
});

function groupByProject(cases: SessionSummary[]) {
  const map = new Map<string, { projectId: string; projectTitle: string; items: SessionSummary[] }>();
  for (const item of cases) {
    const key = item.projectId || item.projectTitle || "unassigned";
    const group = map.get(key);
    if (group) {
      group.items.push(item);
    } else {
      map.set(key, {
        projectId: item.projectId,
        projectTitle: item.projectTitle || "프로젝트 미지정",
        items: [item],
      });
    }
  }
  return [...map.values()];
}


function TagMultiSelectDropdown({ 
  tags, 
  selectedTags, 
  onChange 
}: { 
  tags: { label: string; count: number }[]; 
  selectedTags: string[]; 
  onChange: (tags: string[]) => void; 
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  
  const filteredTags = useMemo(() => 
    tags.filter(t => t.label.toLowerCase().includes(search.toLowerCase())), 
  [tags, search]);

  const toggleTag = (tag: string) => {
    if (selectedTags.includes(tag)) {
      onChange(selectedTags.filter(t => t !== tag));
    } else {
      onChange([...selectedTags, tag]);
    }
  };

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  return (
    <div className="relative" ref={containerRef}>
      <Button 
        type="button"
        variant="outline" 
        onClick={() => setOpen(!open)}
        className="w-[180px] justify-between font-normal text-left"
      >
        <span className="truncate">
          {selectedTags.length === 0 ? "모든 태그" : `${selectedTags.length}개 태그 선택됨`}
        </span>
        <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
      </Button>
      {open && (
        <div className="absolute top-full right-0 mt-1 w-[240px] z-50 rounded-md border bg-popover text-popover-foreground shadow-md outline-none animate-in fade-in-0 zoom-in-95">
          <div className="flex items-center border-b px-3">
            <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
            <input 
              className="flex h-10 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
              placeholder="태그 검색..." 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="max-h-[300px] overflow-y-auto p-1">
            {filteredTags.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">검색 결과 없음.</p>
            ) : (
              filteredTags.map((t) => (
                <div 
                  key={t.label} 
                  className="relative flex cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground"
                  onClick={() => toggleTag(t.label)}
                >
                  <div className={`mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary ${selectedTags.includes(t.label) ? 'bg-primary text-primary-foreground' : 'opacity-50'}`}>
                    {selectedTags.includes(t.label) && <Check className="h-3 w-3" />}
                  </div>
                  <span className="flex-1 truncate">{t.label}</span>
                  <span className="ml-auto text-xs text-muted-foreground">{t.count}</span>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function LibraryPage() {
  const { user, canWrite } = useAuth();
  const uid = user?.uid;
  const [q, setQ] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [projectId, setProjectId] = useState("");
  const [submitted, setSubmitted] = useState({ q: "", tags: [] as string[], projectId: "" });
  const [ask, setAsk] = useState("");
  const [askResult, setAskResult] = useState<
    (ChatGroundedReply & { citations: Record<string, Citation> }) | null
  >(null);
  const [isPending, setIsPending] = useState(false);
  

  const { data: tags = [] } = useQuery({
    queryKey: ["tags", uid],
    queryFn: () => listTags(uid!),
    enabled: !!uid,
  });

  

  const { data: projects = [] } = useQuery({
    queryKey: ["projects", uid],
    queryFn: () => listProjects(uid!),
    enabled: !!uid,
  });

  const { data: cases = [], isFetching: isCasesFetching } = useQuery({
    queryKey: ["library", uid, submitted],
    queryFn: () => listLibraryCases(uid!, submitted),
    enabled: !!uid,
  });

  const { data: literatures = [], isFetching: isLitsFetching } = useQuery({
    queryKey: ["literatures", uid],
    queryFn: () => listLiteratures(uid!),
    enabled: !!uid,
  });

  const allTags = useMemo(() => {
    const map = new Map<string, number>();
    for (const t of tags) {
      map.set(t.label, (map.get(t.label) || 0) + t.count);
    }
    for (const l of literatures) {
      if (l.tags && Array.isArray(l.tags)) {
        for (const t of l.tags) {
          map.set(t, (map.get(t) || 0) + 1);
        }
      }
    }
    return Array.from(map.entries())
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count);
  }, [tags, literatures]);

  const [tagsExpanded, setTagsExpanded] = useState(false);
  const visibleTags = tagsExpanded ? allTags : allTags.slice(0, 5);

  const filteredLiteratures = useMemo(() => {
    let result = literatures;
    const needle = submitted.q.trim().toLowerCase();
    if (needle) {
      result = result.filter(lit => {
        const title = lit.document_metadata?.title?.toLowerCase() || "";
        const authors = (lit.document_metadata?.authors || []).join(" ").toLowerCase();
        const keywords = lit.document_metadata?.literature_type?.toLowerCase() || "";
        const insight = lit.seoul_hrd_insights?.core_implication?.toLowerCase() || "";
        return title.includes(needle) || authors.includes(needle) || keywords.includes(needle) || insight.includes(needle);
      });
    }
    if (submitted.tags && submitted.tags.length > 0) {
      result = result.filter(lit => 
        lit.tags && Array.isArray(lit.tags) && submitted.tags.some(t => lit.tags.includes(t))
      );
    }
    return result;
  }, [literatures, submitted.q, submitted.tags]);


  const groups = useMemo(() => groupByProject(cases), [cases]);
  const filtered = Boolean(submitted.q || submitted.tags.length > 0 || submitted.projectId);
  const isFetching = isCasesFetching || isLitsFetching;

  function applyFilters(next: { q: string; tags: string[]; projectId: string }) {
    setSubmitted(next);
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-serif text-4xl font-semibold tracking-tight">통합 자료실</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          현장록(확정본)과 문헌록 데이터를 교차 검색하고 분석합니다.
        </p>
      </div>

      <form
        className="flex flex-col gap-3 rounded-md border border-border bg-card p-4"
        onSubmit={async (e) => {
          e.preventDefault();
          const question = ask.trim();
          if (!question || isPending) return;
          if (!uid) {
            toast.error("로그인이 필요합니다.");
            return;
          }
          setIsPending(true);
          setAskResult({ answer: "", relatedCases: [], citations: {} });
          try {
            const stream = askConfirmedCorpusStream(uid, question, { projectId: projectId || undefined });
            for await (const chunk of stream) {
              setAskResult({
                answer: chunk.text,
                relatedCases: chunk.relatedCases,
                citations: chunk.citations,
              });
            }
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "에러가 발생했습니다.");
          } finally {
            setIsPending(false);
          }
        }}
      >
        <label className="text-sm font-medium" htmlFor="library-ask">
          자료실에 묻기
        </label>
        
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            id="library-ask"
            value={ask}
            onChange={(e) => setAsk(e.target.value)}
            placeholder="재직자훈련, 주말 집체처럼 주제로 물어보세요"
            className="flex-1"
            disabled={isPending}
          />
          <Button type="submit" disabled={!ask.trim() || isPending}>
            {isPending ? "찾는 중" : "비슷한 자료 찾기"}
          </Button>
        </div>
        {isPending ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <LoaderCircle className="size-4 animate-spin" />
            확정된 회의록 및 문헌에서 비슷한 주제를 고르고 있습니다.
          </p>
        ) : null}
        {askResult ? (
          <div className="flex flex-col gap-3 border-t border-border pt-3">
            <RelatedCases cases={askResult.relatedCases} />
            {askResult.answer ? (
              <div className="markdown-body text-sm">
                <AnswerMarkdown text={askResult.answer} citations={askResult.citations} />
              </div>
            ) : null}
          </div>
        ) : null}
      </form>

      <form
        className="flex flex-col gap-3 sm:flex-row"
        onSubmit={(e) => {
          e.preventDefault();
          applyFilters({ q, tags: selectedTags, projectId });
        }}
      >
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="회의명, 개요, 지역, 조사자, 문헌 제목, 저자…"
            className="pl-10"
          />
        </div>
        <TagMultiSelectDropdown 
          tags={allTags}
          selectedTags={selectedTags}
          onChange={(newTags) => {
            setSelectedTags(newTags);
            applyFilters({ q, tags: newTags, projectId });
          }}
        />
        {projects.length > 0 ? (
          <NativeSelect
            className="sm:w-52"
            value={projectId}
            onChange={(e) => {
              const next = e.target.value;
              setProjectId(next);
              applyFilters({ q, tags: selectedTags, projectId: next });
            }}
            aria-label="프로젝트"
          >
            <option value="">모든 프로젝트</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </NativeSelect>
        ) : null}
        <Button type="submit" disabled={isFetching}>
          {isFetching ? "찾는 중" : "검색"}
        </Button>
      </form>

      

      <Tabs defaultValue="all" className="w-full">
        <TabsList className="mb-4">
          <TabsTrigger value="all">통합 보기</TabsTrigger>
          <TabsTrigger value="field">현장록 ({cases.length})</TabsTrigger>
          <TabsTrigger value="literature">문헌록 ({filteredLiteratures.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="all" className="flex flex-col gap-8">
            {cases.length === 0 && filteredLiteratures.length === 0 ? (
                <EmptyState>검색 조건에 맞는 자료가 없습니다.</EmptyState>
            ) : (
                <div className="flex flex-col gap-8">
                    {filteredLiteratures.length > 0 ? (
                         <section className="flex flex-col gap-3">
                            <div className="flex items-baseline justify-between gap-3">
                                <h2 className="font-serif text-lg font-semibold">관련 문헌록</h2>
                                <span className="text-xs tabular-nums text-muted-foreground">{filteredLiteratures.length}건</span>
                            </div>
                            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                                {filteredLiteratures.map((lit) => (
                                    <li key={lit.id}>
                                         <Link
                                            to="/literature/$literatureId"
                                            params={{ literatureId: lit.id }}
                                            className="block h-full"
                                        >
                                            <Card className="h-full border-l-2 border-l-primary/60 transition-colors hover:border-primary">
                                                <CardContent className="flex h-full flex-col p-5">
                                                    <div className="mb-2 flex items-center justify-between gap-2">
                                                        <div className="flex items-center gap-1.5">
                                                            <span className="inline-flex items-center rounded bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">문헌록</span>
                                                            <span className="text-xs text-muted-foreground line-clamp-1">{lit.document_metadata?.literature_type || "연구보고서"}</span>
                                                        </div>
                                                        {lit.isOwner ? (
                                                            <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">내 자료</span>
                                                        ) : (
                                                            <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">{lit.author_name || "공동자료"}</span>
                                                        )}
                                                    </div>
                                                    <h3 className="font-serif text-base font-semibold leading-snug line-clamp-2 mb-2">
                                                        {lit.document_metadata?.title || "Untitled"}
                                                    </h3>
                                                    <p className="mt-auto text-xs text-muted-foreground line-clamp-2">
                                                        {lit.seoul_hrd_insights?.core_implication || "요약 정보 없음"}
                                                    </p>
                                                    {lit.tags && Array.isArray(lit.tags) && lit.tags.length > 0 && (
                                                      <div className="mt-2 flex flex-wrap gap-1">
                                                        {lit.tags.slice(0, 3).map((tag, i) => (
                                                          <span key={i} className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                                                            #{tag}
                                                          </span>
                                                        ))}
                                                      </div>
                                                    )}
                                                </CardContent>
                                            </Card>
                                        </Link>
                                    </li>
                                ))}
                            </ul>
                        </section>
                    ) : null}

                     {groups.map((group) => (
                        <section key={group.projectId || group.projectTitle} className="flex flex-col gap-3">
                        <div className="flex items-baseline justify-between gap-3">
                            <h2 className="font-serif text-lg font-semibold">{group.projectTitle}</h2>
                            <span className="text-xs tabular-nums text-muted-foreground">{group.items.length}건</span>
                        </div>
                        <ul className="grid gap-3">
                            {group.items.map((item) => (
                            <li key={item.id}>
                                <Link
                                to="/library/$sessionId"
                                params={{ sessionId: item.id }}
                                className="block"
                                >
                                <Card className="border-l-2 border-l-inju transition-colors hover:border-primary/40">
                                    <CardContent className="flex flex-col gap-2 p-5">
                                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                                        <div className="flex items-center gap-2">
                                            <span className="inline-flex items-center rounded bg-inju/10 px-2 py-0.5 text-xs font-medium text-inju-dark">현장록</span>
                                            <h3 className="font-serif text-lg font-semibold">{item.title}</h3>
                                            {item.isOwner ? (
                                                <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">내 자료</span>
                                            ) : (
                                                <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">{item.researcher || "공동자료"}</span>
                                            )}
                                        </div>
                                        <p className="text-xs text-muted-foreground">
                                        {item.sessionKind} · {formatDateKo(item.sessionDate)}
                                        </p>
                                    </div>
                                    <p className="text-xs text-muted-foreground mt-1">
                                        {[item.researcher, item.district, item.industry].filter(Boolean).join(" · ") ||
                                        "조사 정보 미기재"}
                                    </p>
                                    {item.headline ? (
                                        <p className="text-sm leading-relaxed text-ink-soft mt-1">{item.headline}</p>
                                    ) : null}
                                    {item.minutesOverview ? (
                                        <p className="line-clamp-3 text-sm leading-relaxed text-muted-foreground mt-1">
                                        {item.minutesOverview}
                                        </p>
                                    ) : null}
                                    {item.tagLabels.length > 0 ? (
                                        <div className="mt-2 flex flex-wrap gap-1">
                                        {item.tagLabels.map((label) => (
                                            <span key={label} className="text-xs text-muted-foreground">
                                            #{label}
                                            </span>
                                        ))}
                                        </div>
                                    ) : null}
                                    </CardContent>
                                </Card>
                                </Link>
                            </li>
                            ))}
                        </ul>
                        </section>
                    ))}
                </div>
            )}
        </TabsContent>

        <TabsContent value="field" className="flex flex-col gap-8">
            {cases.length === 0 ? (
                <EmptyState
                action={
                    filtered || !canWrite ? undefined : (
                    <Button asChild variant="outline" size="sm">
                        <Link to="/upload" search={{ projectId: undefined }}>
                        새 녹취
                        </Link>
                    </Button>
                    )
                }
                >
                {filtered
                    ? "검색 조건에 맞는 현장록이 없습니다."
                    : "확정된 회의록이 없습니다. 세션에서 확정하면 여기에 쌓습니다."}
                </EmptyState>
            ) : (
                <div className="flex flex-col gap-8">
                {groups.map((group) => (
                    <section key={group.projectId || group.projectTitle} className="flex flex-col gap-3">
                    <div className="flex items-baseline justify-between gap-3">
                        <h2 className="font-serif text-lg font-semibold">{group.projectTitle}</h2>
                        <span className="text-xs tabular-nums text-muted-foreground">{group.items.length}건</span>
                    </div>
                    <ul className="grid gap-3">
                        {group.items.map((item) => (
                        <li key={item.id}>
                            <Link
                            to="/library/$sessionId"
                            params={{ sessionId: item.id }}
                            className="block"
                            >
                            <Card className="border-l-2 border-l-inju transition-colors hover:border-primary/40">
                                <CardContent className="flex flex-col gap-2 p-5">
                                <div className="flex flex-wrap items-baseline justify-between gap-2">
                                    <h3 className="font-serif text-lg font-semibold">{item.title}</h3>
                                    <p className="text-xs text-muted-foreground">
                                    {item.sessionKind} · {formatDateKo(item.sessionDate)}
                                    </p>
                                </div>
                                <p className="text-xs text-muted-foreground">
                                    {[item.researcher, item.district, item.industry].filter(Boolean).join(" · ") ||
                                    "조사 정보 미기재"}
                                </p>
                                {item.headline ? (
                                    <p className="text-sm leading-relaxed text-ink-soft">{item.headline}</p>
                                ) : null}
                                {item.minutesOverview ? (
                                    <p className="line-clamp-3 text-sm leading-relaxed text-muted-foreground">
                                    {item.minutesOverview}
                                    </p>
                                ) : null}
                                {item.tagLabels.length > 0 ? (
                                    <div className="mt-1 flex flex-wrap gap-1">
                                    {item.tagLabels.map((label) => (
                                        <span key={label} className="text-xs text-muted-foreground">
                                        #{label}
                                        </span>
                                    ))}
                                    </div>
                                ) : null}
                                </CardContent>
                            </Card>
                            </Link>
                        </li>
                        ))}
                    </ul>
                    </section>
                ))}
                </div>
            )}
        </TabsContent>

        <TabsContent value="literature">
             {filteredLiteratures.length === 0 ? (
                <EmptyState>
                     {filtered
                        ? "검색 조건에 맞는 문헌록이 없습니다."
                        : "등록된 문헌이 없습니다."}
                </EmptyState>
            ) : (
                <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {filteredLiteratures.map((lit) => (
                        <li key={lit.id}>
                            <Link
                                to="/literature/$literatureId"
                                params={{ literatureId: lit.id }}
                                className="block h-full"
                            >
                                <Card className="h-full border-l-2 border-l-primary/60 transition-colors hover:border-primary">
                                    <CardContent className="flex h-full flex-col p-5">
                                        <div className="mb-3 flex items-center gap-2 text-xs font-medium text-muted-foreground">
                                            <FileText className="size-4" />
                                            <span>{lit.document_metadata?.literature_type || "연구보고서"}</span>
                                        </div>
                                        <h3 className="font-serif text-lg font-semibold leading-snug line-clamp-2 mb-2">
                                            {lit.document_metadata?.title || "Untitled Literature"}
                                        </h3>
                                        {lit.document_metadata?.authors && lit.document_metadata.authors.length > 0 && (
                                             <p className="text-xs text-muted-foreground mb-3 line-clamp-1">
                                                {lit.document_metadata.authors.join(", ")}
                                            </p>
                                        )}
                                        <p className="mt-auto text-sm text-ink-soft leading-relaxed line-clamp-3">
                                            {lit.seoul_hrd_insights?.core_implication || "No summary available."}
                                        </p>
                                        {lit.tags && Array.isArray(lit.tags) && lit.tags.length > 0 && (
                                          <div className="mt-3 flex flex-wrap gap-1.5">
                                            {lit.tags.map((tag, i) => (
                                              <span key={i} className="rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground">
                                                #{tag}
                                              </span>
                                            ))}
                                          </div>
                                        )}
                                    </CardContent>
                                </Card>
                            </Link>
                        </li>
                    ))}
                </ul>
            )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
