import { NextResponse } from "next/server";
import { isAuthError, requireAdmin } from "@/lib/auth/current-user";
import { ensureInitialized } from "@/lib/db/migrations";
import { fetchStaticMapPng } from "@/lib/trips/static-map";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Static OSM tile snippet for an agenda place (auth required). */
export async function GET(request: Request) {
  ensureInitialized();
  const auth = await requireAdmin();
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

  const png = await fetchStaticMapPng({
    lat,
    lon,
    zoom,
    withMarker: true,
  });
  if (!png) {
    return NextResponse.json({ error: "Karte nicht verfügbar" }, { status: 502 });
  }

  return new NextResponse(new Uint8Array(png), {
    status: 200,
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "private, max-age=86400",
    },
  });
}
