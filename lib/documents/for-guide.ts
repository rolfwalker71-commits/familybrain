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

/** True if a knowledge guide was imported from this Paperless document. */
export function documentHasGuide(documentId: number): boolean {
  if (!Number.isInteger(documentId) || documentId <= 0) return false;
  const row = getDb()
    .prepare(
      `SELECT id FROM knowledge_guides WHERE source_document_id = ? LIMIT 1`
    )
    .get(documentId) as { id: number } | undefined;
  return Boolean(row?.id);
}

/**
 * Batch «Für Guide»: setzt Flag lokal + Paperless.
 * Dokumente mit bestehendem Knowledge-Guide werden verworfen (skipped).
 */
export async function markDocumentsForGuideBatch(documentIds: number[]): Promise<{
  marked: number;
  skippedAlreadyInGuide: number;
  skippedAlreadyFlagged: number;
  missing: number;
  failed: Array<{ id: number; error: string }>;
}> {
  const ids = Array.from(
    new Set(documentIds.filter((id) => Number.isInteger(id) && id > 0))
  );
  let marked = 0;
  let skippedAlreadyInGuide = 0;
  let skippedAlreadyFlagged = 0;
  let missing = 0;
  const failed: Array<{ id: number; error: string }> = [];

  const { getDocumentById } = await import("@/lib/db/queries");
  const { writebackStatusFlagsToPaperless } = await import(
    "@/lib/paperless/writeback"
  );

  for (const id of ids) {
    if (!getDocumentById(id)?.document) {
      missing += 1;
      continue;
    }
    if (documentHasGuide(id)) {
      skippedAlreadyInGuide += 1;
      continue;
    }
    if (getDocumentForGuide(id)) {
      skippedAlreadyFlagged += 1;
      continue;
    }
    try {
      const result = await writebackStatusFlagsToPaperless({
        localDocumentId: id,
        forGuide: true,
      });
      if (!result.ok) {
        // Local flag still useful for Guides-Batch even if Paperless writeback fails
        setDocumentForGuide(id, true);
        failed.push({
          id,
          error: result.error || "Paperless-Writeback fehlgeschlagen",
        });
        marked += 1;
        continue;
      }
      marked += 1;
    } catch (err) {
      failed.push({
        id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return {
    marked,
    skippedAlreadyInGuide,
    skippedAlreadyFlagged,
    missing,
    failed,
  };
}

/**
 * Nachziehen: alle Dokumente mit bestehendem Guide bekommen for_guide = 1.
 * Idempotent — bei jedem Bootstrap unproblematisch.
 */
export function backfillForGuideFromKnowledgeGuides(): number {
  const result = getDb()
    .prepare(
      `UPDATE paperless_documents
       SET for_guide = 1, updated_at = ?
       WHERE COALESCE(for_guide, 0) = 0
         AND id IN (
           SELECT source_document_id FROM knowledge_guides
           WHERE source_document_id IS NOT NULL
         )`
    )
    .run(nowIso());
  return Number(result.changes) || 0;
}
