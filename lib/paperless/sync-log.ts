import { getDb } from "@/lib/db/client";
import { nowIso } from "@/lib/utils/dates";

export type PaperlessSyncDirection = "pull" | "push";
export type PaperlessSyncStatus = "ok" | "error" | "skipped";
export type PaperlessSyncKind =
  | "custom_field"
  | "tag"
  | "correspondent"
  | "document_type"
  | "payment_flag"
  | "title"
  | "batch";

export type PaperlessSyncSource =
  | "sync"
  | "writeback_analysis"
  | "writeback_link"
  | "writeback_status"
  | "mark_paid"
  | "webhook"
  | "manual";

export type PaperlessFieldSyncLogRow = {
  id: number;
  created_at: string;
  direction: PaperlessSyncDirection;
  status: PaperlessSyncStatus;
  kind: PaperlessSyncKind;
  source: PaperlessSyncSource;
  field_name: string | null;
  field_value: string | null;
  document_local_id: number | null;
  paperless_id: number | null;
  document_title: string | null;
  message: string | null;
};

const MAX_ROWS = 500;

export function formatSyncLogValue(value: unknown): string | null {
  if (value === undefined) return null;
  if (value === null) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return String(value);
  if (typeof value === "string") {
    const t = value.trim();
    return t.length > 200 ? `${t.slice(0, 199)}…` : t;
  }
  try {
    const s = JSON.stringify(value);
    return s.length > 200 ? `${s.slice(0, 199)}…` : s;
  } catch {
    return String(value);
  }
}

export function appendPaperlessFieldSyncLog(input: {
  direction: PaperlessSyncDirection;
  status: PaperlessSyncStatus;
  kind: PaperlessSyncKind;
  source: PaperlessSyncSource;
  fieldName?: string | null;
  fieldValue?: unknown;
  documentLocalId?: number | null;
  paperlessId?: number | null;
  documentTitle?: string | null;
  message?: string | null;
}): number {
  const db = getDb();
  const result = db
    .prepare(
      `INSERT INTO paperless_field_sync_log (
         created_at, direction, status, kind, source,
         field_name, field_value, document_local_id, paperless_id,
         document_title, message
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      nowIso(),
      input.direction,
      input.status,
      input.kind,
      input.source,
      input.fieldName?.trim() || null,
      formatSyncLogValue(input.fieldValue),
      input.documentLocalId ?? null,
      input.paperlessId ?? null,
      input.documentTitle?.trim() || null,
      input.message?.trim()?.slice(0, 500) || null
    );

  prunePaperlessFieldSyncLog();
  return Number(result.lastInsertRowid);
}

export function appendPaperlessFieldSyncLogs(
  entries: Array<Parameters<typeof appendPaperlessFieldSyncLog>[0]>
): void {
  if (entries.length === 0) return;
  const db = getDb();
  const insert = db.prepare(
    `INSERT INTO paperless_field_sync_log (
       created_at, direction, status, kind, source,
       field_name, field_value, document_local_id, paperless_id,
       document_title, message
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const ts = nowIso();
  const tx = db.transaction(() => {
    for (const input of entries) {
      insert.run(
        ts,
        input.direction,
        input.status,
        input.kind,
        input.source,
        input.fieldName?.trim() || null,
        formatSyncLogValue(input.fieldValue),
        input.documentLocalId ?? null,
        input.paperlessId ?? null,
        input.documentTitle?.trim() || null,
        input.message?.trim()?.slice(0, 500) || null
      );
    }
  });
  tx();
  prunePaperlessFieldSyncLog();
}

function prunePaperlessFieldSyncLog(): void {
  const db = getDb();
  db.prepare(
    `DELETE FROM paperless_field_sync_log
     WHERE id NOT IN (
       SELECT id FROM paperless_field_sync_log
       ORDER BY id DESC
       LIMIT ?
     )`
  ).run(MAX_ROWS);
}

export function listPaperlessFieldSyncLogs(
  limit = 100,
  offset = 0
): { entries: PaperlessFieldSyncLogRow[]; total: number } {
  const db = getDb();
  const safeLimit = Math.min(Math.max(limit, 1), 200);
  const safeOffset = Math.max(offset, 0);
  const entries = db
    .prepare(
      `SELECT * FROM paperless_field_sync_log
       ORDER BY id DESC
       LIMIT ? OFFSET ?`
    )
    .all(safeLimit, safeOffset) as PaperlessFieldSyncLogRow[];
  const total = (
    db.prepare(`SELECT COUNT(*) as c FROM paperless_field_sync_log`).get() as {
      c: number;
    }
  ).c;
  return { entries, total };
}
