import type { TripEventRow } from "@/lib/trips/queries";

function clip(raw: string | null | undefined, max: number): string | null {
  const t = (raw || "").replace(/\s+/g, " ").trim();
  if (!t) return null;
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

function placeHint(event: Pick<
  TripEventRow,
  | "place_name"
  | "location"
  | "address"
  | "origin_place"
  | "destination_place"
  | "departure_airport"
  | "arrival_airport"
>): string | null {
  if (event.place_name?.trim()) return event.place_name.trim();
  if (event.location?.trim()) return event.location.trim();
  if (event.address?.trim()) return event.address.trim();
  if (event.origin_place || event.destination_place) {
    return [event.origin_place, event.destination_place]
      .filter(Boolean)
      .join(" → ");
  }
  if (event.departure_airport || event.arrival_airport) {
    return [event.departure_airport, event.arrival_airport]
      .filter(Boolean)
      .join(" → ");
  }
  return null;
}

function sceneForType(eventType: string): string {
  switch (eventType) {
    case "Flug":
      return "airport terminal or aircraft cabin atmosphere, travel day mood";
    case "Hotel":
    case "Unterkunft":
      return "welcoming hotel exterior or lobby atmosphere";
    case "Kreuzfahrt":
      return "cruise ship deck or scenic port-of-call atmosphere";
    case "Mietauto":
    case "Mietwagen":
      return "scenic road trip / rental car travel atmosphere";
    case "Transfer":
      return "transfer journey atmosphere (train station, shuttle, or city transit)";
    case "Ausflug":
    case "Aktivität":
      return "memorable sightseeing or outdoor activity atmosphere";
    default:
      return "authentic travel moment atmosphere";
  }
}

/** Prefill prompt for selective per-activity AI thumbnails. */
export function buildEventImagePrompt(event: {
  event_type?: string | null;
  title: string;
  place_name?: string | null;
  location?: string | null;
  address?: string | null;
  origin_place?: string | null;
  destination_place?: string | null;
  departure_airport?: string | null;
  arrival_airport?: string | null;
  provider?: string | null;
  notes?: string | null;
  document_notes_md?: string | null;
}): string {
  const type = event.event_type || "Sonstiges";
  const place = placeHint({
    place_name: event.place_name ?? null,
    location: event.location ?? null,
    address: event.address ?? null,
    origin_place: event.origin_place ?? null,
    destination_place: event.destination_place ?? null,
    departure_airport: event.departure_airport ?? null,
    arrival_airport: event.arrival_airport ?? null,
  });
  const notes = clip(event.notes, 180);
  const beleg = clip(
    (event.document_notes_md || "")
      .replace(/[#|*_`>-]/g, " ")
      .replace(/\s+/g, " "),
    160
  );

  const bits = [
    `Photorealistic square travel thumbnail for a «${type}» activity.`,
    `Title: ${event.title}.`,
    place ? `Place/context: ${place}.` : null,
    event.provider?.trim() ? `Provider: ${event.provider.trim()}.` : null,
    notes ? `Traveler notes: ${notes}.` : null,
    beleg ? `Receipt context: ${beleg}.` : null,
    `Scene: ${sceneForType(type)}.`,
    "No text, logos, watermarks, or UI chrome. Natural light, soft depth of field, suitable as a small card thumbnail.",
  ].filter(Boolean);

  return bits.join(" ");
}
