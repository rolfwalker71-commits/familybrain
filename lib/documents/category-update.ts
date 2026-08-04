import { getDb } from "@/lib/db/client";
import { nowIso } from "@/lib/utils/dates";
import { isKnownKnowledgeArea } from "@/lib/knowledge/areas";
import { queueTaxRelevantUdfWriteback } from "@/lib/documents/tax-classification";
import { writebackDocumentMetaToPaperless } from "@/lib/documents/update-meta";

export async function updateDocumentsCategory(input: {
  documentIds: number[];
  category: string;
}): Promise<{
  ok: boolean;
  error?: string;
  updated: number;
  writebackErrors?: string[];
}> {
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
     WHERE document_id = ?`
  );
  const insertPending = db.prepare(
    `INSERT INTO document_summaries (
       document_id, category, analysis_status, is_bank_document,
       created_at, updated_at
     ) VALUES (?, ?, 'pending', ?, ?, ?)`
  );

  let updated = 0;
  const taxUdf: Array<{ id: number; taxRelevant: boolean }> = [];
  const touchedIds: number[] = [];

  const tx = db.transaction(() => {
    for (const id of ids) {
      const exists = db
        .prepare(`SELECT id FROM paperless_documents WHERE id = ?`)
        .get(id) as { id: number } | undefined;
      if (!exists) continue;

      const prev = getCat.get(id) as { category: string | null } | undefined;
      if (!prev) {
        insertPending.run(
          id,
          category,
          category === "Kreditkarten" ? 1 : 0,
          ts,
          ts
        );
        updated += 1;
        touchedIds.push(id);
        if (category === "Steuern") {
          taxUdf.push({ id, taxRelevant: true });
        }
        continue;
      }

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
        touchedIds.push(id);
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

  const writebackErrors: string[] = [];
  for (const id of touchedIds) {
    const wb = await writebackDocumentMetaToPaperless({
      localDocumentId: id,
      category,
    });
    if (!wb.ok && wb.error) {
      writebackErrors.push(`#${id}: ${wb.error}`);
    }
  }

  return {
    ok: true,
    updated,
    writebackErrors: writebackErrors.length ? writebackErrors : undefined,
  };
}
