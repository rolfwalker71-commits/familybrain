import { getSetting, setSetting } from "@/lib/db/migrations";
import { geocodePlace } from "@/lib/finance-brain/geocode";
import {
  weatherCodeLabelDe,
  weatherConditionIcon,
  type CurrentWeather,
  fetchCurrentWeather,
} from "@/lib/trips/weather";

export type DayWeather = {
  date: string;
  temperatureMaxC: number;
  temperatureMinC: number;
  /** Daytime-ish temperature for chips (avg of min/max). */
  temperatureC: number;
  weatherCode: number;
  weatherLabelDe: string;
};

export type AgendaWeatherChip = {
  icon: string;
  temperatureC: number;
  labelDe: string;
  placeLabel: string;
};

/** Home dashboard weather — Altdorf UR. */
export const HOME_WEATHER = {
  label: "Altdorf",
  lat: 46.88042,
  lon: 8.64345,
} as const;

const GEO_CACHE_KEY = "agenda_geocode_cache_json";

/** Well-known Swiss venues → skip geocoder. */
const KNOWN_PLACES: Record<string, { lat: number; lon: number; label: string }> =
  {
    "gottardo arena": { lat: 46.5105, lon: 8.6895, label: "Ambri" },
    "biascarena": { lat: 46.356, lon: 8.972, label: "Biasca" },
    "vaudoise aréna": { lat: 46.528, lon: 6.603, label: "Lausanne" },
    "vaudoise arena": { lat: 46.528, lon: 6.603, label: "Lausanne" },
    "postfinance arena": { lat: 46.958, lon: 7.465, label: "Bern" },
    "swiss life arena": { lat: 47.383, lon: 8.458, label: "Zürich" },
    "hallenstadion": { lat: 47.411, lon: 8.551, label: "Zürich" },
    "tissot arena": { lat: 47.138, lon: 7.244, label: "Biel" },
    "bossard arena": { lat: 47.17, lon: 8.518, label: "Zug" },
    "centro sportivo": { lat: 46.192, lon: 9.017, label: "Bellinzona" },
    "lonza arena": { lat: 46.295, lon: 7.883, label: "Visp" },
    altdorf: { lat: 46.88042, lon: 8.64345, label: "Altdorf" },
    "kantonsspital uri": { lat: 46.88042, lon: 8.64345, label: "Altdorf" },
    "spitalstrasse 1": { lat: 46.88042, lon: 8.64345, label: "Altdorf" },
    regensdorf: { lat: 47.4342, lon: 8.4687, label: "Regensdorf" },
  };

function normalizePlaceKey(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function shortPlaceLabel(raw: string): string {
  const t = raw.trim();
  if (t.length <= 22) return t;
  return `${t.slice(0, 20)}…`;
}

type GeoCache = Record<
  string,
  { lat: number; lon: number; label: string; at: string }
>;

function readGeoCache(): GeoCache {
  const raw = getSetting(GEO_CACHE_KEY);
  if (!raw) return {};
  try {
    return JSON.parse(raw) as GeoCache;
  } catch {
    return {};
  }
}

function writeGeoCache(cache: GeoCache): void {
  const entries = Object.entries(cache).sort(
    (a, b) => b[1].at.localeCompare(a[1].at)
  );
  const trimmed = Object.fromEntries(entries.slice(0, 200));
  setSetting(GEO_CACHE_KEY, JSON.stringify(trimmed));
}

export async function resolvePlaceCoords(
  location: string
): Promise<{ lat: number; lon: number; label: string; source: "known" | "cache" | "network" } | null> {
  const key = normalizePlaceKey(location);
  if (!key || key.length < 3) return null;

  for (const [alias, hit] of Object.entries(KNOWN_PLACES)) {
    if (key === alias || key.includes(alias)) {
      return { ...hit, source: "known" };
    }
  }

  const cache = readGeoCache();
  const cached = cache[key];
  if (cached) {
    return {
      lat: cached.lat,
      lon: cached.lon,
      label: cached.label,
      source: "cache",
    };
  }

  const query = /schweiz|switzerland|\bch\b/i.test(location)
    ? location
    : `${location}, Schweiz`;
  const hit = await geocodePlace(query);
  if (!hit) return null;

  const label = shortPlaceLabel(
    hit.displayName.split(",")[0]?.trim() || location
  );
  cache[key] = {
    lat: hit.lat,
    lon: hit.lon,
    label,
    at: new Date().toISOString(),
  };
  writeGeoCache(cache);
  return { lat: hit.lat, lon: hit.lon, label, source: "network" };
}

function zurichIsoDate(d = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Zurich",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function calendarDaysBetween(fromIso: string, toIso: string): number {
  const a = new Date(`${fromIso.slice(0, 10)}T12:00:00Z`);
  const b = new Date(`${toIso.slice(0, 10)}T12:00:00Z`);
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

export async function fetchDailyForecast(
  lat: number,
  lon: number,
  forecastDays = 16,
  pastDays = 0
): Promise<DayWeather[]> {
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", String(lat));
  url.searchParams.set("longitude", String(lon));
  url.searchParams.set(
    "daily",
    "weather_code,temperature_2m_max,temperature_2m_min"
  );
  url.searchParams.set("timezone", "Europe/Zurich");
  url.searchParams.set(
    "forecast_days",
    String(Math.min(16, Math.max(1, forecastDays)))
  );
  if (pastDays > 0) {
    url.searchParams.set("past_days", String(Math.min(92, pastDays)));
  }

  const res = await fetch(url.toString(), {
    headers: {
      Accept: "application/json",
      "User-Agent":
        "BuddyApp/1.0 (https://github.com/rolfwalker71-commits/familybrain)",
    },
    signal: AbortSignal.timeout(12000),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Open-Meteo HTTP ${res.status}`);
  const data = (await res.json()) as {
    daily?: {
      time?: string[];
      weather_code?: number[];
      temperature_2m_max?: number[];
      temperature_2m_min?: number[];
    };
  };
  const times = data.daily?.time || [];
  const codes = data.daily?.weather_code || [];
  const maxes = data.daily?.temperature_2m_max || [];
  const mins = data.daily?.temperature_2m_min || [];
  const out: DayWeather[] = [];
  for (let i = 0; i < times.length; i += 1) {
    const date = times[i];
    const code = Math.round(Number(codes[i]));
    const tmax = Number(maxes[i]);
    const tmin = Number(mins[i]);
    if (!date || !Number.isFinite(tmax) || !Number.isFinite(code)) continue;
    out.push({
      date: date.slice(0, 10),
      temperatureMaxC: tmax,
      temperatureMinC: Number.isFinite(tmin) ? tmin : tmax,
      temperatureC: Number.isFinite(tmin) ? (tmax + tmin) / 2 : tmax,
      weatherCode: code,
      weatherLabelDe: weatherCodeLabelDe(code),
    });
  }
  return out;
}

export async function fetchHomeWeather(): Promise<{
  placeLabel: string;
  current: CurrentWeather;
  today: DayWeather | null;
} | null> {
  try {
    const [current, days] = await Promise.all([
      fetchCurrentWeather(HOME_WEATHER.lat, HOME_WEATHER.lon),
      fetchDailyForecast(HOME_WEATHER.lat, HOME_WEATHER.lon, 2).catch(
        () => [] as DayWeather[]
      ),
    ]);
    const todayIso = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Zurich",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
    const today = days.find((d) => d.date === todayIso) || days[0] || null;
    return { placeLabel: HOME_WEATHER.label, current, today };
  } catch (error) {
    console.warn(
      "[weather] home fetch failed:",
      error instanceof Error ? error.message : error
    );
    return null;
  }
}

/**
 * Attach day-forecast chips for agenda items that have a location.
 * Batches Open-Meteo by unique coordinates.
 */
export async function enrichAgendaWithWeather<
  T extends { date: string; location?: string | null },
>(items: T[]): Promise<
  Array<T & { weather: AgendaWeatherChip | null }>
> {
  const withLoc = items.filter(
    (i) => i.location && String(i.location).trim().length >= 3
  );
  if (withLoc.length === 0) {
    return items.map((i) => ({ ...i, weather: null }));
  }

  const resolved = new Map<
    string,
    { lat: number; lon: number; label: string }
  >();
  let needNetworkPause = false;
  for (const item of withLoc) {
    const loc = String(item.location).trim();
    const key = normalizePlaceKey(loc);
    if (resolved.has(key)) continue;
    if (needNetworkPause) {
      await new Promise((r) => setTimeout(r, 1100));
      needNetworkPause = false;
    }
    const coords = await resolvePlaceCoords(loc).catch(() => null);
    if (!coords) continue;
    if (coords.source === "network") needNetworkPause = true;
    resolved.set(key, {
      lat: coords.lat,
      lon: coords.lon,
      label: coords.label,
    });
  }

  const today = zurichIsoDate();
  let pastDays = 0;
  let forecastDays = 7;
  for (const item of withLoc) {
    const delta = calendarDaysBetween(today, item.date.slice(0, 10));
    if (delta < 0) pastDays = Math.max(pastDays, -delta);
    else forecastDays = Math.max(forecastDays, delta + 1);
  }
  pastDays = Math.min(92, pastDays);
  forecastDays = Math.min(16, Math.max(1, forecastDays));

  const forecastByCoord = new Map<string, DayWeather[]>();
  for (const place of resolved.values()) {
    const ck = `${place.lat.toFixed(3)},${place.lon.toFixed(3)}`;
    if (forecastByCoord.has(ck)) continue;
    try {
      const days = await fetchDailyForecast(
        place.lat,
        place.lon,
        forecastDays,
        pastDays
      );
      forecastByCoord.set(ck, days);
    } catch (error) {
      console.warn(
        "[weather] forecast failed:",
        error instanceof Error ? error.message : error
      );
      forecastByCoord.set(ck, []);
    }
  }

  return items.map((item) => {
    const loc = item.location?.trim();
    if (!loc) return { ...item, weather: null };
    const place = resolved.get(normalizePlaceKey(loc));
    if (!place) return { ...item, weather: null };
    const ck = `${place.lat.toFixed(3)},${place.lon.toFixed(3)}`;
    const day = (forecastByCoord.get(ck) || []).find(
      (d) => d.date === item.date.slice(0, 10)
    );
    if (!day) return { ...item, weather: null };
    return {
      ...item,
      weather: {
        icon: weatherConditionIcon(day.weatherCode),
        temperatureC: Math.round(day.temperatureC),
        labelDe: day.weatherLabelDe,
        placeLabel: place.label,
      },
    };
  });
}
