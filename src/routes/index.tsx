import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Globe, Plus, User } from "lucide-react";
import { useState } from "react";
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
import { formatDateKo } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";

export const Route = createFileRoute("/")({
  component: Home,
});

function Home() {
  const { user, canWrite } = useAuth();
  const uid = user?.uid;
  const qc = useQueryClient();
  const [sessionScope, setSessionScope] = useState<"all" | "mine">("all");

  const { data: projects = [] } = useQuery({
    queryKey: ["projects", uid],
    queryFn: () => listProjects(uid!),
    enabled: !!uid,
  });
  const { data: sessions = [] } = useQuery({
    queryKey: ["sessions", uid, sessionScope],
    queryFn: () => listSessions(uid!, undefined, sessionScope),
    enabled: !!uid,
  });

  const confirmed = sessions.filter((s) => s.status === "confirmed").length;
  const drafts = sessions.filter((s) => s.status !== "confirmed").length;
  const [open, setOpen] = useState(false);

  return (
    <div className="flex flex-col gap-10">
      <section className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-xl">
          <h1 className="font-serif text-4xl font-semibold tracking-tight sm:text-5xl">
            현장의 목소리를 자산으로
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            녹취록을 업로드하여 회의록 초안을 만들고, 전 연구원과 확정본을 통합 자료실에 구축하세요.
          </p>
          <div className="mt-3 flex items-center gap-2 text-sm tabular-nums text-muted-foreground">
            <span>공동 프로젝트 {projects.length}</span>
            <span>·</span>
            <span>{sessionScope === "all" ? "전체 기록" : "내 기록"} {sessions.length} (확정 {confirmed} / 초안 {drafts})</span>
          </div>
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

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="font-serif text-xl font-semibold">프로젝트</h2>
          <span className="text-xs text-muted-foreground">전체 연구원 공유 워크스페이스</span>
        </div>
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
          <div className="grid gap-3 sm:grid-cols-2">
            {projects.map((p) => (
              <Link key={p.id} to="/projects/$projectId" params={{ projectId: p.id }}>
                <Card className="h-full transition-colors hover:border-primary/40">
                  <CardContent className="flex h-full flex-col gap-3 p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex flex-wrap gap-1.5">
                          <span className="rounded-sm border border-primary/25 px-1.5 py-0.5 text-xs tracking-wide text-primary">
                            {p.year ?? "연도 미정"}
                          </span>
                          <span className="rounded-sm border border-border px-1.5 py-0.5 text-xs text-muted-foreground">
                            {p.kind}
                          </span>
                        </div>
                        <h3 className="mt-2 font-serif text-lg font-semibold">{p.title}</h3>
                      </div>
                      <span className="text-xs tabular-nums text-muted-foreground">
                        {p.confirmedCount}/{p.sessionCount}
                      </span>
                    </div>
                    {p.description ? (
                      <p className="line-clamp-2 text-sm text-muted-foreground">{p.description}</p>
                    ) : null}
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="font-serif text-xl font-semibold">최근 기록</h2>
          <div className="inline-flex rounded-lg border border-border p-0.5 bg-muted/30">
            <button
              type="button"
              onClick={() => setSessionScope("all")}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium transition-all ${
                sessionScope === "all"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Globe className="size-3.5" />
              전체 공유 기록
            </button>
            <button
              type="button"
              onClick={() => setSessionScope("mine")}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium transition-all ${
                sessionScope === "mine"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <User className="size-3.5" />
              내가 올린 기록만
            </button>
          </div>
        </div>

        {sessions.length === 0 ? (
          <EmptyState
            action={
              canWrite ? (
                <Button asChild variant="outline" size="sm">
                  <Link to="/upload" search={{ projectId: undefined }}>
                    새 녹취
                  </Link>
                </Button>
              ) : undefined
            }
          >
            {sessionScope === "mine"
              ? "내가 등록한 녹취가 없습니다. 상단 '새 녹취'를 눌러 올려보세요."
              : "업로드된 녹취가 없습니다. 녹취를 올리면 여기에 쌓입니다."}
          </EmptyState>
        ) : (
          <ul className="divide-y divide-border border-y border-border">
            {sessions.slice(0, 10).map((s) => (
              <li key={s.id}>
                <Link
                  to="/sessions/$sessionId"
                  params={{ sessionId: s.id }}
                  className="flex items-center gap-4 px-0 py-3.5 transition-colors hover:bg-muted/40"
                >
                  <time className="w-20 shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
                    {formatDateKo(s.sessionDate)}
                  </time>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate font-medium">{s.title}</p>
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
                      {s.projectTitle} · {s.sessionKind}
                      {s.researcher && s.isOwner ? ` · 담당: ${s.researcher}` : ""}
                      {s.headline ? ` · ${s.headline}` : ""}
                    </p>
                  </div>
                  <StatusBadge status={s.status} />
                </Link>
              </li>
            ))}
          </ul>
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
              <NativeSelect
                id="pkind"
                value={kind}
                onChange={(e) => setKind(e.target.value)}
              >
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
