import { graphJson } from "@/lib/microsoft/graph";
import {
  addDaysYmd,
  dayWindowLocal,
  hmToMinutes,
  minutesToHm,
  zurichYmd,
} from "@/lib/microsoft/time";

export const BUDDY_DONE_CATEGORY = "Buddy/Erledigt";
export const BUDDY_DONE_PREFIX = "✅ ";

export type MsCalendarEvent = {
  id: string;
  subject: string;
  start: string; // ISO-ish local or UTC from Graph
  end: string;
  startHm: string | null;
  endHm: string | null;
  date: string;
  location: string | null;
  isAllDay: boolean;
  categories: string[];
  done: boolean;
  showAs: string | null;
  webLink: string | null;
  organizer: string | null;
};

type GraphDateTime = {
  dateTime?: string | null;
  timeZone?: string | null;
};

type GraphEvent = {
  id?: string;
  subject?: string | null;
  start?: GraphDateTime;
  end?: GraphDateTime;
  isAllDay?: boolean;
  location?: { displayName?: string | null } | null;
  categories?: string[] | null;
  showAs?: string | null;
  webLink?: string | null;
  organizer?: { emailAddress?: { name?: string | null; address?: string | null } };
};

function parseGraphLocal(dt: GraphDateTime | undefined): {
  date: string;
  hm: string | null;
  raw: string;
} {
  const raw = (dt?.dateTime || "").trim();
  if (!raw) return { date: zurichYmd(), hm: null, raw: "" };
  // Graph with Prefer Zurich often returns "2026-08-07T14:30:00.0000000"
  const date = raw.slice(0, 10);
  const hmMatch = /T(\d{2}):(\d{2})/.exec(raw);
  const hm = hmMatch ? `${hmMatch[1]}:${hmMatch[2]}` : null;
  return { date, hm, raw };
}

function mapEvent(e: GraphEvent): MsCalendarEvent | null {
  if (!e.id) return null;
  const start = parseGraphLocal(e.start);
  const end = parseGraphLocal(e.end);
  const subject = (e.subject || "").trim() || "(ohne Titel)";
  const categories = e.categories || [];
  const done =
    categories.includes(BUDDY_DONE_CATEGORY) ||
    subject.startsWith(BUDDY_DONE_PREFIX) ||
    subject.startsWith("✅");
  return {
    id: e.id,
    subject,
    start: start.raw,
    end: end.raw,
    startHm: start.hm,
    endHm: end.hm,
    date: start.date,
    location: e.location?.displayName?.trim() || null,
    isAllDay: Boolean(e.isAllDay),
    categories,
    done,
    showAs: e.showAs || null,
    webLink: e.webLink || null,
    organizer:
      e.organizer?.emailAddress?.name ||
      e.organizer?.emailAddress?.address ||
      null,
  };
}

const EVENT_SELECT =
  "id,subject,start,end,isAllDay,location,categories,showAs,webLink,organizer";

export async function listMicrosoftEventsInRange(
  userId: number,
  startYmd: string,
  endYmd: string
): Promise<MsCalendarEvent[]> {
  const { start } = dayWindowLocal(startYmd);
  const { end } = dayWindowLocal(endYmd);
  const qs = new URLSearchParams({
    startDateTime: start,
    endDateTime: end,
    $select: EVENT_SELECT,
    $orderby: "start/dateTime",
    $top: "100",
  });
  const data = await graphJson<{ value?: GraphEvent[] }>(
    userId,
    `/me/calendarView?${qs}`,
    { headers: { Prefer: 'outlook.timezone="Europe/Zurich"' } }
  );
  return (data.value || [])
    .map(mapEvent)
    .filter((e): e is MsCalendarEvent => Boolean(e));
}

export async function listMicrosoftEventsToday(
  userId: number
): Promise<MsCalendarEvent[]> {
  const today = zurichYmd();
  return listMicrosoftEventsInRange(userId, today, today);
}

export async function markMicrosoftEventDone(
  userId: number,
  eventId: string
): Promise<MsCalendarEvent> {
  const existing = await graphJson<GraphEvent>(
    userId,
    `/me/events/${encodeURIComponent(eventId)}?$select=${EVENT_SELECT}`
  );
  const subject = (existing.subject || "").trim();
  const categories = [...(existing.categories || [])];
  if (!categories.includes(BUDDY_DONE_CATEGORY)) {
    categories.push(BUDDY_DONE_CATEGORY);
  }
  const nextSubject = subject.startsWith(BUDDY_DONE_PREFIX)
    ? subject
    : `${BUDDY_DONE_PREFIX}${subject || "Termin"}`;

  const patched = await graphJson<GraphEvent>(
    userId,
    `/me/events/${encodeURIComponent(eventId)}`,
    {
      method: "PATCH",
      body: JSON.stringify({
        subject: nextSubject.slice(0, 255),
        categories,
        showAs: "free",
      }),
    }
  );
  const mapped = mapEvent(patched);
  if (!mapped) throw new Error("Event nach Update nicht lesbar.");
  return mapped;
}

export type FreeSlot = {
  date: string;
  startHm: string;
  endHm: string;
  durationMinutes: number;
};

/**
 * Find free slots in [rangeStart, rangeEnd] within work hours,
 * excluding busy timed events. durationMinutes = needed length.
 */
export function findFreeSlots(input: {
  events: MsCalendarEvent[];
  rangeStart: string;
  rangeEnd: string;
  durationMinutes: number;
  workStartHm?: string;
  workEndHm?: string;
  maxSlots?: number;
}): FreeSlot[] {
  const workStart = hmToMinutes(input.workStartHm || "08:00") ?? 8 * 60;
  const workEnd = hmToMinutes(input.workEndHm || "18:00") ?? 18 * 60;
  const need = Math.max(15, input.durationMinutes);
  const maxSlots = input.maxSlots ?? 12;
  const slots: FreeSlot[] = [];

  let day = input.rangeStart;
  while (day <= input.rangeEnd && slots.length < maxSlots) {
    const dayEvents = input.events
      .filter((e) => e.date === day && !e.isAllDay && e.startHm && !e.done)
      .map((e) => {
        const start = hmToMinutes(e.startHm!) ?? workStart;
        const end = hmToMinutes(e.endHm || "") ?? start + 60;
        return { start, end: Math.max(end, start + 15) };
      })
      .sort((a, b) => a.start - b.start);

    let cursor = workStart;
    for (const ev of dayEvents) {
      if (ev.start > cursor && ev.start - cursor >= need) {
        slots.push({
          date: day,
          startHm: minutesToHm(cursor),
          endHm: minutesToHm(cursor + need),
          durationMinutes: need,
        });
        if (slots.length >= maxSlots) break;
      }
      cursor = Math.max(cursor, ev.end);
    }
    if (slots.length < maxSlots && workEnd - cursor >= need) {
      slots.push({
        date: day,
        startHm: minutesToHm(cursor),
        endHm: minutesToHm(cursor + need),
        durationMinutes: need,
      });
    }
    day = addDaysYmd(day, 1);
  }
  return slots;
}

export async function suggestFreeSlotsForEvent(
  userId: number,
  event: MsCalendarEvent,
  options?: {
    rangeStart?: string;
    rangeEnd?: string;
    workStartHm?: string;
    workEndHm?: string;
  }
): Promise<FreeSlot[]> {
  const today = zurichYmd();
  const rangeStart = options?.rangeStart || addDaysYmd(today, 1);
  const rangeEnd = options?.rangeEnd || addDaysYmd(today, 7);
  const duration =
    event.startHm && event.endHm
      ? Math.max(
          15,
          (hmToMinutes(event.endHm) ?? 0) - (hmToMinutes(event.startHm) ?? 0)
        )
      : 60;
  const events = await listMicrosoftEventsInRange(
    userId,
    rangeStart,
    rangeEnd
  );
  return findFreeSlots({
    events: events.filter((e) => e.id !== event.id),
    rangeStart,
    rangeEnd,
    durationMinutes: duration || 60,
    workStartHm: options?.workStartHm,
    workEndHm: options?.workEndHm,
  });
}

export async function rescheduleMicrosoftEvent(
  userId: number,
  eventId: string,
  slot: { date: string; startHm: string; endHm: string }
): Promise<MsCalendarEvent> {
  const start = {
    dateTime: `${slot.date}T${slot.startHm}:00`,
    timeZone: "Europe/Zurich",
  };
  const end = {
    dateTime: `${slot.date}T${slot.endHm}:00`,
    timeZone: "Europe/Zurich",
  };
  const patched = await graphJson<GraphEvent>(
    userId,
    `/me/events/${encodeURIComponent(eventId)}`,
    {
      method: "PATCH",
      body: JSON.stringify({
        start,
        end,
        isAllDay: false,
      }),
      headers: { Prefer: 'outlook.timezone="Europe/Zurich"' },
    }
  );
  const mapped = mapEvent(patched);
  if (!mapped) throw new Error("Verschieben fehlgeschlagen.");
  return mapped;
}

export async function getMicrosoftEvent(
  userId: number,
  eventId: string
): Promise<MsCalendarEvent> {
  const e = await graphJson<GraphEvent>(
    userId,
    `/me/events/${encodeURIComponent(eventId)}?$select=${EVENT_SELECT}`,
    { headers: { Prefer: 'outlook.timezone="Europe/Zurich"' } }
  );
  const mapped = mapEvent(e);
  if (!mapped) throw new Error("Termin nicht gefunden.");
  return mapped;
}
