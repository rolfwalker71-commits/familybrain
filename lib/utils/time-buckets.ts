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

export type TimeBucketPreset = "finance" | "deadlines" | "warranties";

export type TimeBucketDef = {
  id: TimeBucketId;
  title: string;
  defaultOpen: boolean;
  accent: "red" | "orange" | "amber" | "muted";
};

const BASE: Record<TimeBucketId, TimeBucketDef> = {
  overdue: {
    id: "overdue",
    title: "Überfällig",
    defaultOpen: true,
    accent: "red",
  },
  week: {
    id: "week",
    title: "Nächste Woche",
    defaultOpen: true,
    accent: "orange",
  },
  twoWeeks: {
    id: "twoWeeks",
    title: "Nächste 2 Wochen",
    defaultOpen: true,
    accent: "orange",
  },
  month: {
    id: "month",
    title: "Nächster Monat",
    defaultOpen: true,
    accent: "amber",
  },
  halfYear: {
    id: "halfYear",
    title: "Nächstes halbes Jahr",
    defaultOpen: false,
    accent: "muted",
  },
  year: {
    id: "year",
    title: "Nächstes Jahr",
    defaultOpen: false,
    accent: "muted",
  },
  later: {
    id: "later",
    title: "Später",
    defaultOpen: false,
    accent: "muted",
  },
  none: {
    id: "none",
    title: "Ohne Datum",
    defaultOpen: false,
    accent: "muted",
  },
};

/** Display order + label/open overrides per context. */
const PRESET: Record<
  TimeBucketPreset,
  {
    order: TimeBucketId[];
    overrides: Partial<Record<TimeBucketId, Partial<TimeBucketDef>>>;
  }
> = {
  finance: {
    order: [
      "overdue",
      "week",
      "twoWeeks",
      "month",
      "halfYear",
      "year",
      "later",
      "none",
    ],
    overrides: {},
  },
  deadlines: {
    // Aktuelle Fristen zuerst; Verfallene ans Ende, zugeklappt
    order: [
      "week",
      "twoWeeks",
      "month",
      "halfYear",
      "year",
      "later",
      "none",
      "overdue",
    ],
    overrides: {
      overdue: { title: "Verfallen", defaultOpen: false },
      week: { defaultOpen: true },
      twoWeeks: { defaultOpen: false },
      month: { defaultOpen: false },
    },
  },
  warranties: {
    // Nächster Monat zuerst; Abgelaufene ans Ende, zugeklappt
    order: [
      "month",
      "week",
      "twoWeeks",
      "halfYear",
      "year",
      "later",
      "none",
      "overdue",
    ],
    overrides: {
      overdue: { title: "Abgelaufen", defaultOpen: false },
      month: { defaultOpen: true },
      week: { defaultOpen: false },
      twoWeeks: { defaultOpen: false },
    },
  },
};

/** @deprecated Prefer resolveBucketDefs(preset) — kept for callers expecting a flat list. */
export const TIME_BUCKET_DEFS: TimeBucketDef[] = PRESET.finance.order.map(
  (id) => ({ ...BASE[id], ...PRESET.finance.overrides[id] })
);

export function resolveBucketDefs(preset: TimeBucketPreset): TimeBucketDef[] {
  const { order, overrides } = PRESET[preset];
  return order.map((id) => ({ ...BASE[id], ...overrides[id] }));
}

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
  today = new Date().toISOString().slice(0, 10),
  preset: TimeBucketPreset = "finance"
): Array<TimeBucketDef & { rows: T[] }> {
  const defs = resolveBucketDefs(preset);
  const buckets = new Map<TimeBucketId, T[]>();
  for (const def of defs) buckets.set(def.id, []);
  for (const row of rows) {
    const id = timeBucketForDate(getDate(row), today);
    buckets.get(id)!.push(row);
  }
  return defs
    .map((def) => ({
      ...def,
      rows: buckets.get(def.id) || [],
    }))
    .filter((b) => b.rows.length > 0);
}
