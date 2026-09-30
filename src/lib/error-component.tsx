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
        "bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-50"
      }
    >
      <span className="text-red-500" aria-hidden="true">
        <TriangleAlert className="size-10" strokeWidth={2} />
      </span>
      <h1 className="text-lg font-semibold">
        {isChunkError ? "리소스 로딩 중 오류가 발생했습니다" : "Something went wrong"}
      </h1>
      <p className="max-w-md text-sm break-words text-zinc-500 dark:text-zinc-400">
        {errorMessage || "An unexpected error occurred. Try reloading the page."}
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
        className="mt-2 inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-zinc-900 rounded-md hover:bg-zinc-800 transition-colors dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200 cursor-pointer"
      >
        <RefreshCw className="size-4" />
        페이지 새로고침
      </button>
    </main>
  );
}
