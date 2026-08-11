import { getMariConfig, type MariConfig } from "@/lib/mari/config";

type TokenCache = {
  accessToken: string;
  expiresAt: number;
};

/** Per MARI username — colleagues must not share the admin token. */
const tokenCaches = new Map<string, TokenCache>();
/** Single-flight logins per cache key (avoids stampede after expiry / 500). */
const tokenInflight = new Map<string, Promise<TokenCache>>();

export class MariApiError extends Error {
  status: number;
  body: unknown;

  constructor(message: string, status: number, body?: unknown) {
    super(message);
    this.name = "MariApiError";
    this.status = status;
    this.body = body;
  }
}

/**
 * MARI often returns opaque HTTP 500 ("An error has occurred.") for dead
 * sessions instead of 401. Treat those as refreshable once.
 */
export function mariStatusSuggestsStaleAuth(status: number): boolean {
  return (
    status === 401 ||
    status === 403 ||
    status === 500 ||
    status === 502 ||
    status === 503
  );
}

async function fetchToken(cfg: MariConfig): Promise<TokenCache> {
  const body = new URLSearchParams({
    username: cfg.username,
    password: cfg.password,
    grant_type: "password",
  });
  const res = await fetch(`${cfg.baseUrl}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
  });
  const json = (await res.json().catch(() => null)) as {
    access_token?: string;
    expires_in?: number;
    error?: string;
    error_description?: string;
  } | null;
  if (!res.ok || !json?.access_token) {
    throw new MariApiError(
      json?.error_description || json?.error || "MARI Login fehlgeschlagen",
      res.status,
      json
    );
  }
  const expiresIn = Number(json.expires_in) || 3600;
  // Refresh early — MARI sessions can die before advertised expiry.
  const skewSec = Math.max(120, Math.floor(expiresIn * 0.15));
  return {
    accessToken: json.access_token,
    expiresAt: Date.now() + Math.max(30, expiresIn - skewSec) * 1000,
  };
}

function cacheKey(cfg: MariConfig): string {
  return `${cfg.baseUrl}::${cfg.username}`;
}

async function getAccessToken(
  cfg: MariConfig,
  opts?: { force?: boolean }
): Promise<string> {
  const key = cacheKey(cfg);
  if (!opts?.force) {
    const cached = tokenCaches.get(key);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.accessToken;
    }
  } else {
    tokenCaches.delete(key);
  }

  let inflight = tokenInflight.get(key);
  if (!inflight || opts?.force) {
    // Force: abandon joining a pre-existing login that may still write a stale token.
    const login = fetchToken(cfg)
      .then((next) => {
        tokenCaches.set(key, next);
        return next;
      })
      .finally(() => {
        if (tokenInflight.get(key) === login) {
          tokenInflight.delete(key);
        }
      });
    tokenInflight.set(key, login);
    inflight = login;
  }

  const next = await inflight;
  return next.accessToken;
}

/** Call after credentials change in Einstellungen / User-Admin. */
export function clearMariTokenCache(username?: string | null): void {
  if (!username?.trim()) {
    tokenCaches.clear();
    tokenInflight.clear();
    return;
  }
  const needle = username.trim().toLowerCase();
  for (const key of [...tokenCaches.keys()]) {
    if (key.toLowerCase().endsWith(`::${needle}`)) {
      tokenCaches.delete(key);
    }
  }
  for (const key of [...tokenInflight.keys()]) {
    if (key.toLowerCase().endsWith(`::${needle}`)) {
      tokenInflight.delete(key);
    }
  }
}

export function requireMariConfig(): MariConfig {
  const cfg = getMariConfig();
  if (!cfg) {
    throw new MariApiError(
      "MARI nicht konfiguriert. Unter Einstellungen → Maringo oder beim User Benutzer, Passwort und Personalnummer hinterlegen.",
      503
    );
  }
  return cfg;
}

export async function mariFetch(
  path: string,
  init: RequestInit = {},
  retried = false
): Promise<Response> {
  const cfg = requireMariConfig();
  const token = await getAccessToken(cfg, { force: retried });
  const url = path.startsWith("http") ? path : `${cfg.baseUrl}${path}`;
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  if (!headers.has("Accept")) headers.set("Accept", "application/json");

  let res: Response;
  try {
    res = await fetch(url, { ...init, headers, cache: "no-store" });
  } catch (err) {
    // Transient network blip after idle — one re-login + retry.
    if (!retried) {
      clearMariTokenCache(cfg.username);
      return mariFetch(path, init, true);
    }
    throw err;
  }

  if (!retried && mariStatusSuggestsStaleAuth(res.status)) {
    // Consume body so the socket can be reused; ignore content.
    await res.text().catch(() => "");
    clearMariTokenCache(cfg.username);
    return mariFetch(path, init, true);
  }
  return res;
}

export async function mariJson<T>(
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const res = await mariFetch(path, init);
  const text = await res.text();
  let json: unknown = null;
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      json = text;
    }
  }
  if (!res.ok) {
    const rawMsg =
      typeof json === "object" &&
      json &&
      "Message" in json &&
      typeof (json as { Message: unknown }).Message === "string"
        ? String((json as { Message: string }).Message).trim()
        : typeof json === "string"
          ? json.trim()
          : "";
    const generic =
      !rawMsg ||
      /^an error has occurred\.?$/i.test(rawMsg) ||
      /^error$/i.test(rawMsg);
    throw new MariApiError(
      generic ? `MARI HTTP ${res.status}` : rawMsg,
      res.status,
      json
    );
  }
  // Manche MARI-DELETEs liefern 200 ohne Body.
  return (json ?? null) as T;
}

/** Nur SELECT — HANA quoted identifiers. */
export async function mariSql<T extends Record<string, unknown>>(
  sql: string
): Promise<T[]> {
  if (!/^\s*SELECT\b/i.test(sql) || /;/.test(sql)) {
    throw new MariApiError("Nur ein SELECT ohne Semikolon erlaubt.", 400);
  }
  const rows = await mariJson<T[] | { Message?: string }>(
    "/api/SystemToolsReadDataFromDB",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ SQL: sql }),
    }
  );
  if (!Array.isArray(rows)) {
    throw new MariApiError(
      (rows as { Message?: string })?.Message || "SQL-Antwort ungültig",
      502,
      rows
    );
  }
  if (
    rows.length === 1 &&
    rows[0] &&
    typeof rows[0] === "object" &&
    "Message" in rows[0] &&
    typeof (rows[0] as unknown as { Message: unknown }).Message === "string"
  ) {
    throw new MariApiError(
      String((rows[0] as unknown as { Message: string }).Message),
      502,
      rows[0]
    );
  }
  return rows;
}

export type MariPatchResult = {
  IMPORT_Feedback?: number;
  IMPORT_ErrorMessage?: string | null;
  IssueID?: number;
};

export async function mariPatchIssue(
  issueId: number,
  body: Record<string, unknown>
): Promise<MariPatchResult> {
  return mariJson<MariPatchResult>(`/api/SupportIssue/${issueId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function mariGetIssue(
  issueId: number
): Promise<Record<string, unknown>> {
  return mariJson<Record<string, unknown>>(`/api/SupportIssue/${issueId}`);
}
