import { getDb } from "@/lib/db/client";
import { getSetting, setSetting } from "@/lib/db/migrations";
import { nowIso } from "@/lib/utils/dates";
import {
  TRIP_EVENT_TYPES,
  TRIP_STATUSES,
  coerceTripEventType,
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
  ensureTripEventDataMigrations();
  const db = getDb();
  return db
    .prepare(
      `SELECT * FROM trip_events
       WHERE trip_id = ?
       ORDER BY sort_key ASC, id ASC`
    )
    .all(tripId) as TripEventRow[];
}

function ensureTripEventDataMigrations(): void {
  if (getSetting("trip_events_order_v1") === "1") return;
  migrateCruisePortEventTypes();
  resequenceAllTripEventsByDate();
  setSetting("trip_events_order_v1", "1");
}

export function reorderTripEvents(
  tripId: number,
  orderedEventIds: number[]
): TripEventRow[] {
  if (!getTripById(tripId)) throw new Error("Reise nicht gefunden");
  const db = getDb();
  const existing = listTripEvents(tripId);
  const existingIds = new Set(existing.map((e) => e.id));
  if (
    orderedEventIds.length !== existing.length ||
    orderedEventIds.some((id) => !existingIds.has(id))
  ) {
    throw new Error("Ungültige Ereignis-Reihenfolge");
  }

  const update = db.prepare(
    `UPDATE trip_events SET sort_key = ?, updated_at = ? WHERE id = ? AND trip_id = ?`
  );
  const ts = nowIso();
  const tx = db.transaction(() => {
    orderedEventIds.forEach((id, index) => {
      update.run((index + 1) * 10, ts, id, tripId);
    });
  });
  tx();
  return listTripEvents(tripId);
}

/** One-time: order events chronologically into sort_key gaps. */
export function resequenceAllTripEventsByDate(): void {
  const db = getDb();
  const trips = db.prepare(`SELECT id FROM trips`).all() as Array<{ id: number }>;
  const update = db.prepare(
    `UPDATE trip_events SET sort_key = ? WHERE id = ?`
  );
  const tx = db.transaction(() => {
    for (const trip of trips) {
      const rows = db
        .prepare(
          `SELECT id FROM trip_events
           WHERE trip_id = ?
           ORDER BY
             CASE WHEN start_date IS NULL OR start_date = '' THEN 1 ELSE 0 END,
             start_date ASC,
             COALESCE(start_time, '99:99') ASC,
             sort_key ASC,
             id ASC`
        )
        .all(trip.id) as Array<{ id: number }>;
      rows.forEach((row, index) => {
        update.run((index + 1) * 10, row.id);
      });
    }
  });
  tx();
}

/** Ports of call were previously stored as Aktivität — promote to Kreuzfahrt. */
export function migrateCruisePortEventTypes(): number {
  const db = getDb();
  const result = db
    .prepare(
      `UPDATE trip_events
       SET event_type = 'Kreuzfahrt', updated_at = ?
       WHERE event_type = 'Aktivität'
         AND source_excerpt LIKE 'Anlaufhafen:%'`
    )
    .run(nowIso());
  return result.changes;
}

export function getTripEventById(eventId: number): TripEventRow | null {
  const db = getDb();
  const row = db
    .prepare(`SELECT * FROM trip_events WHERE id = ?`)
    .get(eventId) as TripEventRow | undefined;
  return row ?? null;
}

function normalizeEventType(raw: string): TripEventType {
  return coerceTripEventType(raw);
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
  departureTerminal?: string | null;
  arrivalTerminal?: string | null;
  departureGate?: string | null;
  arrivalGate?: string | null;
  checkInDesk?: string | null;
  baggageBelt?: string | null;
  departureLat?: number | null;
  departureLon?: number | null;
  arrivalLat?: number | null;
  arrivalLon?: number | null;
  originPlace?: string | null;
  destinationPlace?: string | null;
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
  const origin = input.originPlace?.trim() || null;
  const destination = input.destinationPlace?.trim() || null;
  const transferRoute =
    origin && destination
      ? `${origin} → ${destination}`
      : origin || destination || null;
  const location =
    input.location?.trim() ||
    formatAirportRoute(dep, arr) ||
    transferRoute ||
    null;

  const result = db
    .prepare(
      `INSERT INTO trip_events (
         trip_id, event_type, title, start_date, end_date, start_time, end_time,
         location, provider, booking_reference, notes, sort_key,
         document_id, travel_item_id, guide_id, note_id, source_excerpt,
         flight_number, airline, aircraft_reg, aircraft_type,
         departure_airport, arrival_airport, duration_minutes, aircraft_image_path,
         departure_terminal, arrival_terminal, departure_gate, arrival_gate,
         check_in_desk, baggage_belt,
         departure_lat, departure_lon, arrival_lat, arrival_lon,
         origin_place, destination_place,
         place_name, address, phone, website, lat, lon, map_image_path, osm_id,
         enrichment_json, enriched_at, created_at, updated_at
       ) VALUES (
         ?, ?, ?, ?, ?, ?, ?,
         ?, ?, ?, ?, ?,
         ?, ?, ?, ?, ?,
         ?, ?, ?, ?,
         ?, ?, ?, ?,
         ?, ?, ?, ?,
         ?, ?,
         ?, ?, ?, ?,
         ?, ?,
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
      input.departureTerminal?.trim() || null,
      input.arrivalTerminal?.trim() || null,
      input.departureGate?.trim() || null,
      input.arrivalGate?.trim() || null,
      input.checkInDesk?.trim() || null,
      input.baggageBelt?.trim() || null,
      input.departureLat ?? null,
      input.departureLon ?? null,
      input.arrivalLat ?? null,
      input.arrivalLon ?? null,
      origin,
      destination,
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
  const docId = input.documentId ?? null;
  if (docId != null && docId > 0) {
    linkTripEventDocument(event.id, docId);
  }
  syncTripDatesFromEvents(tripId);
  return getTripEventById(event.id) ?? event;
}

export function updateTripEvent(
  eventId: number,
  input: Partial<TripEventInput>
): TripEventRow {
  const existing = getTripEventById(eventId);
  if (!existing) throw new Error("Ereignis nicht gefunden");

  const nextOrigin =
    input.originPlace !== undefined
      ? input.originPlace?.trim() || null
      : existing.origin_place;
  const nextDestination =
    input.destinationPlace !== undefined
      ? input.destinationPlace?.trim() || null
      : existing.destination_place;
  const transferRoute =
    nextOrigin && nextDestination
      ? `${nextOrigin} → ${nextDestination}`
      : nextOrigin || nextDestination || null;
  const nextLocation =
    input.location !== undefined
      ? input.location?.trim() || null
      : input.originPlace !== undefined || input.destinationPlace !== undefined
        ? transferRoute || existing.location
        : existing.location;

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
       departure_terminal = ?,
       arrival_terminal = ?,
       departure_gate = ?,
       arrival_gate = ?,
       check_in_desk = ?,
       baggage_belt = ?,
       departure_lat = ?,
       departure_lon = ?,
       arrival_lat = ?,
       arrival_lon = ?,
       origin_place = ?,
       destination_place = ?,
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
    nextLocation,
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
    input.departureTerminal !== undefined
      ? input.departureTerminal?.trim() || null
      : existing.departure_terminal,
    input.arrivalTerminal !== undefined
      ? input.arrivalTerminal?.trim() || null
      : existing.arrival_terminal,
    input.departureGate !== undefined
      ? input.departureGate?.trim() || null
      : existing.departure_gate,
    input.arrivalGate !== undefined
      ? input.arrivalGate?.trim() || null
      : existing.arrival_gate,
    input.checkInDesk !== undefined
      ? input.checkInDesk?.trim() || null
      : existing.check_in_desk,
    input.baggageBelt !== undefined
      ? input.baggageBelt?.trim() || null
      : existing.baggage_belt,
    input.departureLat !== undefined
      ? input.departureLat
      : existing.departure_lat,
    input.departureLon !== undefined
      ? input.departureLon
      : existing.departure_lon,
    input.arrivalLat !== undefined ? input.arrivalLat : existing.arrival_lat,
    input.arrivalLon !== undefined ? input.arrivalLon : existing.arrival_lon,
    nextOrigin,
    nextDestination,
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

export function listLinkedDocumentIdsForEvents(
  eventIds: number[]
): Map<number, number[]> {
  const map = new Map<number, number[]>();
  if (eventIds.length === 0) return map;
  const db = getDb();
  const placeholders = eventIds.map(() => "?").join(",");
  const rows = db
    .prepare(
      `SELECT trip_event_id, document_id
       FROM trip_event_documents
       WHERE trip_event_id IN (${placeholders})
       ORDER BY created_at ASC, document_id ASC`
    )
    .all(...eventIds) as Array<{ trip_event_id: number; document_id: number }>;
  for (const row of rows) {
    const list = map.get(row.trip_event_id) || [];
    list.push(row.document_id);
    map.set(row.trip_event_id, list);
  }
  return map;
}

export function linkTripEventDocument(
  eventId: number,
  documentId: number
): TripEventRow {
  const event = getTripEventById(eventId);
  if (!event) throw new Error("Ereignis nicht gefunden");
  if (!Number.isInteger(documentId) || documentId <= 0) {
    throw new Error("Ungültiges Dokument");
  }
  const db = getDb();
  const doc = db
    .prepare(`SELECT id FROM paperless_documents WHERE id = ?`)
    .get(documentId) as { id: number } | undefined;
  if (!doc) throw new Error("Dokument nicht gefunden");

  db.prepare(
    `INSERT OR IGNORE INTO trip_event_documents (trip_event_id, document_id, created_at)
     VALUES (?, ?, ?)`
  ).run(eventId, documentId, nowIso());

  // Keep primary document_id filled when empty (first beleg).
  if (event.document_id == null) {
    db.prepare(
      `UPDATE trip_events SET document_id = ?, updated_at = ? WHERE id = ?`
    ).run(documentId, nowIso(), eventId);
  }

  const updated = getTripEventById(eventId);
  if (!updated) throw new Error("Ereignis nicht gefunden");
  return updated;
}

export function unlinkTripEventDocument(
  eventId: number,
  documentId: number
): TripEventRow {
  const event = getTripEventById(eventId);
  if (!event) throw new Error("Ereignis nicht gefunden");
  const db = getDb();

  db.prepare(
    `DELETE FROM trip_event_documents
     WHERE trip_event_id = ? AND document_id = ?`
  ).run(eventId, documentId);

  if (event.document_id === documentId) {
    const next = db
      .prepare(
        `SELECT document_id FROM trip_event_documents
         WHERE trip_event_id = ?
         ORDER BY created_at ASC, document_id ASC
         LIMIT 1`
      )
      .get(eventId) as { document_id: number } | undefined;
    db.prepare(
      `UPDATE trip_events SET document_id = ?, updated_at = ? WHERE id = ?`
    ).run(next?.document_id ?? null, nowIso(), eventId);
  }

  const updated = getTripEventById(eventId);
  if (!updated) throw new Error("Ereignis nicht gefunden");
  return updated;
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
