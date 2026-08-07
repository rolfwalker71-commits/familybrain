import { randomUUID } from "crypto";
import { getDb } from "@/lib/db/client";
import { getSetting, setSetting } from "@/lib/db/migrations";
import type { AuthContext } from "@/lib/auth/current-user";

/** Legacy global key — migrated to Rolf once an app user «Rolf» exists. */
export const ICS_CALENDARS_LEGACY_SETTING = "ics_calendars_json";

export function icsCalendarsSettingKey(userId: number): string {
  return `ics_calendars_json_u${userId}`;
}

/** Public Ambri calendar (Google) — optional built-in hockey feed per user. */
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
  "birthday",
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
  birthday: {
    label: "Geburtstage",
    defaultColor: "#ec4899",
    defaultName: "Geburtstage",
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
  const isAmbri = id === AMBRI_CALENDAR_ID;
  return {
    id,
    name: name.slice(0, 80),
    url,
    enabled: raw.enabled !== false,
    color,
    type: isAmbri ? "hockey" : type,
    builtin: isAmbri || Boolean(raw.builtin),
  };
}

function parseCalendarList(raw: string | null): IcsCalendar[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((row) => normalizeCalendar(row as Partial<IcsCalendar>))
      .filter((c): c is IcsCalendar => Boolean(c));
  } catch {
    return [];
  }
}

/** App-User «Rolf» (username oder display_name), falls vorhanden. */
export function findRolfAppUserId(): number | null {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT id FROM users
       WHERE active = 1
         AND (
           username = 'Rolf' COLLATE NOCASE
           OR display_name = 'Rolf' COLLATE NOCASE
         )
       ORDER BY is_admin DESC, id ASC
       LIMIT 1`
    )
    .get() as { id: number } | undefined;
  return row?.id ?? null;
}

/**
 * Move legacy global `ics_calendars_json` onto Rolf's per-user key once.
 * Safe to call repeatedly.
 */
export function migrateLegacyIcsCalendarsToRolf(): {
  migrated: boolean;
  userId: number | null;
} {
  const legacy = getSetting(ICS_CALENDARS_LEGACY_SETTING);
  if (!legacy) return { migrated: false, userId: findRolfAppUserId() };

  const rolfId = findRolfAppUserId();
  if (rolfId == null) return { migrated: false, userId: null };

  const key = icsCalendarsSettingKey(rolfId);
  const existing = getSetting(key);
  if (!existing) {
    setSetting(key, legacy);
  } else {
    const userList = parseCalendarList(existing);
    const legacyList = parseCalendarList(legacy);
    const ids = new Set(userList.map((c) => c.id));
    const merged = [
      ...userList,
      ...legacyList.filter((c) => !ids.has(c.id)),
    ];
    setSetting(key, JSON.stringify(merged));
  }
  setSetting(ICS_CALENDARS_LEGACY_SETTING, null);
  return { migrated: true, userId: rolfId };
}

/**
 * Resolve which app user owns ICS calendars for this session.
 * Env-admin (userId null) → Rolf, if that app user exists.
 */
export function resolveCalendarUserId(
  auth: Pick<AuthContext, "userId" | "username" | "isAdmin">
): number | null {
  migrateLegacyIcsCalendarsToRolf();
  if (auth.userId != null) return auth.userId;

  const byName = getDb()
    .prepare(
      `SELECT id FROM users
       WHERE active = 1 AND username = ? COLLATE NOCASE
       LIMIT 1`
    )
    .get(auth.username.trim()) as { id: number } | undefined;
  if (byName?.id) return byName.id;

  return findRolfAppUserId();
}

export function listIcsCalendars(userId: number): IcsCalendar[] {
  migrateLegacyIcsCalendarsToRolf();
  return parseCalendarList(getSetting(icsCalendarsSettingKey(userId)));
}

/**
 * Per-user list, or legacy global while no calendar owner userId is resolved yet
 * (Env-Admin without App-User «Rolf»).
 */
export function listIcsCalendarsForOwner(
  userId: number | null
): IcsCalendar[] {
  migrateLegacyIcsCalendarsToRolf();
  if (userId != null) return listIcsCalendars(userId);
  return parseCalendarList(getSetting(ICS_CALENDARS_LEGACY_SETTING));
}

export function saveIcsCalendars(
  userId: number | null,
  calendars: IcsCalendar[]
): IcsCalendar[] {
  const cleaned = calendars
    .map((c) => normalizeCalendar(c))
    .filter((c): c is IcsCalendar => Boolean(c));
  const ambri = cleaned.find((c) => c.id === AMBRI_CALENDAR_ID);
  const withoutAmbri = cleaned.filter((c) => c.id !== AMBRI_CALENDAR_ID);
  const next = ambri
    ? [{ ...ambri, type: "hockey" as const, builtin: true }, ...withoutAmbri]
    : withoutAmbri;
  const key =
    userId != null
      ? icsCalendarsSettingKey(userId)
      : ICS_CALENDARS_LEGACY_SETTING;
  setSetting(key, JSON.stringify(next));
  return next;
}

export function getEnabledIcsCalendars(
  userId: number | null
): IcsCalendar[] {
  return listIcsCalendarsForOwner(userId).filter((c) => c.enabled);
}

export function upsertIcsCalendar(
  userId: number | null,
  input: Partial<IcsCalendar> & { name: string; url: string }
): IcsCalendar[] {
  const list = listIcsCalendarsForOwner(userId);
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
  return saveIcsCalendars(userId, next);
}

export function deleteIcsCalendar(
  userId: number | null,
  id: string
): IcsCalendar[] {
  if (id === AMBRI_CALENDAR_ID) {
    const ambri =
      listIcsCalendarsForOwner(userId).find(
        (c) => c.id === AMBRI_CALENDAR_ID
      ) || ambriSeed();
    return upsertIcsCalendar(userId, { ...ambri, enabled: false });
  }
  return saveIcsCalendars(
    userId,
    listIcsCalendarsForOwner(userId).filter((c) => c.id !== id)
  );
}

export function setIcsCalendarEnabled(
  userId: number | null,
  id: string,
  enabled: boolean
): IcsCalendar[] {
  const list = listIcsCalendarsForOwner(userId);
  const row = list.find((c) => c.id === id);
  if (!row) return list;
  return upsertIcsCalendar(userId, { ...row, enabled });
}

/** Add Ambri to a user's list if missing. */
export function ensureAmbriForUser(userId: number): IcsCalendar[] {
  const list = listIcsCalendars(userId);
  if (list.some((c) => c.id === AMBRI_CALENDAR_ID)) return list;
  return saveIcsCalendars(userId, [ambriSeed(), ...list]);
}
