import { NextResponse } from "next/server";
import { isAuthError, requireAuth } from "@/lib/auth/current-user";
import { ensureInitialized } from "@/lib/db/migrations";
import {
  isGoogleMailConnected,
  resolveGoogleUserId,
} from "@/lib/google/oauth";
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
  const userId = resolveGoogleUserId(auth);
  if (userId == null || !isGoogleMailConnected(userId)) {
    return NextResponse.json({
      pending: [],
      pendingCount: 0,
    });
  }
  const pending = listPendingMailTriage(userId, 40);
  return NextResponse.json({
    pending,
    pendingCount: countPendingMailTriage(userId),
  });
}

/** Dismiss a mail analysis (no calendar/task created). */
export async function POST(request: Request) {
  ensureInitialized();
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;
  const userId = resolveGoogleUserId(auth);
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
  const existing = getMailAnalysis(userId, messageId);
  if (!existing) {
    return NextResponse.json({ error: "Analyse nicht gefunden" }, { status: 404 });
  }
  updateMailAnalysisStatus(userId, messageId, "dismissed");
  const { applyGmailStatusLabel } = await import("@/lib/mail/gmail-labels");
  await applyGmailStatusLabel(userId, messageId, "dismissed", request).catch(
    () => undefined
  );
  return NextResponse.json({ ok: true, status: "dismissed" });
}
