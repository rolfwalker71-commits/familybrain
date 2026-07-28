import { getOjpApiToken } from "@/lib/trips/settings";
import {
  buildOjpLocationRequestXml,
  parseOjpLocationResponse,
  type OjpStopCandidate,
} from "@/lib/trips/ojp/location-request";
import { buildOjpTripRequestXml } from "@/lib/trips/ojp/trip-request";
import { parseOjpTripResponse, pickBestTrip } from "@/lib/trips/ojp/parse-trip";
import type { OjpTrip, OjpTripRequestInput } from "@/lib/trips/ojp/types";
import { extractOjpErrorMessage } from "@/lib/trips/ojp/xml-utils";

export const OJP_API_URL = "https://api.opentransportdata.swiss/ojp20";

export class OjpApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly rawPreview?: string
  ) {
    super(message);
    this.name = "OjpApiError";
  }
}

export type OjpRawResult = {
  ok: boolean;
  status: number;
  statusText: string;
  elapsedMs: number;
  body: string;
  requestXml: string;
};

export async function postOjpXmlRaw(body: string): Promise<OjpRawResult> {
  const token = getOjpApiToken();
  if (!token) {
    throw new OjpApiError(
      "ÖV-CH Token fehlt. Bitte unter Einstellungen → TravelBuddy hinterlegen."
    );
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  const started = Date.now();
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
    return {
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
      elapsedMs: Date.now() - started,
      body: text,
      requestXml: body,
    };
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

async function postOjpXml(body: string): Promise<string> {
  const result = await postOjpXmlRaw(body);
  if (!result.ok) {
    const detail = extractOjpErrorMessage(result.body);
    throw new OjpApiError(
      detail
        ? `OJP HTTP ${result.status}: ${detail}`
        : `OJP-Anfrage fehlgeschlagen (HTTP ${result.status}).`,
      result.status,
      result.body.slice(0, 1500)
    );
  }
  if (!result.body.trim()) {
    throw new OjpApiError("OJP lieferte eine leere Antwort.");
  }
  return result.body;
}

export async function searchOjpStops(query: string): Promise<OjpStopCandidate[]> {
  const text = await postOjpXml(buildOjpLocationRequestXml(query));
  const stops = parseOjpLocationResponse(text);
  if (stops.length === 0) {
    const detail = extractOjpErrorMessage(text);
    throw new OjpApiError(
      detail || "Keine Bahnhöfe/Haltestellen gefunden."
    );
  }
  return stops;
}

export async function fetchOjpTrips(
  input: OjpTripRequestInput
): Promise<OjpTrip[]> {
  const body = buildOjpTripRequestXml(input);
  const text = await postOjpXml(body);
  if (
    /faultstring|ErrorMessage|ErrorText/i.test(text) &&
    !/TripResult|<Trip[\s>]/i.test(text)
  ) {
    throw new OjpApiError(
      extractOjpErrorMessage(text) ||
        "OJP meldete einen Fehler ohne Verbindungen.",
      undefined,
      text.slice(0, 1500)
    );
  }
  const trips = parseOjpTripResponse(text);
  if (trips.length === 0) {
    throw new OjpApiError(
      extractOjpErrorMessage(text) ||
        "Keine Zugverbindung in der OJP-Antwort gefunden.",
      undefined,
      text.slice(0, 1500)
    );
  }
  return trips;
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
