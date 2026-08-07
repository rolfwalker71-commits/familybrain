import sharp from "sharp";
import {
  fetchGoogleStaticMapDetailed,
  fetchGoogleStaticRouteMapDetailed,
  hasGoogleMapsApiKey,
} from "@/lib/google/maps";

const USER_AGENT =
  "TripBook-TravelBrain/1.0 (https://github.com/rolfwalker71-commits/familybrain)";

function tileXY(lat: number, lon: number, zoom: number): { x: number; y: number } {
  const n = 2 ** zoom;
  const x = Math.floor(((lon + 180) / 360) * n);
  const latRad = (lat * Math.PI) / 180;
  const y = Math.floor(
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n
  );
  return { x, y };
}

async function fetchOsmTile(
  z: number,
  x: number,
  y: number
): Promise<Buffer | null> {
  const url = `https://tile.openstreetmap.org/${z}/${x}/${y}.png`;
  try {
    const response = await fetch(url, {
      headers: { "User-Agent": USER_AGENT },
      cache: "no-store",
    });
    if (!response.ok) return null;
    return Buffer.from(await response.arrayBuffer());
  } catch {
    return null;
  }
}

async function fetchOsmStaticMapPng(input: {
  lat: number;
  lon: number;
  zoom: number;
  withMarker: boolean;
}): Promise<Buffer | null> {
  const { x, y } = tileXY(input.lat, input.lon, input.zoom);
  const tile = await fetchOsmTile(input.zoom, x, y);
  if (!tile) return null;

  if (!input.withMarker) return tile;

  const n = 2 ** input.zoom;
  const xF = ((input.lon + 180) / 360) * n;
  const latRad = (input.lat * Math.PI) / 180;
  const yF =
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n;
  const px = Math.round((xF - x) * 256);
  const py = Math.round((yF - y) * 256);

  const markerSvg = Buffer.from(
    `<svg width="256" height="256" xmlns="http://www.w3.org/2000/svg">
      <circle cx="${px}" cy="${py}" r="10" fill="#c0392b" stroke="#ffffff" stroke-width="3"/>
      <circle cx="${px}" cy="${py}" r="3" fill="#ffffff"/>
    </svg>`
  );

  try {
    return await sharp(tile)
      .composite([{ input: markerSvg, top: 0, left: 0 }])
      .png()
      .toBuffer();
  } catch {
    return tile;
  }
}

export type StaticMapFetchResult = {
  buffer: Buffer | null;
  source: "google" | "osm" | "none";
  googleError: string | null;
};

/**
 * Kartenausschnitt um lat/lon mit Pin.
 * Mit Google Maps API-Key: Static Maps zuerst; bei Fehler OSM + googleError.
 */
export async function fetchStaticMapPngDetailed(input: {
  lat: number;
  lon: number;
  zoom?: number;
  withMarker?: boolean;
}): Promise<StaticMapFetchResult> {
  const zoom = input.zoom ?? 11;
  const withMarker = input.withMarker !== false;

  if (hasGoogleMapsApiKey()) {
    const google = await fetchGoogleStaticMapDetailed({
      lat: input.lat,
      lon: input.lon,
      zoom,
      width: 640,
      height: 400,
      scale: 2,
      maptype: "roadmap",
      withMarker,
    });
    if (google.ok) {
      return { buffer: google.buffer, source: "google", googleError: null };
    }
    console.warn(
      "[static-map] Google Static Maps fehlgeschlagen, Fallback OSM:",
      google.error
    );
    const osm = await fetchOsmStaticMapPng({
      lat: input.lat,
      lon: input.lon,
      zoom,
      withMarker,
    });
    return {
      buffer: osm,
      source: osm ? "osm" : "none",
      googleError: google.error,
    };
  }

  const osm = await fetchOsmStaticMapPng({
    lat: input.lat,
    lon: input.lon,
    zoom,
    withMarker,
  });
  return {
    buffer: osm,
    source: osm ? "osm" : "none",
    googleError: null,
  };
}

export async function fetchStaticMapPng(input: {
  lat: number;
  lon: number;
  zoom?: number;
  withMarker?: boolean;
}): Promise<Buffer | null> {
  const r = await fetchStaticMapPngDetailed(input);
  return r.buffer;
}

/**
 * Von/Nach-Route als Static Map (Google). Ohne Key / bei Fehler: kein OSM-Stitch,
 * caller kann auf Leaflet zurückfallen.
 */
export async function fetchStaticRouteMapPngDetailed(input: {
  from: { lat: number; lon: number };
  to: { lat: number; lon: number };
  geodesic?: boolean;
  pathPoints?: Array<{ lat: number; lon: number }>;
  zoom?: number;
}): Promise<StaticMapFetchResult> {
  if (!hasGoogleMapsApiKey()) {
    return { buffer: null, source: "none", googleError: "no_api_key" };
  }

  const google = await fetchGoogleStaticRouteMapDetailed({
    from: input.from,
    to: input.to,
    geodesic: input.geodesic,
    pathPoints: input.pathPoints,
    zoom: input.zoom,
    width: 640,
    height: 400,
    scale: 2,
    maptype: "roadmap",
  });

  if (google.ok) {
    return { buffer: google.buffer, source: "google", googleError: null };
  }

  console.warn(
    "[static-map] Google Static Route fehlgeschlagen:",
    google.error
  );
  return { buffer: null, source: "none", googleError: google.error };
}
