import { getSetting, setSetting } from "@/lib/db/migrations";

/** Same home point as dashboard weather (Altdorf UR). */
const HOME = { lat: 46.88042, lon: 8.64345 } as const;

const CACHE_KEY = "agenda_drive_cache_json";

type DriveCache = Record<
  string,
  { minutes: number; distanceKm: number; at: string }
>;

function readCache(): DriveCache {
  const raw = getSetting(CACHE_KEY);
  if (!raw) return {};
  try {
    return JSON.parse(raw) as DriveCache;
  } catch {
    return {};
  }
}

function writeCache(cache: DriveCache): void {
  const entries = Object.entries(cache).sort(
    (a, b) => b[1].at.localeCompare(a[1].at)
  );
  setSetting(CACHE_KEY, JSON.stringify(Object.fromEntries(entries.slice(0, 200))));
}

export type DriveEstimate = {
  minutes: number;
  distanceKm: number;
};

/** Driving time from home (Altdorf) via public OSRM. Cached by destination. */
export async function fetchDriveFromHome(
  lat: number,
  lon: number
): Promise<DriveEstimate | null> {
  const key = `${lat.toFixed(4)},${lon.toFixed(4)}`;
  const cache = readCache();
  const hit = cache[key];
  if (hit && Number.isFinite(hit.minutes)) {
    return { minutes: hit.minutes, distanceKm: hit.distanceKm };
  }

  const url = new URL(
    `https://router.project-osrm.org/route/v1/driving/${HOME.lon},${HOME.lat};${lon},${lat}`
  );
  url.searchParams.set("overview", "false");

  try {
    const res = await fetch(url.toString(), {
      headers: {
        Accept: "application/json",
        "User-Agent":
          "BuddyApp/1.0 (https://github.com/rolfwalker71-commits/familybrain)",
      },
      signal: AbortSignal.timeout(10000),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      code?: string;
      routes?: Array<{ duration?: number; distance?: number }>;
    };
    if (data.code !== "Ok" || !data.routes?.[0]) return null;
    const route = data.routes[0];
    const seconds = Number(route.duration);
    const meters = Number(route.distance);
    if (!Number.isFinite(seconds)) return null;
    const estimate: DriveEstimate = {
      minutes: Math.max(1, Math.round(seconds / 60)),
      distanceKm: Number.isFinite(meters)
        ? Math.round((meters / 1000) * 10) / 10
        : 0,
    };
    cache[key] = { ...estimate, at: new Date().toISOString() };
    writeCache(cache);
    return estimate;
  } catch (error) {
    console.warn(
      "[drive] OSRM failed:",
      error instanceof Error ? error.message : error
    );
    return null;
  }
}

/** Short German label for dashboard chips. */
export function driveLabelDe(estimate: DriveEstimate | null): string | null {
  if (!estimate) return null;
  if (estimate.distanceKm < 1.2 || estimate.minutes <= 2) {
    return "in der Nähe";
  }
  return `~${estimate.minutes} Min Fahrt`;
}

export function googleMapsSearchUrl(query: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query.trim())}`;
}

export function googleMapsDirFromHomeUrl(lat: number, lon: number): string {
  return `https://www.google.com/maps/dir/?api=1&origin=${HOME.lat},${HOME.lon}&destination=${lat},${lon}&travelmode=driving`;
}
