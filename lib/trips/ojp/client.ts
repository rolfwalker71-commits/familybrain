import { getOjpApiToken } from "@/lib/trips/settings";
import {
  buildOjpLocationRequestXml,
  parseOjpLocationResponse,
  type OjpStopCandidate,
} from "@/lib/trips/ojp/location-request";
import { buildOjpTripRequestXml } from "@/lib/trips/ojp/trip-request";
import { parseOjpTripResponse, pickBestTrip } from "@/lib/trips/ojp/parse-trip";
import type { OjpTrip, OjpTripRequestInput } from "@/lib/trips/ojp/types";

export const OJP_API_URL = "https://api.opentransportdata.swiss/ojp20";

export class OjpApiError extends Error {
  constructor(
    message: string,
    readonly status?: number
  ) {
    super(message);
    this.name = "OjpApiError";
  }
}

async function postOjpXml(body: string): Promise<string> {
  const token = getOjpApiToken();
  if (!token) {
    throw new OjpApiError(
      "ÖV-CH Token fehlt. Bitte unter Einstellungen → TravelBuddy hinterlegen."
    );
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(OJP_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/xml",
        Accept: "application/xml",
        "User-Agent": "FamilyBrain/1.0 (travel planner)",
        "Accept-Encoding": "gzip, deflate, br",
      },
      body,
      signal: controller.signal,
      redirect: "follow",
    });
    const text = await response.text().catch(() => "");
    if (!response.ok) {
      throw new OjpApiError(
        `OJP-Anfrage fehlgeschlagen (HTTP ${response.status}).`,
        response.status
      );
    }
    if (!text.trim()) {
      throw new OjpApiError("OJP lieferte eine leere Antwort.");
    }
    return text;
  } catch (error) {
    if (error instanceof OjpApiError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new OjpApiError("OJP-Anfrage hat das Zeitlimit überschritten.");
    }
    throw new OjpApiError(
      error instanceof Error ? error.message : "OJP-Anfrage fehlgeschlagen."
    );
  } finally {
    clearTimeout(timeout);
  }
}

export async function searchOjpStops(query: string): Promise<OjpStopCandidate[]> {
  const text = await postOjpXml(buildOjpLocationRequestXml(query));
  const stops = parseOjpLocationResponse(text);
  if (stops.length === 0) {
    throw new OjpApiError("Keine Bahnhöfe/Haltestellen gefunden.");
  }
  return stops;
}

export async function fetchOjpTrips(
  input: OjpTripRequestInput
): Promise<OjpTrip[]> {
  const body = buildOjpTripRequestXml(input);
  const text = await postOjpXml(body);
  if (/faultstring|ErrorMessage/i.test(text) && !/TripResult|<Trip>/i.test(text)) {
    const fault =
      text.match(/<faultstring[^>]*>([\s\S]*?)<\/faultstring>/i)?.[1] ||
      text.match(/<Text[^>]*>([\s\S]*?)<\/Text>/i)?.[1];
    throw new OjpApiError(
      fault?.trim() || "OJP meldete einen Fehler ohne Verbindungen."
    );
  }
  return parseOjpTripResponse(text);
}

export async function planOjpTrip(
  input: OjpTripRequestInput,
  match?: { trainNumber?: string | null; startTimeIso?: string | null }
): Promise<{ trip: OjpTrip; warning?: string }> {
  const trips = await fetchOjpTrips(input);
  const picked = pickBestTrip(trips, match || {});
  if (!picked) {
    throw new OjpApiError("Keine Zugverbindung gefunden.");
  }
  return picked;
}
