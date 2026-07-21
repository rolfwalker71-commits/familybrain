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

function normalizeFlightNumber(raw: string): string {
  return raw.replace(/\s+/g, "").toUpperCase();
}

export async function enrichFlightEvent(eventId: number): Promise<TripEventRow> {
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
  const url = `${base}/flights/number/${encodeURIComponent(
    number
  )}/${encodeURIComponent(date)}`;

  const response = await fetch(url, { headers });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(
      `Fluglookup fehlgeschlagen (${response.status}, ${provider}): ${text.slice(0, 200)}`
    );
  }

  const data = (await response.json()) as unknown;
  const flights = Array.isArray(data) ? data : [];
  if (flights.length === 0) {
    throw new Error("Keine Flugdaten für diese Nummer/Datum gefunden.");
  }

  const flight = flights[0] as Record<string, unknown>;
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

  return updateTripEvent(eventId, {
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
    location:
      formatAirportRoute(depAirport, arrAirport) || event.location,
    enrichmentJson: JSON.stringify(flight),
    enrichedAt: nowIso(),
  });
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
  const data = (await response.json()) as { url?: string };
  if (!data.url) return null;

  const imageRes = await fetch(data.url);
  if (!imageRes.ok) return null;
  const buffer = Buffer.from(await imageRes.arrayBuffer());
  const filename = `${reg.replace(/[^a-zA-Z0-9-]/g, "")}.jpg`;
  const fullPath = path.join(getTripAircraftDir(), filename);
  fs.writeFileSync(fullPath, buffer);
  return fullPath;
}
