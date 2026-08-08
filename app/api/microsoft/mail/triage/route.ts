import { NextResponse } from "next/server";
import { isAuthError, requireAuth } from "@/lib/auth/current-user";
import { ensureInitialized } from "@/lib/db/migrations";
import {
  hasMicrosoftMailScope,
  isMicrosoftConnected,
  resolveMicrosoftUserId,
} from "@/lib/microsoft/oauth";
import {
  countPendingMailTriage,
  getMailAnalysis,
  listPendingMailTriage,
  updateMailAnalysisStatus,
} from "@/lib/mail/mail-analysis-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  ensureInitialized();
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;
  const userId = resolveMicrosoftUserId(auth);
  if (
    userId == null ||
    !isMicrosoftConnected(userId) ||
    !hasMicrosoftMailScope(userId)
  ) {
    return NextResponse.json({ pending: [], pendingCount: 0 });
  }
  const pending = listPendingMailTriage(userId, 40, "microsoft");
  return NextResponse.json({
    pending,
    pendingCount: countPendingMailTriage(userId, "microsoft"),
  });
}

export async function POST(request: Request) {
  ensureInitialized();
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;
  const userId = resolveMicrosoftUserId(auth);
  if (userId == null) {
    return NextResponse.json({ error: "Kein User" }, { status: 400 });
  }
  const body = (await request.json().catch(() => null)) as {
    messageId?: string;
    action?: "dismiss";
  } | null;
  const messageId = body?.messageId?.trim();
  if (!messageId) {
    return NextResponse.json({ error: "messageId fehlt" }, { status: 400 });
  }
  const existing = getMailAnalysis(userId, messageId, "microsoft");
  if (!existing) {
    return NextResponse.json(
      { error: "Analyse nicht gefunden" },
      { status: 404 }
    );
  }
  updateMailAnalysisStatus(userId, messageId, "dismissed", "microsoft");
  const { recordMailSenderDismissed } = await import(
    "@/lib/mail/mail-sender-prefs"
  );
  recordMailSenderDismissed(userId, existing.fromEmail);
  return NextResponse.json({ ok: true, status: "dismissed" });
}
