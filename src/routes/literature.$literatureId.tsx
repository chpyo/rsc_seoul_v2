import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { ArrowLeft, ExternalLink, FileText, LoaderCircle, Trash2, User } from "lucide-react";
import { deleteLiterature, getLiterature } from "@/lib/firebase-literature";
import { getLiteratureFileUrl } from "@/lib/literature-files";
import { searchConfirmedCases } from "@/lib/firebase-db";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { toast } from "sonner";
import { Link } from "@tanstack/react-router";

export const Route = createFileRoute("/literature/$literatureId")({
  component: LiteratureDetail,
});

function LiteratureDetail() {
  const { literatureId } = Route.useParams();
  const { user } = useAuth();
  const qc = useQueryClient();
  const router = useRouter();
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  const {
    data: doc,
    isPending,
    error,
  } = useQuery({
    queryKey: ["literature", literatureId, user?.uid],
    queryFn: () => getLiterature(literatureId, user?.uid),
  });

  const deleteMut = useMutation({
    mutationFn: () => deleteLiterature(literatureId, user?.uid),
    onSuccess: async () => {
      setDeleteConfirmOpen(false);
      toast.success("문헌을 삭제했습니다.");
      await qc.invalidateQueries({ queryKey: ["literatures"] });
      await router.navigate({ to: "/literature" });
    },
    onError: (err: Error) => {
      setDeleteConfirmOpen(false);
      toast.error(err.message || "삭제 중 오류가 발생했습니다.");
    },
  });

  if (isPending) {
    return (
      <div className="flex h-[40vh] items-center justify-center text-muted-foreground">
        <LoaderCircle className="mr-2 size-5 animate-spin" />
        데이터를 불러오는 중입니다...
      </div>
    );
  }

  if (error || !doc) {
    return (
      <div className="flex h-[40vh] items-center justify-center text-destructive">
        {error instanceof Error ? error.message : "문헌 정보를 찾을 수 없습니다."}
      </div>
    );
  }

  const meta = doc.document_metadata || {
    title: (doc as any).title || "제목 미상",
    literature_type: (doc as any).literature_type || "연구보고서",
    year: (doc as any).year || "",
    authors: (doc as any).authors || ["저자 미상"],
    institution_or_journal: (doc as any).institution_or_journal || "발행처 미기재",
  };
  const method = doc.methodological_framework || {
    data_source: (doc as any).data_source || "원문 미기재",
    sample_and_scope: (doc as any).sample_and_scope || "원문 미기재",
    methodology: (doc as any).methodology || "원문 미기재",
    methodological_caveats: (doc as any).methodological_caveats || "원문 미기재",
  };
  const questions = Array.isArray(doc.question_driven_analysis) ? doc.question_driven_analysis : [];
  const hrd = doc.seoul_hrd_insights || {
    core_implication: (doc as any).core_implication || "도출된 시사점이 없습니다.",
    target_beneficiary_or_industry: (doc as any).target_beneficiary_or_industry || "전체 산업/계층",
    recommended_actions: [],
  };

  const authorsText = Array.isArray(meta.authors)
    ? meta.authors.join(", ")
    : meta.authors || "저자 미상";

  return (
    <div className="mx-auto max-w-4xl space-y-8 pb-12">
      <header className="space-y-4 border-b border-border pb-6">
        <div className="flex items-center justify-between">
          <Link
            to="/literature"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-3.5" />
            문헌록 목록으로
          </Link>
          <div className="flex items-center gap-1">
            {doc.source_storage_path ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={async () => {
                  // 팝업 차단을 피하려고 클릭 즉시 창을 연 뒤 주소를 채운다.
                  const win = window.open("", "_blank");
                  try {
                    const url = await getLiteratureFileUrl(doc.source_storage_path!);
                    if (win) win.location.href = url;
                    else window.location.href = url;
                  } catch {
                    win?.close();
                    toast.error("원문 파일을 열지 못했습니다.");
                  }
                }}
              >
                <ExternalLink className="mr-1.5 size-3.5" />
                원문 PDF
              </Button>
            ) : null}
            {doc.canDelete ? (
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                onClick={() => setDeleteConfirmOpen(true)}
                disabled={deleteMut.isPending}
                title="문헌 삭제"
              >
                <Trash2 className="mr-1.5 size-3.5" />
                문헌 삭제
              </Button>
            ) : null}
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <FileText className="size-4" />
            <span>{meta.literature_type || "연구보고서"}</span>
            {meta.year ? (
              <>
                <span>•</span>
                <span>{meta.year}</span>
              </>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            {doc.author_name ? (
              <span className="flex items-center gap-1 rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                <User className="size-3" />
                등록 연구원: {doc.author_name}
              </span>
            ) : null}
            <span className="rounded bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
              공유 문헌
            </span>
          </div>
        </div>
        <h1 className="font-serif text-3xl font-bold leading-tight">{meta.title || "제목 미상"}</h1>
        <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm text-muted-foreground">
          <p>저자: {authorsText}</p>
          <p>발행처: {meta.institution_or_journal || "발행처 미기재"}</p>
        </div>
      </header>

      {/* Tier 1 */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold">1. 연구 방법론 및 데이터</h2>
        <div className="rounded-md border border-border bg-card p-5 shadow-sm text-sm">
          <ul className="space-y-3">
            <li>
              <span className="font-medium">분석 자료:</span> {method.data_source || "원문 미기재"}
            </li>
            <li>
              <span className="font-medium">표본 및 범위:</span>{" "}
              {method.sample_and_scope || "원문 미기재"}
            </li>
            <li>
              <span className="font-medium">연구 방법론:</span>{" "}
              {method.methodology || "원문 미기재"}
            </li>
            <li>
              <span className="font-medium">한계점:</span>{" "}
              {method.methodological_caveats || "원문 미기재"}
            </li>
          </ul>
        </div>
      </section>

      {/* Tier 2 */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold">2. 핵심 연구 질문 분석</h2>
        <div className="space-y-4">
          {questions.length === 0 ? (
            <div className="rounded-md border border-border bg-card p-5 shadow-sm text-sm text-muted-foreground">
              등록된 핵심 연구 질문 분석 내용이 없습니다.
            </div>
          ) : (
            questions.map((q, i) => (
              <div key={i} className="rounded-md border border-border bg-card p-5 shadow-sm">
                <h3 className="font-medium text-primary">Q. {q.research_question}</h3>
                <div className="mt-3 space-y-2 text-sm">
                  <p>
                    <span className="font-medium">결론:</span> {q.findings_summary}
                  </p>
                  <p className="text-muted-foreground">
                    <span className="font-medium">실증 근거:</span> {q.empirical_evidence}
                  </p>
                </div>
                <RelatedFieldNotes
                  uid={doc.uid}
                  researchQuestion={q.research_question}
                  findings={q.findings_summary}
                />
              </div>
            ))
          )}
        </div>
      </section>

      {/* Synthesis */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold">3. 서울시 인적자원개발(HRD) 시사점</h2>
        <div className="rounded-md border border-primary/20 bg-primary/5 p-5 shadow-sm">
          <p className="font-medium leading-relaxed">
            {hrd.core_implication || "도출된 시사점이 없습니다."}
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            타겟 산업/계층: {hrd.target_beneficiary_or_industry || "전체 산업/계층"}
          </p>

          <div className="mt-6 space-y-3">
            <h4 className="text-sm font-semibold text-primary">추천 액션 아이템</h4>
            {!hrd.recommended_actions || hrd.recommended_actions.length === 0 ? (
              <p className="text-xs text-muted-foreground">등록된 추천 액션 아이템이 없습니다.</p>
            ) : (
              hrd.recommended_actions.map((act, i) => (
                <div key={i} className="rounded-md bg-background p-3 text-sm border border-border">
                  <span className="inline-block rounded-full bg-secondary px-2 py-1 text-xs mb-2">
                    {act.category || "정책 제언"}
                  </span>
                  <p className="font-medium">{act.action_detail}</p>
                  {act.ncs_or_curriculum_linkage && act.ncs_or_curriculum_linkage !== "null" && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      NCS 연계: {act.ncs_or_curriculum_linkage}
                    </p>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </section>

      <ConfirmDialog
        open={deleteConfirmOpen}
        onOpenChange={setDeleteConfirmOpen}
        title="문헌 분석 자료 삭제"
        description={`‘${meta?.title || "이 문헌"}’ 분석 자료를 삭제하시겠습니까?\n등록된 연구 질문, 시사점, 액션 플랜 데이터가 영구적으로 삭제됩니다.`}
        confirmText="문헌 삭제"
        cancelText="취소"
        variant="destructive"
        isLoading={deleteMut.isPending}
        onConfirm={() => deleteMut.mutate()}
      />
    </div>
  );
}

function RelatedFieldNotes({
  uid,
  researchQuestion,
  findings,
}: {
  uid?: string;
  researchQuestion?: string;
  findings?: string;
}) {
  const { data: related, isPending } = useQuery({
    queryKey: ["related-field-notes", uid, researchQuestion],
    queryFn: async () => {
      if (!researchQuestion) return [];
      const queryStr = `${researchQuestion} ${findings || ""}`.trim();
      const hits = await searchConfirmedCases(uid || "", queryStr, { limit: 2 });
      return hits.filter((h) => h.score > 0.4); // Only return highly relevant hits
    },
    enabled: Boolean(researchQuestion),
  });

  if (isPending) {
    return (
      <div className="mt-4 text-xs text-muted-foreground flex items-center gap-1">
        <LoaderCircle className="size-3 animate-spin" /> 관련 현장록 찾는 중...
      </div>
    );
  }

  if (!related || related.length === 0) {
    return (
      <div className="mt-4 text-xs text-muted-foreground">관련된 현장록 데이터가 없습니다.</div>
    );
  }

  return (
    <div className="mt-4 border-t border-border/50 pt-3">
      <h4 className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1">
        관련 현장록
      </h4>
      <div className="space-y-2">
        {related.map((hit) => (
          <Link
            key={hit.sessionId}
            to={"/library/$sessionId"}
            params={{ sessionId: hit.sessionId }}
            className="block group"
          >
            <div className="rounded bg-muted/50 p-2 text-xs transition-colors group-hover:bg-muted">
              <div className="font-medium text-primary/80 group-hover:text-primary mb-1">
                {hit.sessionTitle}
              </div>
              <div className="text-muted-foreground line-clamp-1">{hit.headline}</div>
              <div className="text-muted-foreground line-clamp-1 mt-1 opacity-80">
                "{hit.reason}"
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
