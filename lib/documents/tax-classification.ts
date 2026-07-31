import { getDb } from "@/lib/db/client";
import { nowIso } from "@/lib/utils/dates";
import { KNOWLEDGE_AREAS } from "@/lib/extraction/categories";
import { looksLikeBankDocument } from "@/lib/extraction/bank";

export type TaxDocKind = "bank" | "normal" | "auto";

const KNOWN_CATEGORIES = new Set(KNOWLEDGE_AREAS.map((a) => a.name));

/**
 * Effective bank flag: manual override wins; else heuristic on title/summary.
 */
export function resolveIsBankDocument(input: {
  isBankDocument: number | null | undefined;
  title?: string | null;
  shortSummary?: string | null;
  detailedSummary?: string | null;
}): boolean {
  if (input.isBankDocument === 1) return true;
  if (input.isBankDocument === 0) return false;
  const text = [input.title, input.shortSummary, input.detailedSummary]
    .filter(Boolean)
    .join("\n");
  return looksLikeBankDocument(text);
}

export function updateDocumentTaxClassification(input: {
  documentId: number;
  /** Move into / keep under Steuern (or other knowledge area). */
  category?: string;
  taxKind?: TaxDocKind;
  bankName?: string | null;
  accountNumber?: string | null;
  taxYear?: number | null;
}): { ok: boolean; error?: string } {
  const db = getDb();
  const existing = db
    .prepare(
      `SELECT s.id, s.category, s.short_summary, s.is_bank_document,
              s.bank_name, s.account_number, s.tax_year, d.title
       FROM document_summaries s
       JOIN paperless_documents d ON d.id = s.document_id
       WHERE s.document_id = ?`
    )
    .get(input.documentId) as
    | {
        id: number;
        category: string | null;
        short_summary: string | null;
        is_bank_document: number | null;
        bank_name: string | null;
        account_number: string | null;
        tax_year: number | null;
        title: string | null;
      }
    | undefined;

  if (!existing) {
    return { ok: false, error: "Keine Analyse für dieses Dokument." };
  }

  let category = existing.category;
  if (input.category !== undefined) {
    const next = input.category.trim();
    if (!KNOWN_CATEGORIES.has(next as (typeof KNOWLEDGE_AREAS)[number]["name"])) {
      return { ok: false, error: "Ungültige Wissensrubrik." };
    }
    category = next;
  }

  let isBank = existing.is_bank_document;
  if (input.taxKind === "bank") {
    isBank = 1;
    if (!category || category === "Sonstiges" || category === "Finanzen") {
      category = "Steuern";
    }
    if (category !== "Steuern") {
      category = "Steuern";
    }
  } else if (input.taxKind === "normal") {
    isBank = 0;
    if (category !== "Steuern") category = "Steuern";
  } else if (input.taxKind === "auto") {
    isBank = null;
  }

  let shortSummary = existing.short_summary?.trim() || "";
  const bankName =
    input.bankName !== undefined
      ? input.bankName?.trim() || null
      : existing.bank_name;
  const accountNumber =
    input.accountNumber !== undefined
      ? input.accountNumber?.trim() || null
      : existing.account_number;

  if (
    isBank === 1 &&
    accountNumber &&
    shortSummary &&
    !shortSummary.includes(accountNumber)
  ) {
    shortSummary = `${shortSummary.replace(/\.\s*$/, "")} (${accountNumber}).`;
  }

  const taxYear =
    input.taxYear !== undefined ? input.taxYear : existing.tax_year;

  db.prepare(
    `UPDATE document_summaries
     SET category = ?,
         tax_year = ?,
         is_bank_document = ?,
         bank_name = ?,
         account_number = ?,
         short_summary = ?,
         updated_at = ?
     WHERE document_id = ?`
  ).run(
    category,
    taxYear,
    isBank,
    bankName,
    accountNumber,
    shortSummary || existing.short_summary,
    nowIso(),
    input.documentId
  );

  return { ok: true };
}
