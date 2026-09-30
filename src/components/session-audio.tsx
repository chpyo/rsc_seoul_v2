import { useMutation } from "@tanstack/react-query";
import { LoaderCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { runTranscribeAudio } from "@/lib/ai/run";
import { formatAudioBytes, formatDurationSec, getAudioDownloadUrl } from "@/lib/audio";
import type { SessionAudio } from "@/lib/types";

export function SessionAudioPlayer({
  audio,
  canRetranscribe,
  onRetranscribe,
}: {
  audio: SessionAudio;
  canRetranscribe?: boolean;
  onRetranscribe?: (text: string) => Promise<void>;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getAudioDownloadUrl(audio.storagePath)
      .then((next) => {
        if (!cancelled) setUrl(next);
      })
      .catch(() => {
        if (!cancelled) setUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [audio.storagePath]);

  const retryMut = useMutation({
    mutationFn: async () => {
      const res = await runTranscribeAudio(
        {
          storagePath: audio.storagePath,
          mimeType: audio.mimeType,
          durationSec: audio.durationSec,
        },
        (p) =>
          setProgress(
            p.stage === "preparing"
              ? "원본 준비 중"
              : `전사 중 ${p.part}${p.totalParts ? `/${p.totalParts}` : ""}`,
          ),
      );
      setProgress(null);
      if (!res.ok) throw new Error(res.error);
      if (!onRetranscribe) return;
      await onRetranscribe(res.text);
    },
    onSuccess: () => {
      setConfirmOpen(false);
      toast.success("원본을 다시 전사했습니다.");
    },
    onError: (err: Error) => {
      setProgress(null);
      setConfirmOpen(false);
      toast.error(err.message);
    },
  });

  const duration = formatDurationSec(audio.durationSec);

  return (
    <div className="flex flex-col gap-2 border-b border-border px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          원본 녹음 {audio.filename}
          {duration ? ` · ${duration}` : ""}
          {audio.sizeBytes ? ` · ${formatAudioBytes(audio.sizeBytes)}` : ""}
        </p>
        {canRetranscribe && onRetranscribe ? (
          <Button
            size="sm"
            variant="outline"
            disabled={retryMut.isPending}
            onClick={() => setConfirmOpen(true)}
          >
            {retryMut.isPending ? <LoaderCircle className="size-4 animate-spin" /> : null}
            {retryMut.isPending && progress ? progress : "원본 다시 전사"}
          </Button>
        ) : null}
      </div>
      {url ? (
        <audio controls src={url} className="w-full" preload="metadata">
          이 브라우저는 오디오 재생을 지원하지 않습니다.
        </audio>
      ) : (
        <p className="text-xs text-muted-foreground">원본 오디오를 불러오는 중</p>
      )}

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="원본 다시 전사"
        description="원본 오디오를 다시 전사하시겠습니까?\n현재 생성된 원문 구간이 새로운 전사 결과로 대체됩니다."
        confirmText="다시 전사하기"
        cancelText="취소"
        variant="default"
        isLoading={retryMut.isPending}
        onConfirm={() => retryMut.mutate()}
      />
    </div>
  );
}
