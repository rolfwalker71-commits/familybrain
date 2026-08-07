import type { OverviewPayload, OverviewPeriod } from "@/lib/dashboard/overview";

const TTL_MS = 15_000;

type CacheEntry = {
  at: number;
  payload: OverviewPayload;
};

const cache = new Map<string, CacheEntry>();

function cacheKey(
  userId: number | null,
  period: OverviewPeriod,
  anchor: string | null
): string {
  return `${userId ?? "anon"}:${period}:${anchor || ""}`;
}

export function getCachedOverview(
  userId: number | null,
  period: OverviewPeriod,
  anchor: string | null
): OverviewPayload | null {
  const key = cacheKey(userId, period, anchor);
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > TTL_MS) {
    cache.delete(key);
    return null;
  }
  return hit.payload;
}

export function setCachedOverview(
  userId: number | null,
  period: OverviewPeriod,
  anchor: string | null,
  payload: OverviewPayload
): void {
  const key = cacheKey(userId, period, anchor);
  cache.set(key, { at: Date.now(), payload });
  // Bound size
  if (cache.size > 40) {
    const oldest = [...cache.entries()].sort((a, b) => a[1].at - b[1].at)[0];
    if (oldest) cache.delete(oldest[0]);
  }
}

export function invalidateOverviewCache(userId?: number | null): void {
  if (userId == null) {
    cache.clear();
    return;
  }
  const prefix = `${userId}:`;
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) cache.delete(key);
  }
}
