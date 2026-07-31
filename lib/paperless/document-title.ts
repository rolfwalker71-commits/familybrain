import { getDb } from "@/lib/db/client";
import type { DocumentAnalysis } from "@/lib/ai/schemas";
import { shortenInstitutionName } from "@/lib/extraction/bank";
import { nowIso } from "@/lib/utils/dates";

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
  getDb()
    .prepare(
      `UPDATE paperless_documents
       SET title = ?, updated_at = ?
       WHERE id = ?`
    )
    .run(title, ts, localDocumentId);
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
