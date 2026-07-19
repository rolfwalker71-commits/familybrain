import { NextRequest, NextResponse } from "next/server";
import {
  getAuthConfiguration,
  SESSION_COOKIE_NAME,
} from "@/lib/auth/config";
import { verifySessionToken } from "@/lib/auth/session";

const PUBLIC_PATHS = new Set([
  "/login",
  "/api/auth/login",
  "/api/auth/logout",
  "/manifest.webmanifest",
  "/favicon.ico",
  "/apple-touch-icon.png",
  "/icon-192.png",
  "/icon-512.png",
  "/icon-maskable-512.png",
]);

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.has(pathname);
}

function hasValidOrigin(request: NextRequest): boolean {
  if (SAFE_METHODS.has(request.method)) return true;
  const origin = request.headers.get("origin");
  if (!origin) return false;

  try {
    const originUrl = new URL(origin);
    const forwardedHost = request.headers.get("x-forwarded-host");
    const expectedHost =
      forwardedHost?.split(",")[0]?.trim() ||
      request.headers.get("host") ||
      request.nextUrl.host;
    return originUrl.host === expectedHost;
  } catch {
    return false;
  }
}

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (pathname.startsWith("/api/") && !hasValidOrigin(request)) {
    return NextResponse.json(
      { error: "Ungültige Request-Herkunft." },
      { status: 403 }
    );
  }

  if (isPublicPath(pathname) && pathname !== "/login") {
    return NextResponse.next();
  }

  const auth = getAuthConfiguration();
  const session = auth.configured
    ? await verifySessionToken(
        request.cookies.get(SESSION_COOKIE_NAME)?.value,
        auth.sessionSecret,
        auth.username
      )
    : null;

  if (session) {
    if (pathname === "/login") {
      return NextResponse.redirect(new URL("/dashboard", request.url));
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

  const loginUrl = new URL("/login", request.url);
  const next = `${pathname}${search}`;
  if (next !== "/") loginUrl.searchParams.set("next", next);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|robots.txt|sitemap.xml|.*\\.(?:svg|webp|jpg|jpeg|gif)$).*)",
  ],
};
