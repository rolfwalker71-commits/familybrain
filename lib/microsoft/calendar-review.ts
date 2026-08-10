import { graphJson } from "@/lib/microsoft/graph";
import {
  addDaysYmd,
  dayWindowLocal,
  hmToMinutes,
  minutesToHm,
  zurichHm,
  zurichYmd,
} from "@/lib/microsoft/time";

export const BUDDY_DONE_CATEGORY = "Buddy/Erledigt";
export const BUDDY_DONE_PREFIX = "✅ ";
/** Markiert verschobene Termine im Titel (ohne Mail an Organisator). */
export const BUDDY_RESCHEDULED_PREFIX = "➡️ ";
export const BUDDY_RESCHEDULED_CATEGORY = "Buddy/Verschoben";

/** Titel um Verschieben-Pfeil ergänzen (idempotent). */
export function withReschedulePrefix(subject: string): string {
  const s = (subject || "").trim() || "Termin";
  if (s.includes(BUDDY_RESCHEDULED_PREFIX.trim())) return s.slice(0, 255);
  return `${BUDDY_RESCHEDULED_PREFIX}${s}`.slice(0, 255);
}

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

/** Arbeitsfenster für Verschiebe-Vorschläge (Europe/Zurich). */
export const MS_WORK_START_HM = "08:00";
export const MS_WORK_END_HM = "18:00";
/** Keine Termine über die Mittagspause. */
export const MS_LUNCH_START_HM = "12:00";
export const MS_LUNCH_END_HM = "13:00";

const SLOT_STEP_MINUTES = 30;

function isOccupyingCalendarEvent(e: MsCalendarEvent): boolean {
  if (e.isAllDay || !e.startHm) return false;
  if (e.done) return false;
  const show = (e.showAs || "busy").toLowerCase();
  // «free» z. B. nach Buddy/Erledigt — Slot wieder nutzbar
  if (show === "free") return false;
  return true;
}

function mergeBusyIntervals(
  intervals: Array<{ start: number; end: number }>
): Array<{ start: number; end: number }> {
  if (intervals.length === 0) return [];
  const sorted = [...intervals].sort((a, b) => a.start - b.start);
  const out: Array<{ start: number; end: number }> = [
    { start: sorted[0]!.start, end: sorted[0]!.end },
  ];
  for (let i = 1; i < sorted.length; i++) {
    const cur = sorted[i]!;
    const last = out[out.length - 1]!;
    if (cur.start <= last.end) {
      last.end = Math.max(last.end, cur.end);
    } else {
      out.push({ start: cur.start, end: cur.end });
    }
  }
  return out;
}

/** Slot muss in 08–18 liegen, Mittag 12–13 meiden, Ende ≤ 18. */
export function isAllowedWorkSlot(input: {
  startHm: string;
  endHm: string;
  workStartHm?: string;
  workEndHm?: string;
  lunchStartHm?: string;
  lunchEndHm?: string;
}): boolean {
  const workStart =
    hmToMinutes(input.workStartHm || MS_WORK_START_HM) ?? 8 * 60;
  const workEnd = hmToMinutes(input.workEndHm || MS_WORK_END_HM) ?? 18 * 60;
  const lunchStart =
    hmToMinutes(input.lunchStartHm || MS_LUNCH_START_HM) ?? 12 * 60;
  const lunchEnd =
    hmToMinutes(input.lunchEndHm || MS_LUNCH_END_HM) ?? 13 * 60;
  const start = hmToMinutes(input.startHm);
  const end = hmToMinutes(input.endHm);
  if (start == null || end == null) return false;
  if (end <= start) return false;
  if (start < workStart || end > workEnd) return false;
  // Überlappt Mittagspause?
  if (start < lunchEnd && end > lunchStart) return false;
  return true;
}

/**
 * Freie Slots in [rangeStart, rangeEnd] innerhalb Arbeitszeit 08–18,
 * ohne Mittag 12–13 und ohne bereits belegte Timed-Events.
 */
export function findFreeSlots(input: {
  events: MsCalendarEvent[];
  rangeStart: string;
  rangeEnd: string;
  durationMinutes: number;
  workStartHm?: string;
  workEndHm?: string;
  lunchStartHm?: string;
  lunchEndHm?: string;
  maxSlots?: number;
  /** Cap proposals per calendar day so a full week stays visible. */
  maxSlotsPerDay?: number;
  stepMinutes?: number;
  /** Skip slot starts before this local wall time on `notBefore.date` (e.g. now). */
  notBefore?: { date: string; hm: string } | null;
}): FreeSlot[] {
  const workStart = Math.max(
    8 * 60,
    hmToMinutes(input.workStartHm || MS_WORK_START_HM) ?? 8 * 60
  );
  const workEnd = Math.min(
    18 * 60,
    hmToMinutes(input.workEndHm || MS_WORK_END_HM) ?? 18 * 60
  );
  const lunchStart =
    hmToMinutes(input.lunchStartHm || MS_LUNCH_START_HM) ?? 12 * 60;
  const lunchEnd =
    hmToMinutes(input.lunchEndHm || MS_LUNCH_END_HM) ?? 13 * 60;
  const need = Math.max(15, input.durationMinutes);
  const step = Math.max(15, input.stepMinutes ?? SLOT_STEP_MINUTES);
  const maxSlots = input.maxSlots ?? 12;
  const maxPerDay = input.maxSlotsPerDay ?? maxSlots;
  const notBeforeMins =
    input.notBefore && input.notBefore.date
      ? hmToMinutes(input.notBefore.hm)
      : null;
  const slots: FreeSlot[] = [];

  if (workEnd - workStart < need) return slots;

  let day = input.rangeStart;
  while (day <= input.rangeEnd && slots.length < maxSlots) {
    let dayCount = 0;
    const dayBusy: Array<{ start: number; end: number }> = input.events
      .filter((e) => e.date === day && isOccupyingCalendarEvent(e))
      .map((e) => {
        const start = hmToMinutes(e.startHm!) ?? workStart;
        const end = hmToMinutes(e.endHm || "") ?? start + 60;
        return {
          start: Math.max(start, workStart),
          end: Math.min(Math.max(end, start + 15), workEnd),
        };
      })
      .filter((b) => b.end > b.start);

    // Mittagssperre als belegter Block
    if (lunchEnd > workStart && lunchStart < workEnd) {
      dayBusy.push({
        start: Math.max(lunchStart, workStart),
        end: Math.min(lunchEnd, workEnd),
      });
    }

    const busy = mergeBusyIntervals(dayBusy);
    const freeGaps: Array<{ start: number; end: number }> = [];
    let cursor = workStart;
    for (const b of busy) {
      if (b.start > cursor) {
        freeGaps.push({ start: cursor, end: Math.min(b.start, workEnd) });
      }
      cursor = Math.max(cursor, b.end);
    }
    if (cursor < workEnd) {
      freeGaps.push({ start: cursor, end: workEnd });
    }

    for (const gap of freeGaps) {
      if (slots.length >= maxSlots || dayCount >= maxPerDay) break;
      if (gap.end - gap.start < need) continue;
      for (
        let t = gap.start;
        t + need <= gap.end &&
        slots.length < maxSlots &&
        dayCount < maxPerDay;
        t += step
      ) {
        if (
          input.notBefore &&
          day === input.notBefore.date &&
          notBeforeMins != null &&
          t < notBeforeMins
        ) {
          continue;
        }
        const end = t + need;
        if (
          !isAllowedWorkSlot({
            startHm: minutesToHm(t),
            endHm: minutesToHm(end),
            workStartHm: minutesToHm(workStart),
            workEndHm: minutesToHm(workEnd),
            lunchStartHm: minutesToHm(lunchStart),
            lunchEndHm: minutesToHm(lunchEnd),
          })
        ) {
          continue;
        }
        slots.push({
          date: day,
          startHm: minutesToHm(t),
          endHm: minutesToHm(end),
          durationMinutes: need,
        });
        dayCount += 1;
      }
    }

    day = addDaysYmd(day, 1);
  }
  return slots;
}

export type SuggestFreeSlotsOptions = {
  rangeStart?: string;
  rangeEnd?: string;
  workStartHm?: string;
  workEndHm?: string;
  /** Override event length (minutes). */
  durationMinutes?: number;
  /** Include today and skip past starts (Zurich now). Default false → from tomorrow. */
  fromToday?: boolean;
  maxSlots?: number;
  maxSlotsPerDay?: number;
};

function resolveSlotSearchWindow(options?: SuggestFreeSlotsOptions): {
  rangeStart: string;
  rangeEnd: string;
  notBefore: { date: string; hm: string } | null;
} {
  const today = zurichYmd();
  if (options?.fromToday) {
    const rangeStart = options.rangeStart || today;
    const rangeEnd = options.rangeEnd || addDaysYmd(today, 7);
    return {
      rangeStart,
      rangeEnd,
      notBefore: { date: today, hm: zurichHm() },
    };
  }
  return {
    rangeStart: options?.rangeStart || addDaysYmd(today, 1),
    rangeEnd: options?.rangeEnd || addDaysYmd(today, 7),
    notBefore: null,
  };
}

export async function suggestFreeSlotsForEvent(
  userId: number,
  event: MsCalendarEvent,
  options?: SuggestFreeSlotsOptions
): Promise<FreeSlot[]> {
  const { rangeStart, rangeEnd, notBefore } = resolveSlotSearchWindow(options);
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
  const events = await listMicrosoftEventsInRange(
    userId,
    rangeStart,
    rangeEnd
  );
  return findFreeSlots({
    events: events.filter((e) => e.id !== event.id),
    rangeStart,
    rangeEnd,
    durationMinutes: duration,
    workStartHm: options?.workStartHm || MS_WORK_START_HM,
    workEndHm: options?.workEndHm || MS_WORK_END_HM,
    notBefore,
    maxSlots: options?.maxSlots ?? 48,
    maxSlotsPerDay: options?.maxSlotsPerDay ?? 6,
  });
}

/** Freie Slots für neue Ad-hoc-Termine (ohne bestehendes Event). */
export async function suggestFreeSlotsForDuration(
  userId: number,
  options: SuggestFreeSlotsOptions & { durationMinutes: number }
): Promise<FreeSlot[]> {
  const { rangeStart, rangeEnd, notBefore } = resolveSlotSearchWindow({
    ...options,
    fromToday: options.fromToday !== false,
  });
  const duration = Math.max(15, Math.round(options.durationMinutes));
  const events = await listMicrosoftEventsInRange(
    userId,
    rangeStart,
    rangeEnd
  );
  return findFreeSlots({
    events,
    rangeStart,
    rangeEnd,
    durationMinutes: duration,
    workStartHm: options.workStartHm || MS_WORK_START_HM,
    workEndHm: options.workEndHm || MS_WORK_END_HM,
    notBefore,
    maxSlots: options.maxSlots ?? 48,
    maxSlotsPerDay: options.maxSlotsPerDay ?? 6,
  });
}

export async function rescheduleMicrosoftEvent(
  userId: number,
  eventId: string,
  slot: { date: string; startHm: string; endHm: string }
): Promise<MsCalendarEvent> {
  if (!isAllowedWorkSlot(slot)) {
    throw new Error(
      "Slot ungültig: nur 08:00–18:00, nicht über 12:00–13:00, Ende spätestens 18:00."
    );
  }

  // Belegte Termine erneut prüfen (ohne das zu verschiebende Event)
  const dayEvents = await listMicrosoftEventsInRange(
    userId,
    slot.date,
    slot.date
  );
  const startM = hmToMinutes(slot.startHm)!;
  const endM = hmToMinutes(slot.endHm)!;
  const conflict = dayEvents.some((e) => {
    if (e.id === eventId || !isOccupyingCalendarEvent(e)) return false;
    const es = hmToMinutes(e.startHm!);
    const ee = hmToMinutes(e.endHm || "") ?? (es != null ? es + 60 : null);
    if (es == null || ee == null) return false;
    return startM < ee && endM > es;
  });
  if (conflict) {
    throw new Error("Slot ist bereits belegt.");
  }

  const existing = await graphJson<GraphEvent>(
    userId,
    `/me/events/${encodeURIComponent(eventId)}?$select=${EVENT_SELECT}`,
    { headers: { Prefer: 'outlook.timezone="Europe/Zurich"' } }
  );
  const subject = (existing.subject || "").trim() || "Termin";
  const nextSubject = withReschedulePrefix(subject);
  const categories = [...(existing.categories || [])];
  if (!categories.includes(BUDDY_RESCHEDULED_CATEGORY)) {
    categories.push(BUDDY_RESCHEDULED_CATEGORY);
  }

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
        subject: nextSubject,
        categories,
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
