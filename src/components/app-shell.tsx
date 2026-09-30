import { Link, useRouterState } from "@tanstack/react-router";
import {
  BookOpen,
  Clock,
  FilePlus2,
  FolderOpen,
  Library,
  Loader2,
  LogIn,
  LogOut,
  Settings,
  ShieldCheck,
} from "lucide-react";
import { type ReactNode } from "react";
import { BrandMark } from "@/components/brand-mark";
import { Button } from "@/components/ui/button";
import { APP_NAME, APP_NAME_EN, APP_TAGLINE } from "@/lib/brand";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";
import { ROLE_LABELS } from "@/lib/membership";

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
  const { user, login, logout, loading, isAdmin, role, canWrite, memberStatus, refreshMembership } =
    useAuth();
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
              {canWrite ? (
                <Button asChild size="sm" className="ml-2">
                  <Link to="/upload" search={{ projectId: undefined }}>
                    새 녹취
                  </Link>
                </Button>
              ) : null}
            </nav>
            {user ? (
              <div className="flex items-center gap-1.5">
                {isAdmin ? (
                  <span
                    className="inline-flex items-center gap-1 rounded border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-xs font-semibold text-amber-700 dark:text-amber-400"
                    title="모든 프로젝트와 자료의 수정·삭제, 멤버 관리 권한을 가진 관리자 계정입니다"
                  >
                    <ShieldCheck className="size-3.5" />
                    관리자
                  </span>
                ) : role === "viewer" ? (
                  <span
                    className="inline-flex items-center rounded border border-border bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground"
                    title="자료를 읽을 수만 있는 계정입니다"
                  >
                    {ROLE_LABELS.viewer}
                  </span>
                ) : null}
                <Button variant="ghost" size="icon" className="text-muted-foreground" asChild>
                  <Link to="/settings" aria-label="설정">
                    <Settings className="size-4" />
                  </Link>
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground"
                  onClick={logout}
                >
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
        {user && memberStatus === "member" ? (
          children
        ) : user ? (
          <MembershipNotice
            status={memberStatus}
            email={user.email}
            onRetry={refreshMembership}
            onLogout={logout}
          />
        ) : (
          <div className="mx-auto flex max-w-lg flex-col gap-8 py-10 sm:py-16">
            <div className="paper-ruled rounded-md border border-border bg-card px-6 py-10 sm:px-8">
              <BrandMark className="size-12 text-primary" title={APP_NAME} />
              <h1 className="mt-5 font-serif text-4xl font-semibold tracking-tight">{APP_NAME}</h1>
              <p className="mt-1 text-xs tracking-wide text-muted-foreground uppercase">
                {APP_NAME_EN}
              </p>
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
        <div className={cn("grid", canWrite ? "grid-cols-4" : "grid-cols-3")}>
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
          {canWrite ? (
            <Link
              to="/upload"
              search={{ projectId: undefined }}
              className={cn(
                "flex h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium",
                uploadActive ? "text-primary" : "text-muted-foreground",
              )}
            >
              <FilePlus2 className="size-5 mb-0.5" />새 녹취
            </Link>
          ) : null}
        </div>
      </nav>
    </div>
  );
}

function MembershipNotice({
  status,
  email,
  onRetry,
  onLogout,
}: {
  status: string;
  email: string | null;
  onRetry: () => Promise<void>;
  onLogout: () => Promise<void>;
}) {
  if (status === "loading") {
    return (
      <div className="flex items-center justify-center gap-2 py-24 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        계정 권한을 확인하고 있습니다.
      </div>
    );
  }

  const copy =
    status === "inactive"
      ? {
          title: "비활성화된 계정입니다",
          body: "관리자가 이 계정의 사용을 중지했습니다. 다시 사용하려면 관리자에게 문의하세요.",
        }
      : status === "error"
        ? {
            title: "권한을 확인하지 못했습니다",
            body: "네트워크 상태를 확인한 뒤 다시 시도해 주세요.",
          }
        : {
            title: "승인 대기 중입니다",
            body: "현장록은 초대받은 멤버만 사용할 수 있습니다. 관리자에게 아래 이메일로 초대를 요청한 뒤, 초대가 등록되면 다시 확인을 눌러 주세요.",
          };

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-8 py-10 sm:py-16">
      <div className="rounded-md border border-border bg-card px-6 py-10 sm:px-8">
        <Clock className="size-10 text-primary" />
        <h1 className="mt-5 font-serif text-2xl font-semibold tracking-tight">{copy.title}</h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{copy.body}</p>
        {email ? (
          <p className="mt-4 rounded border border-border bg-muted/40 px-3 py-2 font-mono text-sm">
            {email}
          </p>
        ) : null}
        <div className="mt-6 flex gap-2">
          <Button onClick={() => void onRetry()}>다시 확인</Button>
          <Button variant="outline" onClick={() => void onLogout()}>
            <LogOut className="size-4" />
            다른 계정으로 로그인
          </Button>
        </div>
      </div>
    </div>
  );
}
