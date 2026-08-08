import { getDb } from "@/lib/db/client";
import { getPaperlessSettings } from "@/lib/db/queries";
import { PaperlessClient, PaperlessError } from "@/lib/paperless/client";
import { clearDocumentAiIcon } from "@/lib/paperless/document-icon";
import { deleteVectorPointsBySource } from "@/lib/vectors/client";

/**
 * Remove local Buddy state for a document (row, icon, vectors).
 * Does not call Paperless. Related analysis rows cascade via FK.
 */
export async function purgeDocumentLocally(localDocumentId: number): Promise<{
  ok: boolean;
  error?: string;
  paperlessId?: number;
}> {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT id, paperless_id FROM paperless_documents WHERE id = ?`
    )
    .get(localDocumentId) as
    | { id: number; paperless_id: number }
    | undefined;
  if (!row) return { ok: false, error: "Dokument nicht gefunden" };

  try {
    clearDocumentAiIcon(localDocumentId);
  } catch {
    /* ignore */
  }
  try {
    await deleteVectorPointsBySource("paperless", String(localDocumentId));
  } catch {
    /* ignore vector cleanup failures */
  }

  // Trash Google Drive mirror before local row/link vanishes
  try {
    const { removeDocumentDriveMirror } = await import(
      "@/lib/buddy/drive-mirror"
    );
    await removeDocumentDriveMirror(localDocumentId);
  } catch (err) {
    console.warn(
      "[drive-mirror] delete:",
      err instanceof Error ? err.message : err
    );
  }

  // Detach optional refs without cascade FK
  db.prepare(
    `UPDATE trip_events SET document_id = NULL, updated_at = datetime('now')
     WHERE document_id = ?`
  ).run(localDocumentId);

  db.prepare(`DELETE FROM paperless_documents WHERE id = ?`).run(localDocumentId);

  // Any remaining source links for this document
  db.prepare(
    `DELETE FROM buddy_source_links
     WHERE entity_type = 'document' AND entity_id = ?`
  ).run(String(localDocumentId));

  return { ok: true, paperlessId: row.paperless_id };
}

/**
 * Delete document in Paperless (if configured), then remove local row + vectors + icon.
 * Paperless 404 counts as already deleted.
 */
export async function deleteDocumentFully(localDocumentId: number): Promise<{
  ok: boolean;
  error?: string;
  paperlessId?: number;
}> {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT id, paperless_id FROM paperless_documents WHERE id = ?`
    )
    .get(localDocumentId) as
    | { id: number; paperless_id: number }
    | undefined;
  if (!row) return { ok: false, error: "Dokument nicht gefunden" };

  const { baseUrl, apiToken, publicUrl } = getPaperlessSettings();
  if (baseUrl && apiToken) {
    try {
      const client = new PaperlessClient(baseUrl, apiToken, publicUrl);
      await client.deleteDocument(row.paperless_id);
    } catch (err) {
      const message =
        err instanceof PaperlessError
          ? err.message
          : err instanceof Error
            ? err.message
            : String(err);
      return {
        ok: false,
        error: `Paperless-Löschen fehlgeschlagen: ${message}`,
        paperlessId: row.paperless_id,
      };
    }
  }

  return purgeDocumentLocally(localDocumentId);
}

/**
 * Paperless removed these IDs — purge matching Buddy rows (no Paperless DELETE call).
 */
export async function purgeLocalDocumentsByPaperlessIds(
  paperlessIds: number[]
): Promise<number> {
  if (paperlessIds.length === 0) return 0;
  const db = getDb();
  const placeholders = paperlessIds.map(() => "?").join(",");
  const rows = db
    .prepare(
      `SELECT id FROM paperless_documents
       WHERE paperless_id IN (${placeholders})`
    )
    .all(...paperlessIds) as Array<{ id: number }>;

  let purged = 0;
  for (const row of rows) {
    const result = await purgeDocumentLocally(row.id);
    if (result.ok) purged += 1;
  }
  return purged;
}
