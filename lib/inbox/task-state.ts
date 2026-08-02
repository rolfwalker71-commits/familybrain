import { getDb } from "@/lib/db/client";
import { nowIso } from "@/lib/utils/dates";
import type {
  InboxSourceKind,
  InboxTaskStatus,
} from "@/lib/inbox/types";

export type InboxTaskStateRow = {
  owner_key: string;
  source_kind: InboxSourceKind;
  source_id: string;
  status: InboxTaskStatus;
  snoozed_until: string | null;
  note: string | null;
  completed_at: string | null;
  updated_at: string;
  created_at: string;
};

/** Shared household inbox (admin-only today). */
export const INBOX_OWNER_HOUSEHOLD = "household";

function todayIsoLocal(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, "0"),
    String(d.getDate()).padStart(2, "0"),
  ].join("-");
}

export function addDaysIso(days: number): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + days);
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, "0"),
    String(d.getDate()).padStart(2, "0"),
  ].join("-");
}

export function listInboxTaskStates(
  ownerKey = INBOX_OWNER_HOUSEHOLD
): Map<string, InboxTaskStateRow> {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT owner_key, source_kind, source_id, status, snoozed_until, note,
              completed_at, updated_at, created_at
       FROM inbox_task_state
       WHERE owner_key = ?`
    )
    .all(ownerKey) as InboxTaskStateRow[];

  const map = new Map<string, InboxTaskStateRow>();
  for (const row of rows) {
    map.set(`${row.source_kind}:${row.source_id}`, row);
  }
  return map;
}

export function getInboxTaskState(
  sourceKind: InboxSourceKind,
  sourceId: string,
  ownerKey = INBOX_OWNER_HOUSEHOLD
): InboxTaskStateRow | null {
  const db = getDb();
  return (
    (db
      .prepare(
        `SELECT owner_key, source_kind, source_id, status, snoozed_until, note,
                completed_at, updated_at, created_at
         FROM inbox_task_state
         WHERE owner_key = ? AND source_kind = ? AND source_id = ?`
      )
      .get(ownerKey, sourceKind, sourceId) as InboxTaskStateRow | undefined) ??
    null
  );
}

export function upsertInboxTaskState(input: {
  ownerKey?: string;
  sourceKind: InboxSourceKind;
  sourceId: string;
  status: InboxTaskStatus;
  snoozedUntil?: string | null;
  note?: string | null;
  completedAt?: string | null;
}): InboxTaskStateRow {
  const ownerKey = input.ownerKey ?? INBOX_OWNER_HOUSEHOLD;
  const ts = nowIso();
  const db = getDb();
  const existing = getInboxTaskState(
    input.sourceKind,
    input.sourceId,
    ownerKey
  );
  const snoozedUntil =
    input.snoozedUntil === undefined
      ? (existing?.snoozed_until ?? null)
      : input.snoozedUntil;
  const note =
    input.note === undefined ? (existing?.note ?? null) : input.note;
  const completedAt =
    input.completedAt === undefined
      ? input.status === "done" || input.status === "dismissed"
        ? existing?.completed_at || ts
        : null
      : input.completedAt;

  db.prepare(
    `INSERT INTO inbox_task_state (
       owner_key, source_kind, source_id, status, snoozed_until, note,
       completed_at, updated_at, created_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(owner_key, source_kind, source_id) DO UPDATE SET
       status = excluded.status,
       snoozed_until = excluded.snoozed_until,
       note = excluded.note,
       completed_at = excluded.completed_at,
       updated_at = excluded.updated_at`
  ).run(
    ownerKey,
    input.sourceKind,
    input.sourceId,
    input.status,
    snoozedUntil,
    note,
    completedAt,
    ts,
    existing?.created_at ?? ts
  );

  return getInboxTaskState(input.sourceKind, input.sourceId, ownerKey)!;
}

export function recordInboxTaskEvent(input: {
  ownerKey?: string;
  sourceKind: InboxSourceKind;
  sourceId: string;
  action: string;
  detail?: string | null;
}): void {
  const db = getDb();
  db.prepare(
    `INSERT INTO inbox_task_events (
       owner_key, source_kind, source_id, action, detail, created_at
     ) VALUES (?, ?, ?, ?, ?, ?)`
  ).run(
    input.ownerKey ?? INBOX_OWNER_HOUSEHOLD,
    input.sourceKind,
    input.sourceId,
    input.action,
    input.detail ?? null,
    nowIso()
  );
}

export function listCompletedInboxStates(
  ownerKey = INBOX_OWNER_HOUSEHOLD,
  limit = 40
): InboxTaskStateRow[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT owner_key, source_kind, source_id, status, snoozed_until, note,
              completed_at, updated_at, created_at
       FROM inbox_task_state
       WHERE owner_key = ?
         AND status IN ('done', 'dismissed')
       ORDER BY COALESCE(completed_at, updated_at) DESC
       LIMIT ?`
    )
    .all(ownerKey, limit) as InboxTaskStateRow[];
}

/** Effective view status after applying snooze expiry. */
export function effectiveTaskStatus(
  row: InboxTaskStateRow | null | undefined
): InboxTaskStatus {
  if (!row) return "open";
  if (row.status === "snoozed") {
    const until = row.snoozed_until?.trim();
    if (!until || until < todayIsoLocal()) return "open";
    return "snoozed";
  }
  return row.status;
}
