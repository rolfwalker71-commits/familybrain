import { normalizeTravelType } from "@/lib/extraction/normalize-categories";
import {
  itineraryFromExtractedData,
  resolveItinerary,
  type ItineraryStop,
} from "@/lib/extraction/itinerary";
import type { TripEventDraft } from "@/lib/trips/constants";
import { formatAirportRoute, normalizeIataCode } from "@/lib/trips/iata";

export type TravelItemLike = {
  id?: number | null;
  travel_type?: string | null;
  travel_type_override?: string | null;
  provider?: string | null;
  title?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  origin?: string | null;
  destination?: string | null;
  booking_reference?: string | null;
  extracted_data?: string | null | Record<string, unknown>;
  document_id?: number | null;
  document_local_id?: number | null;
};

function parseExtracted(
  raw: TravelItemLike["extracted_data"]
): Record<string, unknown> | null {
  if (!raw) return null;
  if (typeof raw === "object") return raw as Record<string, unknown>;
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function asString(value: unknown): string | null {
  if (value == null) return null;
  const s = String(value).trim();
  return s || null;
}

/** Best-effort IATA flight number from free text (LX80, LH 400, U21234). */
export function guessFlightNumber(
  ...parts: Array<string | null | undefined>
): string | null {
  const hay = parts.filter(Boolean).join(" ");
  if (!hay) return null;
  const match = hay.match(/\b([A-Z]{1,3})\s*(\d{1,4}[A-Z]?)\b/i);
  if (!match) return null;
  const code = match[1].toUpperCase();
  const num = match[2].toUpperCase();
  if (/^(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)$/i.test(code)) {
    return null;
  }
  return `${code}${num}`;
}

function normalizeClock(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const m = String(raw).trim().match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  return `${m[1].padStart(2, "0")}:${m[2]}`;
}

function travelTypeOf(
  item: TravelItemLike,
  extracted: Record<string, unknown> | null
): string {
  return normalizeTravelType(
    item.travel_type_override ||
      item.travel_type ||
      asString(extracted?.travel_type),
    {
      title: item.title || asString(extracted?.title),
      provider: item.provider || asString(extracted?.provider),
      origin: item.origin || asString(extracted?.origin),
      destination: item.destination || asString(extracted?.destination),
    }
  );
}

function portNote(stop: ItineraryStop): string | null {
  const parts = [
    stop.arrive ? `Ankunft ${stop.arrive}` : null,
    stop.depart ? `Abfahrt ${stop.depart}` : null,
    stop.note,
    stop.day_label && !stop.date ? stop.day_label : null,
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
}

/**
 * Map a Paperless travel_item (+ extracted_data / itinerary) to one or more
 * TravelBrain event drafts. Cruises expand ports of call into Aktivität events.
 */
export function travelItemToEventDrafts(item: TravelItemLike): TripEventDraft[] {
  const extracted = parseExtracted(item.extracted_data);
  const type = travelTypeOf(item, extracted);
  const title =
    item.title ||
    asString(extracted?.title) ||
    [
      item.origin || asString(extracted?.origin),
      item.destination || asString(extracted?.destination),
    ]
      .filter(Boolean)
      .join(" → ") ||
    type;

  const bookingReference =
    item.booking_reference ||
    asString(extracted?.booking_reference) ||
    asString(extracted?.bookingReference) ||
    null;

  const flightNumber =
    asString(extracted?.flight_number) ||
    asString(extracted?.flightNumber) ||
    guessFlightNumber(
      title,
      item.provider,
      asString(extracted?.title),
      asString(extracted?.notes)
    );

  const hotelAddress = asString(extracted?.address);

  const route = [
    item.origin || asString(extracted?.origin),
    item.destination || asString(extracted?.destination),
  ]
    .filter(Boolean)
    .join(" → ");

  const location =
    type === "Hotel"
      ? hotelAddress ||
        item.destination ||
        asString(extracted?.destination) ||
        route ||
        null
      : route || hotelAddress || null;

  const documentId = item.document_id ?? item.document_local_id ?? null;
  const travelItemId = item.id ?? null;

  const depIata =
    type === "Flug"
      ? normalizeIataCode(item.origin || asString(extracted?.origin))
      : null;
  const arrIata =
    type === "Flug"
      ? normalizeIataCode(
          item.destination || asString(extracted?.destination)
        )
      : null;

  const main: TripEventDraft = {
    type,
    title,
    start_date: item.start_date || asString(extracted?.start_date),
    end_date: item.end_date || asString(extracted?.end_date),
    start_time: normalizeClock(
      asString(extracted?.start_time) || asString(extracted?.startTime)
    ),
    end_time: normalizeClock(
      asString(extracted?.end_time) || asString(extracted?.endTime)
    ),
    location:
      type === "Flug"
        ? formatAirportRoute(depIata, arrIata) || location
        : location,
    address: hotelAddress,
    provider: item.provider || asString(extracted?.provider),
    booking_reference: bookingReference,
    flight_number: type === "Flug" ? flightNumber : null,
    departure_airport: depIata,
    arrival_airport: arrIata,
    document_id: documentId,
    travel_item_id: travelItemId,
    source_excerpt: title,
  };

  const drafts: TripEventDraft[] = [main];

  let itinerary = resolveItinerary({ travelItems: [item] });
  if (itinerary.length === 0) {
    itinerary = itineraryFromExtractedData(extracted);
  }

  if (type === "Kreuzfahrt" && itinerary.length > 0) {
    for (const stop of itinerary) {
      const stopTitle = stop.location.trim() || "Hafen";
      drafts.push({
        type: "Aktivität",
        title: stopTitle,
        start_date: stop.date,
        end_date: stop.date,
        start_time: normalizeClock(stop.arrive),
        end_time: normalizeClock(stop.depart),
        location: stopTitle,
        notes: portNote(stop),
        document_id: documentId,
        travel_item_id: travelItemId,
        source_excerpt: `Anlaufhafen: ${stopTitle}`,
      });
    }
  }

  return drafts;
}

export function summarizeDraftBatch(drafts: TripEventDraft[]): string {
  if (drafts.length <= 1) {
    const d = drafts[0];
    return d ? `${d.type} · ${d.title}` : "Ereignis";
  }
  const ports = drafts.length - 1;
  return `${drafts[0].type} · ${drafts[0].title} (+${ports} Häfen/Stops)`;
}
