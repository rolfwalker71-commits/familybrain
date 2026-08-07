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

export type GoogleStaticMapResult =
  | { ok: true; buffer: Buffer; bytes: number }
  | { ok: false; error: string; httpStatus?: number };

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
  const result = await fetchGoogleStaticMapDetailed(input);
  return result.ok ? result.buffer : null;
}

export async function fetchGoogleStaticMapDetailed(input: {
  lat: number;
  lon: number;
  zoom?: number;
  width?: number;
  height?: number;
  scale?: 1 | 2;
  maptype?: GoogleStaticMapType;
  withMarker?: boolean;
}): Promise<GoogleStaticMapResult> {
  const key = getGoogleMapsApiKey();
  if (!key) return { ok: false, error: "no_api_key" };

  const zoom = Math.min(20, Math.max(1, input.zoom ?? 15));
  const width = Math.min(640, Math.max(64, input.width ?? 640));
  const height = Math.min(640, Math.max(64, input.height ?? 400));
  const scale = input.scale ?? 2;
  const maptype = input.maptype ?? "roadmap";
  const expectedMinBytes = 8_000; // Fehlerbilder von Google sind oft winzig

  const url = new URL("https://maps.googleapis.com/maps/api/staticmap");
  url.searchParams.set("center", `${input.lat},${input.lon}`);
  url.searchParams.set("zoom", String(zoom));
  url.searchParams.set("size", `${width}x${height}`);
  url.searchParams.set("scale", String(scale));
  url.searchParams.set("maptype", maptype);
  url.searchParams.set("format", "png");
  url.searchParams.set("language", "de");
  url.searchParams.set("region", "CH");
  url.searchParams.set("key", key);
  if (input.withMarker !== false) {
    // Named color ist robuster als 0x… je nach Key/Account
    url.searchParams.set(
      "markers",
      `color:red|${input.lat},${input.lon}`
    );
  }

  try {
    const res = await fetch(url.toString(), {
      signal: AbortSignal.timeout(15000),
      cache: "no-store",
    });
    const ct = (res.headers.get("content-type") || "").toLowerCase();
    const buf = Buffer.from(await res.arrayBuffer());

    if (!res.ok) {
      const hint = buf.toString("utf8").slice(0, 200);
      console.warn("[google-maps] Static Map HTTP", res.status, hint);
      return {
        ok: false,
        error: `http_${res.status}${hint ? `: ${hint}` : ""}`,
        httpStatus: res.status,
      };
    }

    if (!ct.includes("image") || buf.length < expectedMinBytes) {
      const asText = buf.toString("utf8").slice(0, 240);
      console.warn(
        "[google-maps] Static Map rejected payload",
        "ct=",
        ct,
        "bytes=",
        buf.length,
        asText
      );
      return {
        ok: false,
        error:
          buf.length < expectedMinBytes
            ? `tiny_or_error_image (${buf.length}b) — oft: Maps Static API aus, Billing fehlt, oder Key nur für Browser-Referrer statt Server-IP`
            : `unexpected_content_type:${ct}`,
        httpStatus: res.status,
      };
    }

    return { ok: true, buffer: buf, bytes: buf.length };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn("[google-maps] Static Map failed:", message);
    return { ok: false, error: message };
  }
}

/** Kurzer Connectivity-Check für Einstellungen. */
export async function probeGoogleMaps(): Promise<{
  hasKey: boolean;
  geocodeOk: boolean;
  geocodeError: string | null;
  staticOk: boolean;
  staticError: string | null;
  staticBytes: number | null;
}> {
  const hasKey = hasGoogleMapsApiKey();
  if (!hasKey) {
    return {
      hasKey: false,
      geocodeOk: false,
      geocodeError: "no_api_key",
      staticOk: false,
      staticError: "no_api_key",
      staticBytes: null,
    };
  }

  let geocodeOk = false;
  let geocodeError: string | null = null;
  try {
    const geo = await geocodeWithGoogleMaps("Altdorf UR, Schweiz");
    geocodeOk = Boolean(geo);
    if (!geo) geocodeError = "ZERO_RESULTS_or_denied";
  } catch (e) {
    geocodeError = e instanceof Error ? e.message : String(e);
  }

  const staticRes = await fetchGoogleStaticMapDetailed({
    lat: 46.88042,
    lon: 8.64345,
    zoom: 15,
    width: 400,
    height: 240,
    scale: 2,
    withMarker: true,
  });

  return {
    hasKey: true,
    geocodeOk,
    geocodeError,
    staticOk: staticRes.ok,
    staticError: staticRes.ok ? null : staticRes.error,
    staticBytes: staticRes.ok ? staticRes.bytes : null,
  };
}
