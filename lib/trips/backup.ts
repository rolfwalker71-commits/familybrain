import fs from "fs";
import path from "path";
import { getDb } from "@/lib/db/client";
import { nowIso } from "@/lib/utils/dates";
import {
  ensureTripMediaDirs,
  getTripAircraftDir,
  getTripCoversDir,
  getTripEventAiDir,
  getTripMapsDir,
} from "@/lib/trips/paths";
import {
  createTrip,
  createTripEvent,
  getTripById,
  linkTripEventDocument,
  listTripEvents,
  listTrips,
  updateTrip,
  type TripEventRow,
  type TripRow,
} from "@/lib/trips/queries";
import {
  createTripShareLink,
  listTripShareLinks,
} from "@/lib/trips/share";
import { TRIP_STATUSES, type TripStatus } from "@/lib/trips/constants";

export const TRAVELBRAIN_BACKUP_VERSION = 1;

type MediaBlob = {
  kind: "cover" | "aircraft" | "map" | "ai";
  filename: string;
  base64: string;
};

type BackupEventDoc = {
  paperless_id: number;
};

type BackupEvent = {
  event_type: string;
  title: string;
  start_date: string | null;
  end_date: string | null;
  start_time: string | null;
  end_time: string | null;
  location: string | null;
  provider: string | null;
  booking_reference: string | null;
  notes: string | null;
  sort_key: number;
  source_excerpt: string | null;
  flight_number: string | null;
  airline: string | null;
  aircraft_reg: string | null;
  aircraft_type: string | null;
  departure_airport: string | null;
  arrival_airport: string | null;
  duration_minutes: number | null;
  departure_terminal: string | null;
  arrival_terminal: string | null;
  departure_gate: string | null;
  arrival_gate: string | null;
  check_in_desk: string | null;
  baggage_belt: string | null;
  departure_lat: number | null;
  departure_lon: number | null;
  arrival_lat: number | null;
  arrival_lon: number | null;
  origin_place: string | null;
  destination_place: string | null;
  place_name: string | null;
  address: string | null;
  phone: string | null;
  website: string | null;
  lat: number | null;
  lon: number | null;
  osm_id: string | null;
  enrichment_json: string | null;
  document_notes_md: string | null;
  show_document_notes: number;
  document_notes_enriched_at: string | null;
  media: MediaBlob[];
  documents: BackupEventDoc[];
};

type BackupTrip = {
  title: string;
  status: string;
  start_date: string | null;
  end_date: string | null;
  destination: string | null;
  summary: string | null;
  notes: string | null;
  cover: MediaBlob | null;
  events: BackupEvent[];
  share_labels: string[];
};

export type TravelBrainBackup = {
  version: number;
  exported_at: string;
  trips: BackupTrip[];
};

function fileToMedia(
  kind: MediaBlob["kind"],
  filePath: string | null
): MediaBlob | null {
  if (!filePath || !fs.existsSync(filePath)) return null;
  const filename = path.basename(filePath);
  const base64 = fs.readFileSync(filePath).toString("base64");
  return { kind, filename, base64 };
}

function eventDocuments(eventId: number): BackupEventDoc[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT d.paperless_id
       FROM trip_event_documents ted
       JOIN paperless_documents d ON d.id = ted.document_id
       WHERE ted.trip_event_id = ?
       ORDER BY ted.created_at ASC`
    )
    .all(eventId) as Array<{ paperless_id: number }>;
  return rows.map((r) => ({ paperless_id: r.paperless_id }));
}

function serializeEvent(event: TripEventRow): BackupEvent {
  const media: MediaBlob[] = [];
  const aircraft = fileToMedia("aircraft", event.aircraft_image_path);
  const map = fileToMedia("map", event.map_image_path);
  const ai = fileToMedia("ai", event.ai_image_path);
  if (aircraft) media.push(aircraft);
  if (map) media.push(map);
  if (ai) media.push(ai);
  return {
    event_type: event.event_type,
    title: event.title,
    start_date: event.start_date,
    end_date: event.end_date,
    start_time: event.start_time,
    end_time: event.end_time,
    location: event.location,
    provider: event.provider,
    booking_reference: event.booking_reference,
    notes: event.notes,
    sort_key: event.sort_key,
    source_excerpt: event.source_excerpt,
    flight_number: event.flight_number,
    airline: event.airline,
    aircraft_reg: event.aircraft_reg,
    aircraft_type: event.aircraft_type,
    departure_airport: event.departure_airport,
    arrival_airport: event.arrival_airport,
    duration_minutes: event.duration_minutes,
    departure_terminal: event.departure_terminal,
    arrival_terminal: event.arrival_terminal,
    departure_gate: event.departure_gate,
    arrival_gate: event.arrival_gate,
    check_in_desk: event.check_in_desk,
    baggage_belt: event.baggage_belt,
    departure_lat: event.departure_lat,
    departure_lon: event.departure_lon,
    arrival_lat: event.arrival_lat,
    arrival_lon: event.arrival_lon,
    origin_place: event.origin_place,
    destination_place: event.destination_place,
    place_name: event.place_name,
    address: event.address,
    phone: event.phone,
    website: event.website,
    lat: event.lat,
    lon: event.lon,
    osm_id: event.osm_id,
    enrichment_json: event.enrichment_json,
    document_notes_md: event.document_notes_md ?? null,
    show_document_notes: event.show_document_notes ?? 1,
    document_notes_enriched_at: event.document_notes_enriched_at ?? null,
    media,
    documents: eventDocuments(event.id),
  };
}

function serializeTrip(trip: TripRow): BackupTrip {
  const events = listTripEvents(trip.id).map(serializeEvent);
  const shares = listTripShareLinks(trip.id).filter((s) => !s.revoked_at);
  return {
    title: trip.title,
    status: trip.status,
    start_date: trip.start_date,
    end_date: trip.end_date,
    destination: trip.destination,
    summary: trip.summary,
    notes: trip.notes,
    cover: fileToMedia("cover", trip.cover_path),
    events,
    share_labels: shares.map((s) => s.label || "Share"),
  };
}

export function buildTravelBrainBackup(): TravelBrainBackup {
  return {
    version: TRAVELBRAIN_BACKUP_VERSION,
    exported_at: nowIso(),
    trips: listTrips().map(serializeTrip),
  };
}

function writeMediaBlob(
  kind: MediaBlob["kind"],
  blob: MediaBlob
): string {
  ensureTripMediaDirs();
  const dir =
    kind === "cover"
      ? getTripCoversDir()
      : kind === "aircraft"
        ? getTripAircraftDir()
        : kind === "map"
          ? getTripMapsDir()
          : getTripEventAiDir();
  const safe = path.basename(blob.filename).replace(/[^a-zA-Z0-9._-]/g, "_");
  const full = path.join(dir, `restore-${Date.now()}-${safe}`);
  fs.writeFileSync(full, Buffer.from(blob.base64, "base64"));
  return full;
}

function localDocIdForPaperless(paperlessId: number): number | null {
  const db = getDb();
  const row = db
    .prepare(`SELECT id FROM paperless_documents WHERE paperless_id = ?`)
    .get(paperlessId) as { id: number } | undefined;
  return row?.id ?? null;
}

export function importTravelBrainBackup(payload: TravelBrainBackup): {
  tripsCreated: number;
  eventsCreated: number;
  linksRestored: number;
  linksSkipped: number;
  warnings: string[];
} {
  if (!payload || payload.version !== TRAVELBRAIN_BACKUP_VERSION) {
    throw new Error(
      `Ungültige Backup-Version (erwartet ${TRAVELBRAIN_BACKUP_VERSION}).`
    );
  }
  if (!Array.isArray(payload.trips)) {
    throw new Error("Backup enthält keine Reisen.");
  }

  let tripsCreated = 0;
  let eventsCreated = 0;
  let linksRestored = 0;
  let linksSkipped = 0;
  const warnings: string[] = [];

  for (const trip of payload.trips) {
    const status = (
      (TRIP_STATUSES as readonly string[]).includes(trip.status)
        ? trip.status
        : "planned"
    ) as TripStatus;
    const created = createTrip({
      title: trip.title || "Importierte Reise",
      status,
      startDate: trip.start_date,
      endDate: trip.end_date,
      destination: trip.destination,
      summary: trip.summary,
      notes: trip.notes,
    });
    tripsCreated += 1;

    if (trip.cover) {
      try {
        const coverPath = writeMediaBlob("cover", trip.cover);
        updateTrip(created.id, { coverPath });
      } catch (err) {
        warnings.push(
          `Cover für «${trip.title}»: ${
            err instanceof Error ? err.message : String(err)
          }`
        );
      }
    }

    for (const ev of trip.events || []) {
      let aircraftImagePath: string | null = null;
      let mapImagePath: string | null = null;
      let aiImagePath: string | null = null;
      for (const m of ev.media || []) {
        try {
          const p = writeMediaBlob(m.kind, m);
          if (m.kind === "aircraft") aircraftImagePath = p;
          if (m.kind === "map") mapImagePath = p;
          if (m.kind === "ai") aiImagePath = p;
        } catch (err) {
          warnings.push(
            `Medien «${ev.title}»: ${
              err instanceof Error ? err.message : String(err)
            }`
          );
        }
      }

      const event = createTripEvent(created.id, {
        eventType: ev.event_type || "Sonstiges",
        title: ev.title || "Ereignis",
        startDate: ev.start_date,
        endDate: ev.end_date,
        startTime: ev.start_time,
        endTime: ev.end_time,
        location: ev.location,
        provider: ev.provider,
        bookingReference: ev.booking_reference,
        notes: ev.notes,
        sortKey: ev.sort_key,
        sourceExcerpt: ev.source_excerpt,
        flightNumber: ev.flight_number,
        airline: ev.airline,
        aircraftReg: ev.aircraft_reg,
        aircraftType: ev.aircraft_type,
        departureAirport: ev.departure_airport,
        arrivalAirport: ev.arrival_airport,
        durationMinutes: ev.duration_minutes,
        aircraftImagePath,
        departureTerminal: ev.departure_terminal,
        arrivalTerminal: ev.arrival_terminal,
        departureGate: ev.departure_gate,
        arrivalGate: ev.arrival_gate,
        checkInDesk: ev.check_in_desk,
        baggageBelt: ev.baggage_belt,
        departureLat: ev.departure_lat,
        departureLon: ev.departure_lon,
        arrivalLat: ev.arrival_lat,
        arrivalLon: ev.arrival_lon,
        originPlace: ev.origin_place,
        destinationPlace: ev.destination_place,
        placeName: ev.place_name,
        address: ev.address,
        phone: ev.phone,
        website: ev.website,
        lat: ev.lat,
        lon: ev.lon,
        mapImagePath,
        osmId: ev.osm_id,
        enrichmentJson: ev.enrichment_json,
        documentNotesMd: ev.document_notes_md,
        showDocumentNotes: ev.show_document_notes !== 0,
        documentNotesEnrichedAt: ev.document_notes_enriched_at,
        aiImagePath,
      });
      eventsCreated += 1;

      for (const doc of ev.documents || []) {
        const localId = localDocIdForPaperless(doc.paperless_id);
        if (localId == null) {
          linksSkipped += 1;
          warnings.push(
            `Beleg paperless_id=${doc.paperless_id} fehlt lokal («${ev.title}»).`
          );
          continue;
        }
        try {
          linkTripEventDocument(event.id, localId);
          linksRestored += 1;
        } catch (err) {
          linksSkipped += 1;
          warnings.push(
            `Link «${ev.title}»: ${
              err instanceof Error ? err.message : String(err)
            }`
          );
        }
      }
    }

    for (const label of trip.share_labels || []) {
      try {
        createTripShareLink(created.id, label);
      } catch {
        /* ignore */
      }
    }

    // Ensure trip still exists
    if (!getTripById(created.id)) {
      warnings.push(`Reise «${trip.title}» nach Import nicht lesbar.`);
    }
  }

  return {
    tripsCreated,
    eventsCreated,
    linksRestored,
    linksSkipped,
    warnings,
  };
}
