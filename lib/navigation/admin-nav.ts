export type AdminNavMode = "home" | "mybrain" | "travelbuddy" | "finanzbuddy";

export const ADMIN_NAV_STORAGE_KEY = "buddyapp-admin-nav-mode";
export const ADMIN_NAV_EXITED_HOME_KEY = "buddyapp-admin-nav-exited-home";

const MYBRAIN_PREFIXES = [
  "/dashboard",
  "/calendar",
  "/mail",
  "/microsoft",
  "/account",
  "/inbox",
  "/documents",
  "/warranties",
  "/deadlines",
  "/finance",
  "/travel",
  "/knowledge",
  "/guides",
  "/chat",
  "/settings",
  "/sync",
] as const;

export function isMyBrainPath(pathname: string): boolean {
  return MYBRAIN_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

/** Infer section from URL; null if path does not map to a Buddy area. */
export function inferAdminNavMode(pathname: string): AdminNavMode | null {
  if (pathname === "/trips" || pathname.startsWith("/trips/")) {
    return "travelbuddy";
  }
  if (
    pathname === "/finance-brain" ||
    pathname.startsWith("/finance-brain/")
  ) {
    return "finanzbuddy";
  }
  if (isMyBrainPath(pathname)) {
    return "mybrain";
  }
  return null;
}

export function readStoredAdminNavMode(): AdminNavMode | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(ADMIN_NAV_STORAGE_KEY);
  if (
    raw === "home" ||
    raw === "mybrain" ||
    raw === "travelbuddy" ||
    raw === "finanzbuddy"
  ) {
    return raw;
  }
  return null;
}

export function readHasExitedHome(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(ADMIN_NAV_EXITED_HOME_KEY) === "1";
}

export function persistAdminNav(mode: AdminNavMode, exitedHome: boolean) {
  if (typeof window === "undefined") return;
  localStorage.setItem(ADMIN_NAV_STORAGE_KEY, mode);
  localStorage.setItem(ADMIN_NAV_EXITED_HOME_KEY, exitedHome ? "1" : "0");
}
