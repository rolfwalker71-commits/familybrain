/** Built-in default: illustration style; placeholders filled per activity. */
export const DEFAULT_EVENT_AI_IMAGE_PROMPT = `Square travel illustration (not photorealistic) for a «{{type}}» activity.
Title: {{title}}.
Place/context: {{place}}.
Provider: {{provider}}.
Traveler notes: {{notes}}.
Receipt context: {{beleg}}.
Scene idea: {{scene}}.
Style: clean modern editorial illustration, soft flat colors with gentle shading, friendly travel poster vibe. Any text in the image must be spelled correctly and clearly readable. No logos, watermarks, or UI chrome. Suitable as a small card thumbnail.`;

export const EVENT_AI_IMAGE_PROMPT_PLACEHOLDERS = [
  "{{type}}",
  "{{title}}",
  "{{place}}",
  "{{provider}}",
  "{{notes}}",
  "{{beleg}}",
  "{{scene}}",
] as const;

function clip(raw: string | null | undefined, max: number): string | null {
  const t = (raw || "").replace(/\s+/g, " ").trim();
  if (!t) return null;
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
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

export type EventImagePromptInput = {
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
    provider: event.provider?.trim() || "",
    notes: notes || "",
    beleg: beleg || "",
    scene: sceneForType(type),
  });
}
