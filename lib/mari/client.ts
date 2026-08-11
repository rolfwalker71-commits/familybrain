import { getMariConfig, type MariConfig } from "@/lib/mari/config";

type TokenCache = {
  accessToken: string;
  expiresAt: number;
};

/** Per MARI username — colleagues must not share the admin token. */
const tokenCaches = new Map<string, TokenCache>();

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
  return {
    accessToken: json.access_token,
    expiresAt: Date.now() + Math.max(30, expiresIn - 60) * 1000,
  };
}

function cacheKey(cfg: MariConfig): string {
  return `${cfg.baseUrl}::${cfg.username}`;
}

async function getAccessToken(cfg: MariConfig): Promise<string> {
  const key = cacheKey(cfg);
  const cached = tokenCaches.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.accessToken;
  }
  const next = await fetchToken(cfg);
  tokenCaches.set(key, next);
  return next.accessToken;
}

/** Call after credentials change in Einstellungen / User-Admin. */
export function clearMariTokenCache(username?: string | null): void {
  if (!username?.trim()) {
    tokenCaches.clear();
    return;
  }
  const needle = username.trim().toLowerCase();
  for (const key of tokenCaches.keys()) {
    if (key.toLowerCase().endsWith(`::${needle}`)) {
      tokenCaches.delete(key);
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
  init: RequestInit = {}
): Promise<Response> {
  const cfg = requireMariConfig();
  const token = await getAccessToken(cfg);
  const url = path.startsWith("http") ? path : `${cfg.baseUrl}${path}`;
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  if (!headers.has("Accept")) headers.set("Accept", "application/json");
  return fetch(url, { ...init, headers, cache: "no-store" });
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
