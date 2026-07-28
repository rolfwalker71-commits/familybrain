import { createHash } from "crypto";
import { nowIso } from "@/lib/utils/dates";
import { hasOjpCredentials } from "@/lib/trips/settings";
import { fetchOjpTrips, searchOjpStops } from "@/lib/trips/ojp/client";
import type { OjpTrip } from "@/lib/trips/ojp/types";
import type { OjpStopCandidate } from "@/lib/trips/ojp/location-request";
import { formatOjpDepArrTime } from "@/lib/trips/ojp/trip-request";
import type { TrainEnrichmentData, TrainEnrichmentStop } from "@/lib/trips/train-enrichment";
import { formatZurichClock } from "@/lib/trips/train-enrichment";
import {
  getTripEventById,
  updateTripEvent,
  type TripEventRow,
} from "@/lib/trips/queries";

export type TrainEnrichResult = {
  event: TripEventRow;
  warning?: string;
};

export type TrainConnectionOption = {
  id: string;
  label: string;
  summary: string;
  startTime?: string;
  endTime?: string;
  changes: number;
  trip: OjpTrip;
};

export type TrainStationCandidate = {
  stopRef: string;
  name: string;
  displayName: string;
  lat: number;
  lon: number;
};

type PlaceInput = {
  lat?: number;
  lon?: number;
  name?: string;
  stopRef?: string;
};

function splitRoutePlaces(event: TripEventRow): { origin: string; destination: string } {
  if (event.origin_place || event.destination_place) {
    return {
      origin: event.origin_place || "",
      destination: event.destination_place || "",
    };
  }
  const loc = (event.location || "").trim();
  const parts = loc.split(/\s*(?:→|->|–|-\s*>\s*)\s*/);
  if (parts.length >= 2) {
    return {
      origin: parts[0]?.trim() || "",
      destination: parts.slice(1).join(" → ").trim(),
    };
  }
  return { origin: loc, destination: "" };
}

function normalizeEventTime(raw: string | null | undefined): string {
  const value = (raw || "").trim();
  if (!value) return "08:00";
  const colon = value.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (colon) return `${colon[1].padStart(2, "0")}:${colon[2]}`;
  const spaced = value.match(/^(\d{1,2})\s+(\d{2})$/);
  if (spaced) return `${spaced[1].padStart(2, "0")}:${spaced[2]}`;
  const compact = value.match(/^(\d{1,2})(\d{2})$/);
  if (compact) return `${compact[1].padStart(2, "0")}:${compact[2]}`;
  return value;
}

function isoTimeFromEvent(event: TripEventRow): string | null {
  const date = event.start_date?.trim();
  if (!date) return null;
  try {
    return formatOjpDepArrTime(date, normalizeEventTime(event.start_time));
  } catch {
    return null;
  }
}

export function hashTrainInput(event: TripEventRow): string {
  const places = splitRoutePlaces(event);
  const payload = [
    event.start_date,
    normalizeEventTime(event.start_time),
    event.end_time,
    event.flight_number,
    places.origin,
    places.destination,
    event.departure_lat,
    event.departure_lon,
    event.arrival_lat,
    event.arrival_lon,
  ].join("|");
  return createHash("sha256").update(payload).digest("hex").slice(0, 16);
}

function scoreStopMatch(query: string, candidate: OjpStopCandidate): number {
  const q = query.trim().toLowerCase();
  const name = candidate.name.toLowerCase();
  if (name === q) return 100;
  if (name.startsWith(q)) return 80;
  if (name.includes(q)) return 60;
  // Prefer main rail stations over bus stops when query is generic.
  if (/flughafen|bahnhof|\bhb\b/i.test(q) && /flughafen|\bhb\b|bahnhof/i.test(name)) {
    return 50;
  }
  return 10;
}

async function resolveStopByName(name: string): Promise<OjpStopCandidate | null> {
  const q = name.trim();
  if (!q) return null;
  try {
    const stops = await searchOjpStops(q);
    if (stops.length === 0) return null;
    return [...stops].sort(
      (a, b) => scoreStopMatch(q, b) - scoreStopMatch(q, a)
    )[0];
  } catch {
    return null;
  }
}

async function resolvePlace(
  coords: { lat: number | null; lon: number | null },
  name: string,
  stopRef?: string | null
): Promise<PlaceInput> {
  if (stopRef?.trim()) {
    return {
      stopRef: stopRef.trim(),
      name: name.trim() || undefined,
      lat: coords.lat ?? undefined,
      lon: coords.lon ?? undefined,
    };
  }
  if (name.trim()) {
    const stop = await resolveStopByName(name);
    if (stop) {
      return {
        stopRef: stop.stopRef,
        name: stop.name,
        lat: stop.lat,
        lon: stop.lon,
      };
    }
  }
  if (coords.lat != null && coords.lon != null) {
    return { lat: coords.lat, lon: coords.lon, name: name || undefined };
  }
  if (name.trim()) {
    return { name: name.trim() };
  }
  throw new Error("Start- und Zielort fehlen (Name oder Koordinaten).");
}

function readStopRefs(event: TripEventRow): {
  originStopRef?: string;
  destinationStopRef?: string;
} {
  if (!event.enrichment_json?.trim()) return {};
  try {
    const parsed = JSON.parse(event.enrichment_json) as {
      originStopRef?: string;
      destinationStopRef?: string;
    };
    return {
      originStopRef: parsed.originStopRef,
      destinationStopRef: parsed.destinationStopRef,
    };
  } catch {
    return {};
  }
}

async function buildTripSearchInput(event: TripEventRow) {
  const places = splitRoutePlaces(event);
  if (!places.origin.trim() && !places.destination.trim()) {
    throw new Error("Von/Nach oder Standort mit Route wird benötigt.");
  }
  if (!event.start_date?.trim()) {
    throw new Error("Datum wird für die Streckenplanung benötigt.");
  }
  const depArrTimeIso = isoTimeFromEvent(event);
  if (!depArrTimeIso) {
    throw new Error("Ungültiges Datum oder Abfahrtszeit.");
  }
  const stopRefs = readStopRefs(event);
  const [origin, destination] = await Promise.all([
    resolvePlace(
      { lat: event.departure_lat, lon: event.departure_lon },
      places.origin,
      stopRefs.originStopRef
    ),
    resolvePlace(
      { lat: event.arrival_lat, lon: event.arrival_lon },
      places.destination,
      stopRefs.destinationStopRef
    ),
  ]);
  return { origin, destination, depArrTimeIso, places };
}

function formatLocalTime(iso: string | undefined): string | null {
  return formatZurichClock(iso);
}

function formatLocalDate(iso: string | undefined): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Zurich",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function formatDuration(seconds: number | undefined): string {
  if (seconds == null || !Number.isFinite(seconds)) return "";
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}min`;
  return `${m} min`;
}

function summarizeTrip(trip: OjpTrip): string {
  return trip.legs
    .map((leg) => {
      const line = leg.trainNumber || leg.lineName || leg.mode;
      return `${leg.board.name} → ${leg.alight.name}${line ? ` (${line})` : ""}`;
    })
    .join(" · ");
}

/** Build a full stop timeline with An/Ab times (incl. transfers). */
export function buildRouteStops(trip: OjpTrip): TrainEnrichmentStop[] {
  const raw: TrainEnrichmentStop[] = [];

  for (let i = 0; i < trip.legs.length; i++) {
    const leg = trip.legs[i];
    const train = leg.trainNumber || leg.lineName || undefined;
    const isFirst = i === 0;
    const isLast = i === trip.legs.length - 1;

    raw.push({
      name: leg.board.name,
      kind: isFirst ? "origin" : "transfer",
      departure: leg.board.departure,
      arrival: isFirst ? undefined : leg.board.arrival,
      departureQuay: leg.board.quay,
      arrivalQuay: isFirst ? undefined : leg.board.quay,
      trainNumber: train,
    });

    for (const mid of leg.intermediateStops) {
      if (!mid.name?.trim()) continue;
      raw.push({
        name: mid.name,
        kind: "intermediate",
        arrival: mid.arrival,
        departure: mid.departure,
        arrivalQuay: mid.quay,
        departureQuay: mid.quay,
        trainNumber: train,
      });
    }

    raw.push({
      name: leg.alight.name,
      kind: isLast ? "destination" : "transfer",
      arrival: leg.alight.arrival,
      departure: isLast ? undefined : leg.alight.departure,
      arrivalQuay: leg.alight.quay,
      departureQuay: isLast ? undefined : leg.alight.quay,
      trainNumber: isLast ? undefined : train,
    });
  }

  // Merge consecutive same-name stops (typical: alight + board at transfer).
  const merged: TrainEnrichmentStop[] = [];
  for (const stop of raw) {
    const prev = merged[merged.length - 1];
    if (
      prev &&
      prev.name.trim().toLowerCase() === stop.name.trim().toLowerCase()
    ) {
      prev.arrival = prev.arrival || stop.arrival;
      prev.departure = stop.departure || prev.departure;
      prev.arrivalQuay = prev.arrivalQuay || stop.arrivalQuay;
      prev.departureQuay = stop.departureQuay || prev.departureQuay;
      prev.trainNumber = stop.trainNumber || prev.trainNumber;
      if (stop.kind === "destination") prev.kind = "destination";
      else if (prev.kind !== "origin" && prev.kind !== "destination") {
        prev.kind = "transfer";
      }
      continue;
    }
    merged.push({ ...stop });
  }
  return merged;
}

export function tripToConnectionOption(trip: OjpTrip): TrainConnectionOption {
  const changes = Math.max(0, trip.legs.length - 1);
  const start = formatLocalTime(trip.startTime);
  const end = formatLocalTime(trip.endTime);
  const duration = formatDuration(trip.durationSeconds);
  const label = [
    start && end ? `${start} → ${end}` : null,
    duration || null,
    changes === 0 ? "direkt" : `${changes} Umstieg${changes === 1 ? "" : "e"}`,
  ]
    .filter(Boolean)
    .join(" · ");
  return {
    id: trip.id,
    label,
    summary: summarizeTrip(trip),
    startTime: trip.startTime,
    endTime: trip.endTime,
    changes,
    trip,
  };
}

function buildEnrichmentPayload(
  event: TripEventRow,
  trip: OjpTrip,
  inputHash: string,
  stopRefs: { originStopRef?: string; destinationStopRef?: string },
  warning?: string
): TrainEnrichmentData {
  const firstLeg = trip.legs[0];
  const lastLeg = trip.legs[trip.legs.length - 1];
  const routeStops = buildRouteStops(trip);
  const intermediateStops = routeStops.filter(
    (s) => s.kind === "intermediate" || s.kind === "transfer"
  );
  const trainNumber =
    event.flight_number?.trim() ||
    trip.legs.map((leg) => leg.trainNumber).filter(Boolean).join(" · ") ||
    undefined;

  return {
    status: trip.path.length >= 2 ? "complete" : "route_only",
    source: "ojp",
    fetchedAt: nowIso(),
    inputHash,
    tripId: trip.id,
    trainNumber,
    from: firstLeg
      ? {
          name: firstLeg.board.name,
          stopRef: firstLeg.board.stopRef,
          lat: firstLeg.board.lat,
          lon: firstLeg.board.lon,
        }
      : undefined,
    to: lastLeg
      ? {
          name: lastLeg.alight.name,
          stopRef: lastLeg.alight.stopRef,
          lat: lastLeg.alight.lat,
          lon: lastLeg.alight.lon,
        }
      : undefined,
    routeStops,
    intermediateStops,
    routePath: trip.path,
    legCount: trip.legs.length,
    warning,
    ...(stopRefs.originStopRef ? { originStopRef: stopRefs.originStopRef } : {}),
    ...(stopRefs.destinationStopRef
      ? { destinationStopRef: stopRefs.destinationStopRef }
      : {}),
  };
}

export type SearchTrainConnectionsOptions = {
  /** Override wall-clock time HH:mm (Europe/Zurich) for “ab wann”. */
  departAfter?: string | null;
  /** Override date yyyy-mm-dd. */
  date?: string | null;
  numberOfResults?: number;
};

export async function searchTrainConnections(
  eventId: number,
  options: SearchTrainConnectionsOptions = {}
): Promise<{ options: TrainConnectionOption[]; depArrTimeIso: string }> {
  const event = getTripEventById(eventId);
  if (!event) throw new Error("Ereignis nicht gefunden");
  if (event.event_type !== "Zugreisen") {
    throw new Error("Anreicherung nur für Zugreisen.");
  }

  const date = options.date?.trim() || event.start_date?.trim();
  if (!date) {
    throw new Error("Datum wird für die Streckenplanung benötigt.");
  }
  const time = normalizeEventTime(
    options.departAfter?.trim() || event.start_time
  );
  let depArrTimeIso: string;
  try {
    depArrTimeIso = formatOjpDepArrTime(date, time);
  } catch {
    throw new Error("Ungültiges Datum oder Abfahrtszeit.");
  }

  const { origin, destination } = await buildTripSearchInput({
    ...event,
    start_date: date,
    start_time: time,
  });

  const trips = await fetchOjpTrips({
    origin,
    destination,
    depArrTimeIso,
    numberOfResults: options.numberOfResults ?? 20,
  });
  if (trips.length === 0) {
    throw new Error("Keine Zugverbindungen gefunden.");
  }
  return {
    options: trips.map(tripToConnectionOption),
    depArrTimeIso,
  };
}

export async function applyTrainConnection(
  eventId: number,
  trip: OjpTrip,
  warning?: string
): Promise<TrainEnrichResult> {
  const event = getTripEventById(eventId);
  if (!event) throw new Error("Ereignis nicht gefunden");
  if (event.event_type !== "Zugreisen") {
    throw new Error("Anreicherung nur für Zugreisen.");
  }

  const places = splitRoutePlaces(event);
  const inputHash = hashTrainInput(event);
  const stopRefs = readStopRefs(event);
  const enrichment = buildEnrichmentPayload(
    event,
    trip,
    inputHash,
    stopRefs,
    warning
  );

  const firstLeg = trip.legs[0];
  const lastLeg = trip.legs[trip.legs.length - 1];
  const startTime = formatLocalTime(trip.startTime) || event.start_time;
  const endTime = formatLocalTime(trip.endTime) || event.end_time;
  const endDate = formatLocalDate(trip.endTime) || event.end_date;

  const updated = updateTripEvent(eventId, {
    originPlace: firstLeg?.board.name || places.origin || event.origin_place,
    destinationPlace:
      lastLeg?.alight.name || places.destination || event.destination_place,
    departureLat: firstLeg?.board.lat ?? event.departure_lat,
    departureLon: firstLeg?.board.lon ?? event.departure_lon,
    arrivalLat: lastLeg?.alight.lat ?? event.arrival_lat,
    arrivalLon: lastLeg?.alight.lon ?? event.arrival_lon,
    startTime,
    endTime,
    endDate,
    durationMinutes:
      trip.durationSeconds != null
        ? Math.round(trip.durationSeconds / 60)
        : event.duration_minutes,
    location:
      [firstLeg?.board.name, lastLeg?.alight.name].filter(Boolean).join(" → ") ||
      event.location,
    enrichmentJson: JSON.stringify(enrichment),
    enrichedAt: nowIso(),
  });

  return {
    event: updated,
    warning: warning || (enrichment.status === "route_only"
      ? "Strecke ohne detaillierte Geometrie — Haltestellen verwendet."
      : undefined),
  };
}

/** @deprecated Use searchTrainConnections + applyTrainConnection */
export async function enrichTrainEvent(eventId: number): Promise<TrainEnrichResult> {
  const { options } = await searchTrainConnections(eventId);
  const event = getTripEventById(eventId);
  const picked = options[0];
  if (!picked) throw new Error("Keine Zugverbindung gefunden.");
  return applyTrainConnection(eventId, picked.trip, "Erste gefundene Verbindung übernommen.");
}

export async function searchTrainStations(
  query: string
): Promise<TrainStationCandidate[]> {
  if (!hasOjpCredentials()) {
    throw new Error("ÖV-CH Token fehlt für die Bahnhofssuche.");
  }
  const stops = await searchOjpStops(query);
  return stops.map((stop: OjpStopCandidate) => ({
    stopRef: stop.stopRef,
    name: stop.name,
    displayName: stop.stopRef
      ? `${stop.name} (${stop.stopRef})`
      : stop.name,
    lat: stop.lat,
    lon: stop.lon,
  }));
}

export async function applyTrainStation(
  eventId: number,
  target: "origin" | "destination",
  station: TrainStationCandidate
): Promise<TripEventRow> {
  const event = getTripEventById(eventId);
  if (!event) throw new Error("Ereignis nicht gefunden");
  if (event.event_type !== "Zugreisen") {
    throw new Error("Bahnhofssuche nur für Zugreisen.");
  }

  const stopRefs = readStopRefs(event);
  if (target === "origin") {
    stopRefs.originStopRef = station.stopRef;
  } else {
    stopRefs.destinationStopRef = station.stopRef;
  }

  let enrichmentJson = event.enrichment_json;
  try {
    const base = enrichmentJson ? JSON.parse(enrichmentJson) : {};
    enrichmentJson = JSON.stringify({
      ...base,
      ...stopRefs,
      source: base.source || "ojp",
    });
  } catch {
    enrichmentJson = JSON.stringify({ source: "ojp", ...stopRefs });
  }

  return updateTripEvent(eventId, {
    originPlace: target === "origin" ? station.name : event.origin_place,
    destinationPlace:
      target === "destination" ? station.name : event.destination_place,
    departureLat: target === "origin" ? station.lat : event.departure_lat,
    departureLon: target === "origin" ? station.lon : event.departure_lon,
    arrivalLat: target === "destination" ? station.lat : event.arrival_lat,
    arrivalLon: target === "destination" ? station.lon : event.arrival_lon,
    enrichmentJson,
  });
}
