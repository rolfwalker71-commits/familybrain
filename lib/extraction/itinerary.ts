/** Shared itinerary / ports-of-call helpers for travel docs. */

export type ItineraryStop = {
  /** ISO yyyy-mm-dd when known */
  date: string | null;
  /** Free-form day label as on the ticket, e.g. "25 OCT" / "SUN 25 AUG" */
  day_label: string | null;
  location: string;
  arrive: string | null;
  depart: string | null;
  note: string | null;
};

const MONTHS: Record<string, number> = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
};

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

/** Best-effort ISO date from ticket fragments like "25 OCT" + optional year context. */
export function guessIsoDate(
  dayLabel: string | null | undefined,
  yearHint?: number | null
): string | null {
  if (!dayLabel) return null;
  const m = dayLabel.match(/(\d{1,2})\s+([A-Za-z]{3,9})(?:\s+(\d{4}))?/i);
  if (!m) return null;
  const day = Number(m[1]);
  const month = MONTHS[m[2].toLowerCase()];
  if (!day || !month) return null;
  const year = m[3] ? Number(m[3]) : yearHint || null;
  if (!year) return null;
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

function yearHintsFromText(text: string): number[] {
  const years = new Set<number>();
  for (const m of text.matchAll(/\b(20\d{2})\b/g)) {
    years.add(Number(m[1]));
  }
  return [...years].sort((a, b) => b - a);
}

function cleanLocation(raw: string): string {
  return raw
    .replace(/\s+/g, " ")
    .replace(/\s*,\s*/g, ", ")
    .replace(/\bCRUIS+N?G\b/gi, "Cruising")
    .trim();
}

function isJunkLocation(loc: string): boolean {
  const l = loc.toLowerCase();
  if (loc.length < 3) return true;
  if (/^(day|date|ports|tender|dock|arrive|depart|ort|ortszeit)/i.test(l)) {
    return true;
  }
  return false;
}

/**
 * Parse cruise itinerary tables from OCR (German "Kreuzfahrtverlauf" or
 * English "PORTS-OF-CALL" / Cruise Itinerary).
 */
export function parseItineraryFromOcr(
  content: string | null | undefined
): ItineraryStop[] {
  if (!content?.trim()) return [];

  const years = yearHintsFromText(content);
  const yearHint = years[0] ?? null;
  const stops: ItineraryStop[] = [];
  const seen = new Set<string>();

  const push = (stop: ItineraryStop) => {
    const key = `${stop.day_label || ""}|${stop.location}|${stop.arrive || ""}|${stop.depart || ""}`;
    if (seen.has(key) || isJunkLocation(stop.location)) return;
    seen.add(key);
    stops.push(stop);
  };

  // English booklet table:
  // SUN 25 AUG BARCELONA, SPAIN D 5:30 PM
  // MON 26 AUG PALMA DE MALLORCA, SPAIN D 8:00 AM 4:00 PM
  // Do NOT treat "C" inside country names (CYPRUS) as the dock marker.
  const enLine =
    /(?:MON|TUE|WED|THU|FRI|SAT|SUN)\s+(\d{1,2}\s+[A-Z]{3})\s+(.+?)\s+([DT])\s+(\d{1,2}:\d{2}\s*[AP]M)(?:\s+(\d{1,2}:\d{2}\s*[AP]M))?/gi;

  for (const m of content.matchAll(enLine)) {
    const dayLabel = m[1].trim();
    const location = cleanLocation(m[2]);
    const marker = m[3].toUpperCase();
    const time1 = m[4]?.replace(/\s+/g, " ").trim() || null;
    const time2 = m[5]?.replace(/\s+/g, " ").trim() || null;
    push({
      date: guessIsoDate(dayLabel, yearHint),
      day_label: dayLabel,
      location,
      arrive: time2 ? time1 : null,
      depart: time2 ? time2 : time1,
      note: marker === "T" ? "Tender" : null,
    });
  }

  const enCruising =
    /(?:MON|TUE|WED|THU|FRI|SAT|SUN)\s+(\d{1,2}\s+[A-Z]{3})\s+CRUISING\s+C\b/gi;
  for (const m of content.matchAll(enCruising)) {
    const dayLabel = m[1].trim();
    push({
      date: guessIsoDate(dayLabel, yearHint),
      day_label: dayLabel,
      location: "Cruising",
      arrive: null,
      depart: null,
      note: "Seetag",
    });
  }

  // German confirmation:
  // 25 OCT BARCELONA, SPAIN 17:00
  // 26 OCT ALICANTE, SPAIN 07:00 16:00
  const sectionMatch = content.match(
    /Kreuzfahrtverlauf:[\s\S]{0,2500}?(?=Arrangements nach|Flugarrangements:|Unterrichtung|$)/i
  );
  const germanBlock = sectionMatch?.[0] || "";
  const deLine =
    /^(\d{1,2}\s+[A-Z]{3}(?:\s+\d{4})?)\s+([A-Z0-9 .,'()/&+-]+?)(?:\s+(\d{1,2}:\d{2})(?:\s+(\d{1,2}:\d{2}))?)?\s*$/gim;

  for (const m of germanBlock.matchAll(deLine)) {
    const dayLabel = m[1].trim();
    let location = cleanLocation(m[2]);
    if (/^cruising|^cruisng/i.test(location)) location = "Cruising";
    const t1 = m[3] || null;
    const t2 = m[4] || null;
    push({
      date: guessIsoDate(dayLabel, yearHint),
      day_label: dayLabel,
      location,
      arrive: t2 ? t1 : null,
      depart: t2 ? t2 : t1,
      note: location === "Cruising" ? "Seetag" : null,
    });
  }

  return stops
    .sort((a, b) => {
      const da = a.date || a.day_label || "";
      const db = b.date || b.day_label || "";
      return da.localeCompare(db, "en");
    })
    .slice(0, 40);
}

export function itineraryFromExtractedData(
  extractedData: unknown
): ItineraryStop[] {
  if (!extractedData) return [];
  let obj: Record<string, unknown> | null = null;
  if (typeof extractedData === "string") {
    try {
      obj = JSON.parse(extractedData) as Record<string, unknown>;
    } catch {
      return [];
    }
  } else if (typeof extractedData === "object") {
    obj = extractedData as Record<string, unknown>;
  }
  if (!obj) return [];

  const raw = obj.itinerary;
  if (!Array.isArray(raw)) return [];

  return raw
    .map((item): ItineraryStop | null => {
      if (!item || typeof item !== "object") return null;
      const s = item as Record<string, unknown>;
      const location = String(s.location || s.port || s.name || "").trim();
      if (!location) return null;
      return {
        date: s.date ? String(s.date) : null,
        day_label: s.day_label ? String(s.day_label) : null,
        location,
        arrive: s.arrive ? String(s.arrive) : null,
        depart: s.depart ? String(s.depart) : null,
        note: s.note ? String(s.note) : null,
      };
    })
    .filter((x): x is ItineraryStop => Boolean(x));
}

/** Prefer AI itinerary; fall back to OCR parse. */
export function resolveItinerary(opts: {
  travelItems?: Array<{ extracted_data?: unknown } | unknown>;
  ocrContent?: string | null;
}): ItineraryStop[] {
  for (const raw of opts.travelItems || []) {
    const row = raw as { extracted_data?: unknown; itinerary?: unknown };
    const fromAi = itineraryFromExtractedData(
      row.extracted_data ?? (row.itinerary ? row : null)
    );
    if (fromAi.length > 0) return fromAi;
  }
  return parseItineraryFromOcr(opts.ocrContent);
}

/**
 * When truncating OCR for analysis, keep itinerary sections even if they sit
 * past the usual head window.
 */
export function selectAnalysisOcrWindow(
  content: string | null | undefined,
  maxChars = 28000
): string {
  if (!content) return "";
  if (content.length <= maxChars) return content;

  const markers = [
    /Kreuzfahrtverlauf/i,
    /PORTS-OF-CALL/i,
    /Cruise Itinerary/i,
    /Reiseverlauf/i,
    /Anreise|Abreise|Check-?in/i,
  ];

  const chunks: string[] = [content.slice(0, Math.floor(maxChars * 0.55))];
  let used = chunks[0].length;

  for (const re of markers) {
    const idx = content.search(re);
    if (idx < 0 || idx < chunks[0].length) continue;
    const start = Math.max(0, idx - 200);
    const piece = content.slice(start, start + 4500);
    if (used + piece.length > maxChars) break;
    chunks.push(piece);
    used += piece.length;
  }

  if (used < maxChars) {
    const mid = Math.floor(content.length / 3);
    chunks.push(content.slice(mid, mid + (maxChars - used)));
  }

  return chunks.join("\n\n---\n\n");
}
