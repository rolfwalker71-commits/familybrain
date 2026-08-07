import { getDb } from "@/lib/db/client";
import { getSetting } from "@/lib/db/migrations";
import { TriliumClient } from "@/lib/trilium/client";
import { TRILIUM_SETTING_KEYS } from "@/lib/trilium/constants";

export type ReferenceNote = {
  id: number;
  userId: number;
  title: string;
  body: string | null;
  reference: string | null;
  sourceMessageId: string | null;
  triliumNoteId: string | null;
  createdAt: string;
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function getTriliumClient(): {
  client: TriliumClient;
  parentNoteId: string;
} | null {
  const baseUrl = getSetting(TRILIUM_SETTING_KEYS.baseUrl)?.trim();
  const token = getSetting(TRILIUM_SETTING_KEYS.token)?.trim();
  const parentNoteId =
    getSetting(TRILIUM_SETTING_KEYS.privatNoteId)?.trim() ||
    getSetting(TRILIUM_SETTING_KEYS.masterNoteId)?.trim();
  if (!baseUrl || !token || !parentNoteId) return null;
  return { client: new TriliumClient(baseUrl, token), parentNoteId };
}

export function listRecentReferenceNotes(
  userId: number,
  limit = 12
): ReferenceNote[] {
  const rows = getDb()
    .prepare(
      `SELECT id, user_id, title, body, reference, source_message_id,
              trilium_note_id, created_at
       FROM reference_notes
       WHERE user_id = ?
       ORDER BY created_at DESC
       LIMIT ?`
    )
    .all(userId, limit) as Array<{
    id: number;
    user_id: number;
    title: string;
    body: string | null;
    reference: string | null;
    source_message_id: string | null;
    trilium_note_id: string | null;
    created_at: string;
  }>;
  return rows.map((r) => ({
    id: r.id,
    userId: r.user_id,
    title: r.title,
    body: r.body,
    reference: r.reference,
    sourceMessageId: r.source_message_id,
    triliumNoteId: r.trilium_note_id,
    createdAt: r.created_at,
  }));
}

/** Save a reference note in Buddy; optionally mirror to Trilium (Privat). */
export async function createReferenceNote(input: {
  userId: number;
  title: string;
  body?: string | null;
  reference?: string | null;
  sourceMessageId?: string | null;
}): Promise<ReferenceNote> {
  const title = input.title.trim().slice(0, 200);
  if (!title) throw new Error("Titel fehlt.");
  const body = input.body?.trim() || null;
  const reference = input.reference?.trim() || null;
  const createdAt = new Date().toISOString();

  let triliumNoteId: string | null = null;
  const trilium = getTriliumClient();
  if (trilium) {
    try {
      const parts = [
        reference ? `<p><strong>Referenz:</strong> ${escapeHtml(reference)}</p>` : "",
        body ? `<p>${escapeHtml(body).replace(/\n/g, "<br/>")}</p>` : "",
        input.sourceMessageId
          ? `<p><em>Aus Mail ${escapeHtml(input.sourceMessageId)}</em></p>`
          : "",
      ].filter(Boolean);
      const created = await trilium.client.createTextNote({
        parentNoteId: trilium.parentNoteId,
        title,
        contentHtml: parts.join("\n") || `<p>${escapeHtml(title)}</p>`,
      });
      triliumNoteId = created.noteId;
    } catch (error) {
      console.warn(
        "[reference-notes] Trilium create failed:",
        error instanceof Error ? error.message : error
      );
    }
  }

  const result = getDb()
    .prepare(
      `INSERT INTO reference_notes (
        user_id, title, body, reference, source_message_id, trilium_note_id, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      input.userId,
      title,
      body,
      reference,
      input.sourceMessageId ?? null,
      triliumNoteId,
      createdAt
    );

  return {
    id: Number(result.lastInsertRowid),
    userId: input.userId,
    title,
    body,
    reference,
    sourceMessageId: input.sourceMessageId ?? null,
    triliumNoteId,
    createdAt,
  };
}

/** Remove from Buddy DB; best-effort delete of mirrored Trilium note. */
export async function deleteReferenceNote(
  userId: number,
  noteId: number
): Promise<boolean> {
  const row = getDb()
    .prepare(
      `SELECT id, trilium_note_id FROM reference_notes WHERE id = ? AND user_id = ?`
    )
    .get(noteId, userId) as
    | { id: number; trilium_note_id: string | null }
    | undefined;
  if (!row) return false;

  if (row.trilium_note_id) {
    const trilium = getTriliumClient();
    if (trilium) {
      try {
        await trilium.client.deleteNote(row.trilium_note_id);
      } catch (error) {
        console.warn(
          "[reference-notes] Trilium delete failed:",
          error instanceof Error ? error.message : error
        );
      }
    }
  }

  getDb()
    .prepare(`DELETE FROM reference_notes WHERE id = ? AND user_id = ?`)
    .run(noteId, userId);
  return true;
}
