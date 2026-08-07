import { google } from "googleapis";
import { getSetting, setSetting } from "@/lib/db/migrations";
import { absoluteAppUrl } from "@/lib/app-url";
import type { AuthContext } from "@/lib/auth/current-user";
import { resolveCalendarUserId } from "@/lib/calendar/ics-calendars";

export const GOOGLE_OAUTH_CLIENT_ID_SETTING = "google_oauth_client_id";
export const GOOGLE_OAUTH_CLIENT_SECRET_SETTING = "google_oauth_client_secret";

export const GOOGLE_OAUTH_SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/calendar.readonly",
  /** Needed to write Ambri results back into owned Google events */
  "https://www.googleapis.com/auth/calendar.events",
  /** Google Tasks — lesen + anlegen aus Mail-Vorschlägen */
  "https://www.googleapis.com/auth/tasks",
] as const;

export const GOOGLE_OAUTH_CALLBACK_PATH = "/api/google/oauth/callback";

export type GoogleUserTokens = {
  refreshToken: string;
  accessToken?: string | null;
  expiryDate?: number | null;
  email?: string | null;
  scope?: string | null;
  updatedAt: string;
};

function tokensSettingKey(userId: number): string {
  return `google_oauth_tokens_u${userId}`;
}

function stateSettingKey(userId: number): string {
  return `google_oauth_state_u${userId}`;
}

export function getGoogleOauthClientId(): string | null {
  const stored = getSetting(GOOGLE_OAUTH_CLIENT_ID_SETTING)?.trim();
  if (stored) return stored;
  return process.env.GOOGLE_OAUTH_CLIENT_ID?.trim() || null;
}

export function getGoogleOauthClientSecret(): string | null {
  const stored = getSetting(GOOGLE_OAUTH_CLIENT_SECRET_SETTING)?.trim();
  if (stored) return stored;
  return process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim() || null;
}

export function saveGoogleOauthClientId(value: string | null): void {
  setSetting(GOOGLE_OAUTH_CLIENT_ID_SETTING, value?.trim() || null);
}

export function saveGoogleOauthClientSecret(value: string | null): void {
  setSetting(GOOGLE_OAUTH_CLIENT_SECRET_SETTING, value?.trim() || null);
}

export function isGoogleOauthConfigured(): boolean {
  return Boolean(getGoogleOauthClientId() && getGoogleOauthClientSecret());
}

export function getGoogleOauthRedirectUri(request?: Request | null): string {
  return absoluteAppUrl(GOOGLE_OAUTH_CALLBACK_PATH, request);
}

export function createOAuth2Client(request?: Request | null) {
  const clientId = getGoogleOauthClientId();
  const clientSecret = getGoogleOauthClientSecret();
  if (!clientId || !clientSecret) {
    throw new Error(
      "Google OAuth nicht konfiguriert (Client-ID und Secret in den Einstellungen)."
    );
  }
  return new google.auth.OAuth2(
    clientId,
    clientSecret,
    getGoogleOauthRedirectUri(request)
  );
}

export function readGoogleUserTokens(
  userId: number
): GoogleUserTokens | null {
  const raw = getSetting(tokensSettingKey(userId));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as GoogleUserTokens;
    if (!parsed?.refreshToken) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveGoogleUserTokens(
  userId: number,
  tokens: GoogleUserTokens | null
): void {
  if (!tokens?.refreshToken) {
    setSetting(tokensSettingKey(userId), null);
    return;
  }
  setSetting(
    tokensSettingKey(userId),
    JSON.stringify({
      ...tokens,
      updatedAt: new Date().toISOString(),
    } satisfies GoogleUserTokens)
  );
}

export function clearGoogleUserTokens(userId: number): void {
  saveGoogleUserTokens(userId, null);
}

export function isGoogleMailConnected(userId: number | null): boolean {
  if (userId == null) return false;
  return Boolean(readGoogleUserTokens(userId)?.refreshToken);
}

/** True if stored token scopes include Calendar read. */
export function hasGoogleCalendarScope(userId: number | null): boolean {
  if (userId == null) return false;
  const scope = readGoogleUserTokens(userId)?.scope || "";
  return (
    scope.includes("https://www.googleapis.com/auth/calendar.readonly") ||
    scope.includes("https://www.googleapis.com/auth/calendar") ||
    scope.includes("https://www.googleapis.com/auth/calendar.events")
  );
}

/** True if Buddy may patch event title/description (Resultat zurückschreiben). */
export function hasGoogleCalendarEventsWriteScope(
  userId: number | null
): boolean {
  if (userId == null) return false;
  const scope = readGoogleUserTokens(userId)?.scope || "";
  return (
    scope.includes("https://www.googleapis.com/auth/calendar.events") ||
    scope.includes("https://www.googleapis.com/auth/calendar")
  );
}

/** True if Buddy may read/write Google Tasks (full scope, not readonly). */
export function hasGoogleTasksScope(userId: number | null): boolean {
  if (userId == null) return false;
  const scopes = (readGoogleUserTokens(userId)?.scope || "")
    .split(/[\s,]+/)
    .filter(Boolean);
  return scopes.includes("https://www.googleapis.com/auth/tasks");
}

export function getConnectedGoogleEmail(
  userId: number | null
): string | null {
  if (userId == null) return null;
  return readGoogleUserTokens(userId)?.email?.trim() || null;
}

export function resolveGoogleUserId(
  auth: Pick<AuthContext, "userId" | "username" | "isAdmin">
): number | null {
  return resolveCalendarUserId(auth);
}

/** Create authorization URL + store CSRF state for this user. */
export function beginGoogleOauth(
  userId: number,
  request?: Request | null
): string {
  const client = createOAuth2Client(request);
  const nonce = `${Date.now().toString(36)}.${Math.random().toString(36).slice(2, 12)}`;
  setSetting(
    stateSettingKey(userId),
    JSON.stringify({ nonce, at: new Date().toISOString() })
  );
  const state = Buffer.from(
    JSON.stringify({ u: userId, n: nonce }),
    "utf8"
  ).toString("base64url");

  return client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: [...GOOGLE_OAUTH_SCOPES],
    include_granted_scopes: true,
    state,
  });
}

export function parseOauthState(
  stateRaw: string | null
): { userId: number; nonce: string } | null {
  if (!stateRaw) return null;
  try {
    const json = Buffer.from(stateRaw, "base64url").toString("utf8");
    const parsed = JSON.parse(json) as { u?: number; n?: string };
    if (!parsed.u || !parsed.n) return null;
    return { userId: Number(parsed.u), nonce: parsed.n };
  } catch {
    return null;
  }
}

export function consumeOauthState(
  userId: number,
  nonce: string
): boolean {
  const raw = getSetting(stateSettingKey(userId));
  setSetting(stateSettingKey(userId), null);
  if (!raw) return false;
  try {
    const parsed = JSON.parse(raw) as { nonce?: string; at?: string };
    if (parsed.nonce !== nonce) return false;
    if (parsed.at) {
      const age = Date.now() - new Date(parsed.at).getTime();
      if (age > 15 * 60 * 1000) return false;
    }
    return true;
  } catch {
    return false;
  }
}

export async function finishGoogleOauth(
  userId: number,
  code: string,
  request?: Request | null
): Promise<GoogleUserTokens> {
  const client = createOAuth2Client(request);
  const { tokens } = await client.getToken(code);
  if (!tokens.refresh_token) {
    const existing = readGoogleUserTokens(userId);
    if (!existing?.refreshToken) {
      throw new Error(
        "Kein Refresh-Token erhalten. Bitte in Google die App-Berechtigung widerrufen und erneut verbinden (consent)."
      );
    }
  }
  client.setCredentials(tokens);
  let email: string | null = null;
  try {
    const oauth2 = google.oauth2({ version: "v2", auth: client });
    const me = await oauth2.userinfo.get();
    email = me.data.email || null;
  } catch {
    email = null;
  }

  const refreshToken =
    tokens.refresh_token || readGoogleUserTokens(userId)?.refreshToken || "";
  if (!refreshToken) {
    throw new Error("Refresh-Token fehlt.");
  }

  const saved: GoogleUserTokens = {
    refreshToken,
    accessToken: tokens.access_token || null,
    expiryDate: tokens.expiry_date || null,
    email,
    scope: tokens.scope || GOOGLE_OAUTH_SCOPES.join(" "),
    updatedAt: new Date().toISOString(),
  };
  saveGoogleUserTokens(userId, saved);
  return saved;
}

/** Authenticated OAuth2 client for a user (refreshes access token as needed). */
export async function getAuthedGoogleClient(
  userId: number,
  request?: Request | null
) {
  const stored = readGoogleUserTokens(userId);
  if (!stored?.refreshToken) {
    throw new Error("Google-Konto nicht verbunden.");
  }
  const client = createOAuth2Client(request);
  client.setCredentials({
    refresh_token: stored.refreshToken,
    access_token: stored.accessToken || undefined,
    expiry_date: stored.expiryDate || undefined,
  });

  client.on("tokens", (tokens) => {
    const next: GoogleUserTokens = {
      ...stored,
      accessToken: tokens.access_token || stored.accessToken,
      expiryDate: tokens.expiry_date ?? stored.expiryDate,
      refreshToken: tokens.refresh_token || stored.refreshToken,
      updatedAt: new Date().toISOString(),
    };
    saveGoogleUserTokens(userId, next);
  });

  // Force refresh if expired / missing access token
  if (
    !stored.accessToken ||
    (stored.expiryDate != null && stored.expiryDate < Date.now() + 60_000)
  ) {
    const { credentials } = await client.refreshAccessToken();
    client.setCredentials(credentials);
    saveGoogleUserTokens(userId, {
      ...stored,
      accessToken: credentials.access_token || stored.accessToken,
      expiryDate: credentials.expiry_date ?? stored.expiryDate,
      refreshToken: credentials.refresh_token || stored.refreshToken,
      updatedAt: new Date().toISOString(),
    });
  }

  return client;
}
