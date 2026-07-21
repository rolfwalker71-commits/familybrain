import { getSetting, setSetting } from "@/lib/db/migrations";

export const AERODATABOX_KEY_SETTING = "aerodatabox_api_key";
export const NOMINATIM_URL_SETTING = "nominatim_base_url";

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

export function getNominatimBaseUrl(): string {
  return (
    getSetting(NOMINATIM_URL_SETTING) ||
    process.env.NOMINATIM_BASE_URL ||
    "https://nominatim.openstreetmap.org"
  ).replace(/\/$/, "");
}

export function saveNominatimBaseUrl(url: string | null): void {
  setSetting(NOMINATIM_URL_SETTING, url?.trim() || null);
}
