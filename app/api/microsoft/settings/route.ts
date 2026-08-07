import { NextResponse } from "next/server";
import { z } from "zod";
import { isAuthError, requireAdmin } from "@/lib/auth/current-user";
import { ensureInitialized } from "@/lib/db/migrations";
import { maskToken } from "@/lib/utils/format";
import {
  getConnectedMicrosoftEmail,
  getMicrosoftOauthClientId,
  getMicrosoftOauthClientSecret,
  getMicrosoftOauthRedirectUri,
  getMicrosoftOauthTenant,
  isMicrosoftConnected,
  isMicrosoftOauthConfigured,
  resolveMicrosoftUserId,
  saveMicrosoftOauthClientId,
  saveMicrosoftOauthClientSecret,
  saveMicrosoftOauthTenant,
} from "@/lib/microsoft/oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PutSchema = z.object({
  microsoftOauthClientId: z.string().optional(),
  microsoftOauthClientSecret: z.string().optional(),
  microsoftOauthTenant: z.string().optional(),
  clearMicrosoftOauthClientSecret: z.boolean().optional(),
  clearMicrosoftOauthClientId: z.boolean().optional(),
});

function settingsPayload(request: Request, userId: number | null) {
  const secret = getMicrosoftOauthClientSecret();
  const connected = isMicrosoftConnected(userId);
  return {
    microsoftOauthClientId: getMicrosoftOauthClientId() || "",
    microsoftOauthClientSecretMasked: maskToken(secret),
    hasMicrosoftOauthClientSecret: Boolean(secret),
    microsoftOauthTenant: getMicrosoftOauthTenant(),
    microsoftOauthConfigured: isMicrosoftOauthConfigured(),
    microsoftOauthRedirectUri: getMicrosoftOauthRedirectUri(request),
    connected,
    connectedEmail: getConnectedMicrosoftEmail(userId),
    ownerUserId: userId,
  };
}

export async function GET(request: Request) {
  ensureInitialized();
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth;
  const userId = resolveMicrosoftUserId(auth);
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

  if (parsed.data.clearMicrosoftOauthClientId) {
    saveMicrosoftOauthClientId(null);
  } else if (parsed.data.microsoftOauthClientId !== undefined) {
    saveMicrosoftOauthClientId(parsed.data.microsoftOauthClientId || null);
  }

  if (parsed.data.clearMicrosoftOauthClientSecret) {
    saveMicrosoftOauthClientSecret(null);
  } else if (parsed.data.microsoftOauthClientSecret?.trim()) {
    saveMicrosoftOauthClientSecret(parsed.data.microsoftOauthClientSecret);
  }

  if (parsed.data.microsoftOauthTenant !== undefined) {
    saveMicrosoftOauthTenant(parsed.data.microsoftOauthTenant || null);
  }

  const userId = resolveMicrosoftUserId(auth);
  return NextResponse.json({
    ok: true,
    ...settingsPayload(request, userId),
  });
}
