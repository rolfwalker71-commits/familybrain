import { TRAVEL_TYPES } from "@/lib/extraction/normalize-categories";

export const TRIP_STATUSES = ["planned", "active", "done", "cancelled"] as const;
export type TripStatus = (typeof TRIP_STATUSES)[number];

export const TRIP_EVENT_TYPES = [
  ...TRAVEL_TYPES,
  "Aktivität",
  "Notiz",
] as const;
export type TripEventType = (typeof TRIP_EVENT_TYPES)[number];

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
  document_id?: number | null;
  travel_item_id?: number | null;
  guide_id?: number | null;
  note_id?: string | null;
  source_excerpt?: string | null;
};
