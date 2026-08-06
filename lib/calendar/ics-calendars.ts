import { randomUUID } from "crypto";
import { getSetting, setSetting } from "@/lib/db/migrations";

export const ICS_CALENDARS_SETTING = "ics_calendars_json";

/** Public Ambri calendar (Google) — seeded as built-in hockey feed. */
export const AMBRI_ICS_URL =
  "https://calendar.google.com/calendar/ical/c_f974949164df4b0605b30aa319f918570bb7b00ebb7514e06558dad73706f8cd%40group.calendar.google.com/public/basic.ics";

export const AMBRI_CALENDAR_ID = "builtin-ambri";

export const ICS_CALENDAR_TYPES = [
  "hockey",
  "school",
  "waste",
  "church",
  "sports",
  "family",
  "work",
  "holiday",
  "other",
] as const;

export type IcsCalendarType = (typeof ICS_CALENDAR_TYPES)[number];

export type IcsCalendar = {
  id: string;
  name: string;
  url: string;
  enabled: boolean;
  color: string;
  type: IcsCalendarType;
  /** Built-in Ambri row — URL editable but type locked to hockey. */
  builtin?: boolean;
};

export const ICS_TYPE_META: Record<
  IcsCalendarType,
  { label: string; defaultColor: string; defaultName: string }
> = {
  hockey: {
    label: "Hockey",
    defaultColor: "#e11d48",
    defaultName: "Hockey",
  },
  school: {
    label: "Schule",
    defaultColor: "#2563eb",
    defaultName: "Schule",
  },
  waste: {
    label: "Abfall",
    defaultColor: "#78836c",
    defaultName: "Entsorgung",
  },
  church: {
    label: "Kirche",
    defaultColor: "#7c3aed",
    defaultName: "Kirche",
  },
  sports: {
    label: "Sport",
    defaultColor: "#ea580c",
    defaultName: "Sport",
  },
  family: {
    label: "Familie",
    defaultColor: "#db2777",
    defaultName: "Familie",
  },
  work: {
    label: "Arbeit",
    defaultColor: "#0f766e",
    defaultName: "Arbeit",
  },
  holiday: {
    label: "Ferien / Feiertage",
    defaultColor: "#8b5cf6",
    defaultName: "Ferien",
  },
  other: {
    label: "Sonstiges",
    defaultColor: "#64748b",
    defaultName: "Kalender",
  },
};

function ambriSeed(): IcsCalendar {
  return {
    id: AMBRI_CALENDAR_ID,
    name: "HC Ambri-Piotta",
    url: AMBRI_ICS_URL,
    enabled: true,
    color: ICS_TYPE_META.hockey.defaultColor,
    type: "hockey",
    builtin: true,
  };
}

function normalizeCalendar(raw: Partial<IcsCalendar>): IcsCalendar | null {
  const id = String(raw.id || "").trim();
  const url = String(raw.url || "").trim();
  const name = String(raw.name || "").trim();
  if (!id || !url || !name) return null;
  const type = ICS_CALENDAR_TYPES.includes(raw.type as IcsCalendarType)
    ? (raw.type as IcsCalendarType)
    : "other";
  const color =
    typeof raw.color === "string" && /^#[0-9a-fA-F]{6}$/.test(raw.color.trim())
      ? raw.color.trim()
      : ICS_TYPE_META[type].defaultColor;
  return {
    id,
    name: name.slice(0, 80),
    url,
    enabled: raw.enabled !== false,
    color,
    type: id === AMBRI_CALENDAR_ID ? "hockey" : type,
    builtin: id === AMBRI_CALENDAR_ID || Boolean(raw.builtin),
  };
}

export function listIcsCalendars(): IcsCalendar[] {
  const raw = getSetting(ICS_CALENDARS_SETTING);
  let list: IcsCalendar[] = [];
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) {
        list = parsed
          .map((row) => normalizeCalendar(row as Partial<IcsCalendar>))
          .filter((c): c is IcsCalendar => Boolean(c));
      }
    } catch {
      list = [];
    }
  }

  if (!list.some((c) => c.id === AMBRI_CALENDAR_ID)) {
    list = [ambriSeed(), ...list];
    saveIcsCalendars(list);
  }

  return list;
}

export function saveIcsCalendars(calendars: IcsCalendar[]): IcsCalendar[] {
  const cleaned = calendars
    .map((c) => normalizeCalendar(c))
    .filter((c): c is IcsCalendar => Boolean(c));
  // Ensure Ambri exists exactly once
  const withoutAmbri = cleaned.filter((c) => c.id !== AMBRI_CALENDAR_ID);
  const ambri =
    cleaned.find((c) => c.id === AMBRI_CALENDAR_ID) || ambriSeed();
  const next = [
    { ...ambri, type: "hockey" as const, builtin: true },
    ...withoutAmbri,
  ];
  setSetting(ICS_CALENDARS_SETTING, JSON.stringify(next));
  return next;
}

export function getEnabledIcsCalendars(): IcsCalendar[] {
  return listIcsCalendars().filter((c) => c.enabled);
}

export function upsertIcsCalendar(
  input: Partial<IcsCalendar> & { name: string; url: string }
): IcsCalendar[] {
  const list = listIcsCalendars();
  const id = input.id?.trim() || randomUUID();
  const existing = list.find((c) => c.id === id);
  const type =
    id === AMBRI_CALENDAR_ID
      ? "hockey"
      : ICS_CALENDAR_TYPES.includes(input.type as IcsCalendarType)
        ? (input.type as IcsCalendarType)
        : existing?.type || "other";
  const row = normalizeCalendar({
    id,
    name: input.name,
    url: input.url,
    enabled: input.enabled ?? existing?.enabled ?? true,
    color: input.color || existing?.color || ICS_TYPE_META[type].defaultColor,
    type,
    builtin: id === AMBRI_CALENDAR_ID,
  });
  if (!row) return list;
  const next = existing
    ? list.map((c) => (c.id === id ? row : c))
    : [...list, row];
  return saveIcsCalendars(next);
}

export function deleteIcsCalendar(id: string): IcsCalendar[] {
  if (id === AMBRI_CALENDAR_ID) {
    const ambri =
      listIcsCalendars().find((c) => c.id === AMBRI_CALENDAR_ID) ||
      ambriSeed();
    return upsertIcsCalendar({ ...ambri, enabled: false });
  }
  return saveIcsCalendars(listIcsCalendars().filter((c) => c.id !== id));
}

export function setIcsCalendarEnabled(
  id: string,
  enabled: boolean
): IcsCalendar[] {
  const list = listIcsCalendars();
  const row = list.find((c) => c.id === id);
  if (!row) return list;
  return upsertIcsCalendar({ ...row, enabled });
}
