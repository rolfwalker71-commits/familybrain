/**
 * Detect land vs sea vs urban for static weather-map zoom.
 * Uses Nominatim reverse geocoding (best-effort; falls back to land).
 */

const USER_AGENT =
  "FamilyBrain-TravelBrain/1.0 (https://github.com/rolfwalker71-commits/familybrain)";

export type MapLocationKind = "sea" | "urban" | "land";

/** Zoom levels for weather comment maps. */
export const WEATHER_MAP_ZOOM: Record<MapLocationKind, number> = {
  /** Continent outlines / open ocean orientation. */
  sea: 4,
  /** City / town — slightly wider than countryside. */
  urban: 10,
  /** Countryside / mountains (previous default). */
  land: 11,
};

const SEA_TYPES = new Set([
  "ocean",
  "sea",
  "bay",
  "strait",
  "fjord",
  "sound",
  "gulf",
  "channel",
  "water",
  "coastline",
  "reef",
  "shoal",
]);

const URBAN_TYPES = new Set([
  "city",
  "town",
  "municipality",
  "suburb",
  "neighbourhood",
  "neighborhood",
  "quarter",
  "residential",
  "city_district",
  "borough",
  "village",
]);

function isSeaResult(data: {
  class?: string;
  type?: string;
  addresstype?: string;
  address?: Record<string, string | undefined>;
}): boolean {
  const cls = (data.class || "").toLowerCase();
  const type = (data.type || data.addresstype || "").toLowerCase();
  const address = data.address || {};

  if (address.ocean || address.sea) return true;
  if (SEA_TYPES.has(type)) return true;
  if (cls === "natural" && (type === "water" || type === "bay" || type === "strait")) {
    return true;
  }
  if (cls === "place" && (type === "ocean" || type === "sea" || type === "archipelago")) {
    return true;
  }
  // Named marine areas sometimes land as waterway / boundary.
  if (cls === "waterway" && SEA_TYPES.has(type)) return true;
  return false;
}

function isUrbanResult(data: {
  class?: string;
  type?: string;
  addresstype?: string;
  address?: Record<string, string | undefined>;
}): boolean {
  const type = (data.type || data.addresstype || "").toLowerCase();
  const address = data.address || {};
  if (URBAN_TYPES.has(type)) return true;
  if (
    address.city ||
    address.town ||
    address.municipality ||
    address.suburb ||
    address.neighbourhood ||
    address.neighborhood ||
    address.city_district ||
    address.borough
  ) {
    return true;
  }
  return false;
}

export async function detectMapLocationKind(
  lat: number,
  lon: number
): Promise<MapLocationKind> {
  const url = new URL("https://nominatim.openstreetmap.org/reverse");
  url.searchParams.set("lat", String(lat));
  url.searchParams.set("lon", String(lon));
  url.searchParams.set("format", "json");
  // Broad context: enough to classify ocean vs city without over-precision.
  url.searchParams.set("zoom", "8");
  url.searchParams.set("addressdetails", "1");

  try {
    const response = await fetch(url.toString(), {
      headers: {
        Accept: "application/json",
        "User-Agent": USER_AGENT,
      },
      cache: "no-store",
    });
    if (!response.ok) return "land";
    const data = (await response.json()) as {
      error?: string;
      class?: string;
      type?: string;
      addresstype?: string;
      address?: Record<string, string | undefined>;
    };
    if (data.error) return "land";
    if (isSeaResult(data)) return "sea";
    if (isUrbanResult(data)) return "urban";
    return "land";
  } catch {
    return "land";
  }
}

export async function resolveWeatherMapZoom(
  lat: number,
  lon: number
): Promise<{ kind: MapLocationKind; zoom: number }> {
  const kind = await detectMapLocationKind(lat, lon);
  return { kind, zoom: WEATHER_MAP_ZOOM[kind] };
}

/** True when a diary comment body is a generated «Wetter jetzt» entry. */
export function isWeatherCommentBody(body: string | null | undefined): boolean {
  if (!body) return false;
  const trimmed = body.trimStart();
  return (
    trimmed.includes("Wetter jetzt") ||
    trimmed.startsWith("🌤️") ||
    trimmed.startsWith("⛅")
  );
}
