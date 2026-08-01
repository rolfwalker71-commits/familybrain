import { getDb } from "@/lib/db/client";
import { nowIso } from "@/lib/utils/dates";
import { isKnownKnowledgeArea } from "@/lib/knowledge/areas";
import { looksLikeAccountStatement } from "@/lib/extraction/bank";

export type TaxDocKind = "bank" | "normal" | "auto";

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
  return looksLikeAccountStatement(text);
}

export function updateDocumentTaxClassification(input: {
  documentId: number;
  /** Move into / keep under Steuern (or other knowledge area). */
  category?: string;
  taxKind?: TaxDocKind;
  bankName?: string | null;
  accountNumber?: string | null;
  taxYear?: number | null;
}): { ok: boolean; error?: string; category?: string | null } {
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
    if (!isKnownKnowledgeArea(next)) {
      return { ok: false, error: "Ungültige Wissensrubrik." };
    }
    category = next;
  }

  let isBank = existing.is_bank_document;
  if (input.taxKind === "bank") {
    isBank = 1;
    category = "Steuern";
  } else if (input.taxKind === "normal") {
    isBank = 0;
    if (category !== "Steuern") category = "Steuern";
  } else if (input.taxKind === "auto") {
    isBank = null;
  }

  // Leaving Steuern: drop bank flag so the doc does not stay marked as Bankbeleg.
  if (category && category !== "Steuern") {
    isBank = 0;
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

  if (isBank === 1 && accountNumber && shortSummary) {
    const compact = accountNumber.replace(/[\s._\-]/g, "");
    const already =
      shortSummary.includes(accountNumber) ||
      (compact.length >= 4 &&
        shortSummary.replace(/[\s._\-]/g, "").includes(compact));
    if (!already) {
      shortSummary = `${shortSummary.replace(/\.\s*$/, "")} (${accountNumber}).`;
    }
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

  const prevWasSteuern = existing.category === "Steuern";
  const nowSteuern = category === "Steuern";
  if (prevWasSteuern !== nowSteuern) {
    queueTaxRelevantUdfWriteback(input.documentId, nowSteuern);
  }

  return { ok: true, category };
}

/**
 * Fire-and-forget Paperless UDF sync after local Steuern category changes.
 */
export function queueTaxRelevantUdfWriteback(
  documentId: number,
  taxRelevant: boolean
): void {
  void import("@/lib/paperless/writeback")
    .then(({ writebackStatusFlagsToPaperless }) =>
      writebackStatusFlagsToPaperless({
        localDocumentId: documentId,
        taxRelevant,
        applyLocalTaxCategory: false,
      })
    )
    .catch(() => {
      /* optional */
    });
}
