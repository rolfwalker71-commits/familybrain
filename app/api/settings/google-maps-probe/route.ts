import { NextResponse } from "next/server";
import { isAuthError, requireAdmin } from "@/lib/auth/current-user";
import { ensureInitialized } from "@/lib/db/migrations";
import { probeGoogleMaps } from "@/lib/google/maps";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Admin: Google Maps Key / Static API / Geocoding kurz prüfen. */
export async function POST() {
  ensureInitialized();
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth;

  const result = await probeGoogleMaps();
  return NextResponse.json({
    ok: result.hasKey && result.geocodeOk && result.staticOk,
    ...result,
    hint: !result.hasKey
      ? "Kein API-Key unter TravelBuddy gespeichert."
      : !result.staticOk
        ? "Static Maps fehlgeschlagen. Typisch: Maps Static API nicht aktiv, Billing aus, oder Key nur auf HTTP-Referrer beschränkt (Server braucht IP-Beschränkung oder keine Restriction)."
        : !result.geocodeOk
          ? "Geocoding fehlgeschlagen — Geocoding API / Key prüfen."
          : "Google Maps OK (Geocode + Static Map).",
  });
}
