import { NextResponse } from "next/server";
import { isAuthError, requireAuth } from "@/lib/auth/current-user";
import { ensureInitialized } from "@/lib/db/migrations";
import {
  getConnectedGoogleEmail,
  isGoogleMailConnected,
  isGoogleOauthConfigured,
  resolveGoogleUserId,
} from "@/lib/google/oauth";
import {
  listGmailMessages,
  type MailListFilter,
} from "@/lib/mail/gmail";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseFilter(raw: string | null): MailListFilter {
  if (raw === "week" || raw === "unread" || raw === "today") return raw;
  return "today";
}

export async function GET(request: Request) {
  ensureInitialized();
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;
  const userId = resolveGoogleUserId(auth);
  const { searchParams } = new URL(request.url);
  const filter = parseFilter(searchParams.get("filter"));
  const limit = Number(searchParams.get("limit") || "20");

  if (!isGoogleOauthConfigured()) {
    return NextResponse.json({
      configured: false,
      connected: false,
      items: [],
      filter,
      connectedEmail: null,
      ownerUserId: userId,
    });
  }
  if (userId == null || !isGoogleMailConnected(userId)) {
    return NextResponse.json({
      configured: true,
      connected: false,
      items: [],
      filter,
      connectedEmail: null,
      ownerUserId: userId,
    });
  }

  try {
    const items = await listGmailMessages(userId, {
      filter,
      limit: Number.isFinite(limit) ? limit : 20,
      request,
      forceRefresh: searchParams.get("refresh") === "1",
    });
    return NextResponse.json({
      configured: true,
      connected: true,
      connectedEmail: getConnectedGoogleEmail(userId),
      items,
      filter,
      ownerUserId: userId,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : String(error),
        configured: true,
        connected: true,
        connectedEmail: getConnectedGoogleEmail(userId),
        items: [],
        filter,
        ownerUserId: userId,
      },
      { status: 502 }
    );
  }
}
