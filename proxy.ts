import { NextRequest, NextResponse } from "next/server";
import {
  getAuthConfiguration,
  SESSION_COOKIE_NAME,
} from "@/lib/auth/config";
import { verifySessionToken } from "@/lib/auth/session";
import { getAppUserById } from "@/lib/users/queries";

const PUBLIC_PATHS = new Set([
  "/login",
  "/api/auth/login",
  "/api/auth/logout",
  "/api/finance-ledgers/exchange-rate",
  "/api/paperless/webhook",
  "/manifest.webmanifest",
  "/favicon.ico",
  "/apple-touch-icon.png",
  "/icon-192.png",
  "/icon-512.png",
  "/icon-maskable-512.png",
  "/buddy-logo.png",
]);

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function isPublicPath(pathname: string): boolean {
  if (PUBLIC_PATHS.has(pathname)) return true;
  if (pathname.startsWith("/share/t/")) return true;
  if (pathname.startsWith("/api/share/t/")) return true;
  if (pathname.startsWith("/share/f/")) return true;
  if (pathname.startsWith("/api/share/f/")) return true;
  return false;
}

function isLimitedUserAllowedPath(pathname: string): boolean {
  if (pathname === "/api/auth/me" || pathname === "/api/auth/logout") {
    return true;
  }
  if (pathname.startsWith("/api/push/")) return true;
  if (pathname === "/api/me/notification-prefs") return true;
  if (pathname === "/trips" || pathname.startsWith("/trips/")) return true;
  if (pathname === "/finance-brain" || pathname.startsWith("/finance-brain/")) {
    return true;
  }
  if (pathname === "/api/trips" || pathname.startsWith("/api/trips/")) {
    return true;
  }
  if (pathname === "/api/home/agenda") {
    return true;
  }
  if (pathname.startsWith("/api/users/media/avatar/")) {
    return true;
  }
  if (pathname.startsWith("/api/family/media/avatar/")) {
    return true;
  }
  if (
    pathname === "/api/finance-ledgers" ||
    pathname.startsWith("/api/finance-ledgers/")
  ) {
    return true;
  }
  // Trip/finance PDF thumbs + viewers (route still checks trip/ledger access).
  if (
    pathname.startsWith("/api/paperless/documents/") &&
    pathname.endsWith("/file")
  ) {
    return true;
  }
  return false;
}

function normalizeHost(host: string): string {
  const h = host.trim().toLowerCase();
  // Drop default ports so https://x and https://x:443 match.
  if (h.endsWith(":443") || h.endsWith(":80")) {
    return h.replace(/:(443|80)$/, "");
  }
  return h;
}

function expectedRequestHost(request: NextRequest): string {
  const forwardedHost = request.headers.get("x-forwarded-host");
  return normalizeHost(
    forwardedHost?.split(",")[0]?.trim() ||
      request.headers.get("host") ||
      request.nextUrl.host
  );
}

function hasValidOrigin(request: NextRequest): boolean {
  if (SAFE_METHODS.has(request.method)) return true;
  const expectedHost = expectedRequestHost(request);

  const origin = request.headers.get("origin");
  if (origin) {
    try {
      return normalizeHost(new URL(origin).host) === expectedHost;
    } catch {
      return false;
    }
  }

  // Some desktop browsers omit Origin on same-origin fetch POST.
  const referer = request.headers.get("referer");
  if (referer) {
    try {
      return normalizeHost(new URL(referer).host) === expectedHost;
    } catch {
      return false;
    }
  }

  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite === "same-origin" || fetchSite === "same-site") {
    return true;
  }

  return false;
}

function requestOrigin(request: NextRequest): string {
  const forwardedHost = request.headers.get("x-forwarded-host");
  const host =
    forwardedHost?.split(",")[0]?.trim() ||
    request.headers.get("host") ||
    request.nextUrl.host;
  const forwardedProto = request.headers
    .get("x-forwarded-proto")
    ?.split(",")[0]
    ?.trim();
  const proto =
    forwardedProto ||
    (request.nextUrl.protocol === "https:" ? "https" : "http");
  return `${proto}://${host}`;
}

function isLimitedAppUser(session: {
  kind: string;
  userId?: number;
}): boolean {
  if (session.kind !== "user") return false;
  if (!session.userId) return true;
  const user = getAppUserById(session.userId);
  return !user?.active || !user.is_admin;
}

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const origin = requestOrigin(request);

  // CSRF check only for authenticated browser APIs — not for public
  // server-to-server endpoints (e.g. Paperless webhook has no Origin).
  if (
    pathname.startsWith("/api/") &&
    !isPublicPath(pathname) &&
    !hasValidOrigin(request)
  ) {
    return NextResponse.json(
      { error: "Ungültige Request-Herkunft." },
      { status: 403 }
    );
  }

  if (isPublicPath(pathname) && pathname !== "/login") {
    // Trip share APIs are read-only; finance member share allows POST.
    if (
      pathname.startsWith("/api/share/t/") &&
      !SAFE_METHODS.has(request.method)
    ) {
      return NextResponse.json({ error: "Methode nicht erlaubt." }, { status: 405 });
    }
    return NextResponse.next();
  }

  const auth = getAuthConfiguration();
  let session = null;
  try {
    session = auth.configured
      ? await verifySessionToken(
          request.cookies.get(SESSION_COOKIE_NAME)?.value,
          auth.sessionSecret
        )
      : null;
  } catch (error) {
    console.error("[familybrain] Session verification failed:", error);
  }

  // Legacy admin cookies without kind must still match env username.
  if (
    session?.kind === "admin" &&
    session.username !== auth.username
  ) {
    session = null;
  }

  if (session) {
    if (pathname === "/login") {
      let home = "/dashboard";
      if (session.kind === "user" && session.userId) {
        const user = getAppUserById(session.userId);
        home = user?.is_admin ? "/dashboard" : "/trips";
      }
      return NextResponse.redirect(new URL(home, origin));
    }
    if (isLimitedAppUser(session) && !isLimitedUserAllowedPath(pathname)) {
      if (pathname.startsWith("/api/")) {
        return NextResponse.json(
          { error: "Keine Berechtigung." },
          { status: 403 }
        );
      }
      return NextResponse.redirect(new URL("/trips", origin));
    }
    return NextResponse.next();
  }

  if (pathname === "/login") {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/")) {
    return NextResponse.json(
      {
        error: auth.configured
          ? "Anmeldung erforderlich."
          : "Die Server-Anmeldung ist nicht konfiguriert.",
      },
      { status: 401 }
    );
  }

  const loginUrl = new URL("/login", origin);
  const next = `${pathname}${search}`;
  if (next !== "/") loginUrl.searchParams.set("next", next);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|robots.txt|sitemap.xml|.*\\.(?:svg|webp|jpg|jpeg|gif)$).*)",
  ],
};
