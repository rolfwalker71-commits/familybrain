import { NextResponse } from "next/server";
import { isAuthError, requireAuth } from "@/lib/auth/current-user";
import { ensureInitialized } from "@/lib/db/migrations";
import {
  beginGoogleOauth,
  isGoogleOauthConfigured,
  resolveGoogleUserId,
} from "@/lib/google/oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  ensureInitialized();
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;
  if (!isGoogleOauthConfigured()) {
    return NextResponse.json(
      {
        error:
          "Google OAuth nicht konfiguriert. Client-ID und Secret unter Einstellungen → Kalender hinterlegen.",
      },
      { status: 400 }
    );
  }
  const userId = resolveGoogleUserId(auth);
  if (userId == null) {
    return NextResponse.json(
      {
        error:
          "Kein App-User für Google-Verbindung. Bitte App-User «Rolf» anlegen oder als App-User anmelden.",
      },
      { status: 400 }
    );
  }
  try {
    const url = beginGoogleOauth(userId, request);
    return NextResponse.redirect(url);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 400 }
    );
  }
}
