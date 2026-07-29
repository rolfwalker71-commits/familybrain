import { daysUntil } from "@/lib/utils/due-urgency";

/** Horizon buckets for deadlines / warranties / due lists. */
export type TimeBucketId =
  | "overdue"
  | "week"
  | "twoWeeks"
  | "month"
  | "halfYear"
  | "year"
  | "later"
  | "none";

export type TimeBucketDef = {
  id: TimeBucketId;
  title: string;
  defaultOpen: boolean;
  accent: "red" | "orange" | "amber" | "muted";
};

export const TIME_BUCKET_DEFS: TimeBucketDef[] = [
  {
    id: "overdue",
    title: "Überfällig",
    defaultOpen: true,
    accent: "red",
  },
  {
    id: "week",
    title: "Nächste Woche",
    defaultOpen: true,
    accent: "orange",
  },
  {
    id: "twoWeeks",
    title: "Nächste 2 Wochen",
    defaultOpen: true,
    accent: "orange",
  },
  {
    id: "month",
    title: "Nächster Monat",
    defaultOpen: true,
    accent: "amber",
  },
  {
    id: "halfYear",
    title: "Nächstes halbes Jahr",
    defaultOpen: false,
    accent: "muted",
  },
  {
    id: "year",
    title: "Nächstes Jahr",
    defaultOpen: false,
    accent: "muted",
  },
  {
    id: "later",
    title: "Später",
    defaultOpen: false,
    accent: "muted",
  },
  {
    id: "none",
    title: "Ohne Datum",
    defaultOpen: false,
    accent: "muted",
  },
];

export function timeBucketForDate(
  isoDate: string | null | undefined,
  today = new Date().toISOString().slice(0, 10)
): TimeBucketId {
  const days = daysUntil(isoDate, today);
  if (days == null) return "none";
  if (days < 0) return "overdue";
  if (days <= 7) return "week";
  if (days <= 14) return "twoWeeks";
  if (days <= 30) return "month";
  if (days <= 182) return "halfYear";
  if (days <= 365) return "year";
  return "later";
}

export function groupByTimeBucket<T>(
  rows: T[],
  getDate: (row: T) => string | null | undefined,
  today = new Date().toISOString().slice(0, 10)
): Array<TimeBucketDef & { rows: T[] }> {
  const buckets = new Map<TimeBucketId, T[]>();
  for (const def of TIME_BUCKET_DEFS) buckets.set(def.id, []);
  for (const row of rows) {
    const id = timeBucketForDate(getDate(row), today);
    buckets.get(id)!.push(row);
  }
  return TIME_BUCKET_DEFS.map((def) => ({
    ...def,
    rows: buckets.get(def.id) || [],
  })).filter((b) => b.rows.length > 0);
}
