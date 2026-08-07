import { getSetting, setSetting } from "@/lib/db/migrations";
import { absoluteOauthRedirectUrl } from "@/lib/app-url";
import type { AuthContext } from "@/lib/auth/current-user";
import { resolveCalendarUserId } from "@/lib/calendar/ics-calendars";

export const MICROSOFT_OAUTH_CLIENT_ID_SETTING = "microsoft_oauth_client_id";
export const MICROSOFT_OAUTH_CLIENT_SECRET_SETTING =
  "microsoft_oauth_client_secret";
/** Entra tenant GUID, or "organizations" / "common". Default: organizations (Work/School). */
export const MICROSOFT_OAUTH_TENANT_SETTING = "microsoft_oauth_tenant";

export const MICROSOFT_OAUTH_CALLBACK_PATH = "/api/microsoft/oauth/callback";

/** Delegated Graph scopes — match Entra app registration. */
export const MICROSOFT_OAUTH_SCOPES = [
  "openid",
  "profile",
  "email",
  "offline_access",
  "User.Read",
  "Mail.ReadWrite",
  "Mail.Send",
  "Calendars.ReadWrite",
  "Tasks.ReadWrite",
  "Chat.ReadWrite",
  "ChatMessage.Send",
] as const;

export type MicrosoftUserTokens = {
  refreshToken: string;
  accessToken?: string | null;
  /** Unix ms */
  expiryDate?: number | null;
  email?: string | null;
  displayName?: string | null;
  scope?: string | null;
  updatedAt: string;
};

function tokensSettingKey(userId: number): string {
  return `microsoft_oauth_tokens_u${userId}`;
}

function stateSettingKey(userId: number): string {
  return `microsoft_oauth_state_u${userId}`;
}

export function getMicrosoftOauthClientId(): string | null {
  const stored = getSetting(MICROSOFT_OAUTH_CLIENT_ID_SETTING)?.trim();
  if (stored) return stored;
  return process.env.MICROSOFT_OAUTH_CLIENT_ID?.trim() || null;
}

export function getMicrosoftOauthClientSecret(): string | null {
  const stored = getSetting(MICROSOFT_OAUTH_CLIENT_SECRET_SETTING)?.trim();
  if (stored) return stored;
  return process.env.MICROSOFT_OAUTH_CLIENT_SECRET?.trim() || null;
}

export function getMicrosoftOauthTenant(): string {
  const stored = getSetting(MICROSOFT_OAUTH_TENANT_SETTING)?.trim();
  if (stored) return stored;
  return (
    process.env.MICROSOFT_OAUTH_TENANT?.trim() ||
    "organizations"
  );
}

export function saveMicrosoftOauthClientId(value: string | null): void {
  setSetting(MICROSOFT_OAUTH_CLIENT_ID_SETTING, value?.trim() || null);
}

export function saveMicrosoftOauthClientSecret(value: string | null): void {
  setSetting(MICROSOFT_OAUTH_CLIENT_SECRET_SETTING, value?.trim() || null);
}

export function saveMicrosoftOauthTenant(value: string | null): void {
  const v = value?.trim() || null;
  setSetting(MICROSOFT_OAUTH_TENANT_SETTING, v);
}

export function isMicrosoftOauthConfigured(): boolean {
  return Boolean(
    getMicrosoftOauthClientId() && getMicrosoftOauthClientSecret()
  );
}

export function getMicrosoftOauthRedirectUri(
  request?: Request | null
): string {
  return absoluteOauthRedirectUrl(MICROSOFT_OAUTH_CALLBACK_PATH, request);
}

function authorizeEndpoint(): string {
  return `https://login.microsoftonline.com/${encodeURIComponent(getMicrosoftOauthTenant())}/oauth2/v2.0/authorize`;
}

function tokenEndpoint(): string {
  return `https://login.microsoftonline.com/${encodeURIComponent(getMicrosoftOauthTenant())}/oauth2/v2.0/token`;
}

export function readMicrosoftUserTokens(
  userId: number
): MicrosoftUserTokens | null {
  const raw = getSetting(tokensSettingKey(userId));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as MicrosoftUserTokens;
    if (!parsed?.refreshToken) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveMicrosoftUserTokens(
  userId: number,
  tokens: MicrosoftUserTokens | null
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
    } satisfies MicrosoftUserTokens)
  );
}

export function clearMicrosoftUserTokens(userId: number): void {
  saveMicrosoftUserTokens(userId, null);
}

export function isMicrosoftConnected(userId: number | null): boolean {
  if (userId == null) return false;
  return Boolean(readMicrosoftUserTokens(userId)?.refreshToken);
}

function scopeSet(userId: number | null): Set<string> {
  if (userId == null) return new Set();
  const raw = readMicrosoftUserTokens(userId)?.scope || "";
  return new Set(raw.split(/[\s]+/).filter(Boolean));
}

export function hasMicrosoftMailScope(userId: number | null): boolean {
  const s = scopeSet(userId);
  return (
    s.has("Mail.ReadWrite") ||
    s.has("Mail.Read") ||
    s.has("https://graph.microsoft.com/Mail.ReadWrite") ||
    s.has("https://graph.microsoft.com/Mail.Read")
  );
}

export function hasMicrosoftMailSendScope(userId: number | null): boolean {
  const s = scopeSet(userId);
  return (
    s.has("Mail.Send") || s.has("https://graph.microsoft.com/Mail.Send")
  );
}

export function hasMicrosoftCalendarScope(userId: number | null): boolean {
  const s = scopeSet(userId);
  return (
    s.has("Calendars.ReadWrite") ||
    s.has("Calendars.Read") ||
    s.has("https://graph.microsoft.com/Calendars.ReadWrite") ||
    s.has("https://graph.microsoft.com/Calendars.Read")
  );
}

export function hasMicrosoftTasksScope(userId: number | null): boolean {
  const s = scopeSet(userId);
  return (
    s.has("Tasks.ReadWrite") ||
    s.has("Tasks.Read") ||
    s.has("https://graph.microsoft.com/Tasks.ReadWrite") ||
    s.has("https://graph.microsoft.com/Tasks.Read")
  );
}

export function hasMicrosoftTeamsChatScope(userId: number | null): boolean {
  const s = scopeSet(userId);
  return (
    s.has("ChatMessage.Send") ||
    s.has("Chat.ReadWrite") ||
    s.has("https://graph.microsoft.com/ChatMessage.Send") ||
    s.has("https://graph.microsoft.com/Chat.ReadWrite")
  );
}

export function getConnectedMicrosoftEmail(
  userId: number | null
): string | null {
  if (userId == null) return null;
  return readMicrosoftUserTokens(userId)?.email?.trim() || null;
}

export function getConnectedMicrosoftDisplayName(
  userId: number | null
): string | null {
  if (userId == null) return null;
  return readMicrosoftUserTokens(userId)?.displayName?.trim() || null;
}

export function resolveMicrosoftUserId(
  auth: Pick<AuthContext, "userId" | "username" | "isAdmin">
): number | null {
  return resolveCalendarUserId(auth);
}

export function beginMicrosoftOauth(
  userId: number,
  request?: Request | null
): string {
  const clientId = getMicrosoftOauthClientId();
  if (!clientId || !getMicrosoftOauthClientSecret()) {
    throw new Error(
      "Microsoft OAuth nicht konfiguriert (Client-ID und Secret in den Einstellungen)."
    );
  }
  const nonce = `${Date.now().toString(36)}.${Math.random().toString(36).slice(2, 12)}`;
  setSetting(
    stateSettingKey(userId),
    JSON.stringify({ nonce, at: new Date().toISOString() })
  );
  const state = Buffer.from(
    JSON.stringify({ u: userId, n: nonce }),
    "utf8"
  ).toString("base64url");

  const url = new URL(authorizeEndpoint());
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", getMicrosoftOauthRedirectUri(request));
  url.searchParams.set("response_mode", "query");
  url.searchParams.set("scope", MICROSOFT_OAUTH_SCOPES.join(" "));
  url.searchParams.set("state", state);
  // Force account picker alone — Entra rejects combined values like
  // "select_account consent" (AADSTS90023).
  url.searchParams.set("prompt", "select_account");
  return url.toString();
}

export function parseMicrosoftOauthState(
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

export function consumeMicrosoftOauthState(
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

type TokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  error?: string;
  error_description?: string;
};

async function exchangeToken(
  body: Record<string, string>
): Promise<TokenResponse> {
  const clientId = getMicrosoftOauthClientId();
  const clientSecret = getMicrosoftOauthClientSecret();
  if (!clientId || !clientSecret) {
    throw new Error("Microsoft OAuth nicht konfiguriert.");
  }
  const form = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    ...body,
  });
  const res = await fetch(tokenEndpoint(), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });
  const json = (await res.json()) as TokenResponse;
  if (!res.ok || json.error) {
    throw new Error(
      json.error_description ||
        json.error ||
        `Token-Austausch fehlgeschlagen (${res.status})`
    );
  }
  return json;
}

async function fetchGraphProfile(accessToken: string): Promise<{
  email: string | null;
  displayName: string | null;
}> {
  const res = await fetch("https://graph.microsoft.com/v1.0/me", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return { email: null, displayName: null };
  const me = (await res.json()) as {
    mail?: string | null;
    userPrincipalName?: string | null;
    displayName?: string | null;
  };
  return {
    email: (me.mail || me.userPrincipalName || null)?.trim() || null,
    displayName: me.displayName?.trim() || null,
  };
}

export async function finishMicrosoftOauth(
  userId: number,
  code: string,
  request?: Request | null
): Promise<MicrosoftUserTokens> {
  const json = await exchangeToken({
    grant_type: "authorization_code",
    code,
    redirect_uri: getMicrosoftOauthRedirectUri(request),
    scope: MICROSOFT_OAUTH_SCOPES.join(" "),
  });

  const existing = readMicrosoftUserTokens(userId);
  const refreshToken = json.refresh_token || existing?.refreshToken || "";
  if (!refreshToken) {
    throw new Error(
      "Kein Refresh-Token erhalten. In Entra «offline_access» prüfen und erneut verbinden (Consent)."
    );
  }
  if (!json.access_token) {
    throw new Error("Kein Access-Token erhalten.");
  }

  const profile = await fetchGraphProfile(json.access_token);
  const saved: MicrosoftUserTokens = {
    refreshToken,
    accessToken: json.access_token,
    expiryDate: Date.now() + (json.expires_in || 3600) * 1000,
    email: profile.email || existing?.email || null,
    displayName: profile.displayName || existing?.displayName || null,
    scope: json.scope || MICROSOFT_OAUTH_SCOPES.join(" "),
    updatedAt: new Date().toISOString(),
  };
  saveMicrosoftUserTokens(userId, saved);
  return saved;
}

/** Valid access token for Graph calls (refreshes when needed). */
export async function getMicrosoftAccessToken(
  userId: number
): Promise<string> {
  const stored = readMicrosoftUserTokens(userId);
  if (!stored?.refreshToken) {
    throw new Error("Microsoft 365-Konto nicht verbunden.");
  }
  if (
    stored.accessToken &&
    stored.expiryDate != null &&
    stored.expiryDate > Date.now() + 60_000
  ) {
    return stored.accessToken;
  }

  const json = await exchangeToken({
    grant_type: "refresh_token",
    refresh_token: stored.refreshToken,
    scope: MICROSOFT_OAUTH_SCOPES.join(" "),
  });
  if (!json.access_token) {
    throw new Error("Microsoft Access-Token-Refresh fehlgeschlagen.");
  }
  const next: MicrosoftUserTokens = {
    ...stored,
    accessToken: json.access_token,
    expiryDate: Date.now() + (json.expires_in || 3600) * 1000,
    refreshToken: json.refresh_token || stored.refreshToken,
    scope: json.scope || stored.scope,
    updatedAt: new Date().toISOString(),
  };
  saveMicrosoftUserTokens(userId, next);
  return json.access_token;
}
