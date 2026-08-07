import { getSetting, setSetting } from "@/lib/db/migrations";

export const GOOGLE_MAPS_API_KEY_SETTING = "google_maps_api_key";

export function getGoogleMapsApiKey(): string | null {
  return (
    getSetting(GOOGLE_MAPS_API_KEY_SETTING)?.trim() ||
    process.env.GOOGLE_MAPS_API_KEY?.trim() ||
    null
  );
}

export function saveGoogleMapsApiKey(value: string | null): void {
  const v = value?.trim() || null;
  setSetting(GOOGLE_MAPS_API_KEY_SETTING, v);
}

export function hasGoogleMapsApiKey(): boolean {
  return Boolean(getGoogleMapsApiKey());
}

export type GoogleGeocodedPlace = {
  lat: number;
  lon: number;
  displayName: string;
};

export type GoogleDriveEstimate = {
  minutes: number;
  distanceKm: number;
};

/** Geocode via Google Geocoding API (region CH). */
export async function geocodeWithGoogleMaps(
  query: string
): Promise<GoogleGeocodedPlace | null> {
  const key = getGoogleMapsApiKey();
  const q = query.trim();
  if (!key || !q) return null;

  const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
  url.searchParams.set("address", q);
  url.searchParams.set("key", key);
  url.searchParams.set("language", "de");
  url.searchParams.set("region", "ch");

  try {
    const res = await fetch(url.toString(), {
      signal: AbortSignal.timeout(10000),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      status?: string;
      results?: Array<{
        formatted_address?: string;
        geometry?: { location?: { lat?: number; lng?: number } };
      }>;
    };
    if (data.status !== "OK" && data.status !== "ZERO_RESULTS") {
      console.warn("[google-maps] geocode status:", data.status);
    }
    const hit = data.results?.[0];
    const lat = hit?.geometry?.location?.lat;
    const lon = hit?.geometry?.location?.lng;
    if (
      lat == null ||
      lon == null ||
      !Number.isFinite(lat) ||
      !Number.isFinite(lon)
    ) {
      return null;
    }
    return {
      lat,
      lon,
      displayName: hit?.formatted_address?.trim() || q,
    };
  } catch (error) {
    console.warn(
      "[google-maps] geocode failed:",
      error instanceof Error ? error.message : error
    );
    return null;
  }
}

/**
 * Drive time home → destination.
 * Prefers Routes API v2; falls back to Directions API (Legacy).
 */
export async function fetchDriveWithGoogleMaps(
  origin: { lat: number; lon: number },
  destination: { lat: number; lon: number }
): Promise<GoogleDriveEstimate | null> {
  const key = getGoogleMapsApiKey();
  if (!key) return null;

  const viaRoutes = await driveViaRoutesApi(key, origin, destination);
  if (viaRoutes) return viaRoutes;
  return driveViaDirectionsApi(key, origin, destination);
}

async function driveViaRoutesApi(
  key: string,
  origin: { lat: number; lon: number },
  destination: { lat: number; lon: number }
): Promise<GoogleDriveEstimate | null> {
  try {
    const res = await fetch(
      "https://routes.googleapis.com/directions/v2:computeRoutes",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": key,
          "X-Goog-FieldMask": "routes.duration,routes.distanceMeters",
        },
        body: JSON.stringify({
          origin: {
            location: {
              latLng: { latitude: origin.lat, longitude: origin.lon },
            },
          },
          destination: {
            location: {
              latLng: {
                latitude: destination.lat,
                longitude: destination.lon,
              },
            },
          },
          travelMode: "DRIVE",
          routingPreference: "TRAFFIC_UNAWARE",
          languageCode: "de-CH",
          regionCode: "CH",
          units: "METRIC",
        }),
        signal: AbortSignal.timeout(12000),
        cache: "no-store",
      }
    );
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.warn("[google-maps] Routes API", res.status, text.slice(0, 180));
      return null;
    }
    const data = (await res.json()) as {
      routes?: Array<{ duration?: string; distanceMeters?: number }>;
    };
    const route = data.routes?.[0];
    if (!route) return null;
    const seconds = parseDurationSeconds(route.duration);
    const meters = Number(route.distanceMeters);
    if (seconds == null) return null;
    return {
      minutes: Math.max(1, Math.round(seconds / 60)),
      distanceKm: Number.isFinite(meters)
        ? Math.round((meters / 1000) * 10) / 10
        : 0,
    };
  } catch (error) {
    console.warn(
      "[google-maps] Routes API failed:",
      error instanceof Error ? error.message : error
    );
    return null;
  }
}

async function driveViaDirectionsApi(
  key: string,
  origin: { lat: number; lon: number },
  destination: { lat: number; lon: number }
): Promise<GoogleDriveEstimate | null> {
  const url = new URL("https://maps.googleapis.com/maps/api/directions/json");
  url.searchParams.set("origin", `${origin.lat},${origin.lon}`);
  url.searchParams.set(
    "destination",
    `${destination.lat},${destination.lon}`
  );
  url.searchParams.set("mode", "driving");
  url.searchParams.set("language", "de");
  url.searchParams.set("region", "ch");
  url.searchParams.set("key", key);

  try {
    const res = await fetch(url.toString(), {
      signal: AbortSignal.timeout(12000),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      status?: string;
      routes?: Array<{
        legs?: Array<{
          duration?: { value?: number };
          distance?: { value?: number };
        }>;
      }>;
    };
    if (data.status !== "OK") {
      console.warn("[google-maps] Directions status:", data.status);
      return null;
    }
    const leg = data.routes?.[0]?.legs?.[0];
    const seconds = Number(leg?.duration?.value);
    const meters = Number(leg?.distance?.value);
    if (!Number.isFinite(seconds)) return null;
    return {
      minutes: Math.max(1, Math.round(seconds / 60)),
      distanceKm: Number.isFinite(meters)
        ? Math.round((meters / 1000) * 10) / 10
        : 0,
    };
  } catch (error) {
    console.warn(
      "[google-maps] Directions failed:",
      error instanceof Error ? error.message : error
    );
    return null;
  }
}

/** Parse protobuf Duration string like "1234s". */
function parseDurationSeconds(raw: string | undefined): number | null {
  if (!raw) return null;
  const m = /^(\d+(?:\.\d+)?)s$/.exec(raw.trim());
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

export type GoogleStaticMapType = "roadmap" | "terrain" | "hybrid" | "satellite";

/**
 * Google Maps Static API — Kartenausschnitt mit Marker.
 * Braucht «Maps Static API» im Cloud-Projekt (zusätzlich zu Geocoding/Routes).
 */
export async function fetchGoogleStaticMapPng(input: {
  lat: number;
  lon: number;
  zoom?: number;
  width?: number;
  height?: number;
  scale?: 1 | 2;
  maptype?: GoogleStaticMapType;
  withMarker?: boolean;
}): Promise<Buffer | null> {
  const key = getGoogleMapsApiKey();
  if (!key) return null;

  const zoom = Math.min(20, Math.max(1, input.zoom ?? 15));
  const width = Math.min(640, Math.max(64, input.width ?? 640));
  const height = Math.min(640, Math.max(64, input.height ?? 400));
  const scale = input.scale ?? 2;
  const maptype = input.maptype ?? "roadmap";

  const url = new URL("https://maps.googleapis.com/maps/api/staticmap");
  url.searchParams.set("center", `${input.lat},${input.lon}`);
  url.searchParams.set("zoom", String(zoom));
  url.searchParams.set("size", `${width}x${height}`);
  url.searchParams.set("scale", String(scale));
  url.searchParams.set("maptype", maptype);
  url.searchParams.set("language", "de");
  url.searchParams.set("region", "CH");
  url.searchParams.set("key", key);
  if (input.withMarker !== false) {
    url.searchParams.set(
      "markers",
      `color:0xC0392B|${input.lat},${input.lon}`
    );
  }

  try {
    const res = await fetch(url.toString(), {
      signal: AbortSignal.timeout(15000),
      cache: "no-store",
    });
    if (!res.ok) {
      console.warn("[google-maps] Static Map HTTP", res.status);
      return null;
    }
    const ct = (res.headers.get("content-type") || "").toLowerCase();
    if (!ct.includes("image")) {
      const text = await res.text().catch(() => "");
      console.warn(
        "[google-maps] Static Map unexpected content:",
        text.slice(0, 160)
      );
      return null;
    }
    return Buffer.from(await res.arrayBuffer());
  } catch (error) {
    console.warn(
      "[google-maps] Static Map failed:",
      error instanceof Error ? error.message : error
    );
    return null;
  }
}
