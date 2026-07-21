import fs from "fs";
import path from "path";
import { nowIso } from "@/lib/utils/dates";
import { ensureTripMediaDirs, getTripMapsDir } from "@/lib/trips/paths";
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

const PREFERRED_TYPES = new Set([
  "hotel",
  "guest_house",
  "hostel",
  "motel",
  "apartment",
  "chalet",
  "resort",
  "camp_site",
  "caravan_site",
  "alpine_hut",
  "attraction",
  "museum",
  "gallery",
  "viewpoint",
  "theme_park",
  "zoo",
  "aquarium",
]);

const PREFERRED_CLASSES = new Set(["tourism", "amenity", "leisure"]);

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

function isPreferredPlace(row: {
  type?: string;
  class?: string;
}): boolean {
  const type = (row.type || "").toLowerCase();
  const cls = (row.class || "").toLowerCase();
  if (PREFERRED_TYPES.has(type)) return true;
  if (cls === "tourism") return true;
  if (cls === "amenity" && (type === "restaurant" || type === "cafe")) {
    return true;
  }
  if (PREFERRED_CLASSES.has(cls) && type !== "yes") return true;
  return false;
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
    limit: "12",
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

  type Ranked = PlaceCandidate & { preferred: boolean };

  const mapped: Ranked[] = rows
    .map((row): Ranked | null => {
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
        preferred: isPreferredPlace(row),
      };
    })
    .filter((x): x is Ranked => Boolean(x));

  const preferred = mapped.filter((c) => c.preferred);
  const others = mapped.filter((c) => !c.preferred);
  const ranked =
    preferred.length >= 3 ? preferred : [...preferred, ...others];

  return ranked.slice(0, 8).map(({ preferred: _p, ...candidate }) => candidate);
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
    mapImagePath: mapPath ?? event.map_image_path,
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
  // staticmap.openstreetmap.de is often unavailable — cache a single OSM tile instead.
  const zoom = 15;
  const n = 2 ** zoom;
  const x = Math.floor(((lon + 180) / 360) * n);
  const latRad = (lat * Math.PI) / 180;
  const y = Math.floor(
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n
  );
  const url = `https://tile.openstreetmap.org/${zoom}/${x}/${y}.png`;
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "FamilyBrain-TravelBrain/1.0 (https://github.com/rolfwalker71-commits/familybrain)",
      },
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
