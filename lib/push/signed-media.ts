import { createHmac, timingSafeEqual } from "node:crypto";
import { getAuthConfiguration } from "@/lib/auth/config";

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

function b64urlEncode(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

function b64urlDecode(value: string): string | null {
  try {
    return Buffer.from(value, "base64url").toString("utf8");
  } catch {
    return null;
  }
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
 * Relative signed media path for Web Push.
 * Resolved against the SW/PWA install origin on the device (Android-safe).
 * Path form avoids query-string stripping in some Android stacks:
 * `/api/push/media/t/<exp>/<sig>/<base64url(path)>`
 */
export function signedPushMediaPath(
  relativePath: string | null | undefined,
  ttlSec = DEFAULT_TTL_SEC
): string | null {
  const mediaPath = relativePath?.trim() || "";
  if (!mediaPath.startsWith("/") || !isPushMediaPathAllowed(mediaPath)) {
    return null;
  }
  const exp = Math.floor(Date.now() / 1000) + Math.max(60, ttlSec);
  const sig = sign(mediaPath, exp);
  if (!sig) return null;
  return `/api/push/media/t/${exp}/${sig}/${b64urlEncode(mediaPath)}`;
}

/** @deprecated use signedPushMediaPath — kept for older callers */
export function absolutePushMediaUrl(
  relativePath: string | null | undefined,
  ttlSec = DEFAULT_TTL_SEC
): string | null {
  return signedPushMediaPath(relativePath, ttlSec);
}

function verifySignedPath(
  mediaPath: string,
  expRaw: string | null,
  sigRaw: string | null
): { ok: true; path: string } | { ok: false; error: string } {
  if (!isPushMediaPathAllowed(mediaPath)) {
    return { ok: false, error: "Pfad nicht erlaubt" };
  }
  const exp = Number(expRaw);
  if (!Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) {
    return { ok: false, error: "Abgelaufen" };
  }
  const expected = sign(mediaPath, exp);
  const given = sigRaw?.trim() || "";
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
  return { ok: true, path: mediaPath };
}

export function verifyPushMediaToken(input: {
  pathEncoded: string | null;
  exp: string | null;
  sig: string | null;
}): { ok: true; path: string } | { ok: false; error: string } {
  const mediaPath = b64urlDecode(input.pathEncoded?.trim() || "");
  if (!mediaPath) return { ok: false, error: "Pfad nicht erlaubt" };
  return verifySignedPath(mediaPath, input.exp, input.sig);
}

/** Legacy query-string verifier (`p` = raw path). */
export function verifyPushMediaQuery(input: {
  path: string | null;
  exp: string | null;
  sig: string | null;
}): { ok: true; path: string } | { ok: false; error: string } {
  return verifySignedPath(input.path?.trim() || "", input.exp, input.sig);
}
