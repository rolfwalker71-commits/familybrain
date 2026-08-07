import { NextResponse } from "next/server";
import { isAuthError, requireAuth } from "@/lib/auth/current-user";
import { ensureInitialized } from "@/lib/db/migrations";
import { analyzeMicrosoftMailDay } from "@/lib/microsoft/analyze-mail-day";
import { listMicrosoftMailToday } from "@/lib/microsoft/mail-day";
import {
  isMicrosoftConnected,
  resolveMicrosoftUserId,
} from "@/lib/microsoft/oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  ensureInitialized();
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;
  const userId = resolveMicrosoftUserId(auth);
  if (userId == null || !isMicrosoftConnected(userId)) {
    return NextResponse.json(
      { error: "Microsoft 365 nicht verbunden." },
      { status: 400 }
    );
  }
  try {
    const mail = await listMicrosoftMailToday(userId);
    if (mail.inbox.length === 0 && mail.sent.length === 0) {
      return NextResponse.json({
        ok: true,
        mail,
        analysis: {
          daySummary: "Keine Outlook-Mails für heute gefunden.",
          highlights: [],
          openLoops: [],
          tasks: [],
        },
      });
    }
    const analysis = await analyzeMicrosoftMailDay(mail);
    return NextResponse.json({ ok: true, mail, analysis });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 502 }
    );
  }
}
