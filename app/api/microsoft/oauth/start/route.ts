import { NextResponse } from "next/server";
import { isAuthError, requireAuth } from "@/lib/auth/current-user";
import { ensureInitialized } from "@/lib/db/migrations";
import {
  beginMicrosoftOauth,
  isMicrosoftOauthConfigured,
  resolveMicrosoftUserId,
} from "@/lib/microsoft/oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  ensureInitialized();
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;
  if (!isMicrosoftOauthConfigured()) {
    return NextResponse.json(
      {
        error:
          "Microsoft OAuth nicht konfiguriert. Client-ID und Secret unter Einstellungen → Kalender hinterlegen.",
      },
      { status: 400 }
    );
  }
  const userId = resolveMicrosoftUserId(auth);
  if (userId == null) {
    return NextResponse.json(
      {
        error:
          "Kein App-User für Microsoft-Verbindung. Bitte App-User anlegen oder als App-User anmelden.",
      },
      { status: 400 }
    );
  }
  try {
    const url = beginMicrosoftOauth(userId, request);
    return NextResponse.redirect(url);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 400 }
    );
  }
}
