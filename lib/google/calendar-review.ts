/**
 * Google Calendar review actions — mirror of Microsoft Buddy/Erledigt + Verschieben.
 */
import { google } from "googleapis";
import {
  getAuthedGoogleClient,
  hasGoogleCalendarEventsWriteScope,
} from "@/lib/google/oauth";
import { listGoogleCalendarEventsInRange } from "@/lib/google/calendars";
import {
  BUDDY_DONE_PREFIX,
  BUDDY_RESCHEDULED_PREFIX,
  findFreeSlots,
  type FreeSlot,
  withReschedulePrefix,
  type MsCalendarEvent,
} from "@/lib/microsoft/calendar-review";
import { addDaysYmd, hmToMinutes, zurichHm, zurichYmd } from "@/lib/microsoft/time";
import { updateGoogleCalendarEvent } from "@/lib/google/calendar-write";

export const GOOGLE_BUDDY_DONE_PROP = "buddyDone";
export const GOOGLE_BUDDY_RESCHEDULED_PROP = "buddyRescheduled";

export type GoogleReviewEvent = {
  id: string;
  calendarId: string;
  subject: string;
  date: string;
  startHm: string | null;
  endHm: string | null;
  location: string | null;
  isAllDay: boolean;
  done: boolean;
  htmlLink: string | null;
};

function isDoneTitle(summary: string): boolean {
  const s = summary.trim();
  return s.startsWith(BUDDY_DONE_PREFIX) || s.startsWith("✅");
}

function withDonePrefix(subject: string): string {
  const s = (subject || "").trim() || "Termin";
  if (isDoneTitle(s)) return s.slice(0, 255);
  return `${BUDDY_DONE_PREFIX}${s}`.slice(0, 255);
}

/** Heutige Termine (alle aktivierten Google-Kalender) für den Hub-Kalender-Tab. */
export async function listGoogleEventsToday(
  userId: number,
  request?: Request | null
): Promise<GoogleReviewEvent[]> {
  const today = zurichYmd();
  const events = await listGoogleCalendarEventsInRange(
    userId,
    today,
    today,
    request
  );
  return events.map((e) => {
    const summary = (e.summary || "").trim() || "(ohne Titel)";
    return {
      id: e.id,
      calendarId: e.calendarId,
      subject: summary,
      date: e.date,
      startHm: e.time,
      endHm: e.endTime,
      location: e.location,
      isAllDay: !e.time,
      done: isDoneTitle(summary),
      htmlLink: null,
    };
  });
}

export async function getGoogleCalendarEvent(
  userId: number,
  calendarId: string,
  eventId: string,
  request?: Request | null
): Promise<GoogleReviewEvent> {
  if (!hasGoogleCalendarEventsWriteScope(userId)) {
    throw new Error(
      "Kalender-Schreibrecht fehlt — bitte unter Konto neu verbinden."
    );
  }
  const auth = await getAuthedGoogleClient(userId, request);
  const calendar = google.calendar({ version: "v3", auth });
  const res = await calendar.events.get({
    calendarId,
    eventId,
    fields:
      "id,summary,start,end,transparency,htmlLink,extendedProperties",
  });
  const ev = res.data;
  if (!ev.id) throw new Error("Termin nicht gefunden.");
  const summary = (ev.summary || "").trim() || "(ohne Titel)";
  const startDate =
    ev.start?.date ||
    (ev.start?.dateTime || "").slice(0, 10) ||
    zurichYmd();
  const startHm = ev.start?.dateTime
    ? /T(\d{2}):(\d{2})/.exec(ev.start.dateTime)?.slice(1).join(":") || null
    : null;
  const endHm = ev.end?.dateTime
    ? /T(\d{2}):(\d{2})/.exec(ev.end.dateTime)?.slice(1).join(":") || null
    : null;
  const privateProps = ev.extendedProperties?.private || {};
  const done =
    privateProps[GOOGLE_BUDDY_DONE_PROP] === "1" || isDoneTitle(summary);
  return {
    id: ev.id,
    calendarId,
    subject: summary,
    date: startDate,
    startHm,
    endHm,
    location: null,
    isAllDay: Boolean(ev.start?.date && !ev.start?.dateTime),
    done,
    htmlLink: ev.htmlLink || null,
  };
}

export async function markGoogleEventDone(
  userId: number,
  calendarId: string,
  eventId: string,
  request?: Request | null
): Promise<GoogleReviewEvent> {
  const existing = await getGoogleCalendarEvent(
    userId,
    calendarId,
    eventId,
    request
  );
  const auth = await getAuthedGoogleClient(userId, request);
  const calendar = google.calendar({ version: "v3", auth });
  await calendar.events.patch({
    calendarId,
    eventId,
    requestBody: {
      summary: withDonePrefix(existing.subject),
      transparency: "transparent",
      extendedProperties: {
        private: {
          [GOOGLE_BUDDY_DONE_PROP]: "1",
        },
      },
    },
  });
  return getGoogleCalendarEvent(userId, calendarId, eventId, request);
}

export async function suggestGoogleFreeSlotsForEvent(
  userId: number,
  event: GoogleReviewEvent,
  options?: {
    rangeStart?: string;
    rangeEnd?: string;
    request?: Request | null;
    durationMinutes?: number;
    fromToday?: boolean;
    maxSlots?: number;
    maxSlotsPerDay?: number;
  }
): Promise<FreeSlot[]> {
  const today = zurichYmd();
  const fromToday = Boolean(options?.fromToday);
  const rangeStart = options?.rangeStart || (fromToday ? today : addDaysYmd(today, 1));
  const rangeEnd = options?.rangeEnd || addDaysYmd(today, 7);
  const eventDuration =
    event.startHm && event.endHm
      ? Math.max(
          15,
          (hmToMinutes(event.endHm) ?? 0) - (hmToMinutes(event.startHm) ?? 0)
        )
      : 60;
  const duration = Math.max(
    15,
    options?.durationMinutes != null
      ? Math.round(options.durationMinutes)
      : eventDuration || 60
  );

  const events = await listGoogleCalendarEventsInRange(
    userId,
    rangeStart,
    rangeEnd,
    options?.request
  );

  const mapped: MsCalendarEvent[] = events
    .filter((e) => e.id !== event.id)
    .map((e) => {
      const subject = (e.summary || "").trim() || "(ohne Titel)";
      const done = isDoneTitle(subject);
      return {
        id: e.id,
        subject,
        start: e.startAt || e.date,
        end: e.endAt || e.date,
        startHm: e.time,
        endHm: e.endTime,
        date: e.date,
        location: e.location,
        isAllDay: !e.time,
        categories: [],
        done,
        showAs: done ? "free" : "busy",
        webLink: null,
        organizer: null,
      };
    });

  return findFreeSlots({
    events: mapped,
    rangeStart,
    rangeEnd,
    durationMinutes: duration,
    maxSlots: options?.maxSlots ?? 48,
    maxSlotsPerDay: options?.maxSlotsPerDay ?? 6,
    notBefore: fromToday
      ? { date: today, hm: zurichHm() }
      : null,
  });
}

/** Freie Slots für neue Termine (ohne bestehendes Event) — Google. */
export async function suggestGoogleFreeSlotsForDuration(
  userId: number,
  options: {
    durationMinutes: number;
    rangeStart?: string;
    rangeEnd?: string;
    request?: Request | null;
    fromToday?: boolean;
    maxSlots?: number;
    maxSlotsPerDay?: number;
  }
): Promise<FreeSlot[]> {
  const today = zurichYmd();
  const fromToday = options.fromToday !== false;
  const rangeStart = options.rangeStart || (fromToday ? today : addDaysYmd(today, 1));
  const rangeEnd = options.rangeEnd || addDaysYmd(today, 7);
  const duration = Math.max(15, Math.round(options.durationMinutes));

  const events = await listGoogleCalendarEventsInRange(
    userId,
    rangeStart,
    rangeEnd,
    options.request
  );

  const mapped: MsCalendarEvent[] = events.map((e) => {
    const subject = (e.summary || "").trim() || "(ohne Titel)";
    const done = isDoneTitle(subject);
    return {
      id: e.id,
      subject,
      start: e.startAt || e.date,
      end: e.endAt || e.date,
      startHm: e.time,
      endHm: e.endTime,
      date: e.date,
      location: e.location,
      isAllDay: !e.time,
      categories: [],
      done,
      showAs: done ? "free" : "busy",
      webLink: null,
      organizer: null,
    };
  });

  return findFreeSlots({
    events: mapped,
    rangeStart,
    rangeEnd,
    durationMinutes: duration,
    maxSlots: options.maxSlots ?? 48,
    maxSlotsPerDay: options.maxSlotsPerDay ?? 6,
    notBefore: fromToday ? { date: today, hm: zurichHm() } : null,
  });
}

export async function rescheduleGoogleEvent(
  userId: number,
  calendarId: string,
  eventId: string,
  slot: { date: string; startHm: string; endHm: string },
  request?: Request | null
): Promise<GoogleReviewEvent> {
  const existing = await getGoogleCalendarEvent(
    userId,
    calendarId,
    eventId,
    request
  );
  const cleanTitle = existing.subject
    .replace(/^✅\s*/, "")
    .replace(new RegExp(`^${BUDDY_RESCHEDULED_PREFIX}`), "")
    .trim();
  await updateGoogleCalendarEvent(
    userId,
    {
      calendarId,
      eventId,
      title: withReschedulePrefix(cleanTitle || "Termin"),
      startDate: slot.date,
      startTime: slot.startHm,
      endDate: slot.date,
      endTime: slot.endHm,
      allDay: false,
    },
    request
  );

  const auth = await getAuthedGoogleClient(userId, request);
  const calendar = google.calendar({ version: "v3", auth });
  await calendar.events.patch({
    calendarId,
    eventId,
    requestBody: {
      extendedProperties: {
        private: {
          [GOOGLE_BUDDY_RESCHEDULED_PROP]: "1",
        },
      },
    },
  });

  return getGoogleCalendarEvent(userId, calendarId, eventId, request);
}
