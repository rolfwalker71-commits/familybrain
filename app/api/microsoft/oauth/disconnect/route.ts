import { NextResponse } from "next/server";
import { isAuthError, requireAuth } from "@/lib/auth/current-user";
import { ensureInitialized } from "@/lib/db/migrations";
import {
  clearMicrosoftUserTokens,
  getConnectedMicrosoftEmail,
  resolveMicrosoftUserId,
} from "@/lib/microsoft/oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  ensureInitialized();
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;
  const userId = resolveMicrosoftUserId(auth);
  if (userId == null) {
    return NextResponse.json(
      { error: "Kein App-User für Microsoft-Verbindung." },
      { status: 400 }
    );
  }
  clearMicrosoftUserTokens(userId);
  return NextResponse.json({
    ok: true,
    connected: false,
    connectedEmail: getConnectedMicrosoftEmail(userId),
  });
}
