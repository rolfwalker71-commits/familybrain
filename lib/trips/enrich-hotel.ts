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
  source?: string;
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
  "ferry_terminal",
  "harbour",
  "harbor",
  "marina",
  "pier",
  "port",
  "dock",
  "cruise",
]);

const PREFERRED_CLASSES = new Set([
  "tourism",
  "amenity",
  "leisure",
  "harbour",
  "harbor",
  "waterway",
]);

const PHOTON_BASE = "https://photon.komoot.io";

let lastGeocodeAt = 0;

async function geocodeFetch(url: string): Promise<Response> {
  // Be polite to public geocoders (Nominatim policy ~1 req/s).
  const wait = 1100 - (Date.now() - lastGeocodeAt);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastGeocodeAt = Date.now();
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
  osm_value?: string;
  osm_key?: string;
}): boolean {
  const type = (row.type || row.osm_value || "").toLowerCase();
  const cls = (row.class || row.osm_key || "").toLowerCase();
  if (PREFERRED_TYPES.has(type)) return true;
  if (cls === "tourism") return true;
  if (cls === "amenity" && (type === "restaurant" || type === "cafe")) {
    return true;
  }
  if (PREFERRED_CLASSES.has(cls) && type !== "yes") return true;
  if (
    /port|harbour|harbor|ferry|cruise|marina|pier|terminal/i.test(
      `${cls} ${type}`
    )
  ) {
    return true;
  }
  return false;
}

/** Build shorter / fuzzier query variants — Nominatim is very literal. */
export function buildPlaceQueryVariants(raw: string): string[] {
  const cleaned = raw
    .replace(/\s+/g, " ")
    .replace(/[|·•]+/g, ",")
    .trim();
  if (!cleaned) return [];

  const parts = cleaned
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);

  const variants: string[] = [cleaned];
  if (parts.length >= 2) {
    variants.push(parts.slice(0, 2).join(", "));
    variants.push(parts.slice(0, Math.min(3, parts.length)).join(", "));
    variants.push(parts[0]);
    // Last meaningful place token often helps ("Barcelona")
    const last = parts[parts.length - 1];
    if (last && last !== parts[0] && last.length >= 3) {
      variants.push(`${parts[0]}, ${last}`);
    }
  }

  // Drop house-number-only noise for a name+city style query
  const withoutNumbers = cleaned.replace(/\b\d{1,5}[a-zA-Z]?\b/g, " ").replace(/\s+/g, " ").trim();
  if (withoutNumbers.length >= 5 && withoutNumbers !== cleaned) {
    variants.push(withoutNumbers);
  }

  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of variants) {
    const key = v.toLowerCase();
    if (key.length < 3 || seen.has(key)) continue;
    seen.add(key);
    out.push(v);
  }
  return out.slice(0, 5);
}

function formatPhotonAddress(props: Record<string, unknown>): string {
  const bits = [
    [props.street, props.housenumber].filter(Boolean).join(" "),
    props.district,
    props.city || props.town || props.village || props.municipality,
    props.state,
    props.postcode,
    props.country,
  ]
    .map((x) => (typeof x === "string" ? x.trim() : ""))
    .filter(Boolean);
  return bits.join(", ");
}

function candidateKey(c: PlaceCandidate): string {
  return `${c.lat.toFixed(4)},${c.lon.toFixed(4)}`;
}

async function searchPhoton(query: string): Promise<PlaceCandidate[]> {
  const url = `${PHOTON_BASE}/api/?${new URLSearchParams({
    q: query,
    limit: "10",
    lang: "de",
  }).toString()}`;

  const response = await geocodeFetch(url);
  if (!response.ok) return [];

  const data = (await response.json()) as {
    features?: Array<{
      geometry?: { coordinates?: [number, number] };
      properties?: Record<string, unknown>;
    }>;
  };

  const out: PlaceCandidate[] = [];
  for (const feature of data.features || []) {
    const coords = feature.geometry?.coordinates;
    const props = feature.properties || {};
    if (!coords || coords.length < 2) continue;
    const lon = Number(coords[0]);
    const lat = Number(coords[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;

    const osmType =
      typeof props.osm_type === "string"
        ? props.osm_type.slice(0, 1).toLowerCase()
        : "n";
    const osmIdNum = props.osm_id != null ? String(props.osm_id) : "";
    const name =
      (typeof props.name === "string" && props.name) ||
      (typeof props.street === "string" && props.street) ||
      "Ort";
    const address = formatPhotonAddress(props) || name;
    const displayName =
      typeof props.name === "string" && props.name
        ? [props.name, address].filter((x, i, a) => a.indexOf(x) === i).join(", ")
        : address;

    out.push({
      osmId: `${osmType}${osmIdNum}`,
      name,
      displayName,
      address,
      phone: null,
      website: null,
      lat,
      lon,
      source: "photon",
    });
  }
  return out;
}

async function searchNominatim(query: string): Promise<PlaceCandidate[]> {
  const base = getNominatimBaseUrl();
  const url = `${base}/search?${new URLSearchParams({
    q: query,
    format: "jsonv2",
    addressdetails: "1",
    extratags: "1",
    dedupe: "1",
    limit: "12",
  }).toString()}`;

  const response = await geocodeFetch(url);
  if (!response.ok) return [];

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
    .map((row): (PlaceCandidate & { preferred: boolean }) | null => {
      const lat = Number(row.lat);
      const lon = Number(row.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
      const osmId = `${row.osm_type || "n"}${row.osm_id || ""}`;
      const phone =
        row.extratags?.phone || row.extratags?.["contact:phone"] || null;
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
        source: "nominatim",
        preferred: isPreferredPlace(row),
      };
    })
    .filter((x): x is PlaceCandidate & { preferred: boolean } => Boolean(x))
    .map(({ preferred: _p, ...candidate }) => candidate);
}

function mergeCandidates(groups: PlaceCandidate[][]): PlaceCandidate[] {
  const byKey = new Map<string, PlaceCandidate>();
  for (const group of groups) {
    for (const c of group) {
      const key = candidateKey(c);
      const existing = byKey.get(key);
      if (!existing) {
        byKey.set(key, c);
        continue;
      }
      // Prefer entry with phone/website or longer address
      const score = (x: PlaceCandidate) =>
        (x.phone ? 2 : 0) +
        (x.website ? 2 : 0) +
        (x.address?.length || 0) / 100;
      if (score(c) > score(existing)) byKey.set(key, c);
    }
  }
  return [...byKey.values()];
}

function rankCandidates(
  candidates: PlaceCandidate[],
  query: string
): PlaceCandidate[] {
  const q = query.toLowerCase();
  const tokens = q
    .split(/[^a-z0-9äöüáéíóúàè]+/i)
    .map((t) => t.trim())
    .filter((t) => t.length >= 3);

  return [...candidates]
    .map((c) => {
      const hay = `${c.name} ${c.displayName} ${c.address || ""}`.toLowerCase();
      let score = 0;
      for (const t of tokens) {
        if (hay.includes(t)) score += 2;
      }
      if (c.phone) score += 1;
      if (c.website) score += 1;
      if (c.source === "photon") score += 0.5;
      return { c, score };
    })
    .sort((a, b) => b.score - a.score)
    .map((x) => x.c);
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
    [event.title, event.address, event.location, trip?.destination]
      .filter(Boolean)
      .join(", ");

  if (!query || query.length < 3) {
    throw new Error("Suchbegriff für Hotel/Ort ist zu kurz.");
  }

  const variants = buildPlaceQueryVariants(query);
  const collected: PlaceCandidate[][] = [];

  // 1) Photon first — fuzzy, much better for free-text addresses
  for (const variant of variants.slice(0, 3)) {
    try {
      const photonHits = await searchPhoton(variant);
      if (photonHits.length) {
        collected.push(photonHits);
        if (photonHits.length >= 3) break;
      }
    } catch {
      /* try next */
    }
  }

  // 2) Nominatim as fallback / complement (structured OSM search)
  if (mergeCandidates(collected).length < 3) {
    for (const variant of variants.slice(0, 2)) {
      try {
        const nomiHits = await searchNominatim(variant);
        if (nomiHits.length) collected.push(nomiHits);
      } catch {
        /* try next */
      }
    }
  }

  const merged = mergeCandidates(collected);
  if (merged.length === 0) {
    throw new Error(
      `Keine Treffer für «${variants[0]}». Kürzer suchen (z. B. nur Name + Stadt) oder Schreibweise prüfen.`
    );
  }

  return rankCandidates(merged, query).slice(0, 8);
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
    location:
      event.location && event.location.trim()
        ? event.location
        : candidate.name,
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
