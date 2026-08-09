/**
 * Resolve a Paperless document id from a consume task payload.
 * Supports API v9 (`related_document` / `result`) and v10+
 * (`related_document_ids` / `result_data` / `result_message`).
 */
export type PaperlessTaskLike = {
  status?: string | null;
  related_document?: string | number | null;
  related_document_ids?: unknown;
  result?: string | null;
  result_message?: string | null;
  result_data?: Record<string, unknown> | null;
  duplicate_documents?: unknown;
};

function positiveId(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function extractPaperlessTaskDocumentId(
  task: PaperlessTaskLike
): number | null {
  const fromRelated = positiveId(task.related_document);
  if (fromRelated) return fromRelated;

  if (Array.isArray(task.related_document_ids)) {
    for (const id of task.related_document_ids) {
      const n = positiveId(id);
      if (n) return n;
    }
  }

  const data = task.result_data;
  if (data && typeof data === "object") {
    const docId = positiveId(data.document_id);
    if (docId) return docId;
    const dup = positiveId(data.duplicate_of);
    if (dup) return dup;
  }

  if (Array.isArray(task.duplicate_documents)) {
    for (const entry of task.duplicate_documents) {
      if (entry && typeof entry === "object" && "id" in entry) {
        const n = positiveId((entry as { id: unknown }).id);
        if (n) return n;
      }
      const n = positiveId(entry);
      if (n) return n;
    }
  }

  const text = `${task.result || ""} ${task.result_message || ""}`;
  const fromText =
    /document id (\d+)/i.exec(text) ||
    /duplicate of[^\d#]*#?(\d+)/i.exec(text) ||
    /#(\d+)/.exec(text);
  if (fromText) {
    return positiveId(fromText[1]);
  }
  return null;
}

export function paperlessTaskFailureMessage(
  task: PaperlessTaskLike
): string | null {
  const data = task.result_data;
  if (data && typeof data === "object") {
    const reason = data.reason;
    if (typeof reason === "string" && reason.trim()) return reason.trim();
    const err = data.error_message;
    if (typeof err === "string" && err.trim()) return err.trim();
  }
  const msg = (task.result_message || task.result || "").trim();
  return msg || null;
}
