import { NextResponse } from "next/server";
import { z } from "zod";
import { isAuthError, requireAuth } from "@/lib/auth/current-user";
import { ensureInitialized } from "@/lib/db/migrations";
import {
  getGoogleCalendarEvent,
  markGoogleEventDone,
  rescheduleGoogleEvent,
  suggestGoogleFreeSlotsForEvent,
} from "@/lib/google/calendar-review";
import {
  isGoogleMailConnected,
  resolveGoogleUserId,
} from "@/lib/google/oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("done"),
    eventId: z.string().min(1),
    calendarId: z.string().min(1),
  }),
  z.object({
    action: z.literal("suggest_slots"),
    eventId: z.string().min(1),
    calendarId: z.string().min(1),
    rangeStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    rangeEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    durationMinutes: z.number().int().min(15).max(240).optional(),
  }),
  z.object({
    action: z.literal("reschedule"),
    eventId: z.string().min(1),
    calendarId: z.string().min(1),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    startHm: z.string().regex(/^\d{2}:\d{2}$/),
    endHm: z.string().regex(/^\d{2}:\d{2}$/),
  }),
]);

export async function POST(request: Request) {
  ensureInitialized();
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;
  const userId = resolveGoogleUserId(auth);
  if (userId == null || !isGoogleMailConnected(userId)) {
    return NextResponse.json(
      { error: "Google Workspace nicht verbunden." },
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
    if (body.action === "done") {
      const event = await markGoogleEventDone(
        userId,
        body.calendarId,
        body.eventId,
        request
      );
      return NextResponse.json({ ok: true, event });
    }
    if (body.action === "suggest_slots") {
      const event = await getGoogleCalendarEvent(
        userId,
        body.calendarId,
        body.eventId,
        request
      );
      const slots = await suggestGoogleFreeSlotsForEvent(userId, event, {
        rangeStart: body.rangeStart,
        rangeEnd: body.rangeEnd,
        durationMinutes: body.durationMinutes,
        request,
      });
      return NextResponse.json({ ok: true, event, slots });
    }
    const event = await rescheduleGoogleEvent(
      userId,
      body.calendarId,
      body.eventId,
      {
        date: body.date,
        startHm: body.startHm,
        endHm: body.endHm,
      },
      request
    );
    return NextResponse.json({ ok: true, event });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 502 }
    );
  }
}
