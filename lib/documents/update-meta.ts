import { getDb } from "@/lib/db/client";
import { nowIso } from "@/lib/utils/dates";
import { isPaperlessWritebackEnabled } from "@/lib/paperless/writeback";
import { getPaperlessSettings } from "@/lib/db/queries";
import { PaperlessClient } from "@/lib/paperless/client";
import { buddyCategoryTag } from "@/lib/paperless/custom-fields";
import { appendPaperlessFieldSyncLogs } from "@/lib/paperless/sync-log";

function createClientOrNull(): PaperlessClient | null {
  const { baseUrl, apiToken, publicUrl } = getPaperlessSettings();
  if (!baseUrl || !apiToken) return null;
  return new PaperlessClient(baseUrl, apiToken, publicUrl);
}

/**
 * Push title and/or Buddy category tag to Paperless (merge tags; replace buddy:kat:*).
 */
export async function writebackDocumentMetaToPaperless(input: {
  localDocumentId: number;
  title?: string | null;
  category?: string | null;
}): Promise<{ ok: boolean; error?: string }> {
  if (!isPaperlessWritebackEnabled()) return { ok: true };
  const client = createClientOrNull();
  if (!client) return { ok: false, error: "Paperless nicht konfiguriert" };

  const db = getDb();
  const doc = db
    .prepare(
      `SELECT paperless_id, title FROM paperless_documents WHERE id = ?`
    )
    .get(input.localDocumentId) as
    | { paperless_id: number; title: string | null }
    | undefined;
  if (!doc) return { ok: false, error: "Dokument nicht gefunden" };

  try {
    const remote = await client.getDocument(doc.paperless_id);
    const existingTagIds = Array.isArray(remote.tags)
      ? remote.tags.map((t) =>
          typeof t === "number" ? t : Number((t as { id: number }).id)
        )
      : [];

    let nextTags: number[] | undefined;
    if (input.category != null && input.category.trim()) {
      const tagCache = new Map<string, number>();
      const allTags = await client.listTags();
      const buddyKatIds = new Set(
        allTags
          .filter((t) => t.name.toLowerCase().startsWith("buddy:kat:"))
          .map((t) => t.id)
      );
      const kept = existingTagIds.filter((id) => !buddyKatIds.has(id));
      const newTagId = await client.ensureTag(
        buddyCategoryTag(input.category.trim()),
        tagCache
      );
      nextTags = [...new Set([...kept, newTagId])];

      let documentTypeId: number | null | undefined;
      const found = await client.findDocumentTypeIdByName(input.category.trim());
      if (found != null) documentTypeId = found;

      await client.setDocumentMetadata(doc.paperless_id, {
        title: input.title !== undefined ? input.title : undefined,
        tags: nextTags,
        documentTypeId,
      });
    } else {
      await client.setDocumentMetadata(doc.paperless_id, {
        title: input.title !== undefined ? input.title : undefined,
      });
    }

    const logs = [];
    if (input.title?.trim()) {
      logs.push({
        direction: "push" as const,
        source: "manual" as const,
        status: "ok" as const,
        kind: "title" as const,
        fieldName: "Titel",
        fieldValue: input.title.trim(),
        documentLocalId: input.localDocumentId,
        paperlessId: doc.paperless_id,
        documentTitle: input.title.trim(),
      });
    }
    if (input.category?.trim()) {
      logs.push({
        direction: "push" as const,
        source: "manual" as const,
        status: "ok" as const,
        kind: "tag" as const,
        fieldName: buddyCategoryTag(input.category.trim()),
        fieldValue: input.category.trim(),
        documentLocalId: input.localDocumentId,
        paperlessId: doc.paperless_id,
        documentTitle: doc.title,
      });
    }
    if (logs.length) appendPaperlessFieldSyncLogs(logs);
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    appendPaperlessFieldSyncLogs([
      {
        direction: "push",
        source: "manual",
        status: "error",
        kind: "batch",
        documentLocalId: input.localDocumentId,
        documentTitle: doc.title,
        message,
      },
    ]);
    return { ok: false, error: message };
  }
}

export async function updateDocumentTitle(input: {
  documentId: number;
  title: string;
}): Promise<{ ok: boolean; error?: string; title?: string }> {
  const title = input.title.trim();
  if (!title) return { ok: false, error: "Titel darf nicht leer sein." };
  if (title.length > 500) return { ok: false, error: "Titel zu lang." };

  const db = getDb();
  const existing = db
    .prepare(`SELECT id FROM paperless_documents WHERE id = ?`)
    .get(input.documentId) as { id: number } | undefined;
  if (!existing) return { ok: false, error: "Dokument nicht gefunden" };

  db.prepare(
    `UPDATE paperless_documents SET title = ?, updated_at = ? WHERE id = ?`
  ).run(title, nowIso(), input.documentId);

  const wb = await writebackDocumentMetaToPaperless({
    localDocumentId: input.documentId,
    title,
  });
  if (!wb.ok) {
    return {
      ok: false,
      error: wb.error || "Paperless-Titel konnte nicht gesetzt werden.",
      title,
    };
  }
  return { ok: true, title };
}
