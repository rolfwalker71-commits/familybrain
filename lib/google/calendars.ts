import { google } from "googleapis";
import { getSetting, setSetting } from "@/lib/db/migrations";
import {
  ICS_CALENDAR_TYPES,
  ICS_TYPE_META,
  type IcsCalendarType,
} from "@/lib/calendar/ics-calendars";
import {
  getAuthedGoogleClient,
  hasGoogleCalendarScope,
  isGoogleMailConnected,
} from "@/lib/google/oauth";
import {
  parseHockeyGamesFromGoogleEvents,
  type HockeyGame,
} from "@/lib/hockey/games";
import { extractMeetUrl } from "@/lib/calendar/meet-url";

export type GoogleCalendarSelection = {
  id: string;
  enabled: boolean;
  /** Display name snapshot from last save */
  name?: string;
  /** Optional Buddy type override */
  type?: IcsCalendarType;
  /** Optional color override (#rrggbb) */
  color?: string;
};

export type GoogleCalendarListItem = {
  id: string;
  name: string;
  description: string | null;
  color: string;
  primary: boolean;
  accessRole: string | null;
  /** Guessed Buddy type from Google metadata */
  suggestedType: IcsCalendarType;
  /** Whether the user currently includes this calendar */
  selected: boolean;
  enabled: boolean;
  type: IcsCalendarType;
};

export type GoogleCalendarEvent = {
  calendarId: string;
  calendarName: string;
  color: string;
  type: IcsCalendarType;
  id: string;
  date: string;
  time: string | null;
  /** RFC3339 start when timed */
  startAt: string | null;
  /** End time HH:mm when timed */
  endTime: string | null;
  /** RFC3339 end when timed */
  endAt: string | null;
  summary: string;
  location: string | null;
  /** Event description / notes when present */
  description: string | null;
  /** Google Meet / Zoom / Teams URL when present */
  meetUrl: string | null;
  isBirthday: boolean;
};

function selectionsKey(userId: number): string {
  return `google_calendars_json_u${userId}`;
}

export function googleCalendarSourceId(googleCalId: string): string {
  return `google-cal:${googleCalId}`;
}

export function parseGoogleCalendarSourceId(
  sourceId: string
): string | null {
  if (!sourceId.startsWith("google-cal:")) return null;
  return sourceId.slice("google-cal:".length) || null;
}

function guessType(summary: string | null | undefined): IcsCalendarType {
  const s = (summary || "").toLowerCase();
  if (
    s.includes("geburtstag") ||
    s.includes("birthday") ||
    s.includes("birthdays")
  ) {
    return "birthday";
  }
  if (
    s.includes("ambri") ||
    s.includes("hockey") ||
    s.includes("eishockey") ||
    s.includes("national league")
  ) {
    return "hockey";
  }
  if (s.includes("feiertag") || s.includes("holiday") || s.includes("ferien")) {
    return "holiday";
  }
  if (s.includes("arbeit") || s.includes("work") || s.includes("job")) {
    return "work";
  }
  if (s.includes("familie") || s.includes("family")) {
    return "family";
  }
  if (s.includes("schule") || s.includes("school") || s.includes("unterricht")) {
    return "school";
  }
  if (s.includes("sport") || s.includes("hockey") || s.includes("fitness")) {
    return "sports";
  }
  return "other";
}

function normalizeHexColor(raw: string | null | undefined, fallback: string) {
  const v = (raw || "").trim();
  if (/^#[0-9a-fA-F]{6}$/.test(v)) return v;
  if (/^[0-9a-fA-F]{6}$/.test(v)) return `#${v}`;
  return fallback;
}

function readSelections(userId: number): GoogleCalendarSelection[] {
  const raw = getSetting(selectionsKey(userId));
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const out: GoogleCalendarSelection[] = [];
    for (const row of parsed) {
      const r = row as Partial<GoogleCalendarSelection>;
      const id = String(r.id || "").trim();
      if (!id) continue;
      const type =
        r.type && ICS_CALENDAR_TYPES.includes(r.type) ? r.type : undefined;
      const color =
        typeof r.color === "string" && /^#[0-9a-fA-F]{6}$/.test(r.color.trim())
          ? r.color.trim()
          : undefined;
      const name =
        typeof r.name === "string" && r.name.trim()
          ? r.name.trim().slice(0, 120)
          : undefined;
      out.push({
        id,
        enabled: r.enabled !== false,
        ...(name ? { name } : {}),
        ...(type ? { type } : {}),
        ...(color ? { color } : {}),
      });
    }
    return out;
  } catch {
    return [];
  }
}

export function saveGoogleCalendarSelections(
  userId: number,
  selections: GoogleCalendarSelection[]
): GoogleCalendarSelection[] {
  const cleaned = selections
    .map((s) => ({
      id: String(s.id || "").trim(),
      enabled: s.enabled !== false,
      ...(typeof s.name === "string" && s.name.trim()
        ? { name: s.name.trim().slice(0, 120) }
        : {}),
      ...(s.type && ICS_CALENDAR_TYPES.includes(s.type)
        ? { type: s.type }
        : {}),
      ...(typeof s.color === "string" &&
      /^#[0-9a-fA-F]{6}$/.test(s.color.trim())
        ? { color: s.color.trim() }
        : {}),
    }))
    .filter((s) => s.id);
  setSetting(selectionsKey(userId), JSON.stringify(cleaned));
  return cleaned;
}

export function getEnabledGoogleCalendarSelections(
  userId: number
): GoogleCalendarSelection[] {
  return readSelections(userId).filter((s) => s.enabled);
}

/** Live Google calendar list + local selection flags. */
export async function listGoogleCalendarsForUser(
  userId: number,
  request?: Request | null
): Promise<{
  connected: boolean;
  hasCalendarScope: boolean;
  calendars: GoogleCalendarListItem[];
}> {
  const connected = isGoogleMailConnected(userId);
  const hasCalendarScope = hasGoogleCalendarScope(userId);
  if (!connected || !hasCalendarScope) {
    return { connected, hasCalendarScope, calendars: [] };
  }

  const auth = await getAuthedGoogleClient(userId, request);
  const calendar = google.calendar({ version: "v3", auth });
  const selections = readSelections(userId);
  const byId = new Map(selections.map((s) => [s.id, s]));

  const calendars: GoogleCalendarListItem[] = [];
  let pageToken: string | undefined;
  do {
    const res = await calendar.calendarList.list({
      maxResults: 250,
      pageToken,
      showHidden: false,
    });
    for (const item of res.data.items || []) {
      const id = item.id?.trim();
      if (!id) continue;
      const suggestedType = guessType(item.summaryOverride || item.summary);
      const sel = byId.get(id);
      const color = normalizeHexColor(
        sel?.color || item.backgroundColor,
        ICS_TYPE_META[suggestedType].defaultColor
      );
      calendars.push({
        id,
        name: (item.summaryOverride || item.summary || id).trim(),
        description: item.description?.trim() || null,
        color,
        primary: Boolean(item.primary),
        accessRole: item.accessRole || null,
        suggestedType,
        selected: Boolean(sel),
        enabled: sel ? sel.enabled !== false : false,
        type: sel?.type || suggestedType,
      });
    }
    pageToken = res.data.nextPageToken || undefined;
  } while (pageToken);

  calendars.sort((a, b) => {
    if (a.primary !== b.primary) return a.primary ? -1 : 1;
    if (a.selected !== b.selected) return a.selected ? -1 : 1;
    return a.name.localeCompare(b.name, "de");
  });

  return { connected, hasCalendarScope, calendars };
}

function zurichTimeFromIso(iso: string): string | null {
  try {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Zurich",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(new Date(iso));
    const h = parts.find((p) => p.type === "hour")?.value;
    const m = parts.find((p) => p.type === "minute")?.value;
    if (!h || !m) return null;
    return `${h}:${m}`;
  } catch {
    return null;
  }
}

function zurichDateFromIso(iso: string): string | null {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Zurich",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(iso));
  } catch {
    return null;
  }
}

/**
 * Events from enabled selected Google calendars in [startIso, endIso].
 * Pass `listedCalendars` to skip a second calendarList.list round-trip.
 */
export async function listGoogleCalendarEventsInRange(
  userId: number,
  startIso: string,
  endIso: string,
  request?: Request | null,
  listedCalendars?: GoogleCalendarListItem[] | null
): Promise<GoogleCalendarEvent[]> {
  if (!isGoogleMailConnected(userId) || !hasGoogleCalendarScope(userId)) {
    return [];
  }
  const enabled = getEnabledGoogleCalendarSelections(userId);
  if (enabled.length === 0) return [];

  const auth = await getAuthedGoogleClient(userId, request);
  const calendar = google.calendar({ version: "v3", auth });

  const listed =
    listedCalendars ??
    (await listGoogleCalendarsForUser(userId, request)).calendars;
  const metaById = new Map(listed.map((c) => [c.id, c]));

  const timeMin = `${startIso.slice(0, 10)}T00:00:00Z`;
  const endExclusive = new Date(`${endIso.slice(0, 10)}T12:00:00Z`);
  endExclusive.setUTCDate(endExclusive.getUTCDate() + 1);
  const timeMax = `${endExclusive.toISOString().slice(0, 10)}T00:00:00Z`;

  const nonHockey = enabled.filter((sel) => {
    const meta = metaById.get(sel.id);
    const type = sel.type || meta?.type || "other";
    return type !== "hockey";
  });

  const batches = await Promise.all(
    nonHockey.map(async (sel) => {
      const meta = metaById.get(sel.id);
      const name = meta?.name || sel.name || sel.id;
      const type = sel.type || meta?.type || "other";
      const color =
        sel.color || meta?.color || ICS_TYPE_META[type].defaultColor;
      const isBirthdayCal = type === "birthday";
      const out: GoogleCalendarEvent[] = [];

      try {
        let pageToken: string | undefined;
        do {
          const res = await calendar.events.list({
            calendarId: sel.id,
            singleEvents: true,
            orderBy: "startTime",
            timeMin,
            timeMax,
            timeZone: "Europe/Zurich",
            maxResults: 250,
            pageToken,
          });
          for (const ev of res.data.items || []) {
            if (ev.status === "cancelled") continue;
            const allDay = Boolean(ev.start?.date && !ev.start?.dateTime);
            const date =
              ev.start?.date?.slice(0, 10) ||
              (ev.start?.dateTime
                ? zurichDateFromIso(ev.start.dateTime)
                : null);
            if (
              !date ||
              date < startIso.slice(0, 10) ||
              date > endIso.slice(0, 10)
            ) {
              continue;
            }
            const time = allDay
              ? null
              : ev.start?.dateTime
                ? zurichTimeFromIso(ev.start.dateTime)
                : null;
            const endTime = allDay
              ? null
              : ev.end?.dateTime
                ? zurichTimeFromIso(ev.end.dateTime)
                : null;
            const eventType = (ev.eventType || "").toLowerCase();
            const isBirthday = isBirthdayCal || eventType === "birthday";
            const summary = (ev.summary || "Termin").trim();
            const meetUrl =
              extractMeetUrl(
                ev.hangoutLink,
                ev.location,
                ev.description,
                (
                  ev as {
                    conferenceData?: {
                      entryPoints?: Array<{
                        entryPointType?: string | null;
                        uri?: string | null;
                      }>;
                    };
                  }
                ).conferenceData?.entryPoints?.find(
                  (ep) => ep.entryPointType === "video" && ep.uri
                )?.uri || null
              ) || null;
            out.push({
              calendarId: sel.id,
              calendarName: name,
              color,
              type: isBirthday ? "birthday" : type,
              id: ev.id || `${date}-${summary}`,
              date,
              time,
              startAt: ev.start?.dateTime || null,
              endTime,
              endAt: ev.end?.dateTime || null,
              summary,
              location: ev.location?.trim() || null,
              description: ev.description?.trim() || null,
              meetUrl,
              isBirthday,
            });
          }
          pageToken = res.data.nextPageToken || undefined;
        } while (pageToken);
      } catch {
        /* skip calendar on error (missing scope / deleted) */
      }
      return out;
    })
  );

  return batches.flat().sort((a, b) => {
    const c = a.date.localeCompare(b.date);
    if (c !== 0) return c;
    return (a.time || "99:99").localeCompare(b.time || "99:99");
  });
}

export type GoogleHockeyBundle = {
  calendarId: string;
  calendarName: string;
  color: string;
  games: HockeyGame[];
};

/** Enabled Google calendars with type=hockey → Ambri-style matchup games. */
export async function listGoogleHockeyGamesInRange(
  userId: number,
  startIso: string,
  endIso: string,
  request?: Request | null,
  listedCalendars?: GoogleCalendarListItem[] | null
): Promise<GoogleHockeyBundle[]> {
  if (!isGoogleMailConnected(userId) || !hasGoogleCalendarScope(userId)) {
    return [];
  }
  const enabled = getEnabledGoogleCalendarSelections(userId).filter(
    (s) => (s.type || "other") === "hockey"
  );
  if (enabled.length === 0) return [];

  const auth = await getAuthedGoogleClient(userId, request);
  const calendar = google.calendar({ version: "v3", auth });
  const listed =
    listedCalendars ??
    (await listGoogleCalendarsForUser(userId, request)).calendars;
  const metaById = new Map(listed.map((c) => [c.id, c]));

  const timeMin = `${startIso.slice(0, 10)}T00:00:00Z`;
  const endExclusive = new Date(`${endIso.slice(0, 10)}T12:00:00Z`);
  endExclusive.setUTCDate(endExclusive.getUTCDate() + 1);
  const timeMax = `${endExclusive.toISOString().slice(0, 10)}T00:00:00Z`;

  const bundles = await Promise.all(
    enabled.map(async (sel) => {
      const meta = metaById.get(sel.id);
      const name = sel.name || meta?.name || "Hockey";
      const color =
        sel.color || meta?.color || ICS_TYPE_META.hockey.defaultColor;
      const rawEvents: Array<{
        id: string;
        summary: string;
        date: string;
        time: string | null;
        location: string | null;
        startAt?: string | null;
      }> = [];

      try {
        let pageToken: string | undefined;
        do {
          const res = await calendar.events.list({
            calendarId: sel.id,
            singleEvents: true,
            orderBy: "startTime",
            timeMin,
            timeMax,
            timeZone: "Europe/Zurich",
            maxResults: 250,
            pageToken,
          });
          for (const ev of res.data.items || []) {
            if (ev.status === "cancelled") continue;
            const allDay = Boolean(ev.start?.date && !ev.start?.dateTime);
            const date =
              ev.start?.date?.slice(0, 10) ||
              (ev.start?.dateTime
                ? zurichDateFromIso(ev.start.dateTime)
                : null);
            if (
              !date ||
              date < startIso.slice(0, 10) ||
              date > endIso.slice(0, 10)
            ) {
              continue;
            }
            const time = allDay
              ? null
              : ev.start?.dateTime
                ? zurichTimeFromIso(ev.start.dateTime)
                : null;
            rawEvents.push({
              id: ev.id || `${date}-${ev.summary || "game"}`,
              summary: (ev.summary || "").trim(),
              date,
              time,
              location: ev.location?.trim() || null,
              startAt: ev.start?.dateTime || null,
            });
          }
          pageToken = res.data.nextPageToken || undefined;
        } while (pageToken);
      } catch {
        return null;
      }

      const games = parseHockeyGamesFromGoogleEvents(rawEvents);
      if (games.length === 0) return null;
      return {
        calendarId: sel.id,
        calendarName: name,
        color,
        games,
      } satisfies GoogleHockeyBundle;
    })
  );

  return bundles.filter((b): b is GoogleHockeyBundle => b != null);
}

/**
 * One calendarList.list + parallel events + hockey fetches for agenda.
 */
export async function listGoogleAgendaInRange(
  userId: number,
  startIso: string,
  endIso: string,
  request?: Request | null
): Promise<{
  events: GoogleCalendarEvent[];
  hockey: GoogleHockeyBundle[];
}> {
  if (!isGoogleMailConnected(userId) || !hasGoogleCalendarScope(userId)) {
    return { events: [], hockey: [] };
  }
  const listed = (await listGoogleCalendarsForUser(userId, request)).calendars;
  const [events, hockey] = await Promise.all([
    listGoogleCalendarEventsInRange(
      userId,
      startIso,
      endIso,
      request,
      listed
    ),
    listGoogleHockeyGamesInRange(userId, startIso, endIso, request, listed),
  ]);
  return { events, hockey };
}
