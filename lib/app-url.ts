import { getSetting } from "@/lib/db/migrations";

const APP_PUBLIC_URL_KEY = "app_public_url";

/** Settings DB first, then env (Docker/production), then callers use request host. */
export function getAppPublicUrlSetting(): string | null {
  const raw = getSetting(APP_PUBLIC_URL_KEY)?.trim() || null;
  if (raw) {
    try {
      const url = new URL(raw);
      if (url.protocol === "http:" || url.protocol === "https:") {
        return `${url.protocol}//${url.host}`;
      }
    } catch {
      /* ignore */
    }
  }
  const fromEnv =
    process.env.APP_PUBLIC_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    null;
  if (!fromEnv) return null;
  try {
    const url = new URL(fromEnv);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return `${url.protocol}//${url.host}`;
  } catch {
    return null;
  }
}

export function normalizeAppPublicUrl(raw: string | null | undefined): string | null {
  const trimmed = raw?.trim() || "";
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new Error("Ungültige URL");
    }
    return `${url.protocol}//${url.host}`;
  } catch {
    throw new Error("Öffentliche App-URL muss http(s)://… sein");
  }
}

function requestOriginFromHeaders(request?: Request | null): string | null {
  if (!request) return null;
  const forwardedHost = request.headers.get("x-forwarded-host");
  const host =
    forwardedHost?.split(",")[0]?.trim() ||
    request.headers.get("host");
  if (!host) {
    try {
      return new URL(request.url).origin;
    } catch {
      return null;
    }
  }
  const forwardedProto = request.headers
    .get("x-forwarded-proto")
    ?.split(",")[0]
    ?.trim();
  let proto = forwardedProto;
  if (!proto) {
    try {
      proto = new URL(request.url).protocol.replace(":", "") || "http";
    } catch {
      proto = "http";
    }
  }
  return `${proto}://${host}`;
}

/** Prefer settings URL, then forwarded host, then request.url.origin. */
export function getAppPublicOrigin(request?: Request | null): string {
  const fromSettings = getAppPublicUrlSetting();
  if (fromSettings) return fromSettings;
  const fromRequest = requestOriginFromHeaders(request);
  if (fromRequest) return fromRequest;
  return "http://localhost:3100";
}

/**
 * OAuth redirect URIs: prefer the browser-facing HTTPS host when it differs
 * from a stale app_public_url (e.g. old tripbook domain vs buddyapp).
 * Falls back to getAppPublicOrigin for local / non-HTTPS requests.
 */
export function getOauthRedirectOrigin(request?: Request | null): string {
  const fromRequest = requestOriginFromHeaders(request);
  const fromSettings = getAppPublicUrlSetting();
  if (
    fromRequest &&
    /^https:\/\//i.test(fromRequest) &&
    !/localhost|127\.0\.0\.1/i.test(fromRequest)
  ) {
    try {
      const reqHost = new URL(fromRequest).host.toLowerCase();
      const setHost = fromSettings
        ? new URL(fromSettings).host.toLowerCase()
        : null;
      if (!setHost || setHost !== reqHost) {
        return fromRequest.replace(/\/+$/, "");
      }
    } catch {
      /* use absoluteAppUrl path below */
    }
  }
  return getAppPublicOrigin(request).replace(/\/+$/, "");
}

export function absoluteAppUrl(
  path: string,
  request?: Request | null
): string {
  const origin = getAppPublicOrigin(request).replace(/\/+$/, "");
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${origin}${normalized}`;
}

/** Like absoluteAppUrl but host-aware for OAuth callbacks. */
export function absoluteOauthRedirectUrl(
  path: string,
  request?: Request | null
): string {
  const origin = getOauthRedirectOrigin(request);
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${origin}${normalized}`;
}

export { APP_PUBLIC_URL_KEY };
