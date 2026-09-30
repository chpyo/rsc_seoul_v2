import { useEffect } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import {
  createRootRoute,
  HeadContent,
  Outlet,
  Scripts,
} from "@tanstack/react-router";
import { Toaster } from "sonner";
import { AppShell } from "@/components/app-shell";
import { PreviewHostBridge } from "@/components/preview-host-bridge";
import { AuthProvider } from "@/lib/auth/provider";
import { AuthProvider as FirebaseAuthProvider } from "@/lib/auth-context";

import { queryClient } from "@/lib/query-client";
import { APP_DESCRIPTION, APP_NAME, APP_THEME_COLOR } from "@/lib/brand";
import appCss from "../styles.css?url";

function ChunkRecoveryHandler() {
  useEffect(() => {
    const onPreloadError = () => {
      const reloadKey = "chunk_load_reload_ts";
      const lastReload = sessionStorage.getItem(reloadKey);
      const now = Date.now();
      if (!lastReload || now - Number(lastReload) > 10000) {
        sessionStorage.setItem(reloadKey, String(now));
        window.location.reload();
      }
    };

    window.addEventListener("vite:preloadError", onPreloadError);
    return () => {
      window.removeEventListener("vite:preloadError", onPreloadError);
    };
  }, []);

  return null;
}

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: APP_NAME },
      {
        name: "description",
        content: APP_DESCRIPTION,
      },
      { name: "theme-color", content: APP_THEME_COLOR },
    ],
    links: [
      { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
      { rel: "stylesheet", href: appCss },
      { rel: "manifest", href: "/__grok/manifest.webmanifest" },
      { rel: "apple-touch-icon", href: "/__grok/icon-180.png" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+KR:wght@400;500;600&family=Noto+Serif+KR:wght@500;600;700&display=swap",
      },
    ],
  }),
  component: () => (
    <html lang="ko" className="antialiased" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body>
        <PreviewHostBridge />
        <ChunkRecoveryHandler />
        <AuthProvider>
          <FirebaseAuthProvider>
            <QueryClientProvider client={queryClient}>
              <AppShell>
                <Outlet />
              </AppShell>
              <Toaster
                position="bottom-center"
                toastOptions={{
                  className: "font-sans",
                }}
              />
            </QueryClientProvider>
          </FirebaseAuthProvider>
        </AuthProvider>
        <Scripts />
      </body>
    </html>
  ),
});
