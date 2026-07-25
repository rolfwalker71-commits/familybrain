import sharp from "sharp";

const USER_AGENT =
  "FamilyBrain-TravelBrain/1.0 (https://github.com/rolfwalker71-commits/familybrain)";

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

/**
 * Single OSM tile around lat/lon with a simple pin marker.
 * Prefer resolveWeatherMapZoom() for weather comments (sea ≈ 4, urban ≈ 10, land ≈ 11).
 */
export async function fetchStaticMapPng(input: {
  lat: number;
  lon: number;
  zoom?: number;
  withMarker?: boolean;
}): Promise<Buffer | null> {
  const zoom = input.zoom ?? 11;
  const { x, y } = tileXY(input.lat, input.lon, zoom);
  const tile = await fetchOsmTile(zoom, x, y);
  if (!tile) return null;

  if (input.withMarker === false) return tile;

  // Pixel position of lat/lon within the 256×256 tile.
  const n = 2 ** zoom;
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
