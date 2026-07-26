/** Open-Meteo current weather (works worldwide, including open ocean). */

export type CurrentWeather = {
  temperatureC: number;
  weatherCode: number;
  weatherLabelDe: string;
  windSpeedKmh: number | null;
  windDirectionDeg: number | null;
  precipitationMm: number | null;
  humidityPct: number | null;
  observedAt: string | null;
};

/** WMO Weather interpretation codes → short German labels. */
export function weatherCodeLabelDe(code: number): string {
  const map: Record<number, string> = {
    0: "klar",
    1: "überwiegend klar",
    2: "teilweise bewölkt",
    3: "bedeckt",
    45: "Nebel",
    48: "Reifnebel",
    51: "leichter Nieselregen",
    53: "Nieselregen",
    55: "starker Nieselregen",
    56: "leichter gefrierender Nieselregen",
    57: "gefrierender Nieselregen",
    61: "leichter Regen",
    63: "Regen",
    65: "starker Regen",
    66: "leichter gefrierender Regen",
    67: "gefrierender Regen",
    71: "leichter Schneefall",
    73: "Schneefall",
    75: "starker Schneefall",
    77: "Schneegriesel",
    80: "leichte Regenschauer",
    81: "Regenschauer",
    82: "starke Regenschauer",
    85: "leichte Schneeschauer",
    86: "Schneeschauer",
    95: "Gewitter",
    96: "Gewitter mit Hagel",
    99: "starkes Gewitter mit Hagel",
  };
  return map[code] ?? `Wettercode ${code}`;
}

/** Semantic icon for the weather-condition line. */
export function weatherConditionIcon(code: number): string {
  if (code === 0 || code === 1) return "☀️";
  if (code === 2) return "⛅";
  if (code === 3) return "☁️";
  if (code === 45 || code === 48) return "🌫️";
  if (code >= 71 && code <= 77) return "❄️";
  if (code === 85 || code === 86) return "🌨️";
  if (code >= 95) return "⛈️";
  if (code >= 51) return "🌧️";
  return "🌤️";
}

/** 16-point German compass abbreviation from degrees. */
export function windDirectionDe(degrees: number): string {
  const dirs = [
    "N",
    "NNO",
    "NO",
    "ONO",
    "O",
    "OSO",
    "SO",
    "SSO",
    "S",
    "SSW",
    "SW",
    "WSW",
    "W",
    "WNW",
    "NW",
    "NNW",
  ] as const;
  const normalized = ((degrees % 360) + 360) % 360;
  const index = Math.round(normalized / 22.5) % 16;
  return dirs[index];
}

export function formatLatLon(lat: number, lon: number): string {
  const latHem = lat >= 0 ? "N" : "S";
  const lonHem = lon >= 0 ? "E" : "W";
  return `${Math.abs(lat).toFixed(3)}°${latHem}, ${Math.abs(lon).toFixed(3)}°${lonHem}`;
}

function formatMm(mm: number): string {
  return `${mm.toFixed(1).replace(".", ",")} mm`;
}

function formatOrDash(
  value: number | null | undefined,
  format: (n: number) => string
): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return format(value);
}

/**
 * Fixed multi-line layout with semantic icons — always the same structure.
 */
export function formatWeatherCommentBody(input: {
  weather: CurrentWeather;
  lat: number;
  lon: number;
  accuracyM?: number | null;
}): string {
  const { weather, lat, lon, accuracyM } = input;
  const conditionIcon = weatherConditionIcon(weather.weatherCode);

  const windSpeed = formatOrDash(
    weather.windSpeedKmh,
    (n) => `${Math.round(n)} km/h`
  );
  const windDir =
    weather.windDirectionDeg != null &&
    Number.isFinite(weather.windDirectionDeg)
      ? `aus ${windDirectionDe(weather.windDirectionDeg)} (${Math.round(weather.windDirectionDeg)}°)`
      : "—";
  const precip = formatOrDash(weather.precipitationMm, formatMm);
  const humidity = formatOrDash(
    weather.humidityPct,
    (n) => `${Math.round(n)} %`
  );

  const lines = [
    "🌤️ Wetter jetzt",
    `🌡️ Temperatur: ${Math.round(weather.temperatureC)} °C`,
    `${conditionIcon} Lage: ${weather.weatherLabelDe}`,
    `💨 Wind: ${windSpeed}`,
    `🧭 Richtung: ${windDir}`,
    `🌧️ Niederschlag: ${precip}`,
    `💧 Luftfeuchtigkeit: ${humidity}`,
    `📍 Standort: ${formatLatLon(lat, lon)}`,
  ];

  if (accuracyM != null && Number.isFinite(accuracyM)) {
    const gps =
      accuracyM >= 1000
        ? `±${Math.round(accuracyM / 1000)} km`
        : `±${Math.round(accuracyM)} m`;
    lines.push(`📡 GPS-Genauigkeit: ${gps}`);
  }

  return lines.join("\n");
}

export async function fetchCurrentWeather(
  lat: number,
  lon: number
): Promise<CurrentWeather> {
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", String(lat));
  url.searchParams.set("longitude", String(lon));
  url.searchParams.set(
    "current",
    "temperature_2m,weather_code,wind_speed_10m,wind_direction_10m,relative_humidity_2m,precipitation"
  );
  url.searchParams.set("wind_speed_unit", "kmh");
  url.searchParams.set("precipitation_unit", "mm");
  url.searchParams.set("timezone", "auto");

  const response = await fetch(url.toString(), {
    headers: {
      Accept: "application/json",
      "User-Agent":
        "TripBook-TravelBrain/1.0 (https://github.com/rolfwalker71-commits/familybrain)",
    },
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`Wetterdienst antwortet nicht (${response.status}).`);
  }
  const data = (await response.json()) as {
    current?: {
      time?: string;
      temperature_2m?: number;
      weather_code?: number;
      wind_speed_10m?: number;
      wind_direction_10m?: number;
      relative_humidity_2m?: number;
      precipitation?: number;
    };
  };
  const current = data.current;
  if (
    !current ||
    typeof current.temperature_2m !== "number" ||
    typeof current.weather_code !== "number"
  ) {
    throw new Error("Wetterdaten unvollständig.");
  }
  const code = Math.round(current.weather_code);
  return {
    temperatureC: current.temperature_2m,
    weatherCode: code,
    weatherLabelDe: weatherCodeLabelDe(code),
    windSpeedKmh:
      typeof current.wind_speed_10m === "number"
        ? current.wind_speed_10m
        : null,
    windDirectionDeg:
      typeof current.wind_direction_10m === "number"
        ? current.wind_direction_10m
        : null,
    precipitationMm:
      typeof current.precipitation === "number" ? current.precipitation : null,
    humidityPct:
      typeof current.relative_humidity_2m === "number"
        ? current.relative_humidity_2m
        : null,
    observedAt: current.time ?? null,
  };
}
