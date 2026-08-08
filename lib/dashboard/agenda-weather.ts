import { getSetting, setSetting } from "@/lib/db/migrations";
import { geocodePlace } from "@/lib/finance-brain/geocode";
import { hasGoogleMapsApiKey } from "@/lib/google/maps";
import {
  weatherCodeLabelDe,
  weatherConditionIcon,
  type CurrentWeather,
  fetchCurrentWeather,
} from "@/lib/trips/weather";
import {
  driveLabelDe,
  fetchDriveFromHome,
  googleMapsDirFromHomeUrl,
  googleMapsSearchUrl,
} from "@/lib/dashboard/drive-time";
import { isPhysicalAgendaLocation } from "@/lib/dashboard/agenda-location";

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

export type AgendaPlaceCoords = {
  lat: number;
  lon: number;
  label: string;
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
    "kantonsspital uri": {
      lat: 46.8815,
      lon: 8.6448,
      label: "Kantonsspital Uri",
    },
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

function looksLikeStreetAddress(location: string): boolean {
  return (
    /\d/.test(location) &&
    (/,/.test(location) || /strasse|weg|gasse|platz/i.test(location))
  );
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Stadt/Ort aus CH-Adresse, z. B. «6460 Altdorf» oder «…, Altdorf, Schweiz». */
function extractSwissCityHint(location: string): string | null {
  const plzCity = location.match(
    /\b\d{4}\s+([A-Za-zÀ-ÿ][\wÀ-ÿ'’.-]*(?:\s+[A-Za-zÀ-ÿ][\wÀ-ÿ'’.-]*){0,3})/
  );
  if (plzCity?.[1]) {
    const city = plzCity[1].replace(/[,.].*$/, "").trim();
    if (city.length >= 2 && !/^(ch|schweiz|switzerland|suisse)$/i.test(city)) {
      return city;
    }
  }
  const parts = location
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  for (let i = parts.length - 1; i >= 0; i -= 1) {
    const p = parts[i]!;
    if (/^(schweiz|switzerland|suisse|ch)$/i.test(p)) continue;
    if (/^\d{4}/.test(p)) {
      const after = p.replace(/^\d{4}\s*/, "").trim();
      if (after.length >= 2) return after;
      continue;
    }
    if (!/\d/.test(p) && p.length >= 2) return p;
  }
  return null;
}

/** Längster Known-Place-Alias, der als Wort in der normalisierten Adresse vorkommt. */
function matchKnownPlaceInKey(
  key: string
): { lat: number; lon: number; label: string } | null {
  const aliases = Object.entries(KNOWN_PLACES).sort(
    (a, b) => b[0].length - a[0].length
  );
  for (const [alias, hit] of aliases) {
    const re = new RegExp(`(?:^|\\s)${escapeRegExp(alias)}(?:\\s|$)`);
    if (re.test(key)) return hit;
  }
  return null;
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
): Promise<{
  lat: number;
  lon: number;
  label: string;
  source: "known" | "cache" | "network";
} | null> {
  const key = normalizePlaceKey(location);
  if (!key || key.length < 3) return null;

  const isStreet = looksLikeStreetAddress(location);

  // Venues / reine Ortsnamen: bekannte Hallen zuerst
  if (!isStreet) {
    for (const [alias, hit] of Object.entries(KNOWN_PLACES)) {
      if (key === alias || key.includes(alias)) {
        return { ...hit, source: "known" };
      }
    }
  }

  const cache = readGeoCache();
  // Mit Google Maps: frische Geocodierung vor altem Nominatim-Cache
  const preferFreshGoogle = hasGoogleMapsApiKey();

  if (!preferFreshGoogle) {
    const cached = cache[key];
    if (cached) {
      return {
        lat: cached.lat,
        lon: cached.lon,
        label: cached.label,
        source: "cache",
      };
    }
  }

  // Strasse + Ort: zuerst echte Geocodierung (Google / Nominatim / Open-Meteo)
  const query = /schweiz|switzerland|\bch\b/i.test(location)
    ? location
    : `${location}, Schweiz`;
  const hit = await geocodePlace(query, { preferSwitzerland: true });
  if (hit) {
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

  if (preferFreshGoogle) {
    const cached = cache[key];
    if (cached) {
      return {
        lat: cached.lat,
        lon: cached.lon,
        label: cached.label,
        source: "cache",
      };
    }
  }

  // Geocode fehlgeschlagen → Stadt/Known-Place als Fallback (Wetter + grobe Fahrtzeit)
  if (isStreet) {
    const cityHit = matchKnownPlaceInKey(key);
    if (cityHit) {
      return { ...cityHit, source: "known" };
    }
  }
  const cityHint = extractSwissCityHint(location);
  if (cityHint) {
    const cityKey = normalizePlaceKey(cityHint);
    const knownCity = matchKnownPlaceInKey(cityKey) || KNOWN_PLACES[cityKey];
    if (knownCity) {
      return { ...knownCity, source: "known" };
    }
    const cityCached = cache[cityKey];
    if (cityCached) {
      return {
        lat: cityCached.lat,
        lon: cityCached.lon,
        label: cityCached.label,
        source: "cache",
      };
    }
    const cityHit = await geocodePlace(`${cityHint}, Schweiz`, {
      preferSwitzerland: true,
    });
    if (cityHit) {
      const label = shortPlaceLabel(cityHint);
      cache[cityKey] = {
        lat: cityHit.lat,
        lon: cityHit.lon,
        label,
        at: new Date().toISOString(),
      };
      writeGeoCache(cache);
      return {
        lat: cityHit.lat,
        lon: cityHit.lon,
        label,
        source: "network",
      };
    }
  }

  return null;
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

function isSwissApprox(lat: number, lon: number): boolean {
  return lat >= 45.7 && lat <= 47.9 && lon >= 5.8 && lon <= 10.6;
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
  // CH: ICON-EU (kostenlos, Mitteleuropa) — oft besser als globales Default-Modell.
  // Dedizierte MeteoSwiss-ICON-API bei Open-Meteo ist (noch) nicht auf dem Free-Endpoint.
  if (isSwissApprox(lat, lon)) {
    url.searchParams.set("models", "icon_eu");
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

  const swiss = isSwissApprox(lat, lon);
  if (!res.ok) {
    if (!swiss) throw new Error(`Open-Meteo HTTP ${res.status}`);
    // Fallback ohne Modellzwang (ältere Open-Meteo / ausserhalb Modellgebiet)
    return fetchDailyForecastDefaultModel(lat, lon, forecastDays, pastDays);
  }

  let days = parseDailyForecastJson(await res.json());
  // icon_eu deckt oft nur ~5 Tage ab (danach null). Fehlende Tage mit
  // Default-Modell ergänzen — nie null als 0°/Klar anzeigen.
  if (swiss && days.length < Math.min(16, Math.max(1, forecastDays))) {
    try {
      const fill = await fetchDailyForecastDefaultModel(
        lat,
        lon,
        forecastDays,
        pastDays
      );
      const byDate = new Map(days.map((d) => [d.date, d]));
      for (const d of fill) {
        if (!byDate.has(d.date)) byDate.set(d.date, d);
      }
      days = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
    } catch {
      // Nur die gültigen icon_eu-Tage behalten
    }
  }
  return days;
}

async function fetchDailyForecastDefaultModel(
  lat: number,
  lon: number,
  forecastDays: number,
  pastDays: number
): Promise<DayWeather[]> {
  const fallback = new URL("https://api.open-meteo.com/v1/forecast");
  fallback.searchParams.set("latitude", String(lat));
  fallback.searchParams.set("longitude", String(lon));
  fallback.searchParams.set(
    "daily",
    "weather_code,temperature_2m_max,temperature_2m_min"
  );
  fallback.searchParams.set("timezone", "Europe/Zurich");
  fallback.searchParams.set(
    "forecast_days",
    String(Math.min(16, Math.max(1, forecastDays)))
  );
  if (pastDays > 0) {
    fallback.searchParams.set("past_days", String(Math.min(92, pastDays)));
  }
  const res2 = await fetch(fallback.toString(), {
    headers: {
      Accept: "application/json",
      "User-Agent":
        "BuddyApp/1.0 (https://github.com/rolfwalker71-commits/familybrain)",
    },
    signal: AbortSignal.timeout(12000),
    cache: "no-store",
  });
  if (!res2.ok) throw new Error(`Open-Meteo HTTP ${res2.status}`);
  return parseDailyForecastJson(await res2.json());
}

function parseDailyForecastJson(data: {
  daily?: {
    time?: string[];
    weather_code?: (number | null)[];
    temperature_2m_max?: (number | null)[];
    temperature_2m_min?: (number | null)[];
  };
}): DayWeather[] {
  const times = data.daily?.time || [];
  const codes = data.daily?.weather_code || [];
  const maxes = data.daily?.temperature_2m_max || [];
  const mins = data.daily?.temperature_2m_min || [];
  const out: DayWeather[] = [];
  for (let i = 0; i < times.length; i += 1) {
    const date = times[i];
    // Open-Meteo liefert oft null für fehlende Tage; Number(null) === 0
    // würde fälschlich als 0° / Klar (Code 0) erscheinen.
    const rawMax = maxes[i];
    const rawMin = mins[i];
    const rawCode = codes[i];
    if (
      !date ||
      rawMax == null ||
      rawCode == null ||
      typeof rawMax !== "number" ||
      typeof rawCode !== "number"
    ) {
      continue;
    }
    const tmax = rawMax;
    const tmin =
      rawMin != null && typeof rawMin === "number" && Number.isFinite(rawMin)
        ? rawMin
        : tmax;
    const code = Math.round(rawCode);
    if (!Number.isFinite(tmax) || !Number.isFinite(code)) continue;
    out.push({
      date: date.slice(0, 10),
      temperatureMaxC: tmax,
      temperatureMinC: tmin,
      temperatureC: (tmax + tmin) / 2,
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
  /** Nächste 7 Tage ab heute (inkl. heute). */
  week: DayWeather[];
} | null> {
  try {
    const [current, days] = await Promise.all([
      fetchCurrentWeather(HOME_WEATHER.lat, HOME_WEATHER.lon),
      fetchDailyForecast(HOME_WEATHER.lat, HOME_WEATHER.lon, 7).catch(
        () => [] as DayWeather[]
      ),
    ]);
    const todayIso = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Zurich",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
    const fromToday = days.filter((d) => d.date >= todayIso);
    const week = (fromToday.length > 0 ? fromToday : days).slice(0, 7);
    const today = week.find((d) => d.date === todayIso) || week[0] || null;
    return { placeLabel: HOME_WEATHER.label, current, today, week };
  } catch (error) {
    console.warn(
      "[weather] home fetch failed:",
      error instanceof Error ? error.message : error
    );
    return null;
  }
}

export type AgendaPlaceEnrichment = {
  weather: AgendaWeatherChip | null;
  coords: AgendaPlaceCoords | null;
  driveMinutes: number | null;
  /** Road distance from home when drive estimate exists */
  distanceKm: number | null;
  driveLabel: string | null;
  mapsUrl: string | null;
};

/**
 * Attach day-forecast chips, coords, drive time from home, and Maps links
 * for agenda items that have a location.
 */
export async function enrichAgendaWithWeather<
  T extends { date: string; location?: string | null },
>(items: T[]): Promise<Array<T & AgendaPlaceEnrichment>> {
  const withLoc = items.filter((i) =>
    isPhysicalAgendaLocation(i.location)
  );
  if (withLoc.length === 0) {
    return items.map((i) => ({
      ...i,
      weather: null,
      coords: null,
      driveMinutes: null,
      distanceKm: null,
      driveLabel: null,
      mapsUrl: null,
    }));
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
    if (coords.source === "network" && !hasGoogleMapsApiKey()) {
      needNetworkPause = true;
    }
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
  const driveByCoord = new Map<
    string,
    { minutes: number; distanceKm: number } | null
  >();

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

  for (const place of resolved.values()) {
    const ck = `${place.lat.toFixed(3)},${place.lon.toFixed(3)}`;
    if (driveByCoord.has(ck)) continue;
    const drive = await fetchDriveFromHome(place.lat, place.lon).catch(
      () => null
    );
    driveByCoord.set(ck, drive);
  }

  return items.map((item) => {
    const loc = item.location?.trim();
    if (!loc || !isPhysicalAgendaLocation(loc)) {
      return {
        ...item,
        weather: null,
        coords: null,
        driveMinutes: null,
        distanceKm: null,
        driveLabel: null,
        mapsUrl: null,
      };
    }
    const place = resolved.get(normalizePlaceKey(loc));
    if (!place) {
      return {
        ...item,
        weather: null,
        coords: null,
        driveMinutes: null,
        distanceKm: null,
        driveLabel: null,
        mapsUrl: googleMapsSearchUrl(loc),
      };
    }
    const ck = `${place.lat.toFixed(3)},${place.lon.toFixed(3)}`;
    const day = (forecastByCoord.get(ck) || []).find(
      (d) => d.date === item.date.slice(0, 10)
    );
    const drive = driveByCoord.get(ck) || null;
    return {
      ...item,
      weather: day
        ? {
            icon: weatherConditionIcon(day.weatherCode),
            temperatureC: Math.round(day.temperatureC),
            labelDe: day.weatherLabelDe,
            placeLabel: place.label,
          }
        : null,
      coords: {
        lat: place.lat,
        lon: place.lon,
        label: place.label,
      },
      driveMinutes: drive?.minutes ?? null,
      distanceKm: drive?.distanceKm ?? null,
      driveLabel: driveLabelDe(drive),
      mapsUrl: googleMapsDirFromHomeUrl(place.lat, place.lon),
    };
  });
}
