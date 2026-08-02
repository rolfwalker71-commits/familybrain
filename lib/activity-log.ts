import { getDb } from "@/lib/db/client";
import { nowIso } from "@/lib/utils/dates";
import type {
  ActivityAction,
  ActivityEntityType,
  ActivityLogRow,
} from "@/lib/activity-log-shared";

export type {
  ActivityAction,
  ActivityEntityType,
  ActivityLogRow,
} from "@/lib/activity-log-shared";
export { ACTIVITY_ACTION_LABELS } from "@/lib/activity-log-shared";

const MAX_ROWS = 8000;

function trunc(value: unknown, max = 240): string | null {
  if (value === undefined) return null;
  if (value === null) return null;
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return String(value);
  if (typeof value === "string") {
    const t = value.trim();
    if (!t) return null;
    return t.length > max ? `${t.slice(0, max - 1)}…` : t;
  }
  try {
    const s = JSON.stringify(value);
    return s.length > max ? `${s.slice(0, max - 1)}…` : s;
  } catch {
    return String(value).slice(0, max);
  }
}

function pruneActivityLog(): void {
  const db = getDb();
  const count = (
    db.prepare(`SELECT COUNT(*) AS c FROM activity_log`).get() as { c: number }
  ).c;
  if (count <= MAX_ROWS) return;
  const excess = count - MAX_ROWS;
  db.prepare(
    `DELETE FROM activity_log WHERE id IN (
       SELECT id FROM activity_log ORDER BY id ASC LIMIT ?
     )`
  ).run(excess);
}

export function appendActivityLog(input: {
  entityType: ActivityEntityType;
  entityId: number;
  action: ActivityAction;
  summary: string;
  fieldName?: string | null;
  oldValue?: unknown;
  newValue?: unknown;
  actor?: string | null;
  source?: string | null;
  metadata?: Record<string, unknown> | null;
}): number {
  if (!Number.isInteger(input.entityId) || input.entityId <= 0) return 0;
  const summary = input.summary.trim();
  if (!summary) return 0;

  const db = getDb();
  const result = db
    .prepare(
      `INSERT INTO activity_log (
         created_at, entity_type, entity_id, action, summary,
         field_name, old_value, new_value, actor, source, metadata_json
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      nowIso(),
      input.entityType,
      input.entityId,
      input.action,
      summary.slice(0, 500),
      input.fieldName?.trim() || null,
      trunc(input.oldValue),
      trunc(input.newValue),
      input.actor?.trim() || null,
      input.source?.trim() || null,
      input.metadata ? trunc(input.metadata, 1000) : null
    );
  pruneActivityLog();
  return Number(result.lastInsertRowid);
}

export function logFieldChange(input: {
  entityType: ActivityEntityType;
  entityId: number;
  fieldName: string;
  oldValue?: unknown;
  newValue?: unknown;
  actor?: string | null;
  source?: string | null;
  label?: string;
}): number {
  const label = input.label || input.fieldName;
  const from = trunc(input.oldValue) ?? "—";
  const to = trunc(input.newValue) ?? "—";
  if (from === to) return 0;
  return appendActivityLog({
    entityType: input.entityType,
    entityId: input.entityId,
    action: "field_change",
    summary: `${label}: ${from} → ${to}`,
    fieldName: input.fieldName,
    oldValue: input.oldValue,
    newValue: input.newValue,
    actor: input.actor,
    source: input.source,
  });
}

export function listActivityLog(input: {
  entityType: ActivityEntityType;
  entityId: number;
  limit?: number;
  offset?: number;
}): { rows: ActivityLogRow[]; total: number } {
  const db = getDb();
  const limit = Math.min(Math.max(input.limit ?? 50, 1), 200);
  const offset = Math.max(input.offset ?? 0, 0);
  const total = (
    db
      .prepare(
        `SELECT COUNT(*) AS c FROM activity_log
         WHERE entity_type = ? AND entity_id = ?`
      )
      .get(input.entityType, input.entityId) as { c: number }
  ).c;
  const rows = db
    .prepare(
      `SELECT id, created_at, entity_type, entity_id, action, summary,
              field_name, old_value, new_value, actor, source, metadata_json
       FROM activity_log
       WHERE entity_type = ? AND entity_id = ?
       ORDER BY id DESC
       LIMIT ? OFFSET ?`
    )
    .all(input.entityType, input.entityId, limit, offset) as ActivityLogRow[];
  return { rows, total };
}
