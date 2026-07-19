import { getDb } from "@/lib/db/client";
import { currentYear, toSwissDate } from "@/lib/utils/dates";
import { resolveItinerary } from "@/lib/extraction/itinerary";

export type ChatSource = {
  id: number;
  paperlessId: number;
  title: string | null;
  category: string | null;
  shortSummary: string | null;
  correspondent: string | null;
  createdDate: string | null;
  excerpt: string;
  score: number;
};

export type StructuredFact = {
  kind: "warranty" | "deadline" | "finance" | "travel";
  label: string;
  details: string;
  documentId: number | null;
  documentTitle: string | null;
  score: number;
};

export type CorpusStats = {
  totalDocuments: number;
  analyzedDocuments: number;
  warranties: number;
  deadlines: number;
  financialItems: number;
  travelItems: number;
};

export type ChatRetrieval = {
  sources: ChatSource[];
  facts: StructuredFact[];
  corpus: CorpusStats;
};

const STOPWORDS = new Set([
  "der",
  "die",
  "das",
  "dem",
  "den",
  "des",
  "ein",
  "eine",
  "einer",
  "einem",
  "einen",
  "und",
  "oder",
  "aber",
  "auch",
  "nicht",
  "noch",
  "nur",
  "schon",
  "sehr",
  "viel",
  "mehr",
  "wenn",
  "wie",
  "was",
  "wer",
  "wo",
  "wann",
  "warum",
  "welche",
  "welcher",
  "welches",
  "wieso",
  "weshalb",
  "mir",
  "mich",
  "mein",
  "meine",
  "meinen",
  "meiner",
  "ich",
  "du",
  "wir",
  "ihr",
  "sie",
  "es",
  "ist",
  "sind",
  "war",
  "waren",
  "sein",
  "haben",
  "hat",
  "hatte",
  "kann",
  "können",
  "muss",
  "müssen",
  "soll",
  "sollte",
  "wird",
  "werden",
  "für",
  "von",
  "vom",
  "zum",
  "zur",
  "zu",
  "mit",
  "bei",
  "nach",
  "über",
  "unter",
  "ohne",
  "aus",
  "auf",
  "im",
  "in",
  "am",
  "an",
  "als",
  "ob",
  "bis",
  "ab",
  "mal",
  "bitte",
  "zeig",
  "zeige",
  "zeigen",
  "gib",
  "gibt",
  "sag",
  "sagen",
  "liste",
  "alle",
  "alles",
  "dazu",
  "hier",
  "dort",
  "hast",
  "habe",
  "dazu",
  "etwa",
  "etwas",
  "denn",
  "doch",
  "also",
  "dann",
  "man",
]);

function tokenize(query: string): string[] {
  return query
    .toLowerCase()
    .normalize("NFC")
    .split(/[^a-z0-9äöüàéèêâôûïß]+/i)
    .map((t) => t.trim())
    .filter((t) => t.length >= 3 && !STOPWORDS.has(t))
    .slice(0, 12);
}

/** Resolve relative year phrases so retrieval prefers the calendar year users mean. */
function relativeYearHints(query: string): { years: string[]; preferUpcoming: boolean } {
  const lower = query.toLowerCase().normalize("NFC");
  const year = currentYear();
  const years: string[] = [];
  let preferUpcoming = false;

  if (
    /\bdieses\s+jahr\b/.test(lower) ||
    /\baktuelles?\s+jahr\b/.test(lower) ||
    /\bheuer\b/.test(lower) ||
    /\bin\s+diesem\s+jahr\b/.test(lower)
  ) {
    years.push(String(year));
  }
  if (/\bnächstes\s+jahr\b/.test(lower) || /\bnæchstes\s+jahr\b/.test(lower)) {
    years.push(String(year + 1));
  }
  if (/\bletztes\s+jahr\b/.test(lower) || /\bvorjahr\b/.test(lower)) {
    years.push(String(year - 1));
  }
  if (
    /\bkommend|\bgeplant|\banstehend|\bdemnächst|\bbald\b|\bnoch\s+geplant/.test(
      lower
    )
  ) {
    preferUpcoming = true;
    if (!years.includes(String(year))) years.push(String(year));
  }

  return { years: [...new Set(years)], preferUpcoming };
}

/** Multi-word phrases from the question (e.g. "legend of the seas"). */
function extractPhrases(query: string): string[] {
  const lower = query.toLowerCase().normalize("NFC");
  const phrases: string[] = [];

  // Royal Caribbean-style: "<Name> of the Seas"
  for (const m of lower.matchAll(/\b([a-zäöü]+\s+of\s+the\s+seas)\b/gi)) {
    phrases.push(m[1].replace(/\s+/g, " ").trim());
  }

  const tokens = tokenize(query);
  for (let n = Math.min(4, tokens.length); n >= 2; n--) {
    for (let i = 0; i <= tokens.length - n; i++) {
      phrases.push(tokens.slice(i, i + n).join(" "));
    }
  }

  return [...new Set(phrases)].slice(0, 10);
}

function phraseHits(haystackLower: string, phrases: string[]): number {
  let hits = 0;
  for (const p of phrases) {
    if (p.length >= 8 && haystackLower.includes(p)) hits += 1;
  }
  return hits;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Match tokens as whole words/hyphen segments – avoids "port" hitting "important". */
function countTokenMatches(haystackLower: string, token: string): number {
  if (!token) return 0;
  if (token.includes("-")) {
    let from = 0;
    let count = 0;
    while (true) {
      const idx = haystackLower.indexOf(token, from);
      if (idx < 0) break;
      count += 1;
      from = idx + token.length;
    }
    return count;
  }
  const re = new RegExp(`(?:^|[^a-z0-9äöüàéèêâôûïß])${escapeRegExp(token)}(?=[^a-z0-9äöüàéèêâôûïß]|$)`, "gi");
  const matches = haystackLower.match(re);
  return matches?.length || 0;
}

function findTokenPositions(
  haystackLower: string,
  token: string,
  maxHits: number
): number[] {
  const positions: number[] = [];
  if (!token) return positions;

  if (token.includes("-")) {
    let from = 0;
    while (positions.length < maxHits) {
      const idx = haystackLower.indexOf(token, from);
      if (idx < 0) break;
      positions.push(idx);
      from = idx + token.length;
    }
    return positions;
  }

  const re = new RegExp(
    `(?:^|[^a-z0-9äöüàéèêâôûïß])(${escapeRegExp(token)})(?=[^a-z0-9äöüàéèêâôûïß]|$)`,
    "gi"
  );
  let match: RegExpExecArray | null;
  while (positions.length < maxHits && (match = re.exec(haystackLower))) {
    const full = match[0];
    const matched = match[1] || token;
    const offset = full.length - matched.length;
    positions.push(match.index + offset);
  }
  return positions;
}

function scoreText(haystack: string, tokens: string[]): { score: number; hits: number } {
  const text = haystack.toLowerCase();
  let score = 0;
  let hits = 0;
  for (const token of tokens) {
    const occurrences = countTokenMatches(text, token);
    if (occurrences <= 0) continue;
    hits += 1;
    score += 2 + Math.min(3, occurrences);
  }
  return { score, hits };
}

/** Expand query terms with close domain synonyms so EN/DE variants match. */
function expandTokens(tokens: string[]): string[] {
  const set = new Set(tokens);
  const add = (...words: string[]) => {
    for (const w of words) {
      if (w.length >= 3) set.add(w);
    }
  };

  for (const t of tokens) {
    if (t.includes("kreuzfahrt") || t === "cruise") {
      add(
        "kreuzfahrt",
        "cruise",
        "kreuzfahrtverlauf",
        "reiseverlauf",
        "itinerary"
      );
    }
    if (t === "ports" || t === "call" || t === "hafen" || t === "häfen" || t === "anlauf") {
      add(
        "ports",
        "ports-of-call",
        "hafen",
        "häfen",
        "anlaufhafen",
        "anlaufhäfen",
        "kreuzfahrtverlauf",
        "reiseverlauf",
        "itinerary"
      );
    }
    if (t === "häfen" || t === "hafen" || t.startsWith("anlauf")) {
      add("häfen", "hafen", "ports", "ports-of-call", "kreuzfahrtverlauf");
    }
    if (t === "verlauf" || t === "itinerary" || t.includes("reiseverlauf")) {
      add(
        "itinerary",
        "verlauf",
        "kreuzfahrtverlauf",
        "reiseverlauf",
        "ports-of-call"
      );
    }
  }

  return [...set].slice(0, 24);
}

/**
 * Pull windows of OCR text around query matches so the model sees the relevant
 * passage (e.g. Kreuzfahrtverlauf / PORTS-OF-CALL), not just the document head.
 */
function extractRelevantSnippets(
  content: string | null | undefined,
  tokens: string[],
  maxChars = 3500
): string {
  if (!content?.trim()) return "";
  const text = content;
  const lower = text.toLowerCase();

  if (tokens.length === 0) {
    return text.slice(0, Math.min(2000, maxChars));
  }

  // Longer / rarer tokens are more discriminative than generic ones like "cruise"
  const tokenWeight = (t: string) => Math.min(8, t.length);

  type Hit = { pos: number; token: string; weight: number };
  const hits: Hit[] = [];
  for (const token of tokens) {
    const maxPerToken = token.length >= 8 ? 6 : 4;
    for (const idx of findTokenPositions(lower, token, maxPerToken)) {
      hits.push({ pos: idx, token, weight: tokenWeight(token) });
    }
  }

  // Prefer itinerary tables when the question is about ports/stops
  const itineraryMarkers = [
    "kreuzfahrtverlauf",
    "ports-of-call",
    "cruise itinerary",
    "reiseverlauf",
  ];
  for (const marker of itineraryMarkers) {
    let from = 0;
    let found = 0;
    while (found < 2) {
      const idx = lower.indexOf(marker, from);
      if (idx < 0) break;
      hits.push({ pos: idx, token: marker, weight: 24 });
      from = idx + marker.length;
      found += 1;
    }
  }

  if (hits.length === 0) {
    const mid = Math.max(0, Math.floor(text.length / 4));
    return text.slice(mid, mid + Math.min(2000, maxChars));
  }

  hits.sort((a, b) => a.pos - b.pos);
  const windowRadius = 750;
  type Range = {
    start: number;
    end: number;
    weight: number;
    tokens: Set<string>;
  };
  const ranges: Range[] = [];

  for (const hit of hits) {
    const start = Math.max(0, hit.pos - windowRadius);
    const end = Math.min(text.length, hit.pos + windowRadius);
    const last = ranges[ranges.length - 1];
    if (last && start <= last.end + 120) {
      last.end = Math.max(last.end, end);
      last.weight += hit.weight;
      last.tokens.add(hit.token);
    } else {
      ranges.push({
        start,
        end,
        weight: hit.weight,
        tokens: new Set([hit.token]),
      });
    }
  }

  // Prefer dense, multi-token windows (itinerary tables) over letterhead noise
  ranges.sort((a, b) => {
    const uniq = b.tokens.size - a.tokens.size;
    if (uniq !== 0) return uniq;
    return b.weight - a.weight;
  });

  const chunks: string[] = [];
  let used = 0;
  for (const range of ranges) {
    if (used >= maxChars) break;
    const slice = text.slice(range.start, range.end).trim();
    if (!slice) continue;
    const remaining = maxChars - used;
    const piece =
      slice.length > remaining ? `${slice.slice(0, remaining)}…` : slice;
    const prefix = range.start > 0 ? "…" : "";
    chunks.push(`${prefix}${piece}`);
    used += piece.length;
  }

  return chunks.join("\n\n---\n\n");
}

type DocRow = {
  id: number;
  paperless_id: number;
  title: string | null;
  content: string | null;
  correspondent_name: string | null;
  created_date: string | null;
  category: string | null;
  short_summary: string | null;
  detailed_summary: string | null;
  important_points: string | null;
  amounts: string | null;
  deadlines: string | null;
  warranty_info: string | null;
  analysis_status: string | null;
};

function buildSearchBlob(row: DocRow): string {
  return [
    row.title,
    row.correspondent_name,
    row.category,
    row.short_summary,
    row.detailed_summary,
    row.important_points,
    row.amounts,
    row.deadlines,
    row.warranty_info,
    row.content || "",
  ]
    .filter(Boolean)
    .join("\n")
    .toLowerCase();
}

function enrichExcerpt(row: DocRow, tokens: string[] = []): string {
  const db = getDb();
  const parts: string[] = [];
  const OCR_BUDGET = 3500;
  const META_BUDGET = 3200;

  if (row.short_summary) parts.push(`Kurzfassung: ${row.short_summary}`);
  if (row.detailed_summary) {
    parts.push(`Details: ${row.detailed_summary.slice(0, 800)}`);
  }
  if (row.category) parts.push(`Kategorie: ${row.category}`);

  const travel = db
    .prepare(
      `SELECT travel_type, title, provider, start_date, end_date, origin, destination, extracted_data
       FROM travel_items WHERE document_id = ?`
    )
    .all(row.id) as Array<Record<string, unknown>>;
  for (const t of travel) {
    parts.push(
      `Reise: ${t.travel_type || "?"} · ${t.title || "?"} · ${t.provider || "?"} · ${toSwissDate(String(t.start_date || ""))}–${toSwissDate(String(t.end_date || ""))} · ${t.origin || ""}→${t.destination || ""}`
    );
  }

  // Put ports early so they are not truncated by META_BUDGET
  const itinerary = resolveItinerary({
    travelItems: travel,
    ocrContent: row.content,
  });
  if (itinerary.length > 0) {
    parts.push(
      "Reiseverlauf / Ports of Call:",
      ...itinerary.map((s) => {
        const when = s.date ? toSwissDate(s.date) : s.day_label || "?";
        const times = [
          s.arrive ? `Ankunft ${s.arrive}` : null,
          s.depart ? `Abfahrt ${s.depart}` : null,
        ]
          .filter(Boolean)
          .join(", ");
        return `- ${when}: ${s.location}${times ? ` (${times})` : ""}${s.note ? ` · ${s.note}` : ""}`;
      })
    );
  }

  if (row.important_points) {
    parts.push(`Wichtige Punkte: ${row.important_points.slice(0, 500)}`);
  }
  if (row.amounts) parts.push(`Beträge JSON: ${row.amounts.slice(0, 400)}`);
  if (row.deadlines) parts.push(`Fristen JSON: ${row.deadlines.slice(0, 400)}`);
  if (row.warranty_info) {
    parts.push(`Garantie JSON: ${row.warranty_info.slice(0, 400)}`);
  }

  const warranties = db
    .prepare(
      `SELECT product_name, vendor, warranty_until, purchase_date, price, currency
       FROM devices_and_warranties WHERE document_id = ?`
    )
    .all(row.id) as Array<Record<string, unknown>>;
  for (const w of warranties.slice(0, 5)) {
    parts.push(
      `Gerät/Garantie: ${w.product_name || "?"} · ${w.vendor || "?"} · bis ${toSwissDate(String(w.warranty_until || ""))} · ${w.price ?? "?"} ${w.currency || ""}`
    );
  }

  const deadlines = db
    .prepare(
      `SELECT title, deadline_date, deadline_type, description
       FROM deadlines WHERE document_id = ?`
    )
    .all(row.id) as Array<Record<string, unknown>>;
  for (const d of deadlines.slice(0, 5)) {
    parts.push(
      `Frist: ${d.title} · ${toSwissDate(String(d.deadline_date || ""))} · Typ ${d.deadline_type || "?"} · ${d.description || ""}`
    );
  }

  const finances = db
    .prepare(
      `SELECT vendor, amount, currency, invoice_date, category, description
       FROM financial_items WHERE document_id = ? LIMIT 6`
    )
    .all(row.id) as Array<Record<string, unknown>>;
  for (const f of finances) {
    parts.push(
      `Finanzen: ${f.vendor || "?"} · ${f.amount ?? "?"} ${f.currency || "CHF"} · ${toSwissDate(String(f.invoice_date || ""))} · ${f.category || f.description || ""}`
    );
  }

  const meta = parts.join("\n").slice(0, META_BUDGET);

  // Always reserve room for OCR passages – summaries often omit tables/itineraries.
  const ocrSnippets = extractRelevantSnippets(row.content, tokens, OCR_BUDGET);
  const ocrBlock = ocrSnippets
    ? `OCR-Auszug (passend zur Frage):\n${ocrSnippets}`
    : "";

  return [meta, ocrBlock].filter(Boolean).join("\n\n").slice(0, META_BUDGET + OCR_BUDGET + 80);
}

function getCorpusStats(): CorpusStats {
  const db = getDb();
  return {
    totalDocuments: (
      db.prepare(`SELECT COUNT(*) as c FROM paperless_documents`).get() as {
        c: number;
      }
    ).c,
    analyzedDocuments: (
      db
        .prepare(
          `SELECT COUNT(*) as c FROM document_summaries WHERE analysis_status = 'completed'`
        )
        .get() as { c: number }
    ).c,
    warranties: (
      db.prepare(`SELECT COUNT(*) as c FROM devices_and_warranties`).get() as {
        c: number;
      }
    ).c,
    deadlines: (
      db.prepare(`SELECT COUNT(*) as c FROM deadlines`).get() as { c: number }
    ).c,
    financialItems: (
      db.prepare(`SELECT COUNT(*) as c FROM financial_items`).get() as {
        c: number;
      }
    ).c,
    travelItems: (
      db.prepare(`SELECT COUNT(*) as c FROM travel_items`).get() as { c: number }
    ).c,
  };
}

function scoreFactBlob(blob: string, tokens: string[]): number {
  if (tokens.length === 0) return 1;
  const { score, hits } = scoreText(blob, tokens);
  return hits > 0 ? score : 0;
}

function collectFactsAcrossCorpus(
  tokens: string[],
  yearHints: string[] = [],
  preferUpcoming = false
): StructuredFact[] {
  const db = getDb();
  const facts: StructuredFact[] = [];

  const warranties = db
    .prepare(
      `SELECT w.product_name, w.manufacturer, w.vendor, w.warranty_until, w.purchase_date,
              w.price, w.currency, w.serial_number,
              d.id as document_id, d.title as document_title
       FROM devices_and_warranties w
       JOIN paperless_documents d ON d.id = w.document_id`
    )
    .all() as Array<Record<string, unknown>>;

  for (const w of warranties) {
    const blob = [
      w.product_name,
      w.manufacturer,
      w.vendor,
      w.serial_number,
      w.document_title,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    const score = tokens.length === 0 ? 1 : scoreFactBlob(blob, tokens);
    if (tokens.length > 0 && score <= 0) continue;
    facts.push({
      kind: "warranty",
      label: String(w.product_name || "Gerät"),
      details: `Händler ${w.vendor || "–"}, Hersteller ${w.manufacturer || "–"}, Kauf ${toSwissDate(String(w.purchase_date || ""))}, Garantie bis ${toSwissDate(String(w.warranty_until || ""))}, Preis ${w.price ?? "–"} ${w.currency || ""}, SN ${w.serial_number || "–"}`,
      documentId: Number(w.document_id),
      documentTitle: (w.document_title as string) || null,
      score: score || 1,
    });
  }

  const deadlines = db
    .prepare(
      `SELECT dl.title, dl.deadline_date, dl.deadline_type, dl.description, dl.status,
              d.id as document_id, d.title as document_title
       FROM deadlines dl
       JOIN paperless_documents d ON d.id = dl.document_id`
    )
    .all() as Array<Record<string, unknown>>;

  for (const d of deadlines) {
    const blob = [
      d.title,
      d.deadline_type,
      d.description,
      d.document_title,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    const score = tokens.length === 0 ? 1 : scoreFactBlob(blob, tokens);
    if (tokens.length > 0 && score <= 0) continue;
    facts.push({
      kind: "deadline",
      label: String(d.title || "Frist"),
      details: `Datum ${toSwissDate(String(d.deadline_date || ""))}, Typ ${d.deadline_type || "–"}, Status ${d.status || "–"}, ${d.description || ""}`,
      documentId: Number(d.document_id),
      documentTitle: (d.document_title as string) || null,
      score: score || 1,
    });
  }

  const finances = db
    .prepare(
      `SELECT f.vendor, f.amount, f.currency, f.invoice_date, f.due_date, f.category, f.description,
              d.id as document_id, d.title as document_title
       FROM financial_items f
       JOIN paperless_documents d ON d.id = f.document_id`
    )
    .all() as Array<Record<string, unknown>>;

  for (const f of finances) {
    const blob = [
      f.vendor,
      f.category,
      f.description,
      f.document_title,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    const score = tokens.length === 0 ? 1 : scoreFactBlob(blob, tokens);
    if (tokens.length > 0 && score <= 0) continue;
    facts.push({
      kind: "finance",
      label: String(f.vendor || f.category || "Betrag"),
      details: `${f.amount ?? "–"} ${f.currency || "CHF"} · Rechnungsdatum ${toSwissDate(String(f.invoice_date || ""))} · Fällig ${toSwissDate(String(f.due_date || ""))} · ${f.category || ""} ${f.description || ""}`,
      documentId: Number(f.document_id),
      documentTitle: (f.document_title as string) || null,
      score: score || 1,
    });
  }

  const travel = db
    .prepare(
      `SELECT t.travel_type, t.title, t.provider, t.start_date, t.end_date, t.origin, t.destination, t.booking_reference, t.extracted_data,
              d.id as document_id, d.title as document_title, d.content as document_content,
              s.short_summary, s.detailed_summary
       FROM travel_items t
       JOIN paperless_documents d ON d.id = t.document_id
       LEFT JOIN document_summaries s ON s.document_id = d.id`
    )
    .all() as Array<Record<string, unknown>>;

  for (const t of travel) {
    const blob = [
      t.travel_type,
      t.title,
      t.provider,
      t.origin,
      t.destination,
      t.booking_reference,
      t.document_title,
      t.short_summary,
      t.detailed_summary,
      t.extracted_data,
      // Ship names often appear only in OCR (e.g. LEGEND OF THE SEAS)
      String(t.document_content || "").slice(0, 12000),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    const score = tokens.length === 0 ? 1 : scoreFactBlob(blob, tokens);
    if (tokens.length > 0 && score <= 0) continue;

    let boosted = score || 1;
    const startYear = String(t.start_date || "").slice(0, 4);
    if (yearHints.length > 0) {
      if (yearHints.includes(startYear)) boosted += 25;
      else if (startYear) boosted -= 8;
    }
    if (preferUpcoming) {
      const today = new Date().toISOString().slice(0, 10);
      const start = String(t.start_date || "").slice(0, 10);
      if (start && start >= today) boosted += 20;
      else if (start && start < today) boosted -= 12;
    }

    const itinerary = resolveItinerary({
      travelItems: [{ extracted_data: t.extracted_data }],
      ocrContent: String(t.document_content || ""),
    });
    const itineraryLine =
      itinerary.length > 0
        ? ` · Häfen: ${itinerary
            .filter((s) => !/cruising/i.test(s.location))
            .map((s) => s.location)
            .slice(0, 12)
            .join(" → ")}`
        : "";

    facts.push({
      kind: "travel",
      label: String(t.title || t.travel_type || "Reise"),
      details: `${t.provider || "–"} · ${toSwissDate(String(t.start_date || ""))}–${toSwissDate(String(t.end_date || ""))} · ${t.origin || ""}→${t.destination || ""} · Ref ${t.booking_reference || "–"}${itineraryLine}`,
      documentId: Number(t.document_id),
      documentTitle: (t.document_title as string) || null,
      score: boosted,
    });
  }

  facts.sort((a, b) => b.score - a.score);
  return facts.slice(0, 40);
}

/**
 * Search the ENTIRE local document base (all synced docs + analyses + extractions).
 * Categories are not filters – only relevance scoring decides what is returned.
 */
export function retrieveForChat(query: string, limit = 12): ChatRetrieval {
  const db = getDb();
  const yearHints = relativeYearHints(query);
  const tokens = expandTokens([
    ...tokenize(query),
    ...yearHints.years,
  ]);
  const phrases = extractPhrases(query);
  const corpus = getCorpusStats();

  // Full corpus of documents with optional analysis – not limited by category.
  const allDocs = db
    .prepare(
      `SELECT d.id, d.paperless_id, d.title, d.content, d.correspondent_name, d.created_date,
              s.category, s.short_summary, s.detailed_summary, s.important_points, s.amounts,
              s.deadlines, s.warranty_info, s.analysis_status
       FROM paperless_documents d
       LEFT JOIN document_summaries s ON s.document_id = d.id`
    )
    .all() as DocRow[];

  const scoredDocs = allDocs
    .map((row) => {
      const blob = buildSearchBlob(row);
      let score = 0;
      let hits = 0;

      if (tokens.length === 0) {
        // No searchable tokens: prefer analyzed docs as general context
        score = row.analysis_status === "completed" ? 2 : 0.5;
        hits = 1;
      } else {
        const titleScore = scoreText((row.title || "").toLowerCase(), tokens);
        const summaryScore = scoreText(
          `${row.short_summary || ""} ${row.detailed_summary || ""}`.toLowerCase(),
          tokens
        );
        const metaScore = scoreText(
          `${row.correspondent_name || ""} ${row.category || ""}`.toLowerCase(),
          tokens
        );
        // Full OCR – itineraries/tables often sit past letterheads (8k+)
        const contentLower = (row.content || "").toLowerCase();
        const contentScore = scoreText(contentLower, tokens);
        const analysisScore = scoreText(
          `${row.important_points || ""} ${row.amounts || ""} ${row.deadlines || ""} ${row.warranty_info || ""}`.toLowerCase(),
          tokens
        );
        const phrasesMatched = phraseHits(blob, phrases);

        score =
          titleScore.score * 4 +
          summaryScore.score * 3 +
          metaScore.score * 3 +
          analysisScore.score * 3 +
          contentScore.score * 2 +
          phrasesMatched * 40;
        hits =
          titleScore.hits +
          summaryScore.hits +
          metaScore.hits +
          analysisScore.hits +
          contentScore.hits +
          phrasesMatched;

        if (row.analysis_status === "completed") score += 1;
        // Require at least one real token hit somewhere in the full base
        if (hits === 0) score = 0;
      }

      return { row, score, hits, blob };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(limit, 8));

  let facts = collectFactsAcrossCorpus(
    tokens,
    yearHints.years,
    yearHints.preferUpcoming
  );

  // If the question names a specific multi-word entity, keep facts from those docs first
  if (phrases.length > 0) {
    const phraseDocIds = new Set(
      scoredDocs
        .filter((d) => phraseHits(d.blob, phrases) > 0)
        .map((d) => d.row.id)
    );
    if (phraseDocIds.size > 0) {
      const preferred = facts.filter(
        (f) => f.documentId && phraseDocIds.has(f.documentId)
      );
      const rest = facts.filter(
        (f) => !f.documentId || !phraseDocIds.has(f.documentId)
      );
      facts = [...preferred, ...rest];
    }
  }
  facts = facts.slice(0, 40);

  // Ensure documents linked from top facts are present in sources
  const sourceIds = new Set(scoredDocs.map((d) => d.row.id));
  for (const fact of facts.slice(0, 15)) {
    if (!fact.documentId || sourceIds.has(fact.documentId)) continue;
    const row = allDocs.find((d) => d.id === fact.documentId);
    if (!row) continue;
    scoredDocs.push({ row, score: fact.score, hits: 1, blob: buildSearchBlob(row) });
    sourceIds.add(fact.documentId);
  }

  scoredDocs.sort((a, b) => b.score - a.score);

  const sources: ChatSource[] = scoredDocs.slice(0, limit).map(({ row, score }) => ({
    id: row.id,
    paperlessId: row.paperless_id,
    title: row.title,
    category: row.category,
    shortSummary: row.short_summary,
    correspondent: row.correspondent_name,
    createdDate: row.created_date,
    excerpt: enrichExcerpt(row, tokens),
    score,
  }));

  return { sources, facts, corpus };
}

/** @deprecated */
export function retrieveDocumentsForChat(query: string, limit = 6): ChatSource[] {
  return retrieveForChat(query, limit).sources;
}
