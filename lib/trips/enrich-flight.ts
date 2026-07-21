import fs from "fs";
import path from "path";
import { nowIso } from "@/lib/utils/dates";
import { ensureTripMediaDirs, getTripAircraftDir } from "@/lib/trips/paths";
import { formatAirportRoute, normalizeIataCode } from "@/lib/trips/iata";
import {
  getAeroDataBoxApiKey,
  getAeroDataBoxBaseUrl,
  getAeroDataBoxHeaders,
  getAeroDataBoxProvider,
} from "@/lib/trips/settings";
import {
  getTripEventById,
  updateTripEvent,
  type TripEventRow,
} from "@/lib/trips/queries";

function asApiString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function normalizeFlightNumber(raw: string): string {
  return raw.replace(/\s+/g, "").toUpperCase();
}

async function readJsonBody(
  response: Response,
  context: string
): Promise<unknown> {
  const text = await response.text().catch(() => "");
  if (!text.trim()) {
    throw new Error(
      `${context}: leere Antwort von der Flug-API (HTTP ${response.status}).`
    );
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error(
      `${context}: ungültige JSON-Antwort (HTTP ${response.status}): ${text.slice(0, 180)}`
    );
  }
}

function extractFlightsList(data: unknown): Record<string, unknown>[] {
  if (Array.isArray(data)) {
    return data as Record<string, unknown>[];
  }
  if (data && typeof data === "object") {
    const obj = data as Record<string, unknown>;
    for (const key of ["flights", "data", "items", "results"]) {
      const value = obj[key];
      if (Array.isArray(value)) return value as Record<string, unknown>[];
    }
    // Single flight object
    if (obj.departure || obj.arrival || obj.number || obj.airline) {
      return [obj];
    }
  }
  return [];
}

function asCoord(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** Extract lat/lon from AeroDataBox airport / location objects. */
function extractLatLon(source: unknown): { lat: number; lon: number } | null {
  if (!source || typeof source !== "object") return null;
  const obj = source as Record<string, unknown>;
  const location =
    obj.location && typeof obj.location === "object"
      ? (obj.location as Record<string, unknown>)
      : obj;
  const lat =
    asCoord(location.lat) ??
    asCoord(location.latitude) ??
    asCoord(obj.lat) ??
    asCoord(obj.latitude);
  const lon =
    asCoord(location.lon) ??
    asCoord(location.lng) ??
    asCoord(location.longitude) ??
    asCoord(obj.lon) ??
    asCoord(obj.lng) ??
    asCoord(obj.longitude);
  if (lat == null || lon == null) return null;
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
  return { lat, lon };
}

async function fetchAirportCoords(
  base: string,
  headers: HeadersInit,
  iata: string | null
): Promise<{ lat: number; lon: number } | null> {
  if (!iata) return null;
  try {
    const url = `${base}/airports/iata/${encodeURIComponent(iata)}`;
    const response = await fetch(url, { headers });
    if (!response.ok) return null;
    const data = await readJsonBody(response, `Airport ${iata}`);
    return extractLatLon(data);
  } catch {
    return null;
  }
}

export type FlightEnrichResult = {
  event: TripEventRow;
  warning?: string;
};

async function applyIataRouteOnly(
  event: TripEventRow,
  base: string,
  headers: HeadersInit,
  provider: string,
  context: {
    flightNumber: string;
    dateLocal: string;
    reason: string;
  }
): Promise<FlightEnrichResult | null> {
  const dep = normalizeIataCode(event.departure_airport);
  const arr = normalizeIataCode(event.arrival_airport);
  if (!dep || !arr) return null;

  const [depCoords, arrCoords] = await Promise.all([
    fetchAirportCoords(base, headers, dep),
    fetchAirportCoords(base, headers, arr),
  ]);
  if (!depCoords || !arrCoords) return null;

  const notice =
    `Flugdaten nicht verfügbar (${context.reason}). ` +
    `Kartenroute aus ${dep} → ${arr} gezeichnet.`;

  const updated = updateTripEvent(event.id, {
    departureLat: depCoords.lat,
    departureLon: depCoords.lon,
    arrivalLat: arrCoords.lat,
    arrivalLon: arrCoords.lon,
    location: formatAirportRoute(dep, arr) || event.location,
    enrichmentJson: JSON.stringify({
      status: "route_only",
      source: "iata_route_only",
      notice,
      provider,
      flightNumber: context.flightNumber,
      date: context.dateLocal,
      departureAirport: dep,
      arrivalAirport: arr,
      lookedUpAt: nowIso(),
    }),
    enrichedAt: nowIso(),
  });

  return { event: updated, warning: notice };
}

export async function enrichFlightEvent(
  eventId: number
): Promise<FlightEnrichResult> {
  const event = getTripEventById(eventId);
  if (!event) throw new Error("Ereignis nicht gefunden");
  if (event.event_type !== "Flug") {
    throw new Error("Anreicherung nur für Flug-Ereignisse.");
  }

  const flightNumber = event.flight_number?.trim();
  const date = event.start_date?.trim();
  if (!flightNumber || !date) {
    throw new Error("Flugnummer und Datum werden für die Anreicherung benötigt.");
  }

  const apiKey = getAeroDataBoxApiKey();
  if (!apiKey) {
    throw new Error(
      "AeroDataBox API-Key fehlt. Bitte unter Einstellungen hinterlegen."
    );
  }

  const provider = getAeroDataBoxProvider();
  const base = getAeroDataBoxBaseUrl(provider);
  const headers = getAeroDataBoxHeaders(apiKey, provider);

  const number = normalizeFlightNumber(flightNumber);
  // AeroDataBox: YYYY-MM-DD only; 204 = no matching flight (not necessarily auth).
  const dateLocal = date.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateLocal)) {
    throw new Error(
      `Ungültiges Flugdatum «${date}». Bitte als JJJJ-MM-TT speichern und erneut anreichern.`
    );
  }

  const routeContext = {
    flightNumber: number,
    dateLocal,
    reason: "API ohne Treffer",
  };

  const url =
    `${base}/flights/number/${encodeURIComponent(number)}/` +
    `${encodeURIComponent(dateLocal)}` +
    `?dateLocalRole=Both&withAircraftImage=true&withLocation=true`;

  const response = await fetch(url, { headers });
  if (response.status === 204) {
    const partial = await applyIataRouteOnly(event, base, headers, provider, {
      ...routeContext,
      reason: "noch keine Flugdaten / HTTP 204",
    });
    if (partial) return partial;
    throw new Error(
      `Keine Flugdaten für ${number} am ${dateLocal} (${provider}). ` +
        `API meldet «kein Treffer» (HTTP 204) — oft zu früh vor Abflug, ` +
        `falsches Datum/Flugnummer, oder fehlende Von/Nach-IATA für die Karte.`
    );
  }
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    let detail = text.slice(0, 200);
    try {
      const parsed = JSON.parse(text) as { message?: string; error?: string };
      detail = parsed.message || parsed.error || detail;
    } catch {
      /* keep raw */
    }
    const partial = await applyIataRouteOnly(event, base, headers, provider, {
      ...routeContext,
      reason: `API-Fehler ${response.status}`,
    });
    if (partial) return partial;
    throw new Error(
      `Fluglookup fehlgeschlagen (${response.status}, ${provider}): ${detail || "keine Details"}`
    );
  }

  const data = await readJsonBody(response, `Fluglookup (${provider})`);
  const flights = extractFlightsList(data);
  if (flights.length === 0) {
    const partial = await applyIataRouteOnly(event, base, headers, provider, {
      ...routeContext,
      reason: "keine Flugdaten in der Antwort",
    });
    if (partial) return partial;
    throw new Error(
      `Keine Flugdaten für ${number} am ${dateLocal} gefunden (${provider}).`
    );
  }

  const flight = flights[0];
  const departure = (flight.departure || {}) as Record<string, unknown>;
  const arrival = (flight.arrival || {}) as Record<string, unknown>;
  const airline = (flight.airline || {}) as Record<string, unknown>;
  const aircraft = (flight.aircraft || {}) as Record<string, unknown>;

  const depLocal =
    (departure.scheduledTimeLocal as string | undefined) ||
    (departure.revisedTimeLocal as string | undefined) ||
    null;
  const arrLocal =
    (arrival.scheduledTimeLocal as string | undefined) ||
    (arrival.revisedTimeLocal as string | undefined) ||
    null;

  const startTime = depLocal?.includes("T")
    ? depLocal.split("T")[1]?.slice(0, 5)
    : event.start_time;
  const endTime = arrLocal?.includes("T")
    ? arrLocal.split("T")[1]?.slice(0, 5)
    : event.end_time;
  const endDate = arrLocal?.includes("T")
    ? arrLocal.split("T")[0]
    : event.end_date;

  const depAirport =
    normalizeIataCode(
      ((departure.airport as Record<string, unknown> | undefined)?.iata as
        | string
        | undefined) || null
    ) ||
    normalizeIataCode(event.departure_airport) ||
    null;
  const arrAirport =
    normalizeIataCode(
      ((arrival.airport as Record<string, unknown> | undefined)?.iata as
        | string
        | undefined) || null
    ) ||
    normalizeIataCode(event.arrival_airport) ||
    null;

  const reg =
    (aircraft.reg as string | undefined) ||
    (aircraft.registration as string | undefined) ||
    null;
  const aircraftType =
    (aircraft.model as string | undefined) ||
    (aircraft.type as string | undefined) ||
    null;

  const departureTerminal =
    asApiString(departure.terminal) || event.departure_terminal;
  const arrivalTerminal =
    asApiString(arrival.terminal) || event.arrival_terminal;
  const departureGate = asApiString(departure.gate) || event.departure_gate;
  const arrivalGate = asApiString(arrival.gate) || event.arrival_gate;
  const checkInDesk =
    asApiString(departure.checkInDesk) ||
    asApiString(departure.check_in_desk) ||
    event.check_in_desk;
  const baggageBelt =
    asApiString(arrival.baggageBelt) ||
    asApiString(arrival.baggage_belt) ||
    event.baggage_belt;

  const depAirportObj = departure.airport as Record<string, unknown> | undefined;
  const arrAirportObj = arrival.airport as Record<string, unknown> | undefined;
  let depCoords =
    extractLatLon(depAirportObj) ||
    (event.departure_lat != null && event.departure_lon != null
      ? { lat: event.departure_lat, lon: event.departure_lon }
      : null);
  let arrCoords =
    extractLatLon(arrAirportObj) ||
    (event.arrival_lat != null && event.arrival_lon != null
      ? { lat: event.arrival_lat, lon: event.arrival_lon }
      : null);

  if (!depCoords && depAirport) {
    depCoords = await fetchAirportCoords(base, headers, depAirport);
  }
  if (!arrCoords && arrAirport) {
    arrCoords = await fetchAirportCoords(base, headers, arrAirport);
  }

  let durationMinutes: number | null = null;
  if (depLocal && arrLocal) {
    const a = Date.parse(depLocal);
    const b = Date.parse(arrLocal);
    if (Number.isFinite(a) && Number.isFinite(b) && b > a) {
      durationMinutes = Math.round((b - a) / 60000);
    }
  }

  let aircraftImagePath: string | null = event.aircraft_image_path;
  if (reg) {
    try {
      const downloaded = await fetchAircraftImage(base, headers, reg);
      if (downloaded) {
        aircraftImagePath = downloaded;
      }
    } catch {
      /* optional — keep previous path */
    }
  }

  const updated = updateTripEvent(eventId, {
    airline: (airline.name as string | undefined) || event.airline,
    aircraftReg: reg,
    aircraftType,
    departureAirport: depAirport,
    arrivalAirport: arrAirport,
    startTime: startTime || null,
    endTime: endTime || null,
    endDate: endDate || null,
    durationMinutes,
    aircraftImagePath,
    departureTerminal,
    arrivalTerminal,
    departureGate,
    arrivalGate,
    checkInDesk,
    baggageBelt,
    departureLat: depCoords?.lat ?? null,
    departureLon: depCoords?.lon ?? null,
    arrivalLat: arrCoords?.lat ?? null,
    arrivalLon: arrCoords?.lon ?? null,
    location: formatAirportRoute(depAirport, arrAirport) || event.location,
    enrichmentJson: JSON.stringify({
      status: "complete",
      source: "aerodatabox",
      provider,
      flight,
    }),
    enrichedAt: nowIso(),
  });

  return { event: updated };
}

async function fetchAircraftImage(
  base: string,
  headers: HeadersInit,
  reg: string
): Promise<string | null> {
  ensureTripMediaDirs();
  const url = `${base}/aircrafts/reg/${encodeURIComponent(reg)}/image/beta`;
  const response = await fetch(url, { headers });
  if (!response.ok) return null;
  const text = await response.text().catch(() => "");
  if (!text.trim()) return null;
  let data: { url?: string };
  try {
    data = JSON.parse(text) as { url?: string };
  } catch {
    return null;
  }
  if (!data.url) return null;

  const imageRes = await fetch(data.url);
  if (!imageRes.ok) return null;
  const buffer = Buffer.from(await imageRes.arrayBuffer());
  const filename = `${reg.replace(/[^a-zA-Z0-9-]/g, "")}.jpg`;
  const fullPath = path.join(getTripAircraftDir(), filename);
  fs.writeFileSync(fullPath, buffer);
  return fullPath;
}
