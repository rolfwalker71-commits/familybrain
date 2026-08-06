import { getSetting, setSetting } from "@/lib/db/migrations";

export type SwissHoliday = {
  date: string;
  name: string;
  /** e.g. "UR", "ZH", or "CH" for nationwide */
  canton: string;
  types: string[];
};

const CACHE_KEY = "swiss_holidays_cache_json";
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Default cantons for household agenda (Altdorf + Regensdorf). */
export const DEFAULT_HOLIDAY_CANTONS = ["UR", "ZH"] as const;

type CachePayload = {
  fetchedAt: string;
  /** Raw Nager rows per year (unfiltered). */
  byYearRaw: Record<
    string,
    Array<{
      date: string;
      localName: string;
      name: string;
      counties: string[] | null;
      types: string[];
    }>
  >;
};

function readCache(): CachePayload | null {
  const raw = getSetting(CACHE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as CachePayload;
    if (!parsed?.fetchedAt || !parsed.byYearRaw) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeCache(payload: CachePayload): void {
  setSetting(CACHE_KEY, JSON.stringify(payload));
}

async function fetchYearFromNager(year: number) {
  const url = `https://date.nager.at/api/v3/PublicHolidays/${year}/CH`;
  const res = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(12000),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Feiertage HTTP ${res.status}`);
  const rows = (await res.json()) as Array<{
    date: string;
    localName: string;
    name: string;
    counties?: string[] | null;
    types?: string[];
  }>;
  return rows.map((r) => ({
    date: r.date.slice(0, 10),
    localName: r.localName || r.name,
    name: r.name,
    counties: r.counties ?? null,
    types: r.types || ["Public"],
  }));
}

function filterForCantons(
  raw: CachePayload["byYearRaw"][string],
  cantons: string[]
): SwissHoliday[] {
  const out: SwissHoliday[] = [];
  const seen = new Set<string>();
  for (const row of raw) {
    if (
      !row.types.includes("Public") &&
      !row.types.includes("Observance")
    ) {
      continue;
    }
    const counties = row.counties;
    if (!counties || counties.length === 0) {
      const key = `${row.date}|${row.localName}|CH`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        date: row.date,
        name: row.localName,
        canton: "CH",
        types: row.types,
      });
      continue;
    }
    for (const canton of cantons) {
      const code = `CH-${canton}`;
      if (!counties.includes(code)) continue;
      const key = `${row.date}|${row.localName}|${canton}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        date: row.date,
        name: row.localName,
        canton,
        types: row.types,
      });
    }
  }
  return out.sort(
    (a, b) =>
      a.date.localeCompare(b.date) || a.name.localeCompare(b.name, "de")
  );
}

/**
 * Swiss public holidays for selected cantons (nationwide + canton-specific).
 * Cached ~7 days in settings.
 */
export async function getSwissHolidays(input?: {
  years?: number[];
  cantons?: string[];
  forceRefresh?: boolean;
}): Promise<SwissHoliday[]> {
  const cantons = (input?.cantons || [...DEFAULT_HOLIDAY_CANTONS]).map((c) =>
    c.toUpperCase()
  );
  const years =
    input?.years && input.years.length > 0
      ? [...new Set(input.years)]
      : [new Date().getFullYear()];

  const cache = readCache();
  const age = cache
    ? Date.now() - new Date(cache.fetchedAt).getTime()
    : Number.POSITIVE_INFINITY;
  let byYearRaw = { ...(cache?.byYearRaw || {}) };

  const needFetch = years.filter(
    (y) =>
      input?.forceRefresh ||
      age > CACHE_TTL_MS ||
      !byYearRaw[String(y)] ||
      byYearRaw[String(y)]!.length === 0
  );

  if (needFetch.length > 0) {
    try {
      for (const year of needFetch) {
        byYearRaw[String(year)] = await fetchYearFromNager(year);
      }
      writeCache({ fetchedAt: new Date().toISOString(), byYearRaw });
    } catch (error) {
      console.warn(
        "[holidays] Nager.Date fetch failed:",
        error instanceof Error ? error.message : error
      );
    }
  }

  const out: SwissHoliday[] = [];
  const dedupe = new Set<string>();
  for (const year of years) {
    for (const h of filterForCantons(byYearRaw[String(year)] || [], cantons)) {
      const key = `${h.date}|${h.name}|${h.canton}`;
      if (dedupe.has(key)) continue;
      dedupe.add(key);
      out.push(h);
    }
  }
  return out;
}

export function holidaysInRange(
  holidays: SwissHoliday[],
  start: string,
  end: string
): SwissHoliday[] {
  return holidays.filter((h) => h.date >= start && h.date <= end);
}

export function holidayBadge(canton: string): string {
  if (canton === "CH") return "Feiertag";
  return `Feiertag ${canton}`;
}

export function holidaySubtitle(canton: string): string {
  if (canton === "CH") return "Schweiz";
  if (canton === "UR") return "Uri · Altdorf";
  if (canton === "ZH") return "Zürich · Regensdorf";
  return canton;
}
