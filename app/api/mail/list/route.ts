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
import { getMailAnalysesForMessages } from "@/lib/mail/mail-analysis-store";
import { chipLabelDe } from "@/lib/mail/mail-heuristic";
import { syncMailAnalysesForItems } from "@/lib/mail/sync-mail-analysis";
import { countPendingMailTriage } from "@/lib/mail/mail-analysis-store";

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
  const sync = searchParams.get("sync") !== "0";

  if (!isGoogleOauthConfigured()) {
    return NextResponse.json({
      configured: false,
      connected: false,
      items: [],
      filter,
      connectedEmail: null,
      ownerUserId: userId,
      pendingTriage: 0,
      sync: null,
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
      pendingTriage: 0,
      sync: null,
    });
  }

  try {
    const items = await listGmailMessages(userId, {
      filter,
      limit: Number.isFinite(limit) ? limit : 20,
      request,
      forceRefresh: searchParams.get("refresh") === "1",
    });

    let syncResult = null;
    if (sync) {
      syncResult = await syncMailAnalysesForItems(userId, items, {
        maxAi: 3,
        request,
      });
    }

    const analyses = getMailAnalysesForMessages(
      userId,
      items.map((i) => i.id)
    );
    const enriched = items.map((item) => {
      const a = analyses.get(item.id);
      const chip = a?.chip ?? null;
      return {
        ...item,
        analysisChip: chip,
        analysisChipLabel: chipLabelDe(chip),
        analysisStatus: a?.status ?? null,
        suggestionCount: a?.suggestionCount ?? 0,
        analysisSummary: a?.summary ?? null,
      };
    });

    return NextResponse.json({
      configured: true,
      connected: true,
      connectedEmail: getConnectedGoogleEmail(userId),
      items: enriched,
      filter,
      ownerUserId: userId,
      pendingTriage: countPendingMailTriage(userId),
      sync: syncResult,
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
        pendingTriage: 0,
        sync: null,
      },
      { status: 502 }
    );
  }
}
