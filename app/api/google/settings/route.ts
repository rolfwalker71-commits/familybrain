import { NextResponse } from "next/server";
import { z } from "zod";
import { isAuthError, requireAdmin } from "@/lib/auth/current-user";
import { ensureInitialized } from "@/lib/db/migrations";
import { maskToken } from "@/lib/utils/format";
import {
  getConnectedGoogleEmail,
  getGoogleOauthClientId,
  getGoogleOauthClientSecret,
  getGoogleOauthRedirectUri,
  hasGoogleCalendarScope,
  isGoogleMailConnected,
  isGoogleOauthConfigured,
  resolveGoogleUserId,
  saveGoogleOauthClientId,
  saveGoogleOauthClientSecret,
} from "@/lib/google/oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PutSchema = z.object({
  googleOauthClientId: z.string().optional(),
  googleOauthClientSecret: z.string().optional(),
  clearGoogleOauthClientSecret: z.boolean().optional(),
  clearGoogleOauthClientId: z.boolean().optional(),
});

function settingsPayload(request: Request, userId: number | null) {
  const secret = getGoogleOauthClientSecret();
  const connected = isGoogleMailConnected(userId);
  return {
    googleOauthClientId: getGoogleOauthClientId() || "",
    googleOauthClientSecretMasked: maskToken(secret),
    hasGoogleOauthClientSecret: Boolean(secret),
    googleOauthConfigured: isGoogleOauthConfigured(),
    googleOauthRedirectUri: getGoogleOauthRedirectUri(request),
    connected,
    connectedEmail: getConnectedGoogleEmail(userId),
    hasCalendarScope: connected ? hasGoogleCalendarScope(userId) : false,
    ownerUserId: userId,
  };
}

export async function GET(request: Request) {
  ensureInitialized();
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth;
  const userId = resolveGoogleUserId(auth);
  return NextResponse.json(settingsPayload(request, userId));
}

export async function PUT(request: Request) {
  ensureInitialized();
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth;
  const body = await request.json().catch(() => null);
  const parsed = PutSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Ungültige Eingabe" }, { status: 400 });
  }

  if (parsed.data.clearGoogleOauthClientId) {
    saveGoogleOauthClientId(null);
  } else if (parsed.data.googleOauthClientId !== undefined) {
    saveGoogleOauthClientId(parsed.data.googleOauthClientId || null);
  }

  if (parsed.data.clearGoogleOauthClientSecret) {
    saveGoogleOauthClientSecret(null);
  } else if (parsed.data.googleOauthClientSecret?.trim()) {
    saveGoogleOauthClientSecret(parsed.data.googleOauthClientSecret);
  }

  const userId = resolveGoogleUserId(auth);
  return NextResponse.json({
    ok: true,
    ...settingsPayload(request, userId),
  });
}
