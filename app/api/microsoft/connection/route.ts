import { NextResponse } from "next/server";
import { isAuthError, requireAuth } from "@/lib/auth/current-user";
import { ensureInitialized } from "@/lib/db/migrations";
import {
  getConnectedMicrosoftDisplayName,
  getConnectedMicrosoftEmail,
  getMicrosoftOauthRedirectUri,
  getMicrosoftOauthTenant,
  hasMicrosoftCalendarScope,
  hasMicrosoftMailScope,
  hasMicrosoftMailSendScope,
  hasMicrosoftTasksScope,
  isMicrosoftConnected,
  isMicrosoftOauthConfigured,
  resolveMicrosoftUserId,
} from "@/lib/microsoft/oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Per logged-in app user: Microsoft 365 link status (no Client-Secret). */
export async function GET(request: Request) {
  ensureInitialized();
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;
  const userId = resolveMicrosoftUserId(auth);
  const connected = isMicrosoftConnected(userId);
  return NextResponse.json({
    microsoftOauthConfigured: isMicrosoftOauthConfigured(),
    microsoftOauthRedirectUri: getMicrosoftOauthRedirectUri(request),
    microsoftOauthTenant: getMicrosoftOauthTenant(),
    ownerUserId: userId,
    connected,
    connectedEmail: getConnectedMicrosoftEmail(userId),
    connectedDisplayName: getConnectedMicrosoftDisplayName(userId),
    hasMailScope: connected ? hasMicrosoftMailScope(userId) : false,
    hasMailSendScope: connected ? hasMicrosoftMailSendScope(userId) : false,
    hasCalendarScope: connected ? hasMicrosoftCalendarScope(userId) : false,
    hasTasksScope: connected ? hasMicrosoftTasksScope(userId) : false,
  });
}
