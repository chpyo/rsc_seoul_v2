import type { ErrorComponentProps } from "@tanstack/react-router";
import { RefreshCw, TriangleAlert } from "lucide-react";
import { useEffect } from "react";

export function AppErrorComponent({ error, reset }: ErrorComponentProps) {
  const errorMessage = error instanceof Error ? error.message : String(error ?? "");
  const isChunkError =
    errorMessage.includes("Importing a module script failed") ||
    errorMessage.includes("Failed to fetch dynamically imported module") ||
    errorMessage.includes("error loading dynamically imported module");

  useEffect(() => {
    if (isChunkError && typeof window !== "undefined") {
      const reloadKey = "chunk_load_reload_ts";
      const lastReload = sessionStorage.getItem(reloadKey);
      const now = Date.now();
      // Auto-reload once within 10 seconds to recover from stale chunk hashes
      if (!lastReload || now - Number(lastReload) > 10000) {
        sessionStorage.setItem(reloadKey, String(now));
        window.location.reload();
      }
    }
  }, [isChunkError]);

  return (
    <main
      className={
        "flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center " +
        "bg-background text-foreground"
      }
    >
      <span className="text-destructive" aria-hidden="true">
        <TriangleAlert className="size-10" strokeWidth={2} />
      </span>
      <h1 className="text-lg font-semibold">
        {isChunkError ? "리소스 로딩 중 오류가 발생했습니다" : "화면을 표시하지 못했습니다"}
      </h1>
      <p className="max-w-md text-sm break-words text-muted-foreground">
        {errorMessage || "예기치 못한 오류가 발생했습니다. 페이지를 새로고침해 주세요."}
      </p>
      <button
        type="button"
        onClick={() => {
          if (typeof window !== "undefined") {
            window.location.reload();
          } else if (reset) {
            reset();
          }
        }}
        className="mt-2 inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-primary-foreground bg-primary rounded-md hover:bg-primary/90 transition-colors cursor-pointer"
      >
        <RefreshCw className="size-4" />
        페이지 새로고침
      </button>
    </main>
  );
}
