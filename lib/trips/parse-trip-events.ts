import type { TripEventDraft } from "@/lib/trips/constants";

const TRIP_EVENTS_MARKER =
  /\[\[TRIP_EVENTS:\s*(\[[\s\S]*?\])\s*\]\]/i;

function asNullableString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function asNullableNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export function parseTripEventsMarker(rawAnswer: string): {
  answer: string;
  tripEvents: TripEventDraft[];
} {
  const match = rawAnswer.match(TRIP_EVENTS_MARKER);
  if (!match) {
    return { answer: rawAnswer, tripEvents: [] };
  }

  let tripEvents: TripEventDraft[] = [];
  try {
    const parsed = JSON.parse(match[1]) as unknown;
    if (Array.isArray(parsed)) {
      tripEvents = parsed
        .map((item): TripEventDraft | null => {
          if (!item || typeof item !== "object") return null;
          const row = item as Record<string, unknown>;
          const title = asNullableString(row.title);
          const type = asNullableString(row.type) || "Sonstiges";
          if (!title) return null;
          return {
            type,
            title,
            start_date: asNullableString(row.start_date),
            end_date: asNullableString(row.end_date),
            start_time: asNullableString(row.start_time),
            end_time: asNullableString(row.end_time),
            location: asNullableString(row.location),
            address: asNullableString(row.address),
            provider: asNullableString(row.provider),
            booking_reference: asNullableString(row.booking_reference),
            notes: asNullableString(row.notes),
            flight_number: asNullableString(row.flight_number),
            document_id: asNullableNumber(row.document_id),
            travel_item_id: asNullableNumber(row.travel_item_id),
            guide_id: asNullableNumber(row.guide_id),
            note_id: asNullableString(row.note_id),
            source_excerpt: asNullableString(row.source_excerpt),
          };
        })
        .filter((x): x is TripEventDraft => Boolean(x))
        .slice(0, 8);
    }
  } catch {
    tripEvents = [];
  }

  const answer = rawAnswer.replace(TRIP_EVENTS_MARKER, "").trim();
  return { answer, tripEvents };
}
