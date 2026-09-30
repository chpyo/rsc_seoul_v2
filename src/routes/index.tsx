import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { EmptyState } from "@/components/empty-state";
import { StatusBadge } from "@/components/status-badge";
import { NativeSelect } from "@/components/native-select";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createProject, listProjects, listSessions } from "@/lib/firebase-db";
import { PROJECT_KINDS } from "@/lib/types";
import { cn, formatDateKo } from "@/lib/utils";
import { buildWorkQueue } from "@/lib/work-queue";
import { useAuth } from "@/lib/auth-context";

export const Route = createFileRoute("/")({
  component: Home,
});

type Filter = "review" | "analyze";

function Home() {
  const { user, canWrite } = useAuth();
  const uid = user?.uid;
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<Filter>("review");

  const { data: projects = [] } = useQuery({
    queryKey: ["projects", uid],
    queryFn: () => listProjects(uid!),
    enabled: !!uid,
  });
  const { data: sessions = [], isLoading } = useQuery({
    queryKey: ["sessions", uid, "all"],
    queryFn: () => listSessions(uid!, undefined, "all"),
    enabled: !!uid,
  });

  const queue = useMemo(() => buildWorkQueue(sessions), [sessions]);
  const myList = filter === "review" ? queue.inReview : queue.toAnalyze;

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-sans text-2xl font-semibold tracking-tight">작업 현황</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {canWrite
              ? "내가 올린 녹취 중 다음 단계가 남은 것부터 보여 줍니다."
              : "팀이 확정한 기록과 프로젝트를 볼 수 있습니다."}
          </p>
        </div>
        {canWrite ? (
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setOpen(true)}>
              <Plus className="size-4" />
              프로젝트
            </Button>
            <Button asChild>
              <Link to="/upload" search={{ projectId: undefined }}>
                새 녹취
                <ArrowRight className="size-4" />
              </Link>
            </Button>
          </div>
        ) : null}
      </section>

      <section aria-label="요약" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {canWrite ? (
          <>
            <QueueTile
              label="검토 중"
              hint="AI 초안 · 검토 후 확정"
              value={queue.inReview.length}
              tone="review"
              active={filter === "review"}
              onClick={() => setFilter("review")}
            />
            <QueueTile
              label="분석 대기"
              hint="원문 · 분석 필요"
              value={queue.toAnalyze.length}
              tone="action"
              active={filter === "analyze"}
              onClick={() => setFilter("analyze")}
            />
            <QueueTile
              label="이번 주 확정"
              hint="내가 최근 7일에 확정"
              value={queue.confirmedThisWeek}
              tone="seal"
            />
          </>
        ) : null}
        <QueueTile
          label="팀 확정 누적"
          hint="자료실에 쌓인 확정본"
          value={queue.teamConfirmed}
          tone="seal"
          to="/library"
        />
      </section>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        {canWrite ? (
          <section className="flex flex-col gap-3">
            <h2 className="font-sans text-base font-semibold">
              {filter === "review" ? "검토할 초안" : "분석할 원문"}
              <span className="ml-1.5 text-muted-foreground tabular-nums">{myList.length}</span>
            </h2>
            {isLoading ? (
              <p className="py-6 text-sm text-muted-foreground">불러오는 중</p>
            ) : myList.length === 0 ? (
              <EmptyState
                action={
                  filter === "analyze" ? (
                    <Button asChild variant="outline" size="sm">
                      <Link to="/upload" search={{ projectId: undefined }}>
                        새 녹취 올리기
                      </Link>
                    </Button>
                  ) : undefined
                }
              >
                {filter === "review"
                  ? "검토할 초안이 없습니다. 분석을 마친 녹취가 여기에 모입니다."
                  : "분석을 기다리는 원문이 없습니다."}
              </EmptyState>
            ) : (
              <ul className="divide-y divide-border rounded-lg border border-border bg-card">
                {myList.slice(0, 12).map((s) => (
                  <li key={s.id}>
                    <Link
                      to="/sessions/$sessionId"
                      params={{ sessionId: s.id }}
                      className="flex items-center gap-4 px-4 py-3 transition-colors hover:bg-muted/40"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">{s.title}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {s.projectTitle} · {s.sessionKind} · {formatDateKo(s.sessionDate)}
                        </p>
                      </div>
                      <StatusBadge status={s.status} />
                      <span className="hidden shrink-0 text-sm font-medium text-primary sm:inline">
                        {s.status === "uploaded" ? "분석하기" : "검토하기"}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ) : null}

        <section className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between">
            <h2 className="font-sans text-base font-semibold">최근 확정</h2>
            <Link to="/library" className="text-sm text-muted-foreground hover:text-foreground">
              자료실
            </Link>
          </div>
          {queue.recentConfirmed.length === 0 ? (
            <EmptyState>아직 확정된 기록이 없습니다.</EmptyState>
          ) : (
            <ul className="flex flex-col gap-2">
              {queue.recentConfirmed.map((s) => (
                <li key={s.id}>
                  <Link
                    to="/library/$sessionId"
                    params={{ sessionId: s.id }}
                    search={{ seg: undefined }}
                    className="block rounded-md border border-border border-l-2 border-l-inju bg-card px-3 py-2.5 transition-colors hover:border-primary/40"
                  >
                    <p className="truncate font-serif text-sm font-semibold">{s.title}</p>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      {s.projectTitle} · {s.researcher ? `${s.researcher} · ` : ""}
                      {formatDateKo(s.confirmedAt)} 확정
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="font-sans text-base font-semibold">프로젝트</h2>
        {projects.length === 0 ? (
          <EmptyState
            action={
              canWrite ? (
                <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
                  프로젝트 만들기
                </Button>
              ) : undefined
            }
          >
            아직 프로젝트가 없습니다. 연도·유형으로 조사 단위를 나누세요.
          </EmptyState>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map((p) => {
              const pct =
                p.sessionCount > 0 ? Math.round((p.confirmedCount / p.sessionCount) * 100) : 0;
              return (
                <Link key={p.id} to="/projects/$projectId" params={{ projectId: p.id }}>
                  <Card className="h-full transition-colors hover:border-primary/40">
                    <CardContent className="flex h-full flex-col gap-2 p-4">
                      <p className="text-xs text-muted-foreground">
                        {p.year ?? "연도 미정"} · {p.kind}
                      </p>
                      <h3 className="font-sans text-base font-semibold leading-snug">{p.title}</h3>
                      <div className="mt-auto flex items-center gap-2 pt-1">
                        <div
                          className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted"
                          role="progressbar"
                          aria-valuenow={pct}
                          aria-valuemin={0}
                          aria-valuemax={100}
                          aria-label="확정 비율"
                        >
                          <div className="h-full bg-inju" style={{ width: `${pct}%` }} />
                        </div>
                        <span className="text-xs tabular-nums text-muted-foreground">
                          확정 {p.confirmedCount}/{p.sessionCount}
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>
        )}
      </section>

      {uid ? (
        <CreateProjectDialog
          uid={uid}
          open={open}
          onOpenChange={setOpen}
          onCreated={async () => {
            await qc.invalidateQueries({ queryKey: ["projects", uid] });
          }}
        />
      ) : null}
    </div>
  );
}

const TONE = {
  review: "text-review",
  action: "text-primary",
  seal: "text-inju",
} as const;

function QueueTile({
  label,
  hint,
  value,
  tone,
  active,
  onClick,
  to,
}: {
  label: string;
  hint: string;
  value: number;
  tone: keyof typeof TONE;
  active?: boolean;
  onClick?: () => void;
  to?: "/library";
}) {
  const body = (
    <>
      <span className="text-sm font-medium text-foreground">{label}</span>
      <span className={cn("font-sans text-3xl font-semibold tabular-nums", TONE[tone])}>
        {value}
      </span>
      <span className="text-xs text-muted-foreground">{hint}</span>
    </>
  );
  const cls = cn(
    "flex flex-col gap-1 rounded-lg border bg-card px-4 py-3 text-left transition-colors",
    active ? "border-primary ring-1 ring-primary" : "border-border hover:border-primary/40",
  );
  if (to) {
    return (
      <Link to={to} className={cls}>
        {body}
      </Link>
    );
  }
  if (onClick) {
    return (
      <button type="button" className={cls} onClick={onClick} aria-pressed={active}>
        {body}
      </button>
    );
  }
  return <div className={cls}>{body}</div>;
}

function CreateProjectDialog({
  uid,
  open,
  onOpenChange,
  onCreated,
}: {
  uid: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated: () => Promise<void>;
}) {
  const [title, setTitle] = useState("");
  const [year, setYear] = useState("2026");
  const [kind, setKind] = useState("심층조사");
  const [description, setDescription] = useState("");

  const mutation = useMutation({
    mutationFn: () =>
      createProject(uid, {
        title,
        year: year ? Number(year) : null,
        kind,
        description,
      }),
    onSuccess: async () => {
      toast.success("프로젝트를 만들었습니다.");
      setTitle("");
      setDescription("");
      onOpenChange(false);
      await onCreated();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>새 프로젝트</DialogTitle>
          <DialogDescription>연도·유형으로 조사 단위를 나눕니다.</DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            mutation.mutate();
          }}
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ptitle">이름</Label>
            <Input
              id="ptitle"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="2026년 AI 산업 심층조사"
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="pyear">연도</Label>
              <Input
                id="pyear"
                inputMode="numeric"
                value={year}
                onChange={(e) => setYear(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="pkind">유형</Label>
              <NativeSelect id="pkind" value={kind} onChange={(e) => setKind(e.target.value)}>
                {PROJECT_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
              </NativeSelect>
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="pdesc">설명</Label>
            <Textarea
              id="pdesc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </div>
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? "만드는 중" : "만들기"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
