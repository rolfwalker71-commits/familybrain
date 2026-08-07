import { getSetting } from "@/lib/db/migrations";

const APP_PUBLIC_URL_KEY = "app_public_url";

export function getAppPublicUrlSetting(): string | null {
  const raw = getSetting(APP_PUBLIC_URL_KEY)?.trim() || null;
  if (!raw) return null;
  try {
    const url = new URL(raw);
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

export function absoluteAppUrl(
  path: string,
  request?: Request | null
): string {
  const origin = getAppPublicOrigin(request).replace(/\/+$/, "");
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${origin}${normalized}`;
}

export { APP_PUBLIC_URL_KEY };
