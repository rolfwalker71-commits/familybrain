const STORAGE_PREFIX = "buddy.mapZoom.";

export function mapZoomStorageKeyPlace(lat: number, lon: number): string {
  return `place:${lat.toFixed(4)},${lon.toFixed(4)}`;
}

export function mapZoomStorageKeyRoute(
  fromLat: number,
  fromLon: number,
  toLat: number,
  toLon: number
): string {
  return `route:${fromLat.toFixed(4)},${fromLon.toFixed(4)}>${toLat.toFixed(4)},${toLon.toFixed(4)}`;
}

export function readStoredMapZoom(key: string): number | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_PREFIX + key);
    if (raw == null) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

export function writeStoredMapZoom(key: string, zoom: number): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_PREFIX + key, String(zoom));
  } catch {
    /* quota */
  }
}

/** Grobe Default-Zoomstufe für Von→Nach je nach Distanz. */
export function suggestRouteZoom(
  fromLat: number,
  fromLon: number,
  toLat: number,
  toLon: number
): number {
  const span = Math.max(Math.abs(fromLat - toLat), Math.abs(fromLon - toLon));
  if (span > 40) return 3;
  if (span > 15) return 4;
  if (span > 6) return 5;
  if (span > 2) return 7;
  if (span > 0.8) return 9;
  if (span > 0.25) return 11;
  if (span > 0.08) return 12;
  return 13;
}
