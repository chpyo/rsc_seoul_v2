import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { User } from "firebase/auth";
import { toast } from "sonner";
import { auth, loginWithGoogle, logout } from "./firebase";
import {
  resolveMembership,
  setCurrentMember,
  type Member,
  type Role,
} from "./membership";

/** loading: 로그인 또는 멤버십 확인 중 / signed-out / pending: 초대 없음 / inactive: 비활성 / member */
export type MemberStatus = "loading" | "signed-out" | "pending" | "inactive" | "error" | "member";

type AuthContextType = {
  user: User | null;
  loading: boolean;
  member: Member | null;
  memberStatus: MemberStatus;
  role: Role | null;
  isAdmin: boolean;
  canWrite: boolean;
  login: () => Promise<void>;
  logout: () => Promise<void>;
  refreshMembership: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  member: null,
  memberStatus: "loading",
  role: null,
  isAdmin: false,
  canWrite: false,
  login: async () => {},
  logout: async () => {},
  refreshMembership: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [member, setMember] = useState<Member | null>(null);
  const [memberStatus, setMemberStatus] = useState<MemberStatus>("loading");

  const loadMembership = useCallback(async (u: User | null) => {
    if (!u) {
      setMember(null);
      setCurrentMember(null);
      setMemberStatus("signed-out");
      return;
    }
    setMemberStatus("loading");
    try {
      const state = await resolveMembership(u);
      if (state.status === "pending") {
        setMember(null);
        setCurrentMember(null);
        setMemberStatus("pending");
      } else {
        setMember(state.member);
        setCurrentMember(state.status === "member" ? state.member : null);
        setMemberStatus(state.status);
      }
    } catch (err) {
      console.error("[auth] membership check failed:", err);
      setMember(null);
      setCurrentMember(null);
      setMemberStatus("error");
    }
  }, []);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((u) => {
      setUser(u);
      setAuthLoading(false);
      void loadMembership(u);
    });
    return unsubscribe;
  }, [loadMembership]);

  const handleLogin = async () => {
    try {
      await loginWithGoogle();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Google 로그인에 실패했습니다.");
    }
  };

  const handleLogout = async () => {
    await logout();
  };

  const active = memberStatus === "member" && member?.active === true;
  const role = active ? member!.role : null;

  return (
    <AuthContext.Provider
      value={{
        user,
        loading: authLoading,
        member,
        memberStatus,
        role,
        isAdmin: role === "admin",
        canWrite: role === "admin" || role === "researcher",
        login: handleLogin,
        logout: handleLogout,
        refreshMembership: () => loadMembership(auth.currentUser),
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
