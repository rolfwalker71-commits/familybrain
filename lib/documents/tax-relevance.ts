import { getDb } from "@/lib/db/client";
import { nowIso } from "@/lib/utils/dates";

/**
 * Mirror «Steuer relevant» into Buddy's Steuern knowledge category.
 * - true  → category Steuern (keep/set tax_year when provided)
 * - false → leave Steuern → Sonstiges, clear tax_year + bank flag
 */
export function applyTaxRelevantLocal(input: {
  documentId: number;
  taxRelevant: boolean;
  taxYear?: number | null;
}): { ok: boolean; error?: string; category: string | null } {
  const db = getDb();
  const summary = db
    .prepare(
      `SELECT id, category, tax_year, is_bank_document
       FROM document_summaries WHERE document_id = ?`
    )
    .get(input.documentId) as
    | {
        id: number;
        category: string | null;
        tax_year: number | null;
        is_bank_document: number | null;
      }
    | undefined;

  if (!summary) {
    return {
      ok: false,
      error: "Keine Analyse für dieses Dokument.",
      category: null,
    };
  }

  const ts = nowIso();

  if (input.taxRelevant) {
    const taxYear =
      input.taxYear !== undefined ? input.taxYear : summary.tax_year;
    db.prepare(
      `UPDATE document_summaries
       SET category = 'Steuern', tax_year = ?, updated_at = ?
       WHERE id = ?`
    ).run(taxYear, ts, summary.id);
    return { ok: true, category: "Steuern" };
  }

  let nextCategory = summary.category;
  if (summary.category === "Steuern") {
    nextCategory = "Sonstiges";
  }
  db.prepare(
    `UPDATE document_summaries
     SET category = ?,
         tax_year = NULL,
         also_categories = NULL,
         is_bank_document = 0,
         updated_at = ?
     WHERE id = ?`
  ).run(nextCategory, ts, summary.id);

  return { ok: true, category: nextCategory };
}

export function isDocumentInSteuernCategory(documentId: number): boolean {
  const row = getDb()
    .prepare(
      `SELECT category FROM document_summaries
       WHERE document_id = ? AND analysis_status = 'completed'`
    )
    .get(documentId) as { category: string | null } | undefined;
  return row?.category === "Steuern";
}
