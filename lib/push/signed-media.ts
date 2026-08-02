import { createHmac, timingSafeEqual } from "node:crypto";
import { getAuthConfiguration } from "@/lib/auth/config";
import { absoluteAppUrl } from "@/lib/app-url";

const DEFAULT_TTL_SEC = 60 * 60 * 48; // 48h — covers typical push TTL

function signingSecret(): string {
  try {
    return getAuthConfiguration().sessionSecret;
  } catch {
    return process.env.FAMILYBRAIN_SESSION_SECRET?.trim() || "";
  }
}

function sign(path: string, exp: number): string {
  const secret = signingSecret();
  if (!secret) return "";
  return createHmac("sha256", secret)
    .update(`${path}\n${exp}`)
    .digest("base64url");
}

/** Relative app path only, e.g. `/api/documents/media/ai-icon/foo.jpg`. */
export function isPushMediaPathAllowed(pathname: string): boolean {
  if (!pathname.startsWith("/") || pathname.includes("..")) return false;
  return (
    pathname.startsWith("/api/documents/media/ai-icon/") ||
    pathname.startsWith("/api/trips/media/ai/") ||
    pathname.startsWith("/api/trips/media/cover/") ||
    pathname.startsWith("/api/finance-ledgers/media/ai/")
  );
}

/**
 * Build a short-lived absolute URL the OS/browser can fetch without a session
 * (required for Web Push notification icon/image).
 */
export function absolutePushMediaUrl(
  relativePath: string | null | undefined,
  ttlSec = DEFAULT_TTL_SEC
): string | null {
  const path = relativePath?.trim() || "";
  if (!path.startsWith("/") || !isPushMediaPathAllowed(path)) return null;
  const exp = Math.floor(Date.now() / 1000) + Math.max(60, ttlSec);
  const sig = sign(path, exp);
  if (!sig) return null;
  const qs = new URLSearchParams({
    p: path,
    e: String(exp),
    s: sig,
  });
  return absoluteAppUrl(`/api/push/media?${qs.toString()}`);
}

export function verifyPushMediaQuery(input: {
  path: string | null;
  exp: string | null;
  sig: string | null;
}): { ok: true; path: string } | { ok: false; error: string } {
  const path = input.path?.trim() || "";
  if (!isPushMediaPathAllowed(path)) {
    return { ok: false, error: "Pfad nicht erlaubt" };
  }
  const exp = Number(input.exp);
  if (!Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) {
    return { ok: false, error: "Abgelaufen" };
  }
  const expected = sign(path, exp);
  const given = input.sig?.trim() || "";
  if (!expected || !given) {
    return { ok: false, error: "Signatur fehlt" };
  }
  try {
    const a = Buffer.from(expected);
    const b = Buffer.from(given);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      return { ok: false, error: "Signatur ungültig" };
    }
  } catch {
    return { ok: false, error: "Signatur ungültig" };
  }
  return { ok: true, path };
}
