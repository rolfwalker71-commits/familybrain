"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

export type AuthMe = {
  kind: "admin" | "user";
  username: string;
  displayName: string;
  isAdmin: boolean;
  userId?: number;
};

type AuthContextValue = {
  me: AuthMe | null;
  loading: boolean;
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [me, setMe] = useState<AuthMe | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/me");
      if (!res.ok) {
        setMe(null);
        return;
      }
      const data = await res.json();
      setMe({
        kind: data.kind === "user" ? "user" : "admin",
        username: data.username,
        displayName: data.displayName || data.username,
        isAdmin: Boolean(data.isAdmin),
        userId: data.userId,
      });
    } catch {
      setMe(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const value = useMemo(
    () => ({ me, loading, refresh }),
    [me, loading, refresh]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    return {
      me: null,
      loading: true,
      refresh: async () => undefined,
    } satisfies AuthContextValue;
  }
  return ctx;
}
