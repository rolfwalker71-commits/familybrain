import { getDb } from "@/lib/db/client";
import { getPaperlessSettings } from "@/lib/db/queries";
import { PaperlessClient, PaperlessError } from "@/lib/paperless/client";
import { clearDocumentAiIcon } from "@/lib/paperless/document-icon";
import { deleteVectorPointsBySource } from "@/lib/vectors/client";

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
      `SELECT id, paperless_id, ai_icon_path FROM paperless_documents WHERE id = ?`
    )
    .get(localDocumentId) as
    | { id: number; paperless_id: number; ai_icon_path: string | null }
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

  db.prepare(`DELETE FROM paperless_documents WHERE id = ?`).run(localDocumentId);

  return { ok: true, paperlessId: row.paperless_id };
}
