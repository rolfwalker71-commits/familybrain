import { NextResponse } from "next/server";
import { isAuthError, requireAuth } from "@/lib/auth/current-user";
import { ensureInitialized } from "@/lib/db/migrations";
import { fetchStaticMapPngDetailed } from "@/lib/trips/static-map";
import { hasGoogleMapsApiKey } from "@/lib/google/maps";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Static map snippet (Google Static Maps if key works, else OSM). */
export async function GET(request: Request) {
  ensureInitialized();
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  const { searchParams } = new URL(request.url);
  const lat = Number(searchParams.get("lat"));
  const lon = Number(searchParams.get("lon"));
  const zoom = Math.min(16, Math.max(10, Number(searchParams.get("z") || 14)));
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return NextResponse.json({ error: "lat/lon required" }, { status: 400 });
  }
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    return NextResponse.json({ error: "invalid coordinates" }, { status: 400 });
  }

  const result = await fetchStaticMapPngDetailed({
    lat,
    lon,
    zoom,
    withMarker: true,
  });
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
      // Kurz cachen — sonst bleibt alte OSM-Kachel nach Key-Aktivierung hängen
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
