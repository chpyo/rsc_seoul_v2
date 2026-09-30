import { useState } from "react";
import { MessageSquare, LoaderCircle, Send } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RelatedCases } from "@/components/related-cases";
import { askConfirmedCorpusStream } from "@/lib/ai/ask-corpus";
import { AnswerMarkdown } from "@/components/answer-markdown";
import { useAuth } from "@/lib/auth-context";
import type { Citation, RelatedCase } from "@/lib/types";

type ChatMessage =
  | { role: "user"; text: string }
  | { role: "ai"; text: string; relatedCases: RelatedCase[]; citations: Record<string, Citation> };

export function ChatModal({ projectId, projectTitle }: { projectId: string; projectTitle: string }) {
  const { user } = useAuth();
  const uid = user?.uid;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [history, setHistory] = useState<ChatMessage[]>([]);
  const [isPending, setIsPending] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const question = query.trim();
    if (!question || isPending) return;
    if (!uid) {
      toast.error("로그인이 필요합니다.");
      return;
    }
    
    setHistory((prev) => [...prev, { role: "user", text: question }]);
    setQuery("");
    setIsPending(true);
    
    setHistory((prev) => [...prev, { role: "ai", text: "", relatedCases: [], citations: {} }]);
    
    try {
      const stream = askConfirmedCorpusStream(uid, question, { projectId, projectTitle });
      for await (const chunk of stream) {
        setHistory((prev) => {
          const next = [...prev];
          next[next.length - 1] = {
            role: "ai",
            text: chunk.text,
            relatedCases: chunk.relatedCases,
            citations: chunk.citations,
          };
          return next;
        });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "에러가 발생했습니다.");
    } finally {
      setIsPending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2">
          <MessageSquare className="size-4" />
          AI 어시스턴트에게 묻기
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl flex flex-col h-[80vh] p-0 overflow-hidden">
        <DialogHeader className="px-6 py-4 border-b border-border bg-card shrink-0">
          <DialogTitle>자료실에 묻기</DialogTitle>
          <DialogDescription>
            확정된 회의록만 찾습니다. 비슷한 회의를 고르면 자료실로 갑니다.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-muted/20">
          {history.length === 0 ? (
            <div className="h-full flex items-center justify-center text-sm text-muted-foreground text-center">
              "A업종 사람들이 가장 많이 언급한 인력 부족 원인은 무엇인가요?" 처럼 질문해 보세요.
            </div>
          ) : (
            history.map((msg, i) => (
              <div
                key={i}
                className={`flex flex-col max-w-[85%] ${
                  msg.role === "user" ? "ml-auto items-end" : "mr-auto items-start w-full max-w-full"
                }`}
              >
                <span className="text-[11px] text-muted-foreground mb-1 px-1">
                  {msg.role === "user" ? "나" : "AI 어시스턴트"}
                </span>
                {msg.role === "ai" && msg.relatedCases.length > 0 ? (
                  <div className="mb-2 w-full">
                    <RelatedCases cases={msg.relatedCases} onOpen={() => setOpen(false)} />
                  </div>
                ) : null}
                <div
                  className={`rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap leading-relaxed ${
                    msg.role === "user"
                      ? "bg-primary text-primary-foreground rounded-tr-sm"
                      : "bg-card border border-border rounded-tl-sm shadow-sm w-full"
                  }`}
                >
                  {msg.role === "ai" ? (
                    <div className="markdown-body">
                      <AnswerMarkdown
                        text={msg.text}
                        citations={msg.citations}
                        onNavigate={() => setOpen(false)}
                      />
                    </div>
                  ) : (
                    msg.text
                  )}
                </div>
              </div>
            ))
          )}
          {isPending && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground ml-2">
              <LoaderCircle className="size-4 animate-spin" />
              비슷한 회의를 찾고 있습니다...
            </div>
          )}
        </div>

        <form onSubmit={onSubmit} className="p-4 border-t border-border bg-card flex gap-2">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="질문을 입력하세요..."
            className="flex-1 rounded-full px-4"
            disabled={isPending}
          />
          <Button
            type="submit"
            size="icon"
            className="rounded-full shrink-0"
            disabled={!query.trim() || isPending}
          >
            <Send className="size-4" />
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
