import { createHash } from "crypto";
import { nowIso } from "@/lib/utils/dates";
import { getNominatimBaseUrl } from "@/lib/trips/settings";
import { planOjpTrip } from "@/lib/trips/ojp/client";
import type { OjpTrip } from "@/lib/trips/ojp/types";
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

type PlaceInput = { lat?: number; lon?: number; name?: string };

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

function isoTimeFromEvent(event: TripEventRow): string | null {
  const date = event.start_date?.trim();
  if (!date) return null;
  const time = event.start_time?.trim() || "08:00";
  const normalizedTime = /^\d{1,2}:\d{2}$/.test(time) ? `${time}:00` : time;
  const local = new Date(`${date}T${normalizedTime}`);
  if (Number.isNaN(local.getTime())) return null;
  return local.toISOString().replace(/\.\d{3}Z$/, "Z");
}

function hashTrainInput(event: TripEventRow): string {
  const places = splitRoutePlaces(event);
  const payload = [
    event.start_date,
    event.start_time,
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

let lastGeocodeAt = 0;

async function geocodePlace(query: string): Promise<{ lat: number; lon: number } | null> {
  const q = query.trim();
  if (!q) return null;
  const wait = 1100 - (Date.now() - lastGeocodeAt);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastGeocodeAt = Date.now();
  const base = getNominatimBaseUrl();
  const url = `${base}/search?${new URLSearchParams({
    q,
    format: "json",
    limit: "1",
    countrycodes: "ch,de,fr,it,at,li",
  })}`;
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "FamilyBrain/1.0 (travel planner)",
        Accept: "application/json",
      },
    });
    if (!response.ok) return null;
    const data = (await response.json()) as Array<{ lat?: string; lon?: string }>;
    const hit = data[0];
    if (!hit?.lat || !hit?.lon) return null;
    const lat = Number(hit.lat);
    const lon = Number(hit.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    return { lat, lon };
  } catch {
    return null;
  }
}

async function resolvePlace(
  coords: { lat: number | null; lon: number | null },
  name: string
): Promise<PlaceInput> {
  if (coords.lat != null && coords.lon != null) {
    return { lat: coords.lat, lon: coords.lon, name: name || undefined };
  }
  if (name.trim()) {
    const geocoded = await geocodePlace(name);
    if (geocoded) {
      return { ...geocoded, name: name.trim() };
    }
    return { name: name.trim() };
  }
  throw new Error("Start- und Zielort fehlen (Name oder Koordinaten).");
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

function buildEnrichmentPayload(
  event: TripEventRow,
  trip: OjpTrip,
  inputHash: string,
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
  };
}

export async function enrichTrainEvent(eventId: number): Promise<TrainEnrichResult> {
  const event = getTripEventById(eventId);
  if (!event) throw new Error("Ereignis nicht gefunden");
  if (event.event_type !== "Zugreisen") {
    throw new Error("Anreicherung nur für Zugreisen.");
  }

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

  const [origin, destination] = await Promise.all([
    resolvePlace(
      { lat: event.departure_lat, lon: event.departure_lon },
      places.origin
    ),
    resolvePlace(
      { lat: event.arrival_lat, lon: event.arrival_lon },
      places.destination
    ),
  ]);

  const { trip, warning } = await planOjpTrip(
    {
      origin,
      destination,
      depArrTimeIso,
      numberOfResults: 3,
    },
    {
      trainNumber: event.flight_number,
      startTimeIso: depArrTimeIso,
    }
  );

  const inputHash = hashTrainInput(event);
  const enrichment = buildEnrichmentPayload(event, trip, inputHash, warning);

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
