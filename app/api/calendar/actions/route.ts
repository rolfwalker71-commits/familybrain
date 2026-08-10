import { NextResponse } from "next/server";
import { z } from "zod";
import { isAuthError, requireAuth } from "@/lib/auth/current-user";
import { ensureInitialized } from "@/lib/db/migrations";
import { findRolfAppUserId } from "@/lib/calendar/ics-calendars";
import { parseGoogleCalendarSourceId } from "@/lib/google/calendars";
import { parseMicrosoftCalendarSourceId } from "@/lib/microsoft/calendars";
import {
  getGoogleCalendarEvent,
  markGoogleEventDone,
  rescheduleGoogleEvent,
  suggestGoogleFreeSlotsForEvent,
} from "@/lib/google/calendar-review";
import {
  getMicrosoftEvent,
  markMicrosoftEventDone,
  rescheduleMicrosoftEvent,
  suggestFreeSlotsForEvent,
} from "@/lib/microsoft/calendar-review";
import {
  hasGoogleCalendarEventsWriteScope,
  isGoogleMailConnected,
} from "@/lib/google/oauth";
import {
  hasMicrosoftCalendarScope,
  isMicrosoftConnected,
} from "@/lib/microsoft/oauth";
import { createGoogleTask } from "@/lib/google/tasks";
import { createOutlookTodoTask } from "@/lib/microsoft/mail-day-actions";
import { getAppPublicUrlSetting } from "@/lib/app-url";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("done"),
    agendaItemId: z.string().min(1),
    calendarSourceId: z.string().min(1),
  }),
  z.object({
    action: z.literal("suggest_slots"),
    agendaItemId: z.string().min(1),
    calendarSourceId: z.string().min(1),
    durationMinutes: z.number().int().min(15).max(240).optional(),
  }),
  z.object({
    action: z.literal("reschedule"),
    agendaItemId: z.string().min(1),
    calendarSourceId: z.string().min(1),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    startHm: z.string().regex(/^\d{2}:\d{2}$/),
    endHm: z.string().regex(/^\d{2}:\d{2}$/),
  }),
  z.object({
    action: z.literal("follow_up_task"),
    agendaItemId: z.string().min(1),
    calendarSourceId: z.string().min(1),
    title: z.string().min(1).max(200).optional(),
  }),
]);

function parseCloudEventIds(input: {
  agendaItemId: string;
  calendarSourceId: string;
}):
  | { provider: "google"; calendarId: string; eventId: string }
  | { provider: "microsoft"; calendarId: string; eventId: string }
  | null {
  const googleCal = parseGoogleCalendarSourceId(input.calendarSourceId);
  if (googleCal && input.agendaItemId.startsWith("gcal-")) {
    const prefix = `gcal-${googleCal}-`;
    if (!input.agendaItemId.startsWith(prefix)) return null;
    const eventId = input.agendaItemId.slice(prefix.length);
    if (!eventId) return null;
    return { provider: "google", calendarId: googleCal, eventId };
  }
  const msCal = parseMicrosoftCalendarSourceId(input.calendarSourceId);
  if (msCal && input.agendaItemId.startsWith("mscal-")) {
    const prefix = `mscal-${msCal}-`;
    if (!input.agendaItemId.startsWith(prefix)) return null;
    const eventId = input.agendaItemId.slice(prefix.length);
    if (!eventId) return null;
    return { provider: "microsoft", calendarId: msCal, eventId };
  }
  return null;
}

function buddyCalendarHref(): string {
  const origin = getAppPublicUrlSetting();
  return origin ? `${origin.replace(/\/$/, "")}/calendar` : "/calendar";
}

export async function POST(request: Request) {
  ensureInitialized();
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  const userId = findRolfAppUserId();
  if (userId == null) {
    return NextResponse.json({ error: "Kein Kalender-User." }, { status: 400 });
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

  const parsed = parseCloudEventIds({
    agendaItemId: body.agendaItemId,
    calendarSourceId: body.calendarSourceId,
  });
  if (!parsed) {
    return NextResponse.json(
      { error: "Nur Google- oder O365-Termine können bearbeitet werden." },
      { status: 400 }
    );
  }

  try {
    if (parsed.provider === "google") {
      if (!isGoogleMailConnected(userId) || !hasGoogleCalendarEventsWriteScope(userId)) {
        return NextResponse.json(
          { error: "Google-Kalender Schreibrecht fehlt — neu verbinden." },
          { status: 400 }
        );
      }
      if (body.action === "done") {
        const event = await markGoogleEventDone(
          userId,
          parsed.calendarId,
          parsed.eventId,
          request
        );
        return NextResponse.json({ ok: true, provider: "google", event });
      }
      if (body.action === "suggest_slots") {
        const event = await getGoogleCalendarEvent(
          userId,
          parsed.calendarId,
          parsed.eventId,
          request
        );
        const slots = await suggestGoogleFreeSlotsForEvent(userId, event, {
          request,
          durationMinutes: body.durationMinutes,
        });
        return NextResponse.json({
          ok: true,
          provider: "google",
          event,
          slots,
        });
      }
      if (body.action === "reschedule") {
        const event = await rescheduleGoogleEvent(
          userId,
          parsed.calendarId,
          parsed.eventId,
          {
            date: body.date,
            startHm: body.startHm,
            endHm: body.endHm,
          },
          request
        );
        return NextResponse.json({ ok: true, provider: "google", event });
      }
      // follow_up_task
      const event = await getGoogleCalendarEvent(
        userId,
        parsed.calendarId,
        parsed.eventId,
        request
      );
      const taskTitle =
        body.title?.trim() ||
        `Folge: ${event.subject.replace(/^✅\s*/, "").replace(/^➡️\s*/, "")}`;
      const task = await createGoogleTask(userId, {
        title: taskTitle,
        notes: `Aus Kalender · ${buddyCalendarHref()}`,
        dueDate: event.date,
      }, request);
      return NextResponse.json({
        ok: true,
        provider: "google",
        task: { title: taskTitle, id: task.id, link: task.href },
      });
    }

    // Microsoft
    if (!isMicrosoftConnected(userId) || !hasMicrosoftCalendarScope(userId)) {
      return NextResponse.json(
        { error: "Microsoft-Kalender nicht verbunden." },
        { status: 400 }
      );
    }
    if (body.action === "done") {
      const event = await markMicrosoftEventDone(userId, parsed.eventId);
      return NextResponse.json({ ok: true, provider: "microsoft", event });
    }
    if (body.action === "suggest_slots") {
      const event = await getMicrosoftEvent(userId, parsed.eventId);
      const slots = await suggestFreeSlotsForEvent(userId, event, {
        durationMinutes: body.durationMinutes,
      });
      return NextResponse.json({
        ok: true,
        provider: "microsoft",
        event,
        slots,
      });
    }
    if (body.action === "reschedule") {
      const event = await rescheduleMicrosoftEvent(userId, parsed.eventId, {
        date: body.date,
        startHm: body.startHm,
        endHm: body.endHm,
      });
      return NextResponse.json({ ok: true, provider: "microsoft", event });
    }
    const event = await getMicrosoftEvent(userId, parsed.eventId);
    const taskTitle =
      body.title?.trim() ||
      `Folge: ${event.subject.replace(/^✅\s*/, "").replace(/^➡️\s*/, "")}`;
    const task = await createOutlookTodoTask(userId, {
      title: taskTitle,
      notes: `Aus Kalender · ${buddyCalendarHref()}`,
      dueDate: event.date,
    });
    return NextResponse.json({
      ok: true,
      provider: "microsoft",
      task: { title: taskTitle, id: task.id, link: task.webLink },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 502 }
    );
  }
}
