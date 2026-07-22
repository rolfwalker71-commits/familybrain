import { getNominatimBaseUrl } from "@/lib/trips/settings";

export type GeocodedPlace = {
  lat: number;
  lon: number;
  displayName: string;
};

/** Resolve a place string via Nominatim (same stack as TravelBrain). */
export async function geocodePlace(
  query: string
): Promise<GeocodedPlace | null> {
  const q = query.trim();
  if (!q) return null;

  const base = getNominatimBaseUrl();
  const url = new URL(`${base}/search`);
  url.searchParams.set("q", q);
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", "1");

  try {
    const res = await fetch(url.toString(), {
      headers: {
        Accept: "application/json",
        "User-Agent": "FamilyBrain-FinanzBrain/1.0",
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as Array<{
      lat?: string;
      lon?: string;
      display_name?: string;
    }>;
    const hit = data[0];
    if (!hit?.lat || !hit?.lon) return null;
    const lat = Number(hit.lat);
    const lon = Number(hit.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    return {
      lat,
      lon,
      displayName: hit.display_name?.trim() || q,
    };
  } catch (error) {
    console.error("[finance-brain] geocode failed:", error);
    return null;
  }
}
