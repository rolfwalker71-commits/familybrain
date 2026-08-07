import { getNominatimBaseUrl } from "@/lib/trips/settings";

export type GeocodedPlace = {
  lat: number;
  lon: number;
  displayName: string;
};

const GEOCODE_UA =
  "BuddyApp/1.0 (https://github.com/rolfwalker71-commits/familybrain; familybrain)";

/** Open-Meteo Geocoding — oft zuverlässiger für CH-Orte als öffentliches Nominatim. */
export async function geocodePlaceOpenMeteo(
  query: string,
  opts?: { countryCode?: string }
): Promise<GeocodedPlace | null> {
  const q = query.trim();
  if (!q) return null;
  const url = new URL("https://geocoding-api.open-meteo.com/v1/search");
  url.searchParams.set("name", q);
  url.searchParams.set("count", "1");
  url.searchParams.set("language", "de");
  url.searchParams.set("format", "json");
  if (opts?.countryCode) {
    url.searchParams.set("countryCode", opts.countryCode.toUpperCase());
  }
  try {
    const res = await fetch(url.toString(), {
      headers: { Accept: "application/json", "User-Agent": GEOCODE_UA },
      signal: AbortSignal.timeout(8000),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      results?: Array<{
        latitude?: number;
        longitude?: number;
        name?: string;
        admin1?: string;
        country?: string;
      }>;
    };
    const hit = data.results?.[0];
    if (
      hit?.latitude == null ||
      hit?.longitude == null ||
      !Number.isFinite(hit.latitude) ||
      !Number.isFinite(hit.longitude)
    ) {
      return null;
    }
    const label = [hit.name, hit.admin1, hit.country]
      .filter(Boolean)
      .join(", ");
    return {
      lat: hit.latitude,
      lon: hit.longitude,
      displayName: label || q,
    };
  } catch (error) {
    console.error("[geocode] open-meteo failed:", error);
    return null;
  }
}

/** Resolve a place string via Nominatim (same stack as TravelBrain). */
export async function geocodePlaceNominatim(
  query: string,
  opts?: { countrycodes?: string }
): Promise<GeocodedPlace | null> {
  const q = query.trim();
  if (!q) return null;

  const base = getNominatimBaseUrl();
  const url = new URL(`${base}/search`);
  url.searchParams.set("q", q);
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", "1");
  url.searchParams.set("addressdetails", "0");
  if (opts?.countrycodes) {
    url.searchParams.set("countrycodes", opts.countrycodes.toLowerCase());
  }

  try {
    const res = await fetch(url.toString(), {
      headers: {
        Accept: "application/json",
        "User-Agent": GEOCODE_UA,
      },
      signal: AbortSignal.timeout(8000),
      cache: "no-store",
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
    console.error("[geocode] nominatim failed:", error);
    return null;
  }
}

/**
 * Geocode with Nominatim first (street-capable), then Open-Meteo (place names).
 * Prefer CH bias for Buddy agenda.
 */
export async function geocodePlace(
  query: string,
  opts?: { preferSwitzerland?: boolean }
): Promise<GeocodedPlace | null> {
  const preferCh = opts?.preferSwitzerland !== false;
  const q = query.trim();
  if (!q) return null;

  const nominatim = await geocodePlaceNominatim(
    q,
    preferCh ? { countrycodes: "ch" } : undefined
  );
  if (nominatim) return nominatim;

  // Open-Meteo mag eher Ortsnamen als volle Strassenzeilen —
  // bei Misserfolg trotzdem versuchen (oft Stadt/PLZ-Treffer).
  const om = await geocodePlaceOpenMeteo(
    q,
    preferCh ? { countryCode: "CH" } : undefined
  );
  if (om) return om;

  // Ohne country-Filter noch einmal (Grenznähe / falsches Land-Token)
  if (preferCh) {
    const loose =
      (await geocodePlaceNominatim(q)) || (await geocodePlaceOpenMeteo(q));
    if (loose) return loose;
  }

  return null;
}
