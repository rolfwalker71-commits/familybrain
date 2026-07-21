import { getSetting, setSetting } from "@/lib/db/migrations";
import {
  coerceMapStyle,
  type MapStyleId,
  MAP_STYLES,
} from "@/lib/trips/map-tiles";

export const AERODATABOX_KEY_SETTING = "aerodatabox_api_key";
export const AERODATABOX_PROVIDER_SETTING = "aerodatabox_provider";
export const NOMINATIM_URL_SETTING = "nominatim_base_url";
export const MAP_STYLE_SETTING = "trip_map_style";
export const DEFAULT_NOMINATIM_BASE_URL =
  "https://nominatim.openstreetmap.org";

export const AERODATABOX_PROVIDERS = ["apimarket", "rapidapi"] as const;
export type AeroDataBoxProvider = (typeof AERODATABOX_PROVIDERS)[number];

export { MAP_STYLES, type MapStyleId };

const RAPIDAPI_BASE = "https://aerodatabox.p.rapidapi.com";
const APIMARKET_BASE =
  "https://prod.api.market/api/v1/aedbx/aerodatabox";

export function getAeroDataBoxApiKey(): string | null {
  return (
    getSetting(AERODATABOX_KEY_SETTING) ||
    process.env.AERODATABOX_API_KEY ||
    null
  );
}

export function saveAeroDataBoxApiKey(key: string | null): void {
  setSetting(AERODATABOX_KEY_SETTING, key?.trim() || null);
}

export function getAeroDataBoxProvider(): AeroDataBoxProvider {
  const fromEnv = process.env.AERODATABOX_PROVIDER?.trim().toLowerCase();
  if (fromEnv === "apimarket" || fromEnv === "rapidapi") {
    return fromEnv;
  }
  const stored = getSetting(AERODATABOX_PROVIDER_SETTING)?.trim().toLowerCase();
  if (stored === "apimarket" || stored === "rapidapi") {
    return stored;
  }
  // Default API.Market (common for new AeroDataBox subscriptions)
  return "apimarket";
}

export function saveAeroDataBoxProvider(provider: AeroDataBoxProvider): void {
  setSetting(AERODATABOX_PROVIDER_SETTING, provider);
}

export function getAeroDataBoxBaseUrl(
  provider: AeroDataBoxProvider = getAeroDataBoxProvider()
): string {
  return provider === "rapidapi" ? RAPIDAPI_BASE : APIMARKET_BASE;
}

export function getAeroDataBoxHeaders(
  apiKey: string,
  provider: AeroDataBoxProvider = getAeroDataBoxProvider()
): HeadersInit {
  if (provider === "rapidapi") {
    return {
      "X-RapidAPI-Key": apiKey,
      "X-RapidAPI-Host": "aerodatabox.p.rapidapi.com",
    };
  }
  return {
    "x-api-market-key": apiKey,
    Accept: "application/json",
  };
}

export function getNominatimBaseUrl(): string {
  return (
    getSetting(NOMINATIM_URL_SETTING) ||
    process.env.NOMINATIM_BASE_URL ||
    DEFAULT_NOMINATIM_BASE_URL
  ).replace(/\/$/, "");
}

export function saveNominatimBaseUrl(url: string | null): void {
  setSetting(NOMINATIM_URL_SETTING, url?.trim() || null);
}

export function getTripMapStyle(): MapStyleId {
  const fromEnv = process.env.TRIP_MAP_STYLE?.trim();
  if (fromEnv) return coerceMapStyle(fromEnv);
  return coerceMapStyle(getSetting(MAP_STYLE_SETTING));
}

export function saveTripMapStyle(style: MapStyleId): void {
  setSetting(MAP_STYLE_SETTING, coerceMapStyle(style));
}
