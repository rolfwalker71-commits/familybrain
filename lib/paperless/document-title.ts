import { getDb } from "@/lib/db/client";
import type { DocumentAnalysis } from "@/lib/ai/schemas";
import { shortenInstitutionName } from "@/lib/extraction/bank";
import { nowIso } from "@/lib/utils/dates";
import { logFieldChange } from "@/lib/activity-log";

/** Normalize AI-suggested Paperless titles. */
export function clipSuggestedDocumentTitle(
  raw: string | null | undefined,
  max = 160
): string | null {
  const t = shortenInstitutionName((raw || "").replace(/\s+/g, " ").trim());
  if (t.length < 3) return null;
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

export function updateLocalDocumentTitle(
  localDocumentId: number,
  title: string
): void {
  const ts = nowIso();
  const db = getDb();
  const prev = db
    .prepare(`SELECT title FROM paperless_documents WHERE id = ?`)
    .get(localDocumentId) as { title: string | null } | undefined;
  db.prepare(
    `UPDATE paperless_documents
       SET title = ?, updated_at = ?
       WHERE id = ?`
  ).run(title, ts, localDocumentId);
  try {
    logFieldChange({
      entityType: "document",
      entityId: localDocumentId,
      fieldName: "title",
      label: "Titel",
      oldValue: prev?.title,
      newValue: title,
      source: "document-title",
    });
  } catch {
    /* optional */
  }
}

/**
 * Apply analysis suggested_title (fallback: short_summary) to the local document.
 * Returns the title written, or null if nothing usable.
 */
export function applySuggestedTitleAfterAnalysis(
  localDocumentId: number,
  analysis: DocumentAnalysis
): string | null {
  const title =
    clipSuggestedDocumentTitle(analysis.suggested_title) ||
    clipSuggestedDocumentTitle(analysis.short_summary);
  if (!title) return null;
  updateLocalDocumentTitle(localDocumentId, title);
  return title;
}
