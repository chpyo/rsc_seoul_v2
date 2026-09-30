import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MailPlus, Trash2, Users } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { NativeSelect } from "@/components/native-select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/lib/auth-context";
import {
  ROLE_LABELS,
  ROLES,
  createInvite,
  deleteInvite,
  listInvites,
  listMembers,
  updateMember,
  type Role,
} from "@/lib/membership";

function errorText(err: unknown, fallback: string) {
  return err instanceof Error && err.message ? err.message : fallback;
}

/** 관리자 전용: 멤버 역할·활성 관리와 이메일 초대. */
export function MemberAdmin() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("researcher");

  const members = useQuery({ queryKey: ["admin", "members"], queryFn: listMembers });
  const invites = useQuery({ queryKey: ["admin", "invites"], queryFn: listInvites });

  const inviteMut = useMutation({
    mutationFn: () => createInvite(email, role, user?.email || ""),
    onSuccess: () => {
      toast.success("초대를 등록했습니다. 해당 이메일로 로그인하면 바로 사용할 수 있습니다.");
      setEmail("");
      void qc.invalidateQueries({ queryKey: ["admin", "invites"] });
    },
    onError: (err) => toast.error(errorText(err, "초대를 등록하지 못했습니다.")),
  });

  const cancelInviteMut = useMutation({
    mutationFn: (target: string) => deleteInvite(target),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["admin", "invites"] }),
    onError: (err) => toast.error(errorText(err, "초대를 취소하지 못했습니다.")),
  });

  const memberMut = useMutation({
    mutationFn: (args: { uid: string; role?: Role; active?: boolean }) =>
      updateMember(args.uid, { role: args.role, active: args.active }),
    onSuccess: () => {
      toast.success("멤버 정보를 바꿨습니다.");
      void qc.invalidateQueries({ queryKey: ["admin", "members"] });
    },
    onError: (err) => toast.error(errorText(err, "멤버 정보를 바꾸지 못했습니다.")),
  });

  const memberEmails = new Set((members.data || []).map((m) => m.email));

  return (
    <div className="rounded-lg border border-border bg-card p-6 shadow-xs">
      <div className="mb-5 flex items-center gap-2 border-b border-border pb-4">
        <Users className="size-5 text-primary" />
        <h2 className="text-lg font-semibold text-foreground">멤버 관리</h2>
      </div>

      <form
        className="flex flex-col gap-2 sm:flex-row"
        onSubmit={(e) => {
          e.preventDefault();
          if (email.trim()) inviteMut.mutate();
        }}
      >
        <Input
          type="email"
          placeholder="초대할 Google 계정 이메일"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="sm:flex-1"
          aria-label="초대할 이메일"
        />
        <NativeSelect
          value={role}
          onChange={(e) => setRole(e.target.value as Role)}
          className="sm:w-32"
          aria-label="역할"
        >
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABELS[r]}
            </option>
          ))}
        </NativeSelect>
        <Button type="submit" disabled={!email.trim() || inviteMut.isPending} className="h-11">
          <MailPlus className="size-4" />
          초대
        </Button>
      </form>
      <p className="mt-2 text-xs text-muted-foreground">
        연구원은 기록을 올리고 본인 기록을 고칠 수 있습니다. 열람자는 읽기만, 관리자는 모든 기록과
        멤버를 관리합니다.
      </p>

      {(invites.data || []).filter((i) => !memberEmails.has(i.email)).length > 0 ? (
        <div className="mt-6">
          <h3 className="mb-2 text-sm font-semibold">대기 중인 초대</h3>
          <ul className="divide-y divide-border rounded-md border border-border">
            {(invites.data || [])
              .filter((i) => !memberEmails.has(i.email))
              .map((i) => (
                <li key={i.email} className="flex items-center justify-between gap-3 px-3 py-2">
                  <span className="min-w-0 truncate font-mono text-sm">{i.email}</span>
                  <span className="flex shrink-0 items-center gap-2">
                    <Badge variant="outline">{ROLE_LABELS[i.role]}</Badge>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`${i.email} 초대 취소`}
                      onClick={() => cancelInviteMut.mutate(i.email)}
                      disabled={cancelInviteMut.isPending}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </span>
                </li>
              ))}
          </ul>
        </div>
      ) : null}

      <div className="mt-6">
        <h3 className="mb-2 text-sm font-semibold">
          멤버 {members.data ? `(${members.data.length})` : ""}
        </h3>
        {members.isError ? (
          <p className="text-sm text-destructive">멤버 목록을 불러오지 못했습니다.</p>
        ) : (
          <ul className="divide-y divide-border rounded-md border border-border">
            {(members.data || []).map((m) => {
              const self = m.uid === user?.uid;
              return (
                <li
                  key={m.uid}
                  className="flex flex-col gap-2 px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {m.displayName || m.email}
                      {self ? (
                        <span className="ml-1 text-xs text-muted-foreground">(나)</span>
                      ) : null}
                    </p>
                    <p className="truncate font-mono text-xs text-muted-foreground">{m.email}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <NativeSelect
                      value={m.role}
                      disabled={self || memberMut.isPending}
                      onChange={(e) =>
                        memberMut.mutate({ uid: m.uid, role: e.target.value as Role })
                      }
                      className="h-9 w-28"
                      aria-label={`${m.email} 역할`}
                    >
                      {ROLES.map((r) => (
                        <option key={r} value={r}>
                          {ROLE_LABELS[r]}
                        </option>
                      ))}
                    </NativeSelect>
                    <Button
                      variant={m.active ? "outline" : "default"}
                      size="sm"
                      disabled={self || memberMut.isPending}
                      onClick={() => memberMut.mutate({ uid: m.uid, active: !m.active })}
                    >
                      {m.active ? "사용 중지" : "다시 사용"}
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        <p className="mt-2 text-xs text-muted-foreground">
          본인 계정의 역할과 사용 여부는 다른 관리자만 바꿀 수 있습니다.
        </p>
      </div>
    </div>
  );
}
