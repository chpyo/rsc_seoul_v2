import { useMutation } from "@tanstack/react-query";
import { DatabaseZap, LoaderCircle } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth-context";
import { rebuildSearchIndex, type RebuildProgress, type RebuildResult } from "@/lib/search/rebuild";

/** 관리자 전용: 검색 색인(벡터) 다시 만들기. */
export function SearchIndexAdmin() {
  const { user } = useAuth();
  const [onlyMissing, setOnlyMissing] = useState(true);
  const [progress, setProgress] = useState<RebuildProgress | null>(null);
  const [result, setResult] = useState<RebuildResult | null>(null);

  const mut = useMutation({
    mutationFn: () => rebuildSearchIndex(user!.uid, { onlyMissing }, setProgress),
    onMutate: () => {
      setResult(null);
      setProgress(null);
    },
    onSuccess: (res) => {
      setResult(res);
      if (res.failed.length === 0) toast.success(`검색 색인을 만들었습니다 (${res.indexed}건).`);
      else toast.warning(`색인 ${res.indexed}건, 실패 ${res.failed.length}건`);
    },
    onError: (err: Error) => toast.error(err.message),
    onSettled: () => setProgress(null),
  });

  const pct = progress && progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <div className="rounded-lg border border-border bg-card p-6 shadow-xs">
      <div className="mb-5 flex items-center gap-2 border-b border-border pb-4">
        <DatabaseZap className="size-5 text-primary" />
        <h2 className="text-lg font-semibold text-foreground">검색 색인</h2>
      </div>
      <p className="text-sm leading-relaxed text-muted-foreground">
        자료실 검색과 질문 답변은 확정된 녹취의 발언과 문헌 내용을 잘게 나눈 색인으로 찾습니다. 새로
        확정하거나 등록한 자료는 자동으로 색인됩니다. 이 기능을 처음 켰을 때나 색인에 실패한 자료가
        있을 때 다시 만드세요.
      </p>
      <label className="mt-4 flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={onlyMissing}
          onChange={(e) => setOnlyMissing(e.target.checked)}
          disabled={mut.isPending}
        />
        색인이 없는 자료만
      </label>
      <div className="mt-4 flex items-center gap-3">
        <Button onClick={() => mut.mutate()} disabled={mut.isPending || !user}>
          {mut.isPending ? <LoaderCircle className="size-4 animate-spin" /> : null}
          {mut.isPending ? "만드는 중" : "검색 색인 다시 만들기"}
        </Button>
        {progress ? (
          <span className="min-w-0 truncate text-xs text-muted-foreground">
            {progress.done}/{progress.total} {progress.current ? `· ${progress.current}` : ""}
          </span>
        ) : null}
      </div>
      {mut.isPending ? (
        <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div className="h-full bg-primary transition-all" style={{ width: `${Math.max(3, pct)}%` }} />
        </div>
      ) : null}
      {result ? (
        <div className="mt-4 text-sm">
          <p>
            색인 {result.indexed}건 · 건너뜀 {result.skipped}건 · 실패 {result.failed.length}건
          </p>
          {result.failed.length > 0 ? (
            <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-destructive">
              {result.failed.map((f, i) => (
                <li key={i}>
                  {f.title}: {f.error}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
