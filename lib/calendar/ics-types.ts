/** Client-safe ICS calendar types/meta (no Node/DB imports). */

export const ICS_CALENDAR_TYPES = [
  "hockey",
  "school",
  "waste",
  "church",
  "sports",
  "family",
  "birthday",
  "work",
  "work_rolf",
  "work_valentyna",
  "holiday",
  "private",
  "other",
] as const;

export type IcsCalendarType = (typeof ICS_CALENDAR_TYPES)[number];

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
  work_rolf: {
    label: "Arbeit Rolf",
    defaultColor: "#0f766e",
    defaultName: "Arbeit Rolf",
  },
  work_valentyna: {
    label: "Arbeit Valentyna",
    defaultColor: "#0d9488",
    defaultName: "Arbeit Valentyna",
  },
  holiday: {
    label: "Ferien / Feiertage",
    defaultColor: "#8b5cf6",
    defaultName: "Ferien",
  },
  private: {
    label: "Privat",
    defaultColor: "#0369a1",
    defaultName: "Privat",
  },
  other: {
    label: "Sonstiges",
    defaultColor: "#64748b",
    defaultName: "Kalender",
  },
};

/** Generic or person-specific work calendars. */
export function isWorkCalendarType(
  type: string | null | undefined
): boolean {
  const t = String(type || "").toLowerCase();
  return t === "work" || t === "work_rolf" || t === "work_valentyna";
}
