export const TRIP_STATUSES = ["planned", "active", "done", "cancelled"] as const;
export type TripStatus = (typeof TRIP_STATUSES)[number];

/** Selectable TravelBrain event types (edit UI). */
export const TRIP_EVENT_TYPES = [
  "Flug",
  "Zugreisen",
  "Mietauto",
  "Transfer",
  "Hotel",
  "Unterkunft",
  "Kreuzfahrt",
  "Ausflug",
] as const;
export type TripEventType = (typeof TRIP_EVENT_TYPES)[number];

/** Common airline cabin / booking classes for flight events. */
export const CABIN_CLASSES = [
  "Economy",
  "Premium Economy",
  "Business",
  "First",
] as const;
export type CabinClass = (typeof CABIN_CLASSES)[number];

const EVENT_TYPE_ALIASES: Record<string, TripEventType> = {
  Mietwagen: "Mietauto",
  Aktivität: "Ausflug",
  Notiz: "Ausflug",
  Sonstiges: "Ausflug",
  Bahn: "Zugreisen",
  Zug: "Zugreisen",
  Train: "Zugreisen",
  Parking: "Transfer",
  "Visa / Einreise": "Ausflug",
  "Pauschalreise / Urlaub": "Ausflug",
  Reiseversicherung: "Ausflug",
};

/** Map legacy / free-text types onto the selectable set. */
export function coerceTripEventType(raw: string | null | undefined): TripEventType {
  const trimmed = (raw || "").trim();
  if ((TRIP_EVENT_TYPES as readonly string[]).includes(trimmed)) {
    return trimmed as TripEventType;
  }
  return EVENT_TYPE_ALIASES[trimmed] || "Ausflug";
}

export type TripEventDraft = {
  type: string;
  title: string;
  start_date?: string | null;
  end_date?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  location?: string | null;
  address?: string | null;
  provider?: string | null;
  booking_reference?: string | null;
  notes?: string | null;
  flight_number?: string | null;
  cabin_class?: string | null;
  departure_airport?: string | null;
  arrival_airport?: string | null;
  origin_place?: string | null;
  destination_place?: string | null;
  document_id?: number | null;
  travel_item_id?: number | null;
  guide_id?: number | null;
  note_id?: string | null;
  source_excerpt?: string | null;
};
