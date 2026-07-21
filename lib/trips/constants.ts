import path from "path";
import fs from "fs";
import { TRAVEL_TYPES } from "@/lib/extraction/normalize-categories";

export const TRIP_STATUSES = ["planned", "active", "done", "cancelled"] as const;
export type TripStatus = (typeof TRIP_STATUSES)[number];

export const TRIP_EVENT_TYPES = [
  ...TRAVEL_TYPES,
  "Aktivität",
  "Notiz",
] as const;
export type TripEventType = (typeof TRIP_EVENT_TYPES)[number];

export function getTripsDataRoot(): string {
  const configured = process.env.DATABASE_PATH;
  if (configured) {
    const abs = path.isAbsolute(configured)
      ? configured
      : path.join(process.cwd(), configured);
    return path.dirname(abs);
  }
  return path.join(process.cwd(), "data");
}

export function getTripCoversDir(): string {
  return path.join(getTripsDataRoot(), "trip-covers");
}

export function getTripAircraftDir(): string {
  return path.join(getTripsDataRoot(), "trip-aircraft");
}

export function getTripMapsDir(): string {
  return path.join(getTripsDataRoot(), "trip-maps");
}

export function ensureTripMediaDirs(): void {
  for (const dir of [getTripCoversDir(), getTripAircraftDir(), getTripMapsDir()]) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export type TripEventDraft = {
  type: string;
  title: string;
  start_date?: string | null;
  end_date?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  location?: string | null;
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
