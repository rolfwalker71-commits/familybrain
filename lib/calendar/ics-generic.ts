import { getSetting, setSetting } from "@/lib/db/migrations";
import type { IcsCalendar } from "@/lib/calendar/ics-calendars";

export type GenericIcsEvent = {
  uid: string;
  calendarId: string;
  calendarName: string;
  calendarType: IcsCalendar["type"];
  color: string;
  startAt: string;
  endAt: string | null;
  date: string;
  time: string | null;
  summary: string;
  location: string | null;
  description: string | null;
};

type CachePayload = {
  fetchedAt: string;
  ics: string;
};

const CACHE_TTL_MS = 30 * 60 * 1000;

function cacheKey(calendarId: string): string {
  return `ics_feed_cache_${calendarId}`;
}

function unfoldIcs(raw: string): string {
  return raw.replace(/\r\n/g, "\n").replace(/\n[ \t]/g, "");
}

function parseIcsDateTime(value: string): Date | null {
  const v = value.trim();
  const day = /^(\d{4})(\d{2})(\d{2})$/.exec(v);
  if (day) {
    return new Date(
      Number(day[1]),
      Number(day[2]) - 1,
      Number(day[3]),
      12,
      0,
      0
    );
  }
  const dt =
    /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?$/.exec(v);
  if (!dt) return null;
  if (dt[7] === "Z") {
    return new Date(
      Date.UTC(
        Number(dt[1]),
        Number(dt[2]) - 1,
        Number(dt[3]),
        Number(dt[4]),
        Number(dt[5]),
        Number(dt[6])
      )
    );
  }
  return new Date(
    Number(dt[1]),
    Number(dt[2]) - 1,
    Number(dt[3]),
    Number(dt[4]),
    Number(dt[5]),
    Number(dt[6])
  );
}

function prop(block: string, name: string): string | null {
  const re = new RegExp(`(?:^|\\n)${name}(?:;[^:\\n]*)?:([^\\n]*)`);
  const m = re.exec(block);
  return m
    ? m[1].replace(/\\n/g, "\n").replace(/\\,/g, ",").trim()
    : null;
}

function isoZurichDate(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Zurich",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function localTime(d: Date): string | null {
  // All-day events at noon local — skip time display if original was date-only
  const t = d.toLocaleTimeString("de-CH", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Zurich",
  });
  return t === "12:00" ? null : t;
}

export function parseGenericIcsEvents(
  ics: string,
  calendar: IcsCalendar
): GenericIcsEvent[] {
  const unfolded = unfoldIcs(ics);
  const blocks = unfolded.match(/BEGIN:VEVENT[\s\S]*?END:VEVENT/g) || [];
  const events: GenericIcsEvent[] = [];

  for (const block of blocks) {
    const summary = prop(block, "SUMMARY");
    if (!summary || /^busy$/i.test(summary)) continue;
    const startRaw = prop(block, "DTSTART");
    if (!startRaw) continue;
    // Strip TZID params already handled by prop regex value
    const startValue = startRaw.includes(":")
      ? startRaw
      : startRaw;
    const start = parseIcsDateTime(startValue.replace(/^.*:/, ""));
    // DTSTART may be bare YYYYMMDDTHHMMSS — parseIcsDateTime on full startRaw
    const startParsed =
      start ||
      parseIcsDateTime(startRaw.split(":").pop() || startRaw);
    if (!startParsed || !Number.isFinite(startParsed.getTime())) continue;

    const endRaw = prop(block, "DTEND");
    const end = endRaw
      ? parseIcsDateTime(endRaw.split(":").pop() || endRaw)
      : null;
    const uid =
      prop(block, "UID") ||
      `${calendar.id}-${isoZurichDate(startParsed)}-${summary}`;

    const isAllDay = /^\d{8}$/.test((startRaw.split(":").pop() || "").trim());

    events.push({
      uid,
      calendarId: calendar.id,
      calendarName: calendar.name,
      calendarType: calendar.type,
      color: calendar.color,
      startAt: startParsed.toISOString(),
      endAt:
        end && Number.isFinite(end.getTime()) ? end.toISOString() : null,
      date: isoZurichDate(startParsed),
      time: isAllDay ? null : localTime(startParsed),
      summary: summary.trim(),
      location: prop(block, "LOCATION"),
      description: prop(block, "DESCRIPTION"),
    });
  }

  return events.sort((a, b) => a.startAt.localeCompare(b.startAt));
}

async function fetchIcs(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      "User-Agent": "BuddyApp/1.0 (familybrain; local household app)",
      Accept: "text/calendar, text/plain, */*",
    },
    signal: AbortSignal.timeout(20000),
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Kalender nicht erreichbar (${res.status})`);
  }
  const text = await res.text();
  if (!text.includes("BEGIN:VCALENDAR")) {
    throw new Error("Keine gültige ICS-Antwort");
  }
  return text;
}

export async function getGenericCalendarEvents(
  calendar: IcsCalendar,
  options?: { forceRefresh?: boolean }
): Promise<GenericIcsEvent[]> {
  const key = cacheKey(calendar.id);
  const raw = getSetting(key);
  let cached: CachePayload | null = null;
  if (raw) {
    try {
      cached = JSON.parse(raw) as CachePayload;
    } catch {
      cached = null;
    }
  }
  const age = cached?.fetchedAt
    ? Date.now() - new Date(cached.fetchedAt).getTime()
    : Number.POSITIVE_INFINITY;

  let ics = cached?.ics || "";
  if (options?.forceRefresh || !cached?.ics || age > CACHE_TTL_MS) {
    try {
      ics = await fetchIcs(calendar.url);
      setSetting(
        key,
        JSON.stringify({
          fetchedAt: new Date().toISOString(),
          ics,
        } satisfies CachePayload)
      );
    } catch (error) {
      if (!cached?.ics) throw error;
      ics = cached.ics;
    }
  }

  return parseGenericIcsEvents(ics, calendar);
}
