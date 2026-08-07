import { NextResponse } from "next/server";
import { isAuthError, requireAuth } from "@/lib/auth/current-user";
import { ensureInitialized } from "@/lib/db/migrations";
import {
  clearGoogleUserTokens,
  getConnectedGoogleEmail,
  resolveGoogleUserId,
} from "@/lib/google/oauth";
import { invalidateMailListCache } from "@/lib/mail/gmail";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  ensureInitialized();
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;
  const userId = resolveGoogleUserId(auth);
  if (userId == null) {
    return NextResponse.json(
      { error: "Kein App-User für Google-Verbindung." },
      { status: 400 }
    );
  }
  clearGoogleUserTokens(userId);
  invalidateMailListCache(userId);
  return NextResponse.json({
    ok: true,
    connected: false,
    connectedEmail: getConnectedGoogleEmail(userId),
  });
}
