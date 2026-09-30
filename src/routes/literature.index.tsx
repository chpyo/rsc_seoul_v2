import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { FileText, Globe, Plus, User } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/empty-state";
import { listLiteratures } from "@/lib/firebase-literature";
import { useAuth } from "@/lib/auth-context";

export const Route = createFileRoute("/literature/")({
  component: LiteratureIndex,
});

function LiteratureIndex() {
  const { user, canWrite } = useAuth();
  const [scope, setScope] = useState<"all" | "mine">("all");
  
  const { data: literatures = [] } = useQuery({
    queryKey: ["literatures", user?.uid, scope],
    queryFn: () => listLiteratures(user?.uid, scope),
    enabled: !!user?.uid,
  });

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-xl">
          <h1 className="font-serif text-4xl font-semibold tracking-tight">문헌록</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            학술 논문, 연구보고서, 실태조사 자료를 구조화하여 연구원 전체와 공유합니다.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {canWrite ? (
            <Button asChild>
              <Link to="/literature/upload">
                <Plus className="mr-2 size-4" />
                새 문헌 등록
              </Link>
            </Button>
          ) : null}
        </div>
      </div>

      <div className="flex items-center justify-between border-b border-border pb-3">
        <div className="inline-flex rounded-lg border border-border p-0.5 bg-muted/30">
          <button
            type="button"
            onClick={() => setScope("all")}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all ${
              scope === "all"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Globe className="size-3.5" />
            전체 공유 문헌 ({literatures.length})
          </button>
          <button
            type="button"
            onClick={() => setScope("mine")}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all ${
              scope === "mine"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <User className="size-3.5" />
            내가 등록한 문헌만
          </button>
        </div>
      </div>

      {literatures.length === 0 ? (
        <EmptyState>
          {scope === "mine"
            ? "내가 등록한 문헌이 없습니다. 우측 상단의 '새 문헌 등록' 버튼을 눌러 첫 번째 리서치 자료를 업로드해보세요."
            : "등록된 문헌이 없습니다. 우측 상단의 '새 문헌 등록' 버튼을 눌러 첫 번째 리서치 자료를 업로드해보세요."}
        </EmptyState>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {literatures.map((lit) => (
            <Card key={lit.id} className="flex flex-col transition-colors hover:border-primary/40">
              <CardContent className="flex flex-1 flex-col justify-between p-5">
                <div>
                  <div className="flex items-center justify-between gap-2 text-xs font-medium text-muted-foreground">
                    <div className="flex items-center gap-1.5">
                      <FileText className="size-3.5" />
                      <span>{lit.document_metadata?.literature_type || "연구보고서"}</span>
                    </div>
                    {lit.isOwner ? (
                      <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                        내 자료
                      </span>
                    ) : (
                      <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                        {lit.author_name ? `${lit.author_name} 등록` : "공동자료"}
                      </span>
                    )}
                  </div>
                  <h3 className="mt-3 font-semibold leading-snug line-clamp-2 hover:underline">
                    <Link
                      to="/literature/$literatureId"
                      params={{ literatureId: lit.id }}
                    >
                      {lit.document_metadata?.title || "Untitled Literature"}
                    </Link>
                  </h3>
                  <p className="mt-2 text-sm text-muted-foreground line-clamp-3">
                    {lit.seoul_hrd_insights?.core_implication || "요약 정보가 제공되지 않습니다."}
                  </p>
                </div>
                <div className="mt-4 pt-3 border-t border-border/60 flex items-center justify-between text-xs text-muted-foreground">
                  <span className="truncate">{lit.document_metadata?.institution_or_journal || "연구원"}</span>
                  <span className="font-mono tabular-nums">{lit.document_metadata?.year || ""}</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

