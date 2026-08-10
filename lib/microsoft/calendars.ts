import { getSetting, setSetting } from "@/lib/db/migrations";
import {
  ICS_CALENDAR_TYPES,
  ICS_TYPE_META,
  type IcsCalendarType,
} from "@/lib/calendar/ics-calendars";
import { extractMeetUrl } from "@/lib/calendar/meet-url";
import { graphJson } from "@/lib/microsoft/graph";
import {
  hasMicrosoftCalendarScope,
  isMicrosoftConnected,
} from "@/lib/microsoft/oauth";
import { dayWindowLocal } from "@/lib/microsoft/time";

export type MicrosoftCalendarSelection = {
  id: string;
  enabled: boolean;
  name?: string;
  type?: IcsCalendarType;
  color?: string;
  planningRelevant?: boolean;
};

export type MicrosoftCalendarListItem = {
  id: string;
  name: string;
  color: string;
  primary: boolean;
  canEdit: boolean;
  suggestedType: IcsCalendarType;
  selected: boolean;
  enabled: boolean;
  type: IcsCalendarType;
  planningRelevant: boolean;
};

export type MicrosoftCalendarEvent = {
  calendarId: string;
  calendarName: string;
  color: string;
  type: IcsCalendarType;
  id: string;
  date: string;
  time: string | null;
  endTime: string | null;
  summary: string;
  location: string | null;
  description: string | null;
  meetUrl: string | null;
  isBirthday: boolean;
  planningRelevant: boolean;
  webLink: string | null;
};

function selectionsKey(userId: number): string {
  return `microsoft_calendars_json_u${userId}`;
}

export function microsoftCalendarSourceId(msCalId: string): string {
  return `ms-cal:${msCalId}`;
}

export function parseMicrosoftCalendarSourceId(
  sourceId: string
): string | null {
  if (!sourceId.startsWith("ms-cal:")) return null;
  return sourceId.slice("ms-cal:".length) || null;
}

function guessType(name: string | null | undefined): IcsCalendarType {
  const s = (name || "").toLowerCase();
  if (/geburtstag|birthday/.test(s)) return "birthday";
  if (/valentyna/.test(s) && /arbeit|work|job|geschäft|business|office|arbeitsplan|schicht/.test(s)) {
    return "work_valentyna";
  }
  if (/rolf/.test(s) && /arbeit|work|job|geschäft|business|office|arbeitsplan|schicht/.test(s)) {
    return "work_rolf";
  }
  if (/arbeit|work|job|geschäft|business|office/.test(s)) return "work";
  if (/familie|family/.test(s)) return "family";
  if (/privat|private|personal/.test(s)) return "private";
  if (/ferien|feiertag|holiday/.test(s)) return "holiday";
  if (/schule|school/.test(s)) return "school";
  if (/sport|fitness/.test(s)) return "sports";
  return "other";
}

function normalizeHexColor(raw: string | null | undefined, fallback: string) {
  const v = (raw || "").trim();
  if (/^#[0-9a-fA-F]{6}$/.test(v)) return v;
  if (/^[0-9a-fA-F]{6}$/.test(v)) return `#${v}`;
  return fallback;
}

/** Graph hexColor is often "Auto" or named — map a few, else fallback. */
function graphColorToHex(
  hexColor: string | null | undefined,
  fallback: string
): string {
  const raw = (hexColor || "").trim();
  if (/^#[0-9a-fA-F]{6}$/.test(raw)) return raw;
  const named: Record<string, string> = {
    lightblue: "#60a5fa",
    lightgreen: "#86efac",
    lightorange: "#fdba74",
    lightgray: "#94a3b8",
    lightyellow: "#fde047",
    lightteal: "#5eead4",
    lightpink: "#f9a8d4",
    lightbrown: "#d6a07a",
    lightred: "#fca5a5",
    maxdarkblue: "#1e3a8a",
    darkblue: "#1d4ed8",
    darkgreen: "#15803d",
    darkorange: "#c2410c",
    darkred: "#b91c1c",
    darkpink: "#be185d",
    darkbrown: "#78350f",
    darkteal: "#0f766e",
  };
  const key = raw.toLowerCase().replace(/\s+/g, "");
  return named[key] || fallback;
}

function readSelections(userId: number): MicrosoftCalendarSelection[] {
  const raw = getSetting(selectionsKey(userId));
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const out: MicrosoftCalendarSelection[] = [];
    for (const row of parsed) {
      const r = row as Partial<MicrosoftCalendarSelection>;
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
        planningRelevant: r.planningRelevant !== false,
      });
    }
    return out;
  } catch {
    return [];
  }
}

export function saveMicrosoftCalendarSelections(
  userId: number,
  selections: MicrosoftCalendarSelection[]
): MicrosoftCalendarSelection[] {
  const cleaned = selections
    .map((s) => ({
      id: String(s.id || "").trim(),
      enabled: s.enabled !== false,
      planningRelevant: s.planningRelevant !== false,
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

export function getEnabledMicrosoftCalendarSelections(
  userId: number
): MicrosoftCalendarSelection[] {
  return readSelections(userId).filter((s) => s.enabled);
}

type GraphCalendar = {
  id?: string;
  name?: string | null;
  hexColor?: string | null;
  color?: string | null;
  isDefaultCalendar?: boolean;
  canEdit?: boolean;
};

/** Live Graph calendar list + local selection flags. */
export async function listMicrosoftCalendarsForUser(
  userId: number
): Promise<{
  connected: boolean;
  hasCalendarScope: boolean;
  calendars: MicrosoftCalendarListItem[];
}> {
  const connected = isMicrosoftConnected(userId);
  const hasCalendarScope = hasMicrosoftCalendarScope(userId);
  if (!connected || !hasCalendarScope) {
    return { connected, hasCalendarScope, calendars: [] };
  }

  const selections = readSelections(userId);
  const byId = new Map(selections.map((s) => [s.id, s]));

  const data = await graphJson<{ value?: GraphCalendar[] }>(
    userId,
    "/me/calendars?$top=100&$select=id,name,hexColor,color,isDefaultCalendar,canEdit"
  );

  const calendars: MicrosoftCalendarListItem[] = [];
  for (const item of data.value || []) {
    const id = item.id?.trim();
    if (!id) continue;
    const name = (item.name || id).trim();
    const suggestedType = guessType(name);
    const sel = byId.get(id);
    const color = normalizeHexColor(
      sel?.color ||
        graphColorToHex(
          item.hexColor || item.color,
          ICS_TYPE_META[suggestedType].defaultColor
        ),
      ICS_TYPE_META[suggestedType].defaultColor
    );
    calendars.push({
      id,
      name,
      color,
      primary: Boolean(item.isDefaultCalendar),
      canEdit: item.canEdit !== false,
      suggestedType,
      selected: Boolean(sel),
      enabled: sel ? sel.enabled !== false : false,
      type: sel?.type || suggestedType,
      planningRelevant: sel ? sel.planningRelevant !== false : true,
    });
  }

  calendars.sort((a, b) => {
    if (a.primary !== b.primary) return a.primary ? -1 : 1;
    if (a.selected !== b.selected) return a.selected ? -1 : 1;
    return a.name.localeCompare(b.name, "de");
  });

  return { connected, hasCalendarScope, calendars };
}

type GraphDateTime = {
  dateTime?: string | null;
  timeZone?: string | null;
};

type GraphEvent = {
  id?: string;
  subject?: string | null;
  bodyPreview?: string | null;
  body?: { content?: string | null; contentType?: string | null } | null;
  start?: GraphDateTime;
  end?: GraphDateTime;
  isAllDay?: boolean;
  location?: { displayName?: string | null } | null;
  onlineMeeting?: { joinUrl?: string | null } | null;
  onlineMeetingUrl?: string | null;
  webLink?: string | null;
  categories?: string[] | null;
};

function parseLocal(dt: GraphDateTime | undefined): {
  date: string;
  hm: string | null;
} {
  const raw = (dt?.dateTime || "").trim();
  if (!raw) return { date: "", hm: null };
  const date = raw.slice(0, 10);
  const hmMatch = /T(\d{2}):(\d{2})/.exec(raw);
  return {
    date,
    hm: hmMatch ? `${hmMatch[1]}:${hmMatch[2]}` : null,
  };
}

/**
 * Events from enabled selected Microsoft calendars in [startYmd, endYmd].
 */
export async function listMicrosoftCalendarEventsInRange(
  userId: number,
  startYmd: string,
  endYmd: string,
  listedCalendars?: MicrosoftCalendarListItem[] | null
): Promise<MicrosoftCalendarEvent[]> {
  if (!isMicrosoftConnected(userId) || !hasMicrosoftCalendarScope(userId)) {
    return [];
  }
  const enabled = getEnabledMicrosoftCalendarSelections(userId);
  if (enabled.length === 0) return [];

  const listed =
    listedCalendars ??
    (await listMicrosoftCalendarsForUser(userId)).calendars;
  const metaById = new Map(listed.map((c) => [c.id, c]));

  const { start } = dayWindowLocal(startYmd.slice(0, 10));
  const { end } = dayWindowLocal(endYmd.slice(0, 10));

  const batches = await Promise.all(
    enabled.map(async (sel) => {
      const meta = metaById.get(sel.id);
      const name = meta?.name || sel.name || sel.id;
      const type = sel.type || meta?.type || "other";
      const color =
        sel.color || meta?.color || ICS_TYPE_META[type].defaultColor;
      const planningRelevant = sel.planningRelevant !== false;
      const isBirthdayCal = type === "birthday";
      const out: MicrosoftCalendarEvent[] = [];

      try {
        const qs = new URLSearchParams({
          startDateTime: start,
          endDateTime: end,
          $select:
            "id,subject,bodyPreview,body,start,end,isAllDay,location,onlineMeeting,onlineMeetingUrl,webLink,categories",
          $orderby: "start/dateTime",
          $top: "250",
        });
        const data = await graphJson<{ value?: GraphEvent[] }>(
          userId,
          `/me/calendars/${encodeURIComponent(sel.id)}/calendarView?${qs}`,
          { headers: { Prefer: 'outlook.timezone="Europe/Zurich"' } }
        );
        for (const ev of data.value || []) {
          if (!ev.id) continue;
          const startP = parseLocal(ev.start);
          const endP = parseLocal(ev.end);
          if (
            !startP.date ||
            startP.date < startYmd.slice(0, 10) ||
            startP.date > endYmd.slice(0, 10)
          ) {
            continue;
          }
          const allDay = Boolean(ev.isAllDay);
          const summary = (ev.subject || "Termin").trim();
          const desc =
            ev.body?.contentType?.toLowerCase() === "text"
              ? ev.body.content?.trim() || null
              : ev.bodyPreview?.trim() || null;
          const meetUrl =
            extractMeetUrl(
              ev.onlineMeeting?.joinUrl,
              ev.onlineMeetingUrl,
              ev.location?.displayName,
              desc
            ) || null;
          const cats = (ev.categories || []).join(" ").toLowerCase();
          const isBirthday =
            isBirthdayCal ||
            /geburtstag|birthday/.test(summary.toLowerCase()) ||
            /geburtstag|birthday/.test(cats);
          out.push({
            calendarId: sel.id,
            calendarName: name,
            color,
            type: isBirthday ? "birthday" : type,
            id: ev.id,
            date: startP.date,
            time: allDay ? null : startP.hm,
            endTime: allDay ? null : endP.hm,
            summary,
            location: ev.location?.displayName?.trim() || null,
            description: desc,
            meetUrl,
            isBirthday,
            planningRelevant,
            webLink: ev.webLink || null,
          });
        }
      } catch {
        /* skip calendar on error */
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

export async function listMicrosoftAgendaInRange(
  userId: number,
  startYmd: string,
  endYmd: string
): Promise<{ events: MicrosoftCalendarEvent[] }> {
  if (!isMicrosoftConnected(userId) || !hasMicrosoftCalendarScope(userId)) {
    return { events: [] };
  }
  const listed = (await listMicrosoftCalendarsForUser(userId)).calendars;
  const events = await listMicrosoftCalendarEventsInRange(
    userId,
    startYmd,
    endYmd,
    listed
  );
  return { events };
}
