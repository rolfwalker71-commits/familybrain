import { NextResponse } from "next/server";
import { z } from "zod";
import { isAuthError, requireAuth } from "@/lib/auth/current-user";
import { ensureInitialized } from "@/lib/db/migrations";
import { findRolfAppUserId } from "@/lib/calendar/ics-calendars";
import {
  hasMicrosoftCalendarScope,
  isMicrosoftConnected,
} from "@/lib/microsoft/oauth";
import { suggestFreeSlotsForDuration } from "@/lib/microsoft/calendar-review";
import { createOutlookCalendarEvent } from "@/lib/microsoft/mail-day-actions";
import { addDaysYmd, zurichYmd } from "@/lib/microsoft/time";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("suggest_slots"),
    durationMinutes: z.number().int().min(15).max(240),
    rangeDays: z.number().int().min(1).max(14).optional(),
  }),
  z.object({
    action: z.literal("create"),
    title: z.string().trim().min(1).max(200),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    startHm: z.string().regex(/^\d{2}:\d{2}$/),
    endHm: z.string().regex(/^\d{2}:\d{2}$/),
    notes: z.string().trim().max(2000).optional().nullable(),
  }),
]);

export async function POST(request: Request) {
  ensureInitialized();
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  const userId = findRolfAppUserId();
  if (userId == null) {
    return NextResponse.json({ error: "Kein Kalender-User." }, { status: 400 });
  }

  if (!isMicrosoftConnected(userId) || !hasMicrosoftCalendarScope(userId)) {
    return NextResponse.json(
      { error: "Microsoft-Kalender nicht verbunden." },
      { status: 400 }
    );
  }

  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await request.json());
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Ungültige Anfrage",
      },
      { status: 400 }
    );
  }

  try {
    if (body.action === "suggest_slots") {
      const rangeDays = body.rangeDays ?? 7;
      const today = zurichYmd();
      const slots = await suggestFreeSlotsForDuration(userId, {
        durationMinutes: body.durationMinutes,
        fromToday: true,
        rangeStart: today,
        rangeEnd: addDaysYmd(today, rangeDays),
        maxSlots: 48,
        maxSlotsPerDay: 6,
      });
      return NextResponse.json({
        ok: true,
        provider: "microsoft",
        slots,
        durationMinutes: body.durationMinutes,
      });
    }

    const created = await createOutlookCalendarEvent(userId, {
      title: body.title,
      date: body.date,
      startTime: body.startHm,
      endTime: body.endHm,
      notes: body.notes?.trim() || null,
    });
    return NextResponse.json({
      ok: true,
      provider: "microsoft",
      event: created,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 502 }
    );
  }
}
