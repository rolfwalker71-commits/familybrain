import { NextResponse } from "next/server";
import { isAuthError, requireAuth } from "@/lib/auth/current-user";
import { ensureInitialized } from "@/lib/db/migrations";
import {
  fetchStaticMapPngDetailed,
  fetchStaticRouteMapPngDetailed,
} from "@/lib/trips/static-map";
import { hasGoogleMapsApiKey } from "@/lib/google/maps";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseCoord(raw: string | null): number | null {
  if (raw == null || raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function isValidLatLon(lat: number, lon: number): boolean {
  return Math.abs(lat) <= 90 && Math.abs(lon) <= 180;
}

function mapResponse(
  result: Awaited<ReturnType<typeof fetchStaticMapPngDetailed>>
) {
  if (!result.buffer) {
    return NextResponse.json(
      {
        error: "Karte nicht verfügbar",
        hasGoogleMapsApiKey: hasGoogleMapsApiKey(),
        googleError: result.googleError,
        source: result.source,
      },
      { status: 502 }
    );
  }

  return new NextResponse(new Uint8Array(result.buffer), {
    status: 200,
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "private, max-age=120, must-revalidate",
      "X-Buddy-Map-Source": result.source,
      ...(result.googleError
        ? {
            "X-Buddy-Google-Map-Error": result.googleError
              .replace(/[^\x20-\x7E]/g, " ")
              .slice(0, 180),
          }
        : {}),
    },
  });
}

/**
 * Static map snippet:
 * - ?lat=&lon= — einzelner Ort
 * - ?fromLat=&fromLon=&toLat=&toLon=&route=geodesic|straight — Flug/Transfer
 */
export async function GET(request: Request) {
  ensureInitialized();
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  const { searchParams } = new URL(request.url);

  const fromLat = parseCoord(searchParams.get("fromLat"));
  const fromLon = parseCoord(searchParams.get("fromLon"));
  const toLat = parseCoord(searchParams.get("toLat"));
  const toLon = parseCoord(searchParams.get("toLon"));

  if (
    fromLat != null &&
    fromLon != null &&
    toLat != null &&
    toLon != null
  ) {
    if (
      !isValidLatLon(fromLat, fromLon) ||
      !isValidLatLon(toLat, toLon)
    ) {
      return NextResponse.json({ error: "invalid coordinates" }, { status: 400 });
    }
    const route = (searchParams.get("route") || "straight").toLowerCase();
    const geodesic = route === "geodesic" || route === "greatcircle";

    // Optional: kompakte Pfadpunkte "lat,lon|lat,lon|…" (z. B. Zug-Geometrie)
    const pathRaw = searchParams.get("path");
    let pathPoints: Array<{ lat: number; lon: number }> | undefined;
    if (pathRaw) {
      const parsed: Array<{ lat: number; lon: number }> = [];
      for (const part of pathRaw.split("|").slice(0, 60)) {
        const [a, b] = part.split(",");
        const lat = Number(a);
        const lon = Number(b);
        if (Number.isFinite(lat) && Number.isFinite(lon) && isValidLatLon(lat, lon)) {
          parsed.push({ lat, lon });
        }
      }
      if (parsed.length >= 2) pathPoints = parsed;
    }

    const zoomRaw = searchParams.get("z");
    const zoom =
      zoomRaw != null && zoomRaw !== ""
        ? Math.min(18, Math.max(2, Number(zoomRaw)))
        : undefined;

    return mapResponse(
      await fetchStaticRouteMapPngDetailed({
        from: { lat: fromLat, lon: fromLon },
        to: { lat: toLat, lon: toLon },
        geodesic: geodesic && !pathPoints,
        pathPoints,
        zoom: zoom != null && Number.isFinite(zoom) ? zoom : undefined,
      })
    );
  }

  const lat = parseCoord(searchParams.get("lat"));
  const lon = parseCoord(searchParams.get("lon"));
  const zoom = Math.min(18, Math.max(3, Number(searchParams.get("z") || 13)));
  if (lat == null || lon == null) {
    return NextResponse.json(
      { error: "lat/lon or fromLat/fromLon/toLat/toLon required" },
      { status: 400 }
    );
  }
  if (!isValidLatLon(lat, lon)) {
    return NextResponse.json({ error: "invalid coordinates" }, { status: 400 });
  }

  return mapResponse(
    await fetchStaticMapPngDetailed({
      lat,
      lon,
      zoom,
      withMarker: true,
    })
  );
}
