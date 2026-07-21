import { getDb } from "@/lib/db/client";
import { nowIso } from "@/lib/utils/dates";
import {
  TRIP_EVENT_TYPES,
  TRIP_STATUSES,
  type TripEventType,
  type TripStatus,
} from "@/lib/trips/constants";
import { formatAirportRoute, normalizeIataCode } from "@/lib/trips/iata";

export type TripRow = {
  id: number;
  title: string;
  status: string;
  start_date: string | null;
  end_date: string | null;
  destination: string | null;
  summary: string | null;
  cover_path: string | null;
  cover_prompt: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  event_count?: number;
};

export type TripEventRow = {
  id: number;
  trip_id: number;
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
  document_id: number | null;
  travel_item_id: number | null;
  guide_id: number | null;
  note_id: string | null;
  source_excerpt: string | null;
  flight_number: string | null;
  airline: string | null;
  aircraft_reg: string | null;
  aircraft_type: string | null;
  departure_airport: string | null;
  arrival_airport: string | null;
  duration_minutes: number | null;
  aircraft_image_path: string | null;
  place_name: string | null;
  address: string | null;
  phone: string | null;
  website: string | null;
  lat: number | null;
  lon: number | null;
  map_image_path: string | null;
  osm_id: string | null;
  enrichment_json: string | null;
  enriched_at: string | null;
  created_at: string;
  updated_at: string;
};

export function listTrips(): TripRow[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT t.*,
         (SELECT COUNT(*) FROM trip_events e WHERE e.trip_id = t.id) as event_count
       FROM trips t
       ORDER BY
         COALESCE(t.start_date, t.created_at) DESC,
         t.id DESC`
    )
    .all() as TripRow[];
}

export function getTripById(id: number): TripRow | null {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT t.*,
         (SELECT COUNT(*) FROM trip_events e WHERE e.trip_id = t.id) as event_count
       FROM trips t WHERE t.id = ?`
    )
    .get(id) as TripRow | undefined;
  return row ?? null;
}

export function createTrip(input: {
  title: string;
  status?: TripStatus;
  startDate?: string | null;
  endDate?: string | null;
  destination?: string | null;
  summary?: string | null;
  notes?: string | null;
}): TripRow {
  const db = getDb();
  const ts = nowIso();
  const status = input.status ?? "planned";
  if (!(TRIP_STATUSES as readonly string[]).includes(status)) {
    throw new Error("Ungültiger Reisestatus");
  }
  const result = db
    .prepare(
      `INSERT INTO trips (
         title, status, start_date, end_date, destination, summary, notes,
         created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      input.title.trim(),
      status,
      input.startDate || null,
      input.endDate || null,
      input.destination?.trim() || null,
      input.summary?.trim() || null,
      input.notes?.trim() || null,
      ts,
      ts
    );
  const trip = getTripById(Number(result.lastInsertRowid));
  if (!trip) throw new Error("Reise konnte nicht angelegt werden");
  return trip;
}

export function updateTrip(
  id: number,
  input: Partial<{
    title: string;
    status: TripStatus;
    startDate: string | null;
    endDate: string | null;
    destination: string | null;
    summary: string | null;
    notes: string | null;
    coverPath: string | null;
    coverPrompt: string | null;
  }>
): TripRow {
  const existing = getTripById(id);
  if (!existing) throw new Error("Reise nicht gefunden");

  const title = input.title?.trim() ?? existing.title;
  const status = input.status ?? (existing.status as TripStatus);
  if (!(TRIP_STATUSES as readonly string[]).includes(status)) {
    throw new Error("Ungültiger Reisestatus");
  }

  const db = getDb();
  db.prepare(
    `UPDATE trips SET
       title = ?,
       status = ?,
       start_date = ?,
       end_date = ?,
       destination = ?,
       summary = ?,
       notes = ?,
       cover_path = ?,
       cover_prompt = ?,
       updated_at = ?
     WHERE id = ?`
  ).run(
    title,
    status,
    input.startDate !== undefined ? input.startDate : existing.start_date,
    input.endDate !== undefined ? input.endDate : existing.end_date,
    input.destination !== undefined
      ? input.destination?.trim() || null
      : existing.destination,
    input.summary !== undefined
      ? input.summary?.trim() || null
      : existing.summary,
    input.notes !== undefined ? input.notes?.trim() || null : existing.notes,
    input.coverPath !== undefined ? input.coverPath : existing.cover_path,
    input.coverPrompt !== undefined ? input.coverPrompt : existing.cover_prompt,
    nowIso(),
    id
  );

  const trip = getTripById(id);
  if (!trip) throw new Error("Reise nicht gefunden");
  return trip;
}

export function deleteTrip(id: number): void {
  const db = getDb();
  const result = db.prepare(`DELETE FROM trips WHERE id = ?`).run(id);
  if (result.changes === 0) throw new Error("Reise nicht gefunden");
}

export function listTripEvents(tripId: number): TripEventRow[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT * FROM trip_events
       WHERE trip_id = ?
       ORDER BY
         CASE WHEN start_date IS NULL OR start_date = '' THEN 1 ELSE 0 END,
         start_date ASC,
         COALESCE(start_time, '99:99') ASC,
         sort_key ASC,
         id ASC`
    )
    .all(tripId) as TripEventRow[];
}

export function getTripEventById(eventId: number): TripEventRow | null {
  const db = getDb();
  const row = db
    .prepare(`SELECT * FROM trip_events WHERE id = ?`)
    .get(eventId) as TripEventRow | undefined;
  return row ?? null;
}

function normalizeEventType(raw: string): TripEventType {
  const trimmed = raw.trim();
  if ((TRIP_EVENT_TYPES as readonly string[]).includes(trimmed)) {
    return trimmed as TripEventType;
  }
  return "Sonstiges";
}

export type TripEventInput = {
  eventType: string;
  title: string;
  startDate?: string | null;
  endDate?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  location?: string | null;
  provider?: string | null;
  bookingReference?: string | null;
  notes?: string | null;
  sortKey?: number;
  documentId?: number | null;
  travelItemId?: number | null;
  guideId?: number | null;
  noteId?: string | null;
  sourceExcerpt?: string | null;
  flightNumber?: string | null;
  airline?: string | null;
  aircraftReg?: string | null;
  aircraftType?: string | null;
  departureAirport?: string | null;
  arrivalAirport?: string | null;
  durationMinutes?: number | null;
  aircraftImagePath?: string | null;
  placeName?: string | null;
  address?: string | null;
  phone?: string | null;
  website?: string | null;
  lat?: number | null;
  lon?: number | null;
  mapImagePath?: string | null;
  osmId?: string | null;
  enrichmentJson?: string | null;
  enrichedAt?: string | null;
};

export function createTripEvent(
  tripId: number,
  input: TripEventInput
): TripEventRow {
  if (!getTripById(tripId)) throw new Error("Reise nicht gefunden");
  const db = getDb();
  const ts = nowIso();
  const maxSort = db
    .prepare(
      `SELECT COALESCE(MAX(sort_key), 0) as m FROM trip_events WHERE trip_id = ?`
    )
    .get(tripId) as { m: number };

  const dep = normalizeIataCode(input.departureAirport);
  const arr = normalizeIataCode(input.arrivalAirport);
  const location =
    input.location?.trim() ||
    formatAirportRoute(dep, arr) ||
    null;

  const result = db
    .prepare(
      `INSERT INTO trip_events (
         trip_id, event_type, title, start_date, end_date, start_time, end_time,
         location, provider, booking_reference, notes, sort_key,
         document_id, travel_item_id, guide_id, note_id, source_excerpt,
         flight_number, airline, aircraft_reg, aircraft_type,
         departure_airport, arrival_airport, duration_minutes, aircraft_image_path,
         place_name, address, phone, website, lat, lon, map_image_path, osm_id,
         enrichment_json, enriched_at, created_at, updated_at
       ) VALUES (
         ?, ?, ?, ?, ?, ?, ?,
         ?, ?, ?, ?, ?,
         ?, ?, ?, ?, ?,
         ?, ?, ?, ?,
         ?, ?, ?, ?,
         ?, ?, ?, ?, ?, ?, ?, ?,
         ?, ?, ?, ?
       )`
    )
    .run(
      tripId,
      normalizeEventType(input.eventType),
      input.title.trim(),
      input.startDate || null,
      input.endDate || null,
      input.startTime || null,
      input.endTime || null,
      location,
      input.provider?.trim() || null,
      input.bookingReference?.trim() || null,
      input.notes?.trim() || null,
      input.sortKey ?? maxSort.m + 1,
      input.documentId ?? null,
      input.travelItemId ?? null,
      input.guideId ?? null,
      input.noteId ?? null,
      input.sourceExcerpt?.trim() || null,
      input.flightNumber?.trim() || null,
      input.airline?.trim() || null,
      input.aircraftReg?.trim() || null,
      input.aircraftType?.trim() || null,
      dep,
      arr,
      input.durationMinutes ?? null,
      input.aircraftImagePath ?? null,
      input.placeName?.trim() || null,
      input.address?.trim() || null,
      input.phone?.trim() || null,
      input.website?.trim() || null,
      input.lat ?? null,
      input.lon ?? null,
      input.mapImagePath ?? null,
      input.osmId ?? null,
      input.enrichmentJson ?? null,
      input.enrichedAt ?? null,
      ts,
      ts
    );

  const event = getTripEventById(Number(result.lastInsertRowid));
  if (!event) throw new Error("Ereignis konnte nicht angelegt werden");
  syncTripDatesFromEvents(tripId);
  return event;
}

export function updateTripEvent(
  eventId: number,
  input: Partial<TripEventInput>
): TripEventRow {
  const existing = getTripEventById(eventId);
  if (!existing) throw new Error("Ereignis nicht gefunden");

  const db = getDb();
  db.prepare(
    `UPDATE trip_events SET
       event_type = ?,
       title = ?,
       start_date = ?,
       end_date = ?,
       start_time = ?,
       end_time = ?,
       location = ?,
       provider = ?,
       booking_reference = ?,
       notes = ?,
       sort_key = ?,
       document_id = ?,
       travel_item_id = ?,
       guide_id = ?,
       note_id = ?,
       source_excerpt = ?,
       flight_number = ?,
       airline = ?,
       aircraft_reg = ?,
       aircraft_type = ?,
       departure_airport = ?,
       arrival_airport = ?,
       duration_minutes = ?,
       aircraft_image_path = ?,
       place_name = ?,
       address = ?,
       phone = ?,
       website = ?,
       lat = ?,
       lon = ?,
       map_image_path = ?,
       osm_id = ?,
       enrichment_json = ?,
       enriched_at = ?,
       updated_at = ?
     WHERE id = ?`
  ).run(
    input.eventType !== undefined
      ? normalizeEventType(input.eventType)
      : existing.event_type,
    input.title !== undefined ? input.title.trim() : existing.title,
    input.startDate !== undefined ? input.startDate : existing.start_date,
    input.endDate !== undefined ? input.endDate : existing.end_date,
    input.startTime !== undefined ? input.startTime : existing.start_time,
    input.endTime !== undefined ? input.endTime : existing.end_time,
    input.location !== undefined
      ? input.location?.trim() || null
      : existing.location,
    input.provider !== undefined
      ? input.provider?.trim() || null
      : existing.provider,
    input.bookingReference !== undefined
      ? input.bookingReference?.trim() || null
      : existing.booking_reference,
    input.notes !== undefined ? input.notes?.trim() || null : existing.notes,
    input.sortKey !== undefined ? input.sortKey : existing.sort_key,
    input.documentId !== undefined ? input.documentId : existing.document_id,
    input.travelItemId !== undefined
      ? input.travelItemId
      : existing.travel_item_id,
    input.guideId !== undefined ? input.guideId : existing.guide_id,
    input.noteId !== undefined ? input.noteId : existing.note_id,
    input.sourceExcerpt !== undefined
      ? input.sourceExcerpt?.trim() || null
      : existing.source_excerpt,
    input.flightNumber !== undefined
      ? input.flightNumber?.trim() || null
      : existing.flight_number,
    input.airline !== undefined
      ? input.airline?.trim() || null
      : existing.airline,
    input.aircraftReg !== undefined
      ? input.aircraftReg?.trim() || null
      : existing.aircraft_reg,
    input.aircraftType !== undefined
      ? input.aircraftType?.trim() || null
      : existing.aircraft_type,
    input.departureAirport !== undefined
      ? normalizeIataCode(input.departureAirport)
      : existing.departure_airport,
    input.arrivalAirport !== undefined
      ? normalizeIataCode(input.arrivalAirport)
      : existing.arrival_airport,
    input.durationMinutes !== undefined
      ? input.durationMinutes
      : existing.duration_minutes,
    input.aircraftImagePath !== undefined
      ? input.aircraftImagePath
      : existing.aircraft_image_path,
    input.placeName !== undefined
      ? input.placeName?.trim() || null
      : existing.place_name,
    input.address !== undefined
      ? input.address?.trim() || null
      : existing.address,
    input.phone !== undefined ? input.phone?.trim() || null : existing.phone,
    input.website !== undefined
      ? input.website?.trim() || null
      : existing.website,
    input.lat !== undefined ? input.lat : existing.lat,
    input.lon !== undefined ? input.lon : existing.lon,
    input.mapImagePath !== undefined
      ? input.mapImagePath
      : existing.map_image_path,
    input.osmId !== undefined ? input.osmId : existing.osm_id,
    input.enrichmentJson !== undefined
      ? input.enrichmentJson
      : existing.enrichment_json,
    input.enrichedAt !== undefined ? input.enrichedAt : existing.enriched_at,
    nowIso(),
    eventId
  );

  const event = getTripEventById(eventId);
  if (!event) throw new Error("Ereignis nicht gefunden");
  syncTripDatesFromEvents(event.trip_id);
  return event;
}

export function deleteTripEvent(eventId: number): void {
  const existing = getTripEventById(eventId);
  if (!existing) throw new Error("Ereignis nicht gefunden");
  const db = getDb();
  db.prepare(`DELETE FROM trip_events WHERE id = ?`).run(eventId);
  syncTripDatesFromEvents(existing.trip_id);
}

function syncTripDatesFromEvents(tripId: number): void {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT MIN(start_date) as start_date, MAX(COALESCE(end_date, start_date)) as end_date
       FROM trip_events
       WHERE trip_id = ? AND start_date IS NOT NULL AND start_date != ''`
    )
    .get(tripId) as { start_date: string | null; end_date: string | null };

  if (!row.start_date) return;

  const trip = getTripById(tripId);
  if (!trip) return;

  // Only fill empty trip dates from events
  db.prepare(
    `UPDATE trips SET
       start_date = COALESCE(NULLIF(start_date, ''), ?),
       end_date = COALESCE(NULLIF(end_date, ''), ?),
       updated_at = ?
     WHERE id = ?`
  ).run(row.start_date, row.end_date, nowIso(), tripId);
}

export function listTravelItemsForDocument(documentId: number) {
  const db = getDb();
  return db
    .prepare(
      `SELECT id, travel_type, travel_type_override, provider, title, start_date, end_date,
              origin, destination, booking_reference, extracted_data
       FROM travel_items WHERE document_id = ?`
    )
    .all(documentId) as Array<{
    id: number;
    travel_type: string | null;
    travel_type_override: string | null;
    provider: string | null;
    title: string | null;
    start_date: string | null;
    end_date: string | null;
    origin: string | null;
    destination: string | null;
    booking_reference: string | null;
    extracted_data: string | null;
  }>;
}
