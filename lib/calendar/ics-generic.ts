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

/** Outlook / Windows TZID → IANA (enough for CH household + common EU). */
const WINDOWS_TZ_TO_IANA: Record<string, string> = {
  "w. europe standard time": "Europe/Zurich",
  "romance standard time": "Europe/Paris",
  "central europe standard time": "Europe/Warsaw",
  "central european standard time": "Europe/Warsaw",
  "gmt standard time": "Europe/London",
  utc: "UTC",
  "coordinated universal time": "UTC",
  "pacific standard time": "America/Los_Angeles",
  "eastern standard time": "America/New_York",
  "tokyo standard time": "Asia/Tokyo",
};

function cacheKey(calendarId: string): string {
  return `ics_feed_cache_${calendarId}`;
}

function unfoldIcs(raw: string): string {
  return raw.replace(/\r\n/g, "\n").replace(/\n[ \t]/g, "");
}

function resolveIanaTimeZone(tzid: string | null | undefined): string {
  if (!tzid) return "Europe/Zurich";
  const cleaned = tzid.replace(/^"|"$/g, "").trim();
  if (!cleaned) return "Europe/Zurich";
  const lower = cleaned.toLowerCase();
  if (WINDOWS_TZ_TO_IANA[lower]) return WINDOWS_TZ_TO_IANA[lower];
  // Already IANA (Europe/Zurich, etc.)
  if (cleaned.includes("/")) return cleaned;
  return "Europe/Zurich";
}

type WallParts = {
  y: number;
  mo: number;
  d: number;
  h: number;
  mi: number;
  s: number;
};

function parseWallParts(value: string): WallParts | null {
  const v = value.trim();
  const day = /^(\d{4})(\d{2})(\d{2})$/.exec(v);
  if (day) {
    return {
      y: Number(day[1]),
      mo: Number(day[2]),
      d: Number(day[3]),
      h: 12,
      mi: 0,
      s: 0,
    };
  }
  const dt = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?$/i.exec(v);
  if (!dt) return null;
  return {
    y: Number(dt[1]),
    mo: Number(dt[2]),
    d: Number(dt[3]),
    h: Number(dt[4]),
    mi: Number(dt[5]),
    s: Number(dt[6]),
  };
}

function partsInZone(date: Date, timeZone: string): WallParts {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const bag: Record<string, string> = {};
  for (const p of fmt.formatToParts(date)) {
    if (p.type !== "literal") bag[p.type] = p.value;
  }
  return {
    y: Number(bag.year),
    mo: Number(bag.month),
    d: Number(bag.day),
    h: Number(bag.hour),
    mi: Number(bag.minute),
    s: Number(bag.second),
  };
}

/**
 * Convert a wall-clock time in `timeZone` to a UTC Date.
 * Avoids treating floating ICS times as the server's local zone (Docker=UTC → +1/+2h bug).
 */
export function wallTimeInZoneToUtc(
  parts: WallParts,
  timeZone: string
): Date {
  if (timeZone === "UTC") {
    return new Date(
      Date.UTC(parts.y, parts.mo - 1, parts.d, parts.h, parts.mi, parts.s)
    );
  }
  // Guess as UTC, then shift by the zone offset at that instant (handles DST).
  let utcMs = Date.UTC(
    parts.y,
    parts.mo - 1,
    parts.d,
    parts.h,
    parts.mi,
    parts.s
  );
  for (let i = 0; i < 3; i += 1) {
    const asZone = partsInZone(new Date(utcMs), timeZone);
    const wanted = Date.UTC(
      parts.y,
      parts.mo - 1,
      parts.d,
      parts.h,
      parts.mi,
      parts.s
    );
    const got = Date.UTC(
      asZone.y,
      asZone.mo - 1,
      asZone.d,
      asZone.h,
      asZone.mi,
      asZone.s
    );
    const delta = wanted - got;
    if (delta === 0) break;
    utcMs += delta;
  }
  return new Date(utcMs);
}

export function parseIcsDateTimeValue(
  value: string,
  tzid?: string | null
): Date | null {
  const v = value.trim();
  const dayOnly = /^\d{8}$/.test(v);
  const zulu = /Z$/i.test(v);
  const parts = parseWallParts(v);
  if (!parts) return null;

  if (dayOnly) {
    // All-day: noon Zurich so the calendar day sticks in CH.
    return wallTimeInZoneToUtc(parts, "Europe/Zurich");
  }
  if (zulu) {
    return new Date(
      Date.UTC(parts.y, parts.mo - 1, parts.d, parts.h, parts.mi, parts.s)
    );
  }
  return wallTimeInZoneToUtc(parts, resolveIanaTimeZone(tzid));
}

function propLine(
  block: string,
  name: string
): { value: string; params: Record<string, string> } | null {
  const re = new RegExp(`(?:^|\\n)${name}((?:;[^:\\n]*)*):([^\\n]*)`);
  const m = re.exec(block);
  if (!m) return null;
  const params: Record<string, string> = {};
  const paramBlob = m[1] || "";
  for (const part of paramBlob.split(";")) {
    if (!part) continue;
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    const key = part.slice(0, eq).trim().toUpperCase();
    const val = part
      .slice(eq + 1)
      .trim()
      .replace(/^"|"$/g, "");
    params[key] = val;
  }
  return {
    value: m[2].replace(/\\n/g, "\n").replace(/\\,/g, ",").trim(),
    params,
  };
}

function prop(block: string, name: string): string | null {
  return propLine(block, name)?.value ?? null;
}

function isoZurichDate(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Zurich",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function zurichHm(d: Date): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Zurich",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const h = parts.find((p) => p.type === "hour")?.value;
  const m = parts.find((p) => p.type === "minute")?.value;
  return `${h}:${m}`;
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

    const startLine = propLine(block, "DTSTART");
    if (!startLine) continue;
    const startValue = startLine.value.includes(":")
      ? startLine.value.split(":").pop() || startLine.value
      : startLine.value;
    const isAllDay = /^\d{8}$/.test(startValue.trim());
    const startParsed = parseIcsDateTimeValue(
      startValue,
      startLine.params.TZID || null
    );
    if (!startParsed || !Number.isFinite(startParsed.getTime())) continue;

    const endLine = propLine(block, "DTEND");
    let end: Date | null = null;
    if (endLine) {
      const endValue = endLine.value.includes(":")
        ? endLine.value.split(":").pop() || endLine.value
        : endLine.value;
      end = parseIcsDateTimeValue(endValue, endLine.params.TZID || startLine.params.TZID || null);
    }

    const uid =
      prop(block, "UID") ||
      `${calendar.id}-${isoZurichDate(startParsed)}-${summary}`;

    events.push({
      uid,
      calendarId: calendar.id,
      calendarName: calendar.name,
      calendarType: calendar.type,
      color: calendar.color,
      startAt: startParsed.toISOString(),
      endAt: end && Number.isFinite(end.getTime()) ? end.toISOString() : null,
      date: isoZurichDate(startParsed),
      time: isAllDay ? null : zurichHm(startParsed),
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
