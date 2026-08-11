import { NextResponse } from "next/server";
import { z } from "zod";
import { isAuthError, requireModule } from "@/lib/auth/current-user";
import { ensureInitialized } from "@/lib/db/migrations";
import {
  getMicrosoftEvent,
  markMicrosoftEventDone,
  rescheduleMicrosoftEvent,
  suggestFreeSlotsForEvent,
} from "@/lib/microsoft/calendar-review";
import {
  isMicrosoftConnected,
  resolveMicrosoftUserId,
} from "@/lib/microsoft/oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("done"),
    eventId: z.string().min(1),
  }),
  z.object({
    action: z.literal("suggest_slots"),
    eventId: z.string().min(1),
    rangeStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    rangeEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    workStartHm: z.string().optional(),
    workEndHm: z.string().optional(),
    durationMinutes: z.number().int().min(15).max(240).optional(),
  }),
  z.object({
    action: z.literal("reschedule"),
    eventId: z.string().min(1),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    startHm: z.string().regex(/^\d{2}:\d{2}$/),
    endHm: z.string().regex(/^\d{2}:\d{2}$/),
  }),
]);

export async function POST(request: Request) {
  ensureInitialized();
  const auth = await requireModule("microsoft");
  if (isAuthError(auth)) return auth;
  const userId = resolveMicrosoftUserId(auth);
  if (userId == null || !isMicrosoftConnected(userId)) {
    return NextResponse.json(
      { error: "Microsoft 365 nicht verbunden." },
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
      const event = await markMicrosoftEventDone(userId, body.eventId);
      return NextResponse.json({ ok: true, event });
    }
    if (body.action === "suggest_slots") {
      const event = await getMicrosoftEvent(userId, body.eventId);
      const slots = await suggestFreeSlotsForEvent(userId, event, {
        rangeStart: body.rangeStart,
        rangeEnd: body.rangeEnd,
        workStartHm: body.workStartHm,
        workEndHm: body.workEndHm,
        durationMinutes: body.durationMinutes,
      });
      return NextResponse.json({ ok: true, event, slots });
    }
    const event = await rescheduleMicrosoftEvent(userId, body.eventId, {
      date: body.date,
      startHm: body.startHm,
      endHm: body.endHm,
    });
    return NextResponse.json({ ok: true, event });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 502 }
    );
  }
}
