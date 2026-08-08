import { getSetting, setSetting } from "@/lib/db/migrations";
import {
  encodeGooglePolyline,
  subsamplePolyline,
} from "@/lib/google/polyline";

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

export type GoogleStaticMapMarker = {
  lat: number;
  lon: number;
  /** Named color, e.g. red / green / blue */
  color?: string;
  /** Single A–Z / 0–9 label on the pin (nur mid/normal) */
  label?: string;
  size?: "tiny" | "mid" | "normal";
};

export type GoogleStaticMapPath = {
  points: Array<{ lat: number; lon: number }>;
  /** Great-circle between consecutive points (Flüge). */
  geodesic?: boolean;
  color?: string;
  weight?: number;
};

/** Erweitert die Bounding-Box, damit Static Maps nicht knüppeldicht zoomen. */
function paddedVisibleCorners(
  points: Array<{ lat: number; lon: number }>,
  padRatio = 0.45,
  minPadDeg = 0.08
): Array<{ lat: number; lon: number }> {
  if (points.length === 0) return [];
  let minLat = points[0]!.lat;
  let maxLat = points[0]!.lat;
  let minLon = points[0]!.lon;
  let maxLon = points[0]!.lon;
  for (const p of points) {
    minLat = Math.min(minLat, p.lat);
    maxLat = Math.max(maxLat, p.lat);
    minLon = Math.min(minLon, p.lon);
    maxLon = Math.max(maxLon, p.lon);
  }
  const latPad = Math.max((maxLat - minLat) * padRatio, minPadDeg);
  const lonPad = Math.max((maxLon - minLon) * padRatio, minPadDeg);
  return [
    { lat: minLat - latPad, lon: minLon - lonPad },
    { lat: minLat - latPad, lon: maxLon + lonPad },
    { lat: maxLat + latPad, lon: minLon - lonPad },
    { lat: maxLat + latPad, lon: maxLon + lonPad },
  ];
}

async function fetchGoogleStaticMapRequest(input: {
  width?: number;
  height?: number;
  scale?: 1 | 2;
  maptype?: GoogleStaticMapType;
  /** Wenn gesetzt: fester Ausschnitt. Sonst fit über Marker/Pfad. */
  center?: { lat: number; lon: number };
  zoom?: number;
  markers?: GoogleStaticMapMarker[];
  paths?: GoogleStaticMapPath[];
  /** Zusätzliche sichtbare Punkte (Padding für Auto-Fit). */
  visible?: Array<{ lat: number; lon: number }>;
}): Promise<GoogleStaticMapResult> {
  const key = getGoogleMapsApiKey();
  if (!key) return { ok: false, error: "no_api_key" };

  const width = Math.min(640, Math.max(64, input.width ?? 640));
  const height = Math.min(640, Math.max(64, input.height ?? 400));
  const scale = input.scale ?? 2;
  const maptype = input.maptype ?? "roadmap";
  const expectedMinBytes = 8_000;
  const markers = input.markers ?? [];
  const paths = input.paths ?? [];
  const visible = input.visible ?? [];

  if (
    !input.center &&
    markers.length === 0 &&
    paths.length === 0 &&
    visible.length === 0
  ) {
    return { ok: false, error: "no_geometry" };
  }

  const url = new URL("https://maps.googleapis.com/maps/api/staticmap");
  url.searchParams.set("size", `${width}x${height}`);
  url.searchParams.set("scale", String(scale));
  url.searchParams.set("maptype", maptype);
  url.searchParams.set("format", "png");
  url.searchParams.set("language", "de");
  url.searchParams.set("region", "CH");
  url.searchParams.set("key", key);

  if (input.center) {
    const zoom = Math.min(20, Math.max(1, input.zoom ?? 15));
    url.searchParams.set("center", `${input.center.lat},${input.center.lon}`);
    url.searchParams.set("zoom", String(zoom));
  }

  for (const m of markers) {
    const color = m.color || "red";
    const size = m.size ? `size:${m.size}|` : "";
    const label =
      m.label &&
      m.size !== "tiny" &&
      /^[A-Za-z0-9]$/.test(m.label)
        ? `label:${m.label.toUpperCase()}|`
        : "";
    url.searchParams.append(
      "markers",
      `${size}color:${color}|${label}${m.lat},${m.lon}`
    );
  }

  for (const p of paths) {
    if (p.points.length < 2) continue;
    const color = p.color || "0x0F766EFF";
    const weight = Math.min(10, Math.max(1, p.weight ?? 3));
    const geo = p.geodesic ? "|geodesic:true" : "";
    // Encoded polyline hält die Google-URL kurz (viele Zug-Punkte).
    const pts = subsamplePolyline(p.points, 120);
    const enc = encodeGooglePolyline(pts);
    url.searchParams.append(
      "path",
      `color:${color}|weight:${weight}${geo}|enc:${enc}`
    );
  }

  if (visible.length > 0) {
    url.searchParams.set(
      "visible",
      visible.map((p) => `${p.lat},${p.lon}`).join("|")
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
  return fetchGoogleStaticMapRequest({
    center: { lat: input.lat, lon: input.lon },
    zoom: input.zoom,
    width: input.width,
    height: input.height,
    scale: input.scale,
    maptype: input.maptype,
    markers:
      input.withMarker === false
        ? []
        : [{ lat: input.lat, lon: input.lon, color: "red" }],
  });
}

/** Von/Nach-Route (Flug geodesic oder Transfer/Zug gerade bzw. Pfadpunkte). */
export async function fetchGoogleStaticRouteMapDetailed(input: {
  from: { lat: number; lon: number; label?: string };
  to: { lat: number; lon: number; label?: string };
  geodesic?: boolean;
  /** Optional Zwischenpunkte (z. B. OJP-Geometrie), sonst nur from→to. */
  pathPoints?: Array<{ lat: number; lon: number }>;
  /** Wenn gesetzt: fester Zoom um die Streckenmitte (Slider). */
  zoom?: number;
  width?: number;
  height?: number;
  scale?: 1 | 2;
  maptype?: GoogleStaticMapType;
}): Promise<GoogleStaticMapResult> {
  const pathPoints =
    input.pathPoints && input.pathPoints.length >= 2
      ? input.pathPoints
      : [input.from, input.to];

  // Kleine Dots statt riesiger A/B-Pins — Route trägt die Info.
  const markers = [
    {
      lat: input.from.lat,
      lon: input.from.lon,
      color: "0x0F766E",
      size: "tiny" as const,
    },
    {
      lat: input.to.lat,
      lon: input.to.lon,
      color: "0xC0392B",
      size: "tiny" as const,
    },
  ];
  const paths = [
    {
      points: pathPoints,
      geodesic: Boolean(input.geodesic) && pathPoints.length === 2,
      color: "0x0F766EFF",
      weight: 3,
    },
  ];

  if (input.zoom != null && Number.isFinite(input.zoom)) {
    const center = {
      lat: (input.from.lat + input.to.lat) / 2,
      lon: (input.from.lon + input.to.lon) / 2,
    };
    return fetchGoogleStaticMapRequest({
      width: input.width,
      height: input.height,
      scale: input.scale,
      maptype: input.maptype,
      center,
      zoom: Math.min(18, Math.max(2, Math.round(input.zoom))),
      markers,
      paths,
    });
  }

  // Auto-Fit mit Padding: kurze Transfers sonst zu nah; lange Flüge etwas Luft.
  const padPts = [...pathPoints, input.from, input.to];
  const spanLat =
    Math.max(...padPts.map((p) => p.lat)) - Math.min(...padPts.map((p) => p.lat));
  const spanLon =
    Math.max(...padPts.map((p) => p.lon)) - Math.min(...padPts.map((p) => p.lon));
  const shortHop = Math.max(spanLat, spanLon) < 0.35;
  const visible = paddedVisibleCorners(
    padPts,
    shortHop ? 0.7 : 0.4,
    shortHop ? 0.12 : 0.05
  );

  return fetchGoogleStaticMapRequest({
    width: input.width,
    height: input.height,
    scale: input.scale,
    maptype: input.maptype,
    markers,
    paths,
    visible,
  });
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
