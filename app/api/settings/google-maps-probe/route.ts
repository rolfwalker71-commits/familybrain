import { NextResponse } from "next/server";
import { isAuthError, requireAdmin } from "@/lib/auth/current-user";
import { ensureInitialized } from "@/lib/db/migrations";
import { probeGoogleMaps } from "@/lib/google/maps";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Admin: Google Geocoding / Routes prüfen (keine Static Maps). */
export async function POST() {
  ensureInitialized();
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth;

  const result = await probeGoogleMaps();
  return NextResponse.json({
    ok: result.hasKey && result.geocodeOk,
    ...result,
    hint: !result.hasKey
      ? "Kein API-Key unter TravelBuddy gespeichert."
      : !result.geocodeOk
        ? "Geocoding fehlgeschlagen — Geocoding API / Key / Billing prüfen."
        : !result.driveOk
          ? "Geocode ok, Fahrzeit fehlgeschlagen — Routes oder Directions API aktivieren."
          : "Google Maps OK (Geocode + Fahrzeit). Kartenausschnitte nutzen Leaflet/OSM.",
  });
}
