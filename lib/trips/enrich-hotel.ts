import fs from "fs";
import path from "path";
import { nowIso } from "@/lib/utils/dates";
import { ensureTripMediaDirs, getTripMapsDir } from "@/lib/trips/constants";
import { getNominatimBaseUrl } from "@/lib/trips/settings";
import {
  getTripById,
  getTripEventById,
  updateTripEvent,
  type TripEventRow,
} from "@/lib/trips/queries";

export type PlaceCandidate = {
  osmId: string;
  name: string;
  displayName: string;
  address: string | null;
  phone: string | null;
  website: string | null;
  lat: number;
  lon: number;
};

let lastNominatimAt = 0;

async function nominatimFetch(url: string): Promise<Response> {
  const wait = 1100 - (Date.now() - lastNominatimAt);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastNominatimAt = Date.now();
  return fetch(url, {
    headers: {
      "User-Agent": "FamilyBrain-TravelBrain/1.0 (local family app)",
      Accept: "application/json",
    },
  });
}

export async function searchHotelPlaces(
  eventId: number,
  queryOverride?: string | null
): Promise<PlaceCandidate[]> {
  const event = getTripEventById(eventId);
  if (!event) throw new Error("Ereignis nicht gefunden");
  const trip = getTripById(event.trip_id);

  const query =
    queryOverride?.trim() ||
    [event.title, event.location, trip?.destination]
      .filter(Boolean)
      .join(", ");

  if (!query || query.length < 3) {
    throw new Error("Suchbegriff für Hotel/Ort ist zu kurz.");
  }

  const base = getNominatimBaseUrl();
  const url = `${base}/search?${new URLSearchParams({
    q: query,
    format: "jsonv2",
    addressdetails: "1",
    extratags: "1",
    limit: "8",
  }).toString()}`;

  const response = await nominatimFetch(url);
  if (!response.ok) {
    throw new Error(`Nominatim-Suche fehlgeschlagen (${response.status}).`);
  }

  const rows = (await response.json()) as Array<{
    osm_type?: string;
    osm_id?: number;
    name?: string;
    display_name?: string;
    lat?: string;
    lon?: string;
    extratags?: Record<string, string>;
    type?: string;
    class?: string;
  }>;

  return rows
    .map((row): PlaceCandidate | null => {
      const lat = Number(row.lat);
      const lon = Number(row.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
      const osmId = `${row.osm_type || "n"}${row.osm_id || ""}`;
      const phone =
        row.extratags?.phone ||
        row.extratags?.["contact:phone"] ||
        null;
      const website =
        row.extratags?.website ||
        row.extratags?.["contact:website"] ||
        null;
      return {
        osmId,
        name: row.name || row.display_name?.split(",")[0] || "Ort",
        displayName: row.display_name || row.name || "Ort",
        address: row.display_name || null,
        phone,
        website,
        lat,
        lon,
      };
    })
    .filter((x): x is PlaceCandidate => Boolean(x));
}

export async function applyHotelPlaceEnrichment(
  eventId: number,
  candidate: PlaceCandidate
): Promise<TripEventRow> {
  const event = getTripEventById(eventId);
  if (!event) throw new Error("Ereignis nicht gefunden");

  const mapPath = await fetchStaticMap(candidate.lat, candidate.lon, eventId);

  return updateTripEvent(eventId, {
    placeName: candidate.name,
    address: candidate.address,
    phone: candidate.phone,
    website: candidate.website,
    lat: candidate.lat,
    lon: candidate.lon,
    osmId: candidate.osmId,
    location: candidate.address || candidate.name,
    mapImagePath: mapPath,
    enrichmentJson: JSON.stringify(candidate),
    enrichedAt: nowIso(),
  });
}

async function fetchStaticMap(
  lat: number,
  lon: number,
  eventId: number
): Promise<string | null> {
  ensureTripMediaDirs();
  // OpenStreetMap static map via staticmap.openstreetmap.de (public community service)
  const url = `https://staticmap.openstreetmap.de/staticmap.php?center=${lat},${lon}&zoom=15&size=640x360&markers=${lat},${lon},red-pushpin`;
  try {
    const response = await fetch(url, {
      headers: { "User-Agent": "FamilyBrain-TravelBrain/1.0" },
    });
    if (!response.ok) return null;
    const buffer = Buffer.from(await response.arrayBuffer());
    const fullPath = path.join(getTripMapsDir(), `event-${eventId}.png`);
    fs.writeFileSync(fullPath, buffer);
    return fullPath;
  } catch {
    return null;
  }
}
