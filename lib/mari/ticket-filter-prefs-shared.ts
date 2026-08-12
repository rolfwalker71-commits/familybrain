/** Client-safe Maringo ticket filter / list-meta types (no Node/SQLite). */

export type MariTicketFilterMode = "handler" | "customer";

/** Verlauf: newest = aktuellste Nachricht oben */
export type MariTimelineSort = "newest" | "oldest";

/** Ticketliste: newest = neueste Anfrage oben */
export type MariListSort = "newest" | "oldest";

/** Meta-Zeile in der Ticketliste (Stundenbuchung-relevant). */
export type MariListMetaField =
  | "kunde"
  | "projekt"
  | "vertrag"
  | "aktivitaet"
  | "seit"
  | "geaendert";

export const MARI_LIST_META_FIELD_OPTIONS: {
  id: MariListMetaField;
  label: string;
  hint: string;
}[] = [
  {
    id: "kunde",
    label: "Kunde",
    hint: "Matchcode / CardCode",
  },
  {
    id: "projekt",
    label: "Projekt",
    hint: "Kunde (Projektnummer)",
  },
  {
    id: "vertrag",
    label: "Vertrag",
    hint: "Vertragsnummer oder -ID",
  },
  {
    id: "aktivitaet",
    label: "Aktivität",
    hint: "Ticket-Betreff → Vorbelegung Aktivität",
  },
  {
    id: "seit",
    label: "Seit",
    hint: "Anfragedatum",
  },
  {
    id: "geaendert",
    label: "Geändert",
    hint: "Letzte Änderung",
  },
];

export const DEFAULT_MARI_LIST_META_FIELDS: MariListMetaField[] = [
  "kunde",
  "projekt",
  "vertrag",
  "aktivitaet",
];

export type MariTicketFilterCustomer = {
  cardCode: string;
  name: string;
};

export type MariTicketFilterPrefs = {
  statuses: number[];
  overdueOnly: boolean;
  filterMode: MariTicketFilterMode;
  customers: MariTicketFilterCustomer[];
  timelineSort: MariTimelineSort;
  /** Ticketliste alt→neu / neu→alt (Anfragedatum). */
  listSort: MariListSort;
  listMetaFields: MariListMetaField[];
};

/** Browser mirror so Status-Filter survive flaky API / remounts. */
export const MARI_TICKET_FILTER_LS_KEY = "buddy.mariTicketFilterPrefs";

export type MariTicketFilterPrefsPatch = Partial<MariTicketFilterPrefs>;

/**
 * Best-effort parse of stored prefs (API or localStorage).
 * Returns null if nothing usable; unknown fields ignored.
 */
export function parseMariTicketFilterPrefsPatch(
  raw: unknown
): MariTicketFilterPrefsPatch | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const out: MariTicketFilterPrefsPatch = {};

  if (Array.isArray(o.statuses)) {
    const statuses = [
      ...new Set(
        o.statuses
          .map((n) => Number(n))
          .filter((n) => Number.isInteger(n) && n > 0)
      ),
    ].sort((a, b) => a - b);
    if (statuses.length > 0) out.statuses = statuses;
  }
  if (typeof o.overdueOnly === "boolean") out.overdueOnly = o.overdueOnly;
  if (o.filterMode === "handler" || o.filterMode === "customer") {
    out.filterMode = o.filterMode;
  }
  if (o.timelineSort === "newest" || o.timelineSort === "oldest") {
    out.timelineSort = o.timelineSort;
  }
  if (o.listSort === "newest" || o.listSort === "oldest") {
    out.listSort = o.listSort;
  }
  if (Array.isArray(o.listMetaFields)) {
    const allowed = new Set(
      MARI_LIST_META_FIELD_OPTIONS.map((opt) => opt.id)
    );
    const listMetaFields = o.listMetaFields.filter(
      (f): f is MariListMetaField =>
        typeof f === "string" && allowed.has(f as MariListMetaField)
    );
    if (listMetaFields.length > 0) out.listMetaFields = listMetaFields;
  }
  if (Array.isArray(o.customers)) {
    const customers: MariTicketFilterCustomer[] = [];
    const seen = new Set<string>();
    for (const row of o.customers) {
      if (!row || typeof row !== "object") continue;
      const c = row as { cardCode?: unknown; name?: unknown };
      const cardCode = String(c.cardCode || "").trim();
      if (!cardCode || seen.has(cardCode)) continue;
      seen.add(cardCode);
      customers.push({
        cardCode,
        name: String(c.name || cardCode).trim() || cardCode,
      });
      if (customers.length >= 40) break;
    }
    out.customers = customers;
  }

  return Object.keys(out).length > 0 ? out : null;
}

export function readMariTicketFilterPrefsLocal(): MariTicketFilterPrefsPatch | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(MARI_TICKET_FILTER_LS_KEY);
    if (!raw?.trim()) return null;
    return parseMariTicketFilterPrefsPatch(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function writeMariTicketFilterPrefsLocal(
  prefs: MariTicketFilterPrefsPatch
): void {
  if (typeof window === "undefined") return;
  try {
    const prev = readMariTicketFilterPrefsLocal() || {};
    const next = { ...prev, ...prefs };
    window.localStorage.setItem(
      MARI_TICKET_FILTER_LS_KEY,
      JSON.stringify(next)
    );
  } catch {
    /* private mode / quota */
  }
}
