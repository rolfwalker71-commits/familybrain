"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/components/auth/auth-provider";
import {
  type AdminNavMode,
  inferAdminNavMode,
  persistAdminNav,
  readHasExitedHome,
  readStoredAdminNavMode,
} from "@/lib/navigation/admin-nav";

type AdminNavContextValue = {
  mode: AdminNavMode;
  setMode: (mode: AdminNavMode, options?: { exitedHome?: boolean }) => void;
  goHome: () => void;
  isAdminNav: boolean;
};

const AdminNavContext = createContext<AdminNavContextValue | null>(null);

export function AdminNavProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || "/";
  const { me, loading } = useAuth();
  const isAdminNav = !loading && me?.isAdmin === true;

  const [mode, setModeState] = useState<AdminNavMode>("home");
  const [exitedHome, setExitedHome] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (!isAdminNav) return;
    const stored = readStoredAdminNavMode();
    const storedExited = readHasExitedHome();
    setModeState(stored ?? "home");
    setExitedHome(storedExited);
    setHydrated(true);
  }, [isAdminNav]);

  useEffect(() => {
    if (!isAdminNav || !hydrated) return;
    const inferred = inferAdminNavMode(pathname);
    if (!inferred) return;

    if (inferred === "travelbuddy" || inferred === "finanzbuddy") {
      setModeState(inferred);
      setExitedHome(true);
      persistAdminNav(inferred, true);
      return;
    }

    if (inferred === "mybrain" && exitedHome) {
      setModeState("mybrain");
      persistAdminNav("mybrain", true);
    }
  }, [pathname, isAdminNav, hydrated, exitedHome]);

  const setMode = useCallback(
    (next: AdminNavMode, options?: { exitedHome?: boolean }) => {
      const nextExited =
        options?.exitedHome !== undefined
          ? options.exitedHome
          : next !== "home";
      setModeState(next);
      setExitedHome(nextExited);
      if (isAdminNav) {
        persistAdminNav(next, nextExited);
      }
    },
    [isAdminNav]
  );

  const goHome = useCallback(() => {
    setMode("home", { exitedHome: false });
  }, [setMode]);

  const value = useMemo(
    () => ({
      mode,
      setMode,
      goHome,
      isAdminNav,
    }),
    [mode, setMode, goHome, isAdminNav]
  );

  return (
    <AdminNavContext.Provider value={value}>{children}</AdminNavContext.Provider>
  );
}

export function useAdminNav() {
  const ctx = useContext(AdminNavContext);
  if (!ctx) {
    return {
      mode: "home" as AdminNavMode,
      setMode: () => undefined,
      goHome: () => undefined,
      isAdminNav: false,
    };
  }
  return ctx;
}
