import { createFileRoute } from "@tanstack/react-router";
import {
  Settings as SettingsIcon,
  ShieldCheck,
  UserCheck,
  Database,
  Lock,
  Trash2,
  CheckCircle2,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/lib/auth-context";
import { getStoredResearcher, setStoredResearcher } from "@/lib/researcher";

export const Route = createFileRoute("/settings")({
  component: Settings,
});

function Settings() {
  const { user } = useAuth();
  const [researcher, setResearcher] = useState("");

  useEffect(() => {
    // Purge any legacy client-stored API key to prevent browser exposure
    if (localStorage.getItem("GEMINI_API_KEY")) {
      localStorage.removeItem("GEMINI_API_KEY");
    }
    setResearcher(getStoredResearcher());
  }, []);

  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    setStoredResearcher(researcher);
    toast.success("기본 연구원 설정이 저장되었습니다.");
  };

  const handleClearLocalCache = () => {
    try {
      localStorage.removeItem("GEMINI_API_KEY");
      localStorage.removeItem("fb_token");
      toast.success("로컬 임시 캐시 및 보안 데이터가 정리되었습니다.");
    } catch {
      toast.error("캐시 초기화 중 오류가 발생했습니다.");
    }
  };

  return (
    <div className="mx-auto max-w-3xl py-8 px-4 sm:px-6">
      <div className="mb-8">
        <h1 className="flex items-center gap-2.5 font-serif text-3xl font-semibold tracking-tight text-foreground">
          <SettingsIcon className="size-7 text-primary" />
          시스템 설정 및 보안
        </h1>
        <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
          서울지역 인적자원개발위원회(서울인자위) 인터뷰·문헌 분석 시스템의 사용자 프로필 및 배포 보안 상태를 관리합니다.
        </p>
      </div>

      <div className="flex flex-col gap-8">
        {/* Section 1: Researcher & Account Profile */}
        <div className="rounded-lg border border-border bg-card p-6 shadow-xs">
          <div className="flex items-center justify-between border-b border-border pb-4 mb-5">
            <div className="flex items-center gap-2">
              <UserCheck className="size-5 text-primary" />
              <h2 className="text-lg font-semibold text-foreground">계정 및 연구원 프로필</h2>
            </div>
            {user?.email && (
              <Badge variant="secondary" className="font-mono text-xs">
                {user.email}
              </Badge>
            )}
          </div>

          <form onSubmit={handleSaveProfile} className="flex flex-col gap-4">
            <div className="grid gap-2">
              <Label htmlFor="user-display" className="text-sm font-medium text-foreground">
                로그인 계정
              </Label>
              <Input
                id="user-display"
                type="text"
                disabled
                value={user ? `${user.displayName || "연구위원"} (${user.email || "인증됨"})` : "미로그인"}
                className="bg-muted/40 text-muted-foreground"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="researcher-name" className="text-sm font-medium text-foreground">
                기본 연구원(작성자) 서명
              </Label>
              <Input
                id="researcher-name"
                type="text"
                placeholder="예: 박연구 위원, 노동시장분석팀"
                value={researcher}
                onChange={(e) => setResearcher(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                회의 녹취록 생성 및 문헌 분석 보고서 등록 시 기본 작성자명으로 자동 반영됩니다.
              </p>
            </div>

            <div className="flex justify-end pt-2">
              <Button type="submit" size="sm">
                프로필 저장
              </Button>
            </div>
          </form>
        </div>

        {/* Section 2: Security & Deployment Status */}
        <div className="rounded-lg border border-border bg-card p-6 shadow-xs">
          <div className="flex items-center justify-between border-b border-border pb-4 mb-5">
            <div className="flex items-center gap-2">
              <ShieldCheck className="size-5 text-emerald-600 dark:text-emerald-400" />
              <h2 className="text-lg font-semibold text-foreground">배포 및 보안 현황</h2>
            </div>
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="size-4" />
              보안 표준 준수
            </span>
          </div>

          <div className="flex flex-col gap-4">
            {/* Security Item 1: API Key Protection */}
            <div className="flex items-start gap-3.5 rounded-md border border-border bg-muted/20 p-4">
              <Lock className="size-5 text-primary shrink-0 mt-0.5" />
              <div className="flex-1 space-y-1">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-foreground">
                    Gemini AI API 키 완전 격리 보호
                  </h3>
                  <Badge variant="outline" className="border-emerald-500/40 text-emerald-600 dark:text-emerald-400 bg-emerald-50/50 dark:bg-emerald-950/20">
                    서버 프록시 가동 중
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  API 키는 브라우저나 UI 화면에 노출되지 않고, 서버 환경 변수(<code>GEMINI_API_KEY</code>)로 격리되어 백엔드 프록시를 통해서만 암호화 통신됩니다.
                </p>
              </div>
            </div>

            {/* Security Item 2: Database RBAC */}
            <div className="flex items-start gap-3.5 rounded-md border border-border bg-muted/20 p-4">
              <Database className="size-5 text-primary shrink-0 mt-0.5" />
              <div className="flex-1 space-y-1">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-foreground">
                    Firestore 데이터 접근 제어 (RBAC)
                  </h3>
                  <Badge variant="outline" className="border-emerald-500/40 text-emerald-600 dark:text-emerald-400 bg-emerald-50/50 dark:bg-emerald-950/20">
                    보안 규칙 활성화
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  연구원 본인이 등록한 녹취 파일, 전사 텍스트, 문헌 분석 결과물만 조회·수정할 수 있도록 데이터 소유자 격리 규칙이 엄격히 적용되어 있습니다.
                </p>
              </div>
            </div>

            {/* Security Item 3: Local Storage Cleanup */}
            <div className="mt-2 pt-4 border-t border-border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-medium text-foreground">브라우저 보안 캐시 관리</h3>
                <p className="text-xs text-muted-foreground">
                  이전 브라우징 세션에 남아있을 수 있는 임시 인증 토큰 및 캐시 데이터를 정리합니다.
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="text-muted-foreground hover:text-destructive shrink-0"
                onClick={handleClearLocalCache}
              >
                <Trash2 className="size-3.5 mr-1.5" />
                보안 캐시 정리
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
