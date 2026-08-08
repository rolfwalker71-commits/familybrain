import { getDb } from "@/lib/db/client";
import { nowIso } from "@/lib/utils/dates";
import { ensureBuiltinKnowledgeAreas } from "@/lib/knowledge/areas";

/** Household-excluded knowledge area for O365 / ANG business documents. */
export const BUSINESS_KNOWLEDGE_AREA = "Geschäftlich";

/** Paperless / local tags that mark a document as business. */
export const BUSINESS_TAG_NAMES = ["O365", "ANG", "geschäftlich"] as const;

const BUSINESS_TAG_SQL_LIST = `'o365','ang','geschäftlich','geschaeftlich'`;

/**
 * SQL: document is business (alias must be a paperless_documents alias).
 * Uses tags, category «Geschäftlich», or microsoft_message source link.
 */
export function sqlDocIsBusiness(alias = "d"): string {
  return `(
  EXISTS (
    SELECT 1 FROM document_tags t
    WHERE t.document_id = ${alias}.id
      AND LOWER(COALESCE(t.tag_name,'')) IN (${BUSINESS_TAG_SQL_LIST})
  )
  OR EXISTS (
    SELECT 1 FROM document_summaries s
    WHERE s.document_id = ${alias}.id
      AND LOWER(TRIM(COALESCE(s.category,''))) = 'geschäftlich'
  )
  OR EXISTS (
    SELECT 1 FROM buddy_source_links l
    WHERE l.entity_type = 'document'
      AND l.entity_id = CAST(${alias}.id AS TEXT)
      AND l.source_kind = 'microsoft_message'
  )
)`;
}

export function sqlDocNotBusiness(alias = "d"): string {
  return `NOT ${sqlDocIsBusiness(alias)}`;
}

/** Pre-bound fragment for the common `d` alias. */
export const SQL_DOC_IS_BUSINESS = sqlDocIsBusiness("d");
export const SQL_DOC_NOT_BUSINESS = sqlDocNotBusiness("d");

export function isBusinessDocument(documentId: number): boolean {
  if (!Number.isInteger(documentId) || documentId <= 0) return false;
  const row = getDb()
    .prepare(
      `SELECT 1 AS ok FROM paperless_documents d
       WHERE d.id = ? AND ${SQL_DOC_IS_BUSINESS}
       LIMIT 1`
    )
    .get(documentId) as { ok: number } | undefined;
  return Boolean(row);
}

/**
 * Mark a Buddy document as business: category Geschäftlich, skip household triage.
 * Call after O365→Paperless ingest (tags may still be syncing).
 */
export function markDocumentAsBusiness(documentId: number): void {
  if (!Number.isInteger(documentId) || documentId <= 0) return;
  ensureBuiltinKnowledgeAreas();
  const db = getDb();
  const ts = nowIso();

  const existing = db
    .prepare(`SELECT id FROM document_summaries WHERE document_id = ?`)
    .get(documentId) as { id: number } | undefined;

  if (existing) {
    db.prepare(
      `UPDATE document_summaries
       SET category = ?, updated_at = ?
       WHERE document_id = ?`
    ).run(BUSINESS_KNOWLEDGE_AREA, ts, documentId);
  } else {
    db.prepare(
      `INSERT INTO document_summaries (
         document_id, category, analysis_status, created_at, updated_at
       ) VALUES (?, ?, 'pending', ?, ?)`
    ).run(documentId, BUSINESS_KNOWLEDGE_AREA, ts, ts);
  }

  // Keep out of household Action-Inbox (O365 / business is never household triage)
  db.prepare(
    `UPDATE paperless_documents
     SET triage_status = CASE
           WHEN triage_status IN ('ignored','done') THEN triage_status
           ELSE 'skipped'
         END,
         triage_reasons = ?,
         triage_at = ?,
         updated_at = ?
     WHERE id = ?`
  ).run(JSON.stringify(["business"]), ts, ts, documentId);
}
