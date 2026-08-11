import { NextResponse } from "next/server";
import { isAuthError, requireModule } from "@/lib/auth/current-user";
import { ensureInitialized } from "@/lib/db/migrations";
import {
  getConnectedMicrosoftEmail,
  hasMicrosoftMailScope,
  isMicrosoftConnected,
  isMicrosoftOauthConfigured,
  resolveMicrosoftUserId,
} from "@/lib/microsoft/oauth";
import { listMicrosoftInboxMessages } from "@/lib/microsoft/mail-inbox";
import { syncMicrosoftMailAnalysesForItems } from "@/lib/microsoft/sync-mail-analysis";
import {
  countPendingMailTriage,
  getMailAnalysesForMessages,
} from "@/lib/mail/mail-analysis-store";
import { chipForStatus, chipLabelDe } from "@/lib/mail/mail-heuristic";
import type { MailListFilter } from "@/lib/mail/gmail";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseFilter(raw: string | null): MailListFilter {
  if (raw === "week" || raw === "unread" || raw === "today") return raw;
  return "today";
}

export async function GET(request: Request) {
  ensureInitialized();
  const auth = await requireModule("microsoft");
  if (isAuthError(auth)) return auth;
  const userId = resolveMicrosoftUserId(auth);
  const { searchParams } = new URL(request.url);
  const filter = parseFilter(searchParams.get("filter"));
  const limit = Number(searchParams.get("limit") || "30");
  const sync = searchParams.get("sync") !== "0";

  if (!isMicrosoftOauthConfigured()) {
    return NextResponse.json({
      configured: false,
      connected: false,
      items: [],
      filter,
      connectedEmail: null,
      pendingTriage: 0,
      sync: null,
    });
  }
  if (
    userId == null ||
    !isMicrosoftConnected(userId) ||
    !hasMicrosoftMailScope(userId)
  ) {
    return NextResponse.json({
      configured: true,
      connected: false,
      items: [],
      filter,
      connectedEmail: getConnectedMicrosoftEmail(userId),
      pendingTriage: 0,
      sync: null,
    });
  }

  try {
    const items = await listMicrosoftInboxMessages(userId, {
      filter,
      limit: Number.isFinite(limit) ? limit : 30,
    });

    let syncResult = null;
    if (sync) {
      syncResult = await syncMicrosoftMailAnalysesForItems(userId, items, {
        maxAi: 3,
      });
    }

    const analyses = getMailAnalysesForMessages(
      userId,
      items.map((i) => i.id),
      "microsoft"
    );
    const enriched = items.map((item) => {
      const a = analyses.get(item.id);
      const chip = chipForStatus(a?.status ?? null, a?.suggestionCount ?? 0);
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
      items: enriched,
      filter,
      connectedEmail: getConnectedMicrosoftEmail(userId),
      pendingTriage: countPendingMailTriage(userId, "microsoft"),
      sync: syncResult,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 502 }
    );
  }
}
