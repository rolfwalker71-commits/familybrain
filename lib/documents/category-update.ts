import { getDb } from "@/lib/db/client";
import { nowIso } from "@/lib/utils/dates";
import { isKnownKnowledgeArea } from "@/lib/knowledge/areas";
import { queueTaxRelevantUdfWriteback } from "@/lib/documents/tax-classification";

export function updateDocumentsCategory(input: {
  documentIds: number[];
  category: string;
}): { ok: boolean; error?: string; updated: number } {
  const category = input.category.trim();
  if (!category || !isKnownKnowledgeArea(category)) {
    return { ok: false, error: "Ungültige Wissensrubrik.", updated: 0 };
  }
  const ids = [
    ...new Set(
      input.documentIds.filter((id) => Number.isInteger(id) && id > 0)
    ),
  ];
  if (ids.length === 0) {
    return { ok: false, error: "Keine Dokumente ausgewählt.", updated: 0 };
  }
  if (ids.length > 200) {
    return { ok: false, error: "Maximal 200 Dokumente pro Lauf.", updated: 0 };
  }

  const db = getDb();
  const ts = nowIso();
  const getCat = db.prepare(
    `SELECT category FROM document_summaries WHERE document_id = ?`
  );
  const upd = db.prepare(
    `UPDATE document_summaries
     SET category = ?,
         tax_year = CASE WHEN ? = 'Steuern' THEN tax_year ELSE NULL END,
         is_bank_document = CASE
           WHEN ? = 'Steuern' THEN is_bank_document
           WHEN ? = 'Kreditkarten' THEN 1
           ELSE 0
         END,
         updated_at = ?
     WHERE document_id = ? AND analysis_status = 'completed'`
  );

  let updated = 0;
  const taxUdf: Array<{ id: number; taxRelevant: boolean }> = [];

  const tx = db.transaction(() => {
    for (const id of ids) {
      const prev = getCat.get(id) as { category: string | null } | undefined;
      if (!prev) continue;
      const result = upd.run(
        category,
        category,
        category,
        category,
        ts,
        id
      );
      if (result.changes > 0) {
        updated += 1;
        const wasSteuern = prev.category === "Steuern";
        const nowSteuern = category === "Steuern";
        if (wasSteuern !== nowSteuern) {
          taxUdf.push({ id, taxRelevant: nowSteuern });
        }
      }
    }
  });
  tx();

  for (const row of taxUdf) {
    queueTaxRelevantUdfWriteback(row.id, row.taxRelevant);
  }

  return { ok: true, updated };
}
