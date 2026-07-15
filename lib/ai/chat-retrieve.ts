import { getDb } from "@/lib/db/client";
import { toSwissDate } from "@/lib/utils/dates";

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

function scoreText(haystack: string, tokens: string[]): { score: number; hits: number } {
  const text = haystack.toLowerCase();
  let score = 0;
  let hits = 0;
  for (const token of tokens) {
    if (!text.includes(token)) continue;
    hits += 1;
    // denser matches score higher
    const occurrences = text.split(token).length - 1;
    score += 2 + Math.min(3, occurrences);
  }
  return { score, hits };
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
    (row.content || "").slice(0, 8000),
  ]
    .filter(Boolean)
    .join("\n")
    .toLowerCase();
}

function enrichExcerpt(row: DocRow): string {
  const db = getDb();
  const parts: string[] = [];

  if (row.short_summary) parts.push(`Kurzfassung: ${row.short_summary}`);
  if (row.detailed_summary) {
    parts.push(`Details: ${row.detailed_summary.slice(0, 1000)}`);
  }
  if (row.category) parts.push(`Kategorie: ${row.category}`);
  if (row.important_points) {
    parts.push(`Wichtige Punkte: ${row.important_points.slice(0, 600)}`);
  }
  if (row.amounts) parts.push(`Beträge JSON: ${row.amounts.slice(0, 500)}`);
  if (row.deadlines) parts.push(`Fristen JSON: ${row.deadlines.slice(0, 500)}`);
  if (row.warranty_info) {
    parts.push(`Garantie JSON: ${row.warranty_info.slice(0, 500)}`);
  }

  const warranties = db
    .prepare(
      `SELECT product_name, vendor, warranty_until, purchase_date, price, currency
       FROM devices_and_warranties WHERE document_id = ?`
    )
    .all(row.id) as Array<Record<string, unknown>>;
  for (const w of warranties) {
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
  for (const d of deadlines) {
    parts.push(
      `Frist: ${d.title} · ${toSwissDate(String(d.deadline_date || ""))} · Typ ${d.deadline_type || "?"} · ${d.description || ""}`
    );
  }

  const finances = db
    .prepare(
      `SELECT vendor, amount, currency, invoice_date, category, description
       FROM financial_items WHERE document_id = ? LIMIT 10`
    )
    .all(row.id) as Array<Record<string, unknown>>;
  for (const f of finances) {
    parts.push(
      `Finanzen: ${f.vendor || "?"} · ${f.amount ?? "?"} ${f.currency || "CHF"} · ${toSwissDate(String(f.invoice_date || ""))} · ${f.category || f.description || ""}`
    );
  }

  const travel = db
    .prepare(
      `SELECT travel_type, title, provider, start_date, end_date, origin, destination
       FROM travel_items WHERE document_id = ?`
    )
    .all(row.id) as Array<Record<string, unknown>>;
  for (const t of travel) {
    parts.push(
      `Reise: ${t.travel_type || "?"} · ${t.title || "?"} · ${t.provider || "?"} · ${toSwissDate(String(t.start_date || ""))}–${toSwissDate(String(t.end_date || ""))} · ${t.origin || ""}→${t.destination || ""}`
    );
  }

  if (parts.length === 0 && row.content) {
    parts.push(row.content.slice(0, 1500));
  }

  return parts.join("\n").slice(0, 4000);
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

function collectFactsAcrossCorpus(tokens: string[]): StructuredFact[] {
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
      "garantie",
      "gerät",
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
      "frist",
      "kündigung",
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
      "rechnung",
      "ausgabe",
      "betrag",
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
      `SELECT t.travel_type, t.title, t.provider, t.start_date, t.end_date, t.origin, t.destination, t.booking_reference,
              d.id as document_id, d.title as document_title
       FROM travel_items t
       JOIN paperless_documents d ON d.id = t.document_id`
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
      "reise",
      "flug",
      "hotel",
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    const score = tokens.length === 0 ? 1 : scoreFactBlob(blob, tokens);
    if (tokens.length > 0 && score <= 0) continue;
    facts.push({
      kind: "travel",
      label: String(t.title || t.travel_type || "Reise"),
      details: `${t.provider || "–"} · ${toSwissDate(String(t.start_date || ""))}–${toSwissDate(String(t.end_date || ""))} · ${t.origin || ""}→${t.destination || ""} · Ref ${t.booking_reference || "–"}`,
      documentId: Number(t.document_id),
      documentTitle: (t.document_title as string) || null,
      score: score || 1,
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
  const tokens = tokenize(query);
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
        const contentScore = scoreText(
          (row.content || "").slice(0, 8000).toLowerCase(),
          tokens
        );
        const analysisScore = scoreText(
          `${row.important_points || ""} ${row.amounts || ""} ${row.deadlines || ""} ${row.warranty_info || ""}`.toLowerCase(),
          tokens
        );

        score =
          titleScore.score * 4 +
          summaryScore.score * 3 +
          metaScore.score * 3 +
          analysisScore.score * 3 +
          contentScore.score * 1;
        hits =
          titleScore.hits +
          summaryScore.hits +
          metaScore.hits +
          analysisScore.hits +
          contentScore.hits;

        if (row.analysis_status === "completed") score += 1;
        // Require at least one real token hit somewhere in the full base
        if (hits === 0) score = 0;
      }

      return { row, score, hits, blob };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  const facts = collectFactsAcrossCorpus(tokens);

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
    excerpt: enrichExcerpt(row),
    score,
  }));

  return { sources, facts, corpus };
}

/** @deprecated */
export function retrieveDocumentsForChat(query: string, limit = 6): ChatSource[] {
  return retrieveForChat(query, limit).sources;
}
