import { Link, useRouterState } from "@tanstack/react-router";
import { BookOpen, FilePlus2, FolderOpen, Library, LogIn, LogOut, Settings, ShieldCheck } from "lucide-react";
import { type ReactNode } from "react";
import { BrandMark } from "@/components/brand-mark";
import { Button } from "@/components/ui/button";
import { APP_NAME, APP_NAME_EN, APP_TAGLINE } from "@/lib/brand";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";

const NAV = [
  { to: "/", label: "현장록", icon: FolderOpen, match: "home" as const },
  { to: "/literature", label: "문헌록", icon: BookOpen, match: "literature" as const },
  { to: "/library", label: "통합 자료실", icon: Library, match: "library" as const },
] as const;

function navActive(pathname: string, match: (typeof NAV)[number]["match"]) {
  if (match === "home") {
    return pathname === "/" || pathname.startsWith("/projects") || pathname.startsWith("/sessions");
  }
  if (match === "literature") {
    return pathname.startsWith("/literature");
  }
  return pathname.startsWith("/library");
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const wide = pathname.startsWith("/sessions/");
  const { user, login, logout, loading, isAdmin } = useAuth();
  const uploadActive = pathname.startsWith("/upload");

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur-sm">
        <div
          className={cn(
            "mx-auto flex h-16 items-center justify-between gap-3 px-4",
            wide ? "max-w-7xl" : "max-w-6xl",
          )}
        >
          <Link to="/" className="flex min-w-0 items-center gap-2.5">
            <BrandMark className="size-8 text-primary" />
            <span className="font-serif text-lg leading-none font-semibold tracking-tight">
              {APP_NAME}
            </span>
          </Link>

          <div className="flex items-center gap-1">
            <nav className="hidden items-center gap-1 md:flex">
              {NAV.map((item) => {
                const active = navActive(pathname, item.match);
                return (
                  <Link
                    key={item.to}
                    to={item.to}
                    className={cn(
                      "inline-flex h-11 items-center px-3 text-sm font-medium transition-colors",
                      active
                        ? "text-foreground shadow-[inset_0_-2px_0_0_var(--color-primary)]"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {item.label}
                  </Link>
                );
              })}
              <Button asChild size="sm" className="ml-2">
                <Link to="/upload" search={{ projectId: undefined }}>
                  새 녹취
                </Link>
              </Button>
            </nav>
            {user ? (
              <div className="flex items-center gap-1.5">
                {isAdmin ? (
                  <span
                    className="inline-flex items-center gap-1 rounded border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-xs font-semibold text-amber-700 dark:text-amber-400"
                    title="모든 프로젝트와 자료의 수정 및 삭제 권한을 가진 관리자 계정입니다"
                  >
                    <ShieldCheck className="size-3.5" />
                    관리자
                  </span>
                ) : null}
                <Button variant="ghost" size="icon" className="text-muted-foreground" asChild>
                  <Link to="/settings" aria-label="설정">
                    <Settings className="size-4" />
                  </Link>
                </Button>
                <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={logout}>
                  <LogOut className="size-4 mr-1.5" />
                  <span className="hidden max-w-28 truncate sm:inline">
                    {user.displayName || "로그아웃"}
                  </span>
                </Button>
              </div>
            ) : (
              <Button variant="outline" size="sm" onClick={login} disabled={loading}>
                <LogIn className="size-4 mr-1.5" />
                Google 로그인
              </Button>
            )}
          </div>
        </div>
      </header>

      <div
        className={cn(
          "mx-auto px-4 py-6 pb-[calc(5.5rem+env(safe-area-inset-bottom))] md:pb-16",
          wide ? "max-w-7xl" : "max-w-6xl",
        )}
      >
        {user ? (
          children
        ) : (
          <div className="mx-auto flex max-w-lg flex-col gap-8 py-10 sm:py-16">
            <div className="paper-ruled rounded-md border border-border bg-card px-6 py-10 sm:px-8">
              <BrandMark className="size-12 text-primary" title={APP_NAME} />
              <h1 className="mt-5 font-serif text-4xl font-semibold tracking-tight">{APP_NAME}</h1>
              <p className="mt-1 text-xs tracking-wide text-muted-foreground uppercase">{APP_NAME_EN}</p>
              <p className="mt-4 text-sm leading-relaxed text-ink-soft">{APP_TAGLINE}</p>
              <p className="mt-6 text-sm leading-relaxed text-muted-foreground">
                현장 기록을 이어서 보려면 로그인하세요.
              </p>
              <Button className="mt-6" onClick={login} disabled={loading} size="lg">
                <LogIn className="size-4" />
                Google 로그인
              </Button>
            </div>
          </div>
        )}
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-sm md:hidden">
        <div className="grid grid-cols-4">
          {NAV.map((item) => {
            const active = navActive(pathname, item.match);
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "flex h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium",
                  active ? "text-primary" : "text-muted-foreground",
                )}
              >
                <Icon className="size-5 mb-0.5" />
                {item.label}
              </Link>
            );
          })}
          <Link
            to="/upload"
            search={{ projectId: undefined }}
            className={cn(
              "flex h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium",
              uploadActive ? "text-primary" : "text-muted-foreground",
            )}
          >
            <FilePlus2 className="size-5 mb-0.5" />
            새 녹취
          </Link>
        </div>
      </nav>
    </div>
  );
}
