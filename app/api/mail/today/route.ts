import { NextResponse } from "next/server";
import { isAuthError, requireAuth } from "@/lib/auth/current-user";
import { ensureInitialized } from "@/lib/db/migrations";
import {
  getConnectedGoogleEmail,
  isGoogleMailConnected,
  resolveGoogleUserId,
} from "@/lib/google/oauth";
import { listGmailMessages } from "@/lib/mail/gmail";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  ensureInitialized();
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;
  const userId = resolveGoogleUserId(auth);
  if (userId == null || !isGoogleMailConnected(userId)) {
    return NextResponse.json({
      connected: false,
      items: [],
      connectedEmail: null,
    });
  }
  try {
    const items = await listGmailMessages(userId, {
      filter: "today",
      limit: 5,
      request,
    });
    return NextResponse.json({
      connected: true,
      connectedEmail: getConnectedGoogleEmail(userId),
      items,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : String(error),
        connected: true,
        items: [],
      },
      { status: 502 }
    );
  }
}
