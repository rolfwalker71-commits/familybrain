/** Client-safe Maringo ticket filter / list-meta types (no Node/SQLite). */

export type MariTicketFilterMode = "handler" | "customer";

/** Verlauf: newest = aktuellste Nachricht oben */
export type MariTimelineSort = "newest" | "oldest";

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
  listMetaFields: MariListMetaField[];
};
