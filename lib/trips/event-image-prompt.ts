/** Built-in default: illustration style; placeholders filled per activity. */
export const DEFAULT_EVENT_AI_IMAGE_PROMPT = `Square travel illustration (not photorealistic) for a «{{type}}» activity.
Title: {{title}}.
Place/context: {{place}}.
Date/time: {{when}}.
Activity details: {{details}}.
Traveler notes: {{notes}}.
Receipt context: {{beleg}}.
Scene idea: {{scene}}.
Style: clean modern editorial illustration, soft flat colors with gentle shading, friendly travel poster vibe. Any text in the image must be spelled correctly and clearly readable. No logos, watermarks, prices, or UI chrome. Suitable as a small card thumbnail.`;

export const EVENT_AI_IMAGE_PROMPT_PLACEHOLDERS = [
  "{{type}}",
  "{{title}}",
  "{{place}}",
  "{{when}}",
  "{{provider}}",
  "{{booking}}",
  "{{notes}}",
  "{{beleg}}",
  "{{scene}}",
  "{{address}}",
  "{{phone}}",
  "{{website}}",
  "{{flight}}",
  "{{airline}}",
  "{{cabin}}",
  "{{route}}",
  "{{aircraft}}",
  "{{duration}}",
  "{{departure}}",
  "{{arrival}}",
  "{{flight_info}}",
  "{{details}}",
] as const;

function clip(raw: string | null | undefined, max: number): string | null {
  const t = (raw || "").replace(/\s+/g, " ").trim();
  if (!t) return null;
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

function trimOrEmpty(raw: string | null | undefined): string {
  return (raw || "").trim();
}

function placeHint(event: {
  place_name?: string | null;
  location?: string | null;
  address?: string | null;
  origin_place?: string | null;
  destination_place?: string | null;
  departure_airport?: string | null;
  arrival_airport?: string | null;
}): string | null {
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

function airportRoute(event: {
  departure_airport?: string | null;
  arrival_airport?: string | null;
}): string {
  const dep = trimOrEmpty(event.departure_airport);
  const arr = trimOrEmpty(event.arrival_airport);
  if (dep && arr) return `${dep} → ${arr}`;
  return dep || arr || "";
}

function aircraftLabel(event: EventImagePromptInput): string {
  return [event.aircraft_type, event.aircraft_reg]
    .map((x) => trimOrEmpty(x))
    .filter(Boolean)
    .join(" · ");
}

function durationLabel(event: EventImagePromptInput): string {
  return event.duration_minutes != null && Number.isFinite(event.duration_minutes)
    ? `${event.duration_minutes} min`
    : "";
}

function departureLabel(event: EventImagePromptInput): string {
  return [
    event.departure_terminal
      ? `Terminal ${trimOrEmpty(event.departure_terminal)}`
      : null,
    event.departure_gate
      ? `Gate ${trimOrEmpty(event.departure_gate)}`
      : null,
    event.check_in_desk
      ? `Check-in ${trimOrEmpty(event.check_in_desk)}`
      : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

function arrivalLabel(event: EventImagePromptInput): string {
  return [
    event.arrival_terminal
      ? `Terminal ${trimOrEmpty(event.arrival_terminal)}`
      : null,
    event.arrival_gate ? `Gate ${trimOrEmpty(event.arrival_gate)}` : null,
    event.baggage_belt
      ? `Baggage ${trimOrEmpty(event.baggage_belt)}`
      : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

function whenLabel(event: EventImagePromptInput): string {
  const date = trimOrEmpty(event.start_date);
  const endDate = trimOrEmpty(event.end_date);
  const startT = trimOrEmpty(event.start_time);
  const endT = trimOrEmpty(event.end_time);
  const datePart =
    date && endDate && endDate !== date
      ? `${date} – ${endDate}`
      : date || endDate || "";
  const timePart =
    startT || endT ? [startT, endT].filter(Boolean).join("–") : "";
  return [datePart, timePart].filter(Boolean).join(" ");
}

function flightInfoLine(event: EventImagePromptInput): string {
  const parts: string[] = [];
  const flight = trimOrEmpty(event.flight_number);
  const airline = trimOrEmpty(event.airline);
  const cabin = trimOrEmpty(event.cabin_class);
  const booking = trimOrEmpty(event.booking_reference);
  const route = airportRoute(event);
  const aircraft = aircraftLabel(event);
  const duration = durationLabel(event);
  const dep = departureLabel(event);
  const arr = arrivalLabel(event);
  if (flight) parts.push(`flight ${flight}`);
  if (airline) parts.push(`airline ${airline}`);
  if (cabin) parts.push(`cabin ${cabin}`);
  if (booking) parts.push(`booking ${booking}`);
  if (route) parts.push(`route ${route}`);
  if (aircraft) parts.push(`aircraft ${aircraft}`);
  if (duration) parts.push(`duration ${duration}`);
  if (dep) parts.push(`departure ${dep}`);
  if (arr) parts.push(`arrival ${arr}`);
  return parts.join(", ");
}

/** Compact summary of filled activity-card fields (mirrors card details). */
function detailsLine(event: EventImagePromptInput): string {
  const parts: string[] = [];
  const push = (label: string, value: string) => {
    const v = value.trim();
    if (v) parts.push(`${label}: ${v}`);
  };

  push("provider", trimOrEmpty(event.provider));
  push("booking", trimOrEmpty(event.booking_reference));
  push("airline", trimOrEmpty(event.airline));
  push("flight", trimOrEmpty(event.flight_number));
  push("cabin", trimOrEmpty(event.cabin_class));
  push("route", airportRoute(event));
  push("aircraft", aircraftLabel(event));
  push("duration", durationLabel(event));
  push("departure", departureLabel(event));
  push("arrival", arrivalLabel(event));
  push("address", trimOrEmpty(event.address));
  push("phone", trimOrEmpty(event.phone));
  push("website", trimOrEmpty(event.website));
  if (event.origin_place || event.destination_place) {
    push(
      "transfer",
      [event.origin_place, event.destination_place]
        .map((x) => trimOrEmpty(x))
        .filter(Boolean)
        .join(" → ")
    );
  }

  return parts.join("; ");
}

function sceneForType(
  eventType: string,
  cabinClass?: string | null
): string {
  switch (eventType) {
    case "Flug": {
      const cabin = cabinClass?.trim();
      if (cabin) {
        return `${cabin} cabin atmosphere on board or at the gate, travel day mood`;
      }
      return "airport terminal or aircraft cabin atmosphere, travel day mood";
    }
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

export type EventImagePromptInput = {
  event_type?: string | null;
  title: string;
  start_date?: string | null;
  end_date?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  place_name?: string | null;
  location?: string | null;
  address?: string | null;
  origin_place?: string | null;
  destination_place?: string | null;
  departure_airport?: string | null;
  arrival_airport?: string | null;
  provider?: string | null;
  booking_reference?: string | null;
  notes?: string | null;
  document_notes_md?: string | null;
  cabin_class?: string | null;
  flight_number?: string | null;
  airline?: string | null;
  aircraft_type?: string | null;
  aircraft_reg?: string | null;
  duration_minutes?: number | null;
  departure_terminal?: string | null;
  departure_gate?: string | null;
  check_in_desk?: string | null;
  arrival_terminal?: string | null;
  arrival_gate?: string | null;
  baggage_belt?: string | null;
  phone?: string | null;
  website?: string | null;
};

function applyTemplate(
  template: string,
  vars: Record<string, string>
): string {
  let out = template;
  for (const [key, value] of Object.entries(vars)) {
    out = out.replaceAll(`{{${key}}}`, value || "—");
  }
  return out.replace(/\s+/g, " ").trim();
}

/** Prefill prompt for selective per-activity AI thumbnails. */
export function buildEventImagePrompt(
  event: EventImagePromptInput,
  template: string = DEFAULT_EVENT_AI_IMAGE_PROMPT
): string {
  const type = event.event_type || "Sonstiges";
  const place = placeHint(event);
  const notes = clip(event.notes, 180);
  const beleg = clip(
    (event.document_notes_md || "")
      .replace(/[#|*_`>-]/g, " ")
      .replace(/\s+/g, " "),
    160
  );

  return applyTemplate(template.trim() || DEFAULT_EVENT_AI_IMAGE_PROMPT, {
    type,
    title: event.title,
    place: place || "",
    when: whenLabel(event),
    provider: trimOrEmpty(event.provider),
    booking: trimOrEmpty(event.booking_reference),
    notes: notes || "",
    beleg: beleg || "",
    scene: sceneForType(type, event.cabin_class),
    address: trimOrEmpty(event.address),
    phone: trimOrEmpty(event.phone),
    website: trimOrEmpty(event.website),
    flight: trimOrEmpty(event.flight_number),
    airline: trimOrEmpty(event.airline),
    cabin: trimOrEmpty(event.cabin_class),
    route: airportRoute(event),
    aircraft: aircraftLabel(event),
    duration: durationLabel(event),
    departure: departureLabel(event),
    arrival: arrivalLabel(event),
    flight_info: flightInfoLine(event),
    details: detailsLine(event),
  });
}
