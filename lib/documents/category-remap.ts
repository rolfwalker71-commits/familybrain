import { getDb } from "@/lib/db/client";
import { getSetting, setSetting } from "@/lib/db/migrations";
import { nowIso } from "@/lib/utils/dates";
import {
  looksLikeBankDocument,
  looksLikeCreditCardStatement,
} from "@/lib/extraction/bank";
import { looksLikeComputerDocument } from "@/lib/extraction/computer";
import { queueTaxRelevantUdfWriteback } from "@/lib/documents/tax-classification";

const REMAP_DONE_KEY = "knowledge_category_remap_v3_done";

function docText(row: {
  title: string | null;
  short_summary: string | null;
  detailed_summary: string | null;
  content: string | null;
}): string {
  return [
    row.title,
    row.short_summary,
    row.detailed_summary,
    (row.content || "").slice(0, 4000),
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * Remap without AI re-analysis:
 * - Kreditkartenabrechnungen → Kreditkarten (auch wenn bisher Steuern)
 * - Computer/Software/Lizenzen → Computer (aus Sonstiges / Geräte / Finanzen)
 */
export function remapKnowledgeCategoriesHeuristic(): {
  creditCards: number;
  computer: number;
} {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT s.id as summary_id, s.document_id, s.category,
              s.short_summary, s.detailed_summary, d.title, d.content
       FROM document_summaries s
       JOIN paperless_documents d ON d.id = s.document_id
       WHERE s.analysis_status = 'completed'`
    )
    .all() as Array<{
    summary_id: number;
    document_id: number;
    category: string | null;
    short_summary: string | null;
    detailed_summary: string | null;
    title: string | null;
    content: string | null;
  }>;

  const updateCat = db.prepare(
    `UPDATE document_summaries
     SET category = ?, updated_at = ?
     WHERE id = ?`
  );
  const afterLeaveSteuern = db.prepare(
    `UPDATE document_summaries
     SET tax_year = NULL, is_bank_document = 0, updated_at = ?
     WHERE id = ? AND category != 'Steuern'`
  );
  const markCard = db.prepare(
    `UPDATE document_summaries
     SET is_bank_document = 1, tax_year = NULL, updated_at = ?
     WHERE id = ?`
  );

  let creditCards = 0;
  let computer = 0;
  const leftSteuern: number[] = [];

  const tx = db.transaction(() => {
    const ts = nowIso();
    for (const row of rows) {
      const text = docText(row);
      let next: string | null = null;

      if (looksLikeCreditCardStatement(text)) {
        if (row.category !== "Kreditkarten") {
          next = "Kreditkarten";
          creditCards += 1;
        }
      } else if (
        looksLikeComputerDocument(text) &&
        !looksLikeBankDocument(text) &&
        row.category !== "Computer" &&
        row.category !== "Steuern" &&
        (row.category === "Sonstiges" ||
          row.category === "Geräte & Garantien" ||
          row.category === "Finanzen" ||
          row.category == null)
      ) {
        next = "Computer";
        computer += 1;
      }

      if (!next) continue;
      const prev = row.category;
      updateCat.run(next, ts, row.summary_id);
      if (prev === "Steuern" && next !== "Steuern") {
        afterLeaveSteuern.run(ts, row.summary_id);
        leftSteuern.push(row.document_id);
      }
      if (next === "Kreditkarten") {
        markCard.run(ts, row.summary_id);
      }
    }
  });
  tx();

  for (const docId of leftSteuern) {
    queueTaxRelevantUdfWriteback(docId, false);
  }

  return { creditCards, computer };
}

export function maybeRemapKnowledgeCategoriesOnce(): {
  ran: boolean;
  creditCards: number;
  computer: number;
} {
  if (getSetting(REMAP_DONE_KEY) === "1") {
    return { ran: false, creditCards: 0, computer: 0 };
  }
  const result = remapKnowledgeCategoriesHeuristic();
  setSetting(REMAP_DONE_KEY, "1");
  return { ran: true, ...result };
}

export function forceRemapKnowledgeCategories(): {
  creditCards: number;
  computer: number;
} {
  const result = remapKnowledgeCategoriesHeuristic();
  setSetting(REMAP_DONE_KEY, "1");
  return result;
}
