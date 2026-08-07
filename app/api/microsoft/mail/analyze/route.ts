import { NextResponse } from "next/server";
import { z } from "zod";
import { isAuthError, requireAuth } from "@/lib/auth/current-user";
import { ensureInitialized } from "@/lib/db/migrations";
import {
  analyzeMicrosoftMailDay,
  emptyMailDayAnalysis,
} from "@/lib/microsoft/analyze-mail-day";
import { listMicrosoftMailForDay } from "@/lib/microsoft/mail-day";
import { zurichYmd } from "@/lib/microsoft/time";
import {
  isMicrosoftConnected,
  resolveMicrosoftUserId,
} from "@/lib/microsoft/oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .nullable(),
});

export async function POST(request: Request) {
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
  let day = zurichYmd();
  try {
    const raw = await request.json().catch(() => ({}));
    const parsed = BodySchema.safeParse(raw);
    if (parsed.success && parsed.data.date) day = parsed.data.date;
  } catch {
    // empty body ok
  }

  try {
    const mail = await listMicrosoftMailForDay(userId, day);
    if (mail.inbox.length === 0 && mail.sent.length === 0) {
      return NextResponse.json({
        ok: true,
        mail: { ...mail, todayIso: mail.dayIso },
        analysis: emptyMailDayAnalysis(
          `Keine Outlook-Mails für ${day} gefunden.`
        ),
      });
    }
    const analysis = await analyzeMicrosoftMailDay({
      todayIso: mail.dayIso,
      inbox: mail.inbox,
      sent: mail.sent,
    });
    return NextResponse.json({
      ok: true,
      mail: { ...mail, todayIso: mail.dayIso },
      analysis,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 502 }
    );
  }
}
