import fs from "fs";
import {
  coverPublicUrl,
  mapPublicUrl,
  aircraftPublicUrl,
  eventAiImagePublicUrl,
} from "@/lib/trips/cover";
import { getTripById, listTripEvents, type TripRow } from "@/lib/trips/queries";
import {
  serializeTripEvents,
  type SerializedTripEvent,
  type TripEventDocumentRef,
} from "@/lib/trips/serialize-event";
import { toSwissDate } from "@/lib/utils/dates";

const STATUS_LABEL: Record<string, string> = {
  planned: "Geplant",
  booked: "Gebucht",
  completed: "Abgeschlossen",
  cancelled: "Abgesagt",
};

export type TripExportDocument = TripEventDocumentRef & {
  firstEventId: number;
  firstEventTitle: string;
};

export type TripExportEvent = SerializedTripEvent & {
  cover_url: null;
  map_file_exists: boolean;
  aircraft_file_exists: boolean;
  ai_file_exists: boolean;
};

export type TripExportModel = {
  trip: TripRow;
  statusLabel: string;
  dateRangeLabel: string;
  coverUrl: string | null;
  coverPath: string | null;
  events: TripExportEvent[];
  /** Unique belege in first-mention timeline order. */
  documents: TripExportDocument[];
  missingDocumentNotes: string[];
};

function formatDateRange(
  start: string | null,
  end: string | null
): string {
  if (start && end && start !== end) {
    return `${toSwissDate(start)} – ${toSwissDate(end)}`;
  }
  if (start) return toSwissDate(start);
  if (end) return toSwissDate(end);
  return "ohne Datum";
}

function fileExists(p: string | null | undefined): boolean {
  return Boolean(p && fs.existsSync(p));
}

export function buildTripExportModel(tripId: number): TripExportModel | null {
  const trip = getTripById(tripId);
  if (!trip) return null;

  const rawEvents = listTripEvents(tripId);
  const events = serializeTripEvents(rawEvents).map((event) => ({
    ...event,
    cover_url: null as null,
    map_file_exists: fileExists(event.map_image_path),
    aircraft_file_exists: fileExists(event.aircraft_image_path),
    ai_file_exists: fileExists(event.ai_image_path),
    // Prefer public URLs for HTML; keep paths for PDF embedding
    map_image_url: mapPublicUrl(event.map_image_path),
    aircraft_image_url: aircraftPublicUrl(event.aircraft_image_path),
    ai_image_url: eventAiImagePublicUrl(event.ai_image_path),
  }));

  const seenDocs = new Set<number>();
  const documents: TripExportDocument[] = [];
  for (const event of events) {
    for (const doc of event.documents || []) {
      if (seenDocs.has(doc.id)) continue;
      seenDocs.add(doc.id);
      documents.push({
        ...doc,
        firstEventId: event.id,
        firstEventTitle: event.title,
      });
    }
  }

  return {
    trip,
    statusLabel: STATUS_LABEL[trip.status] || trip.status,
    dateRangeLabel: formatDateRange(trip.start_date, trip.end_date),
    coverUrl: coverPublicUrl(trip.cover_path),
    coverPath: trip.cover_path && fileExists(trip.cover_path) ? trip.cover_path : null,
    events,
    documents,
    missingDocumentNotes: [],
  };
}

export function tripExportFilename(trip: TripRow, ext: string): string {
  const slug = trip.title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return `reise-${slug || "export"}-${trip.id}.${ext}`;
}
