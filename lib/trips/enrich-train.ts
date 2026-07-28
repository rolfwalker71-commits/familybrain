import { createHash } from "crypto";
import { nowIso } from "@/lib/utils/dates";
import { hasOjpCredentials } from "@/lib/trips/settings";
import { fetchOjpTrips, searchOjpStops } from "@/lib/trips/ojp/client";
import type { OjpTrip } from "@/lib/trips/ojp/types";
import type { OjpStopCandidate } from "@/lib/trips/ojp/location-request";
import { formatOjpDepArrTime } from "@/lib/trips/ojp/trip-request";
import type { TrainEnrichmentData } from "@/lib/trips/train-enrichment";
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
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

function formatLocalDate(iso: string | undefined): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const yyyy = date.getFullYear();
  const mo = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mo}-${dd}`;
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
  const intermediateStops = trip.legs.flatMap((leg) =>
    leg.intermediateStops.map((stop) => ({
      name: stop.name,
      arrival: stop.arrival,
      departure: stop.departure,
    }))
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

export async function searchTrainConnections(
  eventId: number
): Promise<{ options: TrainConnectionOption[]; depArrTimeIso: string }> {
  const event = getTripEventById(eventId);
  if (!event) throw new Error("Ereignis nicht gefunden");
  if (event.event_type !== "Zugreisen") {
    throw new Error("Anreicherung nur für Zugreisen.");
  }

  const { origin, destination, depArrTimeIso } = await buildTripSearchInput(event);
  const trips = await fetchOjpTrips({
    origin,
    destination,
    depArrTimeIso,
    numberOfResults: 6,
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
