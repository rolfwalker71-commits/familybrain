import type { CalendarEvent } from "@/lib/utils/ics";
import type { TripEventRow, TripRow } from "@/lib/trips/queries";
import { eventAiImagePublicUrl } from "@/lib/trips/cover";
import { loadScaledJpeg } from "@/lib/finance-brain/image-scale";

function stripMarkdownLite(md: string): string {
  return md
    .replace(/\r\n/g, "\n")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/(\*\*|__)(.*?)\1/g, "$2")
    .replace(/(\*|_)(.*?)\1/g, "$2")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1 ($2)")
    .replace(/^>\s?/gm, "")
    .replace(/^[-*+]\s+/gm, "• ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function push(
  parts: string[],
  label: string,
  value: string | number | null | undefined
) {
  if (value == null) return;
  const s = String(value).trim();
  if (!s) return;
  parts.push(`${label}: ${s}`);
}

/** Rich DESCRIPTION lines for one trip event (calendar export). */
export function buildTripEventCalendarDescription(
  trip: TripRow,
  event: TripEventRow,
  opts?: { absoluteOrigin?: string; aiImageAttached?: boolean }
): string {
  const parts: string[] = [];

  push(parts, "Reise", trip.title);
  push(parts, "Ziel", trip.destination);
  if (trip.summary?.trim()) {
    parts.push(trip.summary.trim());
  }

  push(parts, "Ort", event.place_name || event.location);
  const placeRoute =
    event.origin_place || event.destination_place
      ? `${event.origin_place || "—"} → ${event.destination_place || "—"}`
      : null;
  const airportRoute =
    event.departure_airport || event.arrival_airport
      ? `${event.departure_airport || "—"} → ${event.arrival_airport || "—"}`
      : null;
  push(parts, "Route", placeRoute || airportRoute);
  push(parts, "Adresse", event.address);

  if (event.lat != null && event.lon != null) {
    push(parts, "Koordinaten", `${event.lat}, ${event.lon}`);
  } else if (
    event.departure_lat != null &&
    event.departure_lon != null &&
    event.arrival_lat != null &&
    event.arrival_lon != null
  ) {
    push(
      parts,
      "Koordinaten",
      `Ab ${event.departure_lat},${event.departure_lon} · An ${event.arrival_lat},${event.arrival_lon}`
    );
  }

  push(parts, "Anbieter", event.provider);
  push(parts, "Buchung", event.booking_reference);
  push(
    parts,
    event.event_type === "Zugreisen" ? "Zug" : "Flug",
    event.flight_number
  );
  push(parts, "Klasse", event.cabin_class);
  push(parts, "Airline", event.airline);
  push(
    parts,
    "Flugzeug",
    [event.aircraft_type, event.aircraft_reg].filter(Boolean).join(" · ") ||
      null
  );

  const depBits = [
    event.departure_terminal ? `Terminal ${event.departure_terminal}` : null,
    event.departure_gate ? `Gate ${event.departure_gate}` : null,
    event.check_in_desk ? `Check-in ${event.check_in_desk}` : null,
  ].filter(Boolean);
  if (depBits.length) push(parts, "Abflug", depBits.join(" · "));

  const arrBits = [
    event.arrival_terminal ? `Terminal ${event.arrival_terminal}` : null,
    event.arrival_gate ? `Gate ${event.arrival_gate}` : null,
    event.baggage_belt ? `Gepäck ${event.baggage_belt}` : null,
  ].filter(Boolean);
  if (arrBits.length) push(parts, "Ankunft", arrBits.join(" · "));

  if (event.duration_minutes != null && Number.isFinite(event.duration_minutes)) {
    push(parts, "Dauer", `${event.duration_minutes} Min.`);
  }

  push(parts, "Telefon", event.phone);
  push(parts, "Web", event.website);

  if (event.notes?.trim()) {
    parts.push(`Notizen:\n${event.notes.trim()}`);
  }

  if (
    (event.show_document_notes === 0 ? false : true) &&
    event.document_notes_md?.trim()
  ) {
    parts.push(
      `Beleg-Notizen:\n${stripMarkdownLite(event.document_notes_md)}`
    );
  }

  const origin = opts?.absoluteOrigin?.replace(/\/$/, "") || "";
  const aiRel = eventAiImagePublicUrl(event.ai_image_path);
  if (opts?.aiImageAttached) {
    parts.push("KI-Bild: als Kalender-Anhang eingebettet");
  } else if (aiRel && origin) {
    parts.push(`KI-Bild: ${origin}${aiRel}`);
  } else if (event.ai_image_path) {
    parts.push("KI-Bild: in TripBook vorhanden");
  }

  return parts.join("\n");
}

function eventGeo(
  event: TripEventRow
): { lat: number; lon: number } | undefined {
  if (event.lat != null && event.lon != null) {
    return { lat: event.lat, lon: event.lon };
  }
  if (event.departure_lat != null && event.departure_lon != null) {
    return { lat: event.departure_lat, lon: event.departure_lon };
  }
  return undefined;
}

export async function tripEventsToCalendarEvents(
  trip: TripRow,
  events: TripEventRow[],
  opts?: { absoluteOrigin?: string; embedAiImages?: boolean }
): Promise<CalendarEvent[]> {
  const embedAi = opts?.embedAiImages !== false;
  const out: CalendarEvent[] = [];

  for (const event of events) {
    if (!event.start_date) continue;

    let aiAttachment: CalendarEvent["attachments"];
    let aiImageAttached = false;
    if (embedAi && event.ai_image_path) {
      const scaled = await loadScaledJpeg(event.ai_image_path, 240);
      if (scaled) {
        aiImageAttached = true;
        aiAttachment = [
          {
            dataBase64: scaled.toString("base64"),
            mimeType: "image/jpeg",
            filename: `trip-${trip.id}-event-${event.id}-ai.jpg`,
          },
        ];
      }
    }

    const origin = opts?.absoluteOrigin?.replace(/\/$/, "") || "";
    const aiRel = eventAiImagePublicUrl(event.ai_image_path);
    if (!aiAttachment && aiRel && origin) {
      aiAttachment = [{ uri: `${origin}${aiRel}`, mimeType: "image/jpeg" }];
    }

    out.push({
      uid: `tripbook-trip-${trip.id}-event-${event.id}@tripbook`,
      title: `${event.event_type}: ${event.title}`,
      description: buildTripEventCalendarDescription(trip, event, {
        absoluteOrigin: opts?.absoluteOrigin,
        aiImageAttached,
      }),
      location: event.address || event.place_name || event.location || undefined,
      startDate: event.start_date,
      endDate: event.end_date || event.start_date || undefined,
      startTime: event.start_time || undefined,
      endTime: event.end_time || undefined,
      url: event.website || undefined,
      categories: event.event_type ? [event.event_type] : undefined,
      geo: eventGeo(event),
      attachments: aiAttachment,
    });
  }

  return out;
}
