import { getDb } from "@/lib/db/client";
import { nowIso } from "@/lib/utils/dates";

export function setDocumentForGuide(
  documentId: number,
  value: boolean
): void {
  if (!Number.isInteger(documentId) || documentId <= 0) return;
  getDb()
    .prepare(
      `UPDATE paperless_documents
       SET for_guide = ?, updated_at = ?
       WHERE id = ?`
    )
    .run(value ? 1 : 0, nowIso(), documentId);
}

export function getDocumentForGuide(documentId: number): boolean {
  const row = getDb()
    .prepare(`SELECT for_guide FROM paperless_documents WHERE id = ?`)
    .get(documentId) as { for_guide: number | null } | undefined;
  return Number(row?.for_guide) === 1;
}
