import { getDb } from "@/lib/db/client";
import type { DocumentAnalysis } from "@/lib/ai/schemas";
import { applyTriageAfterAnalysis } from "@/lib/documents/triage";

function parseJsonArray<T>(raw: unknown): T[] {
  if (raw == null) return [];
  if (Array.isArray(raw)) return raw as T[];
  if (typeof raw !== "string" || !raw.trim()) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

function parseJsonObject<T>(raw: unknown): T | null {
  if (raw == null) return null;
  if (typeof raw === "object" && !Array.isArray(raw)) return raw as T;
  if (typeof raw !== "string" || !raw.trim()) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as T;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Rebuild a minimal DocumentAnalysis from persisted summary + related rows
 * so triage reasons can be detected without re-running the LLM.
 */
export function buildAnalysisSnapshotForTriage(
  documentId: number
): DocumentAnalysis | null {
  const db = getDb();
  const summary = db
    .prepare(
      `SELECT category, amounts, deadlines, warranty_info, analysis_status
       FROM document_summaries WHERE document_id = ?`
    )
    .get(documentId) as
    | {
        category: string | null;
        amounts: string | null;
        deadlines: string | null;
        warranty_info: string | null;
        analysis_status: string | null;
      }
    | undefined;

  if (!summary || summary.analysis_status !== "completed") return null;

  const financialItems = db
    .prepare(
      `SELECT vendor, amount, currency, invoice_date, due_date, category,
              is_recurring, description
       FROM financial_items WHERE document_id = ? ORDER BY id`
    )
    .all(documentId) as Array<{
    vendor: string | null;
    amount: number | null;
    currency: string | null;
    invoice_date: string | null;
    due_date: string | null;
    category: string | null;
    is_recurring: number | null;
    description: string | null;
  }>;

  const travelItems = db
    .prepare(
      `SELECT travel_type, provider, title, start_date, end_date, origin,
              destination, booking_reference, price, currency
       FROM travel_items WHERE document_id = ? ORDER BY id`
    )
    .all(documentId) as Array<{
    travel_type: string | null;
    provider: string | null;
    title: string | null;
    start_date: string | null;
    end_date: string | null;
    origin: string | null;
    destination: string | null;
    booking_reference: string | null;
    price: number | null;
    currency: string | null;
  }>;

  const warrantyFromDevices = db
    .prepare(
      `SELECT product_name, vendor, warranty_until, serial_number
       FROM devices_and_warranties WHERE document_id = ?
       ORDER BY id ASC LIMIT 1`
    )
    .get(documentId) as
    | {
        product_name: string | null;
        vendor: string | null;
        warranty_until: string | null;
        serial_number: string | null;
      }
    | undefined;

  const warrantyInfo =
    parseJsonObject<DocumentAnalysis["warranty_info"]>(summary.warranty_info) ||
    (warrantyFromDevices
      ? {
          has_warranty: true,
          product_name: warrantyFromDevices.product_name,
          vendor: warrantyFromDevices.vendor,
          purchase_date: null,
          warranty_until: warrantyFromDevices.warranty_until,
          serial_number: warrantyFromDevices.serial_number,
        }
      : null);

  const deadlinesFromSummary = parseJsonArray<DocumentAnalysis["deadlines"][number]>(
    summary.deadlines
  );
  const deadlinesFromTable = db
    .prepare(
      `SELECT title, deadline_date, deadline_type, description
       FROM deadlines WHERE document_id = ? ORDER BY id`
    )
    .all(documentId) as Array<{
    title: string | null;
    deadline_date: string | null;
    deadline_type: string | null;
    description: string | null;
  }>;

  const deadlines =
    deadlinesFromSummary.length > 0
      ? deadlinesFromSummary
      : deadlinesFromTable.map((d) => ({
          title: d.title || "Frist",
          date: d.deadline_date,
          type: d.deadline_type,
          description: d.description,
        }));

  return {
    category: summary.category || "Sonstiges",
    also_categories: [],
    short_summary: null,
    detailed_summary: null,
    important_points: [],
    important_dates: [],
    amounts: parseJsonArray(summary.amounts),
    deadlines,
    contract_parties: [],
    warranty_info: warrantyInfo,
    cancellation_terms: null,
    possible_todos: [],
    financial_items: financialItems.map((f) => ({
      vendor: f.vendor,
      amount: f.amount,
      currency: f.currency,
      invoice_date: f.invoice_date,
      due_date: f.due_date,
      category: f.category,
      is_recurring: f.is_recurring == null ? null : Boolean(f.is_recurring),
      description: f.description,
    })),
    line_items: [],
    travel_items: travelItems.map((t) => ({
      travel_type: t.travel_type,
      provider: t.provider,
      title: t.title,
      start_date: t.start_date,
      end_date: t.end_date,
      origin: t.origin,
      destination: t.destination,
      booking_reference: t.booking_reference,
      price: t.price,
      currency: t.currency,
      itinerary: [],
    })),
    confidence: null,
  };
}

/**
 * Apply triage to analyzed documents that still have no triage_status
 * (e.g. analyzed during an old mass-pause that disabled enqueue).
 */
export function backfillTriageForAnalyzedDocuments(options?: {
  limit?: number;
}): {
  scanned: number;
  queued: number;
  skipped: number;
  pay: number;
} {
  const limit = Math.min(Math.max(options?.limit ?? 200, 1), 2000);
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT d.id
       FROM paperless_documents d
       INNER JOIN document_summaries s ON s.document_id = d.id
       WHERE s.analysis_status = 'completed'
         AND COALESCE(d.sync_status, 'synced') != 'missing'
         AND (d.triage_status IS NULL OR TRIM(d.triage_status) = '')
       ORDER BY COALESCE(s.analyzed_at, d.updated_at) DESC
       LIMIT ?`
    )
    .all(limit) as Array<{ id: number }>;

  let queued = 0;
  let skipped = 0;
  let pay = 0;

  for (const row of rows) {
    const analysis = buildAnalysisSnapshotForTriage(row.id);
    if (!analysis) continue;
    const result = applyTriageAfterAnalysis(row.id, analysis);
    if (result.queued) {
      queued += 1;
      continue;
    }
    const status = (
      db
        .prepare(`SELECT triage_status FROM paperless_documents WHERE id = ?`)
        .get(row.id) as { triage_status: string | null } | undefined
    )?.triage_status;
    if (status === "pay") pay += 1;
    else if (status === "skipped") skipped += 1;
  }

  return { scanned: rows.length, queued, skipped, pay };
}
