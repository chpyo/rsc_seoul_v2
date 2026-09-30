import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Settings as SettingsIcon, ShieldCheck, UserCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/lib/auth-context";
import { getStoredResearcher, setStoredResearcher } from "@/lib/researcher";
import { MemberAdmin } from "@/components/member-admin";
import { SearchIndexAdmin } from "@/components/search-index-admin";
import { ROLE_LABELS } from "@/lib/membership";
import { testEnvHandler } from "@/lib/server/sessions";

export const Route = createFileRoute("/settings")({
  component: Settings,
});

function Settings() {
  const { user, isAdmin } = useAuth();
  const [researcher, setResearcher] = useState("");

  useEffect(() => {
    // 예전 버전이 브라우저에 남긴 키·토큰 정리
    try {
      localStorage.removeItem("GEMINI_API_KEY");
      localStorage.removeItem("fb_token");
    } catch {
      /* ignore */
    }
    setResearcher(getStoredResearcher());
  }, []);

  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    setStoredResearcher(researcher);
    toast.success("기본 연구원 설정이 저장되었습니다.");
  };

  return (
    <div className="mx-auto max-w-3xl py-8 px-4 sm:px-6">
      <div className="mb-8">
        <h1 className="flex items-center gap-2.5 font-serif text-3xl font-semibold tracking-tight text-foreground">
          <SettingsIcon className="size-7 text-primary" />
          설정
        </h1>
        <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
          연구원 프로필과 계정 권한을 확인합니다. 관리자는 멤버를 초대하고 역할을 정합니다.
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
                value={
                  user
                    ? `${user.displayName || "연구위원"} (${user.email || "인증됨"})`
                    : "미로그인"
                }
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

        <AccessStatus />

        {isAdmin ? <MemberAdmin /> : null}

        {isAdmin ? <SearchIndexAdmin /> : null}
      </div>
    </div>
  );
}

function StatusRow({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-md border border-border bg-muted/20 p-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-foreground">{label}</h3>
        <Badge variant="outline">{value}</Badge>
      </div>
      <p className="text-xs leading-relaxed text-muted-foreground">{detail}</p>
    </div>
  );
}

function AccessStatus() {
  const { role } = useAuth();
  const env = useQuery({
    queryKey: ["server-env"],
    queryFn: () => testEnvHandler(),
    staleTime: 60_000,
  });

  const aiValue = env.isLoading ? "확인 중" : env.data?.configured ? "연결됨" : "키 없음";
  const aiDetail = env.data?.configured
    ? "Gemini 호출은 서버에서만 이뤄지며 API 키는 브라우저로 전달되지 않습니다."
    : "서버 환경 변수 GEMINI_API_KEY 가 없어 분석·전사·챗봇을 쓸 수 없습니다. 관리자에게 알려 주세요.";

  return (
    <div className="rounded-lg border border-border bg-card p-6 shadow-xs">
      <div className="mb-5 flex items-center gap-2 border-b border-border pb-4">
        <ShieldCheck className="size-5 text-primary" />
        <h2 className="text-lg font-semibold text-foreground">권한 및 연결 상태</h2>
      </div>
      <div className="flex flex-col gap-3">
        <StatusRow
          label="내 권한"
          value={role ? ROLE_LABELS[role] : "-"}
          detail={
            role === "admin"
              ? "모든 기록을 수정·삭제하고 멤버를 관리할 수 있습니다."
              : role === "researcher"
                ? "기록을 올리고 본인이 올린 기록을 수정·삭제할 수 있습니다."
                : "모든 기록을 읽을 수 있습니다. 작성과 수정은 할 수 없습니다."
          }
        />
        <StatusRow
          label="데이터 공유 범위"
          value="팀 공유"
          detail="승인된 멤버만 기록을 볼 수 있고, 수정·삭제는 작성자 본인과 관리자만 할 수 있습니다. 녹음 원본은 올린 사람과 관리자만 들을 수 있습니다."
        />
        <StatusRow label="AI 서버" value={aiValue} detail={aiDetail} />
      </div>
    </div>
  );
}
