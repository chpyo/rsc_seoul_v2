import React, { createContext, useContext, useEffect, useState } from "react";
import { User } from "firebase/auth";
import { toast } from "sonner";
import { auth, loginWithGoogle, logout } from "./firebase";
import { isUserAdmin } from "./admin";

type AuthContextType = {
  user: User | null;
  loading: boolean;
  isAdmin: boolean;
  login: () => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  isAdmin: false,
  login: async () => {},
  logout: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((u) => {
      setUser(u);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

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

  const isAdmin = isUserAdmin(user?.email);

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        isAdmin,
        login: handleLogin,
        logout: handleLogout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
