import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowRight, FileUp, LoaderCircle, X } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { analyzeLiteratureFile, analyzeLiteratureHandler } from "@/lib/server/literature";
import { prepareGeminiFile, releaseGeminiFile } from "@/lib/server/media";
import { extractOfficeText } from "@/lib/office-text";
import {
  MAX_LITERATURE_FILE_BYTES,
  uploadLiteratureFile,
  type StoredLiteratureFile,
} from "@/lib/literature-files";
import { saveLiterature } from "@/lib/firebase-literature";
import { getStoredResearcher } from "@/lib/researcher";
import { useAuth } from "@/lib/auth-context";
import { ReadOnlyNotice } from "@/components/read-only-notice";

export const Route = createFileRoute("/literature/upload")({
  component: LiteratureUpload,
});

function LiteratureUpload() {
  const { user, canWrite } = useAuth();
  const qc = useQueryClient();

  const [activeTab, setActiveTab] = useState<"file" | "text">("file");
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [focusQuestions, setFocusQuestions] = useState("");
  const [stage, setStage] = useState("");

  const fileInputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;
    if (selectedFile.size >= MAX_LITERATURE_FILE_BYTES) {
      toast.error("문헌 파일은 50MB보다 작아야 합니다.");
      e.target.value = "";
      return;
    }
    setFile(selectedFile);
  };

  const removeFile = () => {
    setFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const mutation = useMutation({
    mutationFn: async () => {
      if (!user?.uid) throw new Error("로그인이 필요합니다.");

      const focus = focusQuestions.trim() || undefined;
      let res;
      let stored: StoredLiteratureFile | null = null;
      if (activeTab === "text") {
        if (!text.trim()) {
          throw new Error("텍스트를 입력해 주세요.");
        }
        setStage("분석 중");
        res = await analyzeLiteratureHandler({
          data: { text: text.trim(), focusQuestions: focus },
        });
      } else {
        if (!file) {
          throw new Error("파일을 업로드해 주세요.");
        }
        const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
        if (isPdf) {
          // PDF: Storage 에 원본 보관 → 서버가 Gemini 에 올려 분석
          setStage("원본 보관 중");
          stored = await uploadLiteratureFile(user.uid, file, (pct) =>
            setStage(`원본 보관 중 ${pct}%`),
          );
          setStage("AI에 전달 중");
          const gFile = await prepareGeminiFile({
            data: { storagePath: stored.storagePath, mimeType: "application/pdf" },
          });
          try {
            setStage("분석 중");
            res = await analyzeLiteratureFile({ data: { file: gFile, focusQuestions: focus } });
          } finally {
            void releaseGeminiFile({ data: { name: gFile.name } }).catch(() => undefined);
          }
        } else {
          // DOCX·HWPX·TXT·MD: 브라우저에서 본문을 뽑아 텍스트로 분석
          setStage("본문 추출 중");
          const extracted = await extractOfficeText(file.name, await file.arrayBuffer());
          if (!extracted.trim()) throw new Error("파일에서 본문을 찾지 못했습니다.");
          setStage("분석 중");
          res = await analyzeLiteratureHandler({
            data: { text: extracted, focusQuestions: focus },
          });
        }
      }

      const analysisData =
        (res as any)?.literature ||
        (res as any)?.result ||
        ((res as any)?.document_metadata ? res : null);

      if (!analysisData) {
        const errMsg = (res as any)?.error || "분석에 실패했습니다. (서버 응답 오류)";
        throw new Error(errMsg);
      }

      const authorName =
        getStoredResearcher() || user.displayName || user.email?.split("@")[0] || "연구위원";
      const saved = await saveLiterature(user.uid, {
        source_text: activeTab === "text" ? text : `[File Upload] ${file?.name}`,
        focus_questions: focusQuestions,
        source_file: stored,
        analysis: analysisData,
        author_name: authorName,
      });
      return saved;
    },
    onSuccess: async (data) => {
      await qc.invalidateQueries({ queryKey: ["literatures"] });
      await qc.invalidateQueries({ queryKey: ["library"] });
      toast.success("문헌 분석이 완료되었습니다.");
      navigate({
        to: "/literature/$literatureId",
        params: { literatureId: data.id },
      });
    },
    onSettled: () => setStage(""),
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "문헌 분석 중 오류가 발생했습니다.");
    },
  });

  const isSubmitDisabled =
    mutation.isPending || (activeTab === "file" && !file) || (activeTab === "text" && !text.trim());

  if (!canWrite) return <ReadOnlyNotice />;

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-8">
        <h1 className="font-serif text-3xl font-semibold tracking-tight">새 문헌 등록</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          문헌(PDF 등)을 업로드하거나 텍스트를 입력하면 AI가 직접 내용을 분석하여 서울지역 정책
          시사점을 도출합니다.
        </p>
      </div>

      <div className="flex flex-col gap-6 rounded-md border border-border bg-card p-6 shadow-sm">
        <div className="flex gap-4 border-b border-border pb-2">
          <button
            type="button"
            className={`text-sm font-medium pb-2 -mb-2 border-b-2 ${activeTab === "file" ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}
            onClick={() => setActiveTab("file")}
          >
            파일 직접 업로드 (추천)
          </button>
          <button
            type="button"
            className={`text-sm font-medium pb-2 -mb-2 border-b-2 ${activeTab === "text" ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}
            onClick={() => setActiveTab("text")}
          >
            텍스트 붙여넣기
          </button>
        </div>

        {activeTab === "file" && (
          <div className="flex flex-col gap-2 rounded-lg border border-dashed border-border bg-muted/30 p-8 text-center transition-colors hover:bg-muted/50">
            <FileUp className="mx-auto size-8 text-muted-foreground" />

            {file ? (
              <div className="mt-4 flex flex-col items-center justify-center gap-2">
                <div className="flex items-center gap-2 bg-background px-3 py-1.5 rounded-md border border-border shadow-sm">
                  <span className="text-sm font-medium text-foreground">{file.name}</span>
                  <span className="text-xs text-muted-foreground">
                    ({(file.size / 1024 / 1024).toFixed(2)} MB)
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 ml-2 rounded-full"
                    onClick={removeFile}
                  >
                    <X className="size-3" />
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <h3 className="mt-2 text-sm font-semibold text-foreground">문서 파일 업로드</h3>
                <p className="text-xs text-muted-foreground">
                  PDF(50MB 이하), DOCX, HWPX, TXT 파일을 올리면 AI가 원문을 분석합니다. PDF 원본은
                  함께 보관됩니다.
                </p>
                <div className="mt-4 flex justify-center">
                  <input
                    type="file"
                    accept=".pdf,.docx,.hwpx,.txt,.md,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
                    className="hidden"
                    ref={fileInputRef}
                    onChange={handleFileUpload}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={mutation.isPending}
                  >
                    파일 선택하기
                  </Button>
                </div>
              </>
            )}
          </div>
        )}

        {activeTab === "text" && (
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="literature-text" className="font-medium text-foreground">
                문헌 원문 (Text)
              </Label>
              {text && (
                <span className="text-xs text-muted-foreground">
                  {text.length.toLocaleString()} 자
                </span>
              )}
            </div>
            <Textarea
              id="literature-text"
              placeholder="논문 초록, 결론, 주요 본문을 직접 붙여넣으세요..."
              className="min-h-[250px] resize-y font-mono text-sm leading-relaxed"
              value={text}
              onChange={(e) => setText(e.target.value)}
              disabled={mutation.isPending}
            />
          </div>
        )}

        <div className="flex flex-col gap-2">
          <Label htmlFor="focus-questions" className="font-medium text-foreground">
            집중 분석 질문 (선택사항)
          </Label>
          <Input
            id="focus-questions"
            placeholder="예: 청년층 일자리 미스매치 관점에서 시사점을 도출해 줘"
            value={focusQuestions}
            onChange={(e) => setFocusQuestions(e.target.value)}
            disabled={mutation.isPending}
          />
          <p className="text-xs text-muted-foreground">
            입력하지 않으면 AI가 스스로 핵심 연구 질문 2~3개를 도출하여 분석합니다.
          </p>
        </div>

        <div className="flex justify-end pt-4">
          <Button
            onClick={() => mutation.mutate()}
            disabled={isSubmitDisabled}
            className="w-full sm:w-auto"
          >
            {mutation.isPending ? (
              <>
                <LoaderCircle className="mr-2 size-4 animate-spin" />
                {stage || "분석 중"}... (길면 몇 분 걸립니다)
              </>
            ) : (
              <>
                AI 분석 시작
                <ArrowRight className="ml-2 size-4" />
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
