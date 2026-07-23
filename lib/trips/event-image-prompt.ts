/** Built-in default: illustration style; activity card fields go into {{details}}. */
export const DEFAULT_EVENT_AI_IMAGE_PROMPT = `Square travel illustration (not photorealistic) for a «{{type}}» activity.
Title: {{title}}.
Activity details: {{details}}.
Traveler notes: {{notes}}.
Receipt context: {{beleg}}.
Scene idea: {{scene}}.
Style: clean modern editorial illustration, soft flat colors with gentle shading, friendly travel poster vibe. Any text in the image must be spelled correctly and clearly readable. No logos, watermarks, prices, or UI chrome. Suitable as a small card thumbnail.`;

/** Public placeholders for the settings UI / custom templates. */
export const EVENT_AI_IMAGE_PROMPT_PLACEHOLDERS = [
  "{{type}}",
  "{{title}}",
  "{{details}}",
  "{{notes}}",
  "{{beleg}}",
  "{{scene}}",
] as const;

function clip(raw: string | null | undefined, max: number): string | null {
  const t = (raw || "").replace(/\s+/g, " ").trim();
  if (!t) return null;
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

function trimOrEmpty(raw: string | null | undefined): string {
  return (raw || "").trim();
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
      return "transfer journey atmosphere (shuttle, taxi, or city transit)";
    case "Zugreisen":
      return "train journey atmosphere at a railway station or scenic rail travel";
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

/** All filled activity-card fields as one prompt fragment. */
function buildActivityDetails(event: EventImagePromptInput): string {
  const parts: string[] = [];
  const push = (label: string, value: string | null | undefined) => {
    const v = trimOrEmpty(value);
    if (v) parts.push(`${label}: ${v}`);
  };

  const startDate = trimOrEmpty(event.start_date);
  const endDate = trimOrEmpty(event.end_date);
  const startT = trimOrEmpty(event.start_time);
  const endT = trimOrEmpty(event.end_time);
  const datePart =
    startDate && endDate && endDate !== startDate
      ? `${startDate} – ${endDate}`
      : startDate || endDate || "";
  const timePart =
    startT || endT ? [startT, endT].filter(Boolean).join("–") : "";
  push("when", [datePart, timePart].filter(Boolean).join(" "));

  push("place", trimOrEmpty(event.place_name));
  push("location", trimOrEmpty(event.location));
  push("address", trimOrEmpty(event.address));

  if (event.origin_place || event.destination_place) {
    push(
      "route",
      [event.origin_place, event.destination_place]
        .map((x) => trimOrEmpty(x))
        .filter(Boolean)
        .join(" → ")
    );
  }

  const depAirport = trimOrEmpty(event.departure_airport);
  const arrAirport = trimOrEmpty(event.arrival_airport);
  if (depAirport || arrAirport) {
    push(
      "airports",
      depAirport && arrAirport
        ? `${depAirport} → ${arrAirport}`
        : depAirport || arrAirport
    );
  }

  push("provider", event.provider);
  push("booking", event.booking_reference);
  push("airline", event.airline);
  push("flight", event.flight_number);
  push("cabin", event.cabin_class);
  push(
    "aircraft",
    [event.aircraft_type, event.aircraft_reg]
      .map((x) => trimOrEmpty(x))
      .filter(Boolean)
      .join(" · ")
  );
  if (event.duration_minutes != null && Number.isFinite(event.duration_minutes)) {
    push("duration", `${event.duration_minutes} min`);
  }

  push(
    "departure",
    [
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
      .join(" · ")
  );
  push(
    "arrival",
    [
      event.arrival_terminal
        ? `Terminal ${trimOrEmpty(event.arrival_terminal)}`
        : null,
      event.arrival_gate ? `Gate ${trimOrEmpty(event.arrival_gate)}` : null,
      event.baggage_belt
        ? `Baggage ${trimOrEmpty(event.baggage_belt)}`
        : null,
    ]
      .filter(Boolean)
      .join(" · ")
  );

  push("phone", event.phone);
  push("website", event.website);

  return parts.join("; ");
}

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
    details: buildActivityDetails(event),
    notes: notes || "",
    beleg: beleg || "",
    scene: sceneForType(type, event.cabin_class),
  });
}
