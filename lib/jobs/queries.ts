import { getDb } from "@/lib/db/client";
import { getSetting, setSetting } from "@/lib/db/migrations";
import { nowIso } from "@/lib/utils/dates";
import {
  ANALYSIS_CLAIM_LEASE_MS,
  ANALYSIS_RETRY_BASE_MS,
  DEFAULT_SCHEDULER_INTERVAL_MINUTES,
  INITIAL_INGESTION_COMPLETE_KEY,
  INITIAL_SYNC_COMPLETE_KEY,
  JOB_LEASE_MS,
  JOB_TYPE_SYNC_ANALYZE,
  MAX_ANALYSIS_ATTEMPTS,
  SCHEDULER_ENABLED_KEY,
  SCHEDULER_INTERVAL_KEY,
  SYNC_LAST_FULL_RECONCILE_KEY,
  SYNC_LAST_ID_RECONCILE_KEY,
  SYNC_MODIFIED_CURSOR_KEY,
  TRILIUM_INITIAL_SYNC_COMPLETE_KEY,
  TRILIUM_SYNC_LAST_FULL_RECONCILE_KEY,
  TRILIUM_SYNC_MODIFIED_CURSOR_KEY,
  clampSchedulerIntervalMinutes,
  parseSchedulerEnabled,
} from "./constants";

export type JobTrigger = "schedule" | "manual";
export type JobStatus = "running" | "success" | "error" | "skipped";

export type JobRunRow = {
  id: number;
  job_type: string;
  trigger: string;
  status: string;
  started_at: string;
  finished_at: string | null;
  summary_json: string | null;
  error_message: string | null;
  lease_owner: string | null;
  lease_expires_at: string | null;
};

export type JobRunItemRow = {
  id: number;
  run_id: number;
  item_kind: string;
  external_ref: string | null;
  title: string | null;
  status: string;
  message: string | null;
  payload_json: string | null;
  created_at: string;
};

export type JobRunSummary = {
  initialRun?: boolean;
  initialComplete?: boolean;
  syncMode?: string;
  totalRemote?: number;
  processed?: number;
  created?: number;
  updated?: number;
  unchanged?: number;
  missing?: number;
  syncErrors?: number;
  analyzed?: number;
  analysisFailed?: number;
  analysisSkipped?: number;
  cursorAdvancedTo?: string | null;
  idReconciled?: boolean;
  fullReconciled?: boolean;
  triliumSyncMode?: string;
  triliumTotalRemote?: number;
  triliumProcessed?: number;
  triliumCreated?: number;
  triliumUpdated?: number;
  triliumUnchanged?: number;
  triliumMissing?: number;
  triliumSyncErrors?: number;
  triliumCursorAdvancedTo?: string | null;
  triliumFullReconciled?: boolean;
};

function newLeaseOwner(): string {
  return `pid-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function getSchedulerSettings() {
  const enabled = parseSchedulerEnabled(getSetting(SCHEDULER_ENABLED_KEY));
  const intervalMinutes = clampSchedulerIntervalMinutes(
    getSetting(SCHEDULER_INTERVAL_KEY) ?? DEFAULT_SCHEDULER_INTERVAL_MINUTES
  );
  return { enabled, intervalMinutes };
}

export function saveSchedulerSettings(input: {
  enabled?: boolean;
  intervalMinutes?: number;
}) {
  if (typeof input.enabled === "boolean") {
    setSetting(SCHEDULER_ENABLED_KEY, input.enabled ? "1" : "0");
  }
  if (input.intervalMinutes != null) {
    setSetting(
      SCHEDULER_INTERVAL_KEY,
      String(clampSchedulerIntervalMinutes(input.intervalMinutes))
    );
  }
  return getSchedulerSettings();
}

export function getSyncCursor(): string | null {
  return getSetting(SYNC_MODIFIED_CURSOR_KEY);
}

export function setSyncCursor(value: string | null) {
  setSetting(SYNC_MODIFIED_CURSOR_KEY, value);
}

export function getLastIdReconcileAt(): string | null {
  return getSetting(SYNC_LAST_ID_RECONCILE_KEY);
}

export function setLastIdReconcileAt(value: string) {
  setSetting(SYNC_LAST_ID_RECONCILE_KEY, value);
}

export function getLastFullReconcileAt(): string | null {
  return getSetting(SYNC_LAST_FULL_RECONCILE_KEY);
}

export function setLastFullReconcileAt(value: string) {
  setSetting(SYNC_LAST_FULL_RECONCILE_KEY, value);
}

export function getTriliumSyncCursor(): string | null {
  return getSetting(TRILIUM_SYNC_MODIFIED_CURSOR_KEY);
}

export function setTriliumSyncCursor(value: string | null) {
  setSetting(TRILIUM_SYNC_MODIFIED_CURSOR_KEY, value);
}

export function getTriliumLastFullReconcileAt(): string | null {
  return getSetting(TRILIUM_SYNC_LAST_FULL_RECONCILE_KEY);
}

export function setTriliumLastFullReconcileAt(value: string) {
  setSetting(TRILIUM_SYNC_LAST_FULL_RECONCILE_KEY, value);
}

export function getTriliumInitialSyncComplete(): boolean {
  return getSetting(TRILIUM_INITIAL_SYNC_COMPLETE_KEY) === "1";
}

export function setTriliumInitialSyncComplete(value: boolean) {
  setSetting(TRILIUM_INITIAL_SYNC_COMPLETE_KEY, value ? "1" : "0");
}

export function getInitialSyncComplete(): boolean {
  return parseSchedulerEnabled(getSetting(INITIAL_SYNC_COMPLETE_KEY) ?? "0");
}

export function setInitialSyncComplete(complete: boolean): void {
  setSetting(INITIAL_SYNC_COMPLETE_KEY, complete ? "1" : "0");
}

export function getInitialIngestionComplete(): boolean {
  return parseSchedulerEnabled(
    getSetting(INITIAL_INGESTION_COMPLETE_KEY) ?? "0"
  );
}

export function setInitialIngestionComplete(complete: boolean): void {
  setSetting(INITIAL_INGESTION_COMPLETE_KEY, complete ? "1" : "0");
}

export function recoverExpiredJobLeases(now = new Date()): number {
  const db = getDb();
  const ts = now.toISOString();
  const result = db
    .prepare(
      `UPDATE job_runs
       SET status = 'error',
           finished_at = ?,
           error_message = COALESCE(error_message, 'Lease abgelaufen (Neustart oder Timeout)')
       WHERE status = 'running'
         AND (lease_expires_at IS NULL OR lease_expires_at < ?)`
    )
    .run(ts, ts);
  return result.changes;
}

export function recoverExpiredAnalysisClaims(now = new Date()): number {
  const db = getDb();
  const ts = now.toISOString();
  const result = db
    .prepare(
      `UPDATE document_summaries
       SET analysis_status = CASE
             WHEN analysis_attempts >= ? THEN 'error'
             ELSE 'pending'
           END,
           analysis_claimed_at = NULL,
           analysis_claim_hash = NULL,
           analysis_next_retry_at = CASE
             WHEN analysis_attempts >= ? THEN NULL
             ELSE ?
           END,
           analysis_last_error = COALESCE(analysis_last_error, 'Analyse-Claim abgelaufen'),
           updated_at = ?
       WHERE analysis_status = 'processing'
         AND analysis_claimed_at IS NOT NULL
         AND datetime(analysis_claimed_at) < datetime(?, '-' || ? || ' seconds')`
    )
    .run(
      MAX_ANALYSIS_ATTEMPTS,
      MAX_ANALYSIS_ATTEMPTS,
      new Date(now.getTime() + ANALYSIS_RETRY_BASE_MS).toISOString(),
      ts,
      ts,
      Math.floor(ANALYSIS_CLAIM_LEASE_MS / 1000)
    );
  return result.changes;
}

/**
 * Atomically claim a global job lease. Returns null if another run holds it.
 */
export function tryAcquireJobRun(trigger: JobTrigger): JobRunRow | null {
  const db = getDb();
  const ts = nowIso();
  const expires = new Date(Date.now() + JOB_LEASE_MS).toISOString();
  const owner = newLeaseOwner();

  const acquired = db.transaction(() => {
    recoverExpiredJobLeases();
    const active = db
      .prepare(
        `SELECT id FROM job_runs
         WHERE status = 'running'
           AND lease_expires_at IS NOT NULL
           AND lease_expires_at >= ?
         LIMIT 1`
      )
      .get(ts) as { id: number } | undefined;
    if (active) return null;

    const result = db
      .prepare(
        `INSERT INTO job_runs (
           job_type, trigger, status, started_at, lease_owner, lease_expires_at
         ) VALUES (?, ?, 'running', ?, ?, ?)`
      )
      .run(JOB_TYPE_SYNC_ANALYZE, trigger, ts, owner, expires);

    return db
      .prepare(`SELECT * FROM job_runs WHERE id = ?`)
      .get(Number(result.lastInsertRowid)) as JobRunRow;
  })();

  return acquired;
}

export function heartbeatJobRun(runId: number): void {
  const db = getDb();
  const expires = new Date(Date.now() + JOB_LEASE_MS).toISOString();
  db.prepare(
    `UPDATE job_runs SET lease_expires_at = ? WHERE id = ? AND status = 'running'`
  ).run(expires, runId);
}

export function finishJobRun(
  runId: number,
  status: Exclude<JobStatus, "running">,
  summary?: JobRunSummary | null,
  errorMessage?: string | null
): void {
  const db = getDb();
  db.prepare(
    `UPDATE job_runs
     SET status = ?,
         finished_at = ?,
         summary_json = ?,
         error_message = ?,
         lease_expires_at = NULL
     WHERE id = ?`
  ).run(
    status,
    nowIso(),
    summary ? JSON.stringify(summary) : null,
    errorMessage ?? null,
    runId
  );
}

export function addJobRunItem(input: {
  runId: number;
  itemKind: string;
  status: string;
  title?: string | null;
  message?: string | null;
  externalRef?: string | null;
  payload?: unknown;
}): number {
  const db = getDb();
  const result = db
    .prepare(
      `INSERT INTO job_run_items (
         run_id, item_kind, external_ref, title, status, message, payload_json, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      input.runId,
      input.itemKind,
      input.externalRef ?? null,
      input.title ?? null,
      input.status,
      input.message ?? null,
      input.payload != null ? JSON.stringify(input.payload) : null,
      nowIso()
    );
  return Number(result.lastInsertRowid);
}

export function listJobRuns(limit = 20, offset = 0): {
  runs: JobRunRow[];
  total: number;
} {
  const db = getDb();
  const runs = db
    .prepare(
      `SELECT * FROM job_runs ORDER BY started_at DESC, id DESC LIMIT ? OFFSET ?`
    )
    .all(limit, offset) as JobRunRow[];
  const total = (
    db.prepare(`SELECT COUNT(*) as c FROM job_runs`).get() as { c: number }
  ).c;
  return { runs, total };
}

export function getJobRunById(id: number): JobRunRow | null {
  const db = getDb();
  return (
    (db.prepare(`SELECT * FROM job_runs WHERE id = ?`).get(id) as
      | JobRunRow
      | undefined) ?? null
  );
}

export function listJobRunItems(runId: number, limit = 200): JobRunItemRow[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT * FROM job_run_items
       WHERE run_id = ?
       ORDER BY id ASC
       LIMIT ?`
    )
    .all(runId, limit) as JobRunItemRow[];
}

export function getActiveJobRun(): JobRunRow | null {
  const db = getDb();
  const ts = nowIso();
  return (
    (db
      .prepare(
        `SELECT * FROM job_runs
         WHERE status = 'running'
           AND lease_expires_at IS NOT NULL
           AND lease_expires_at >= ?
         ORDER BY id DESC
         LIMIT 1`
      )
      .get(ts) as JobRunRow | undefined) ?? null
  );
}

export function isJobRunning(): boolean {
  return getActiveJobRun() != null;
}

export type AnalysisClaim = {
  documentId: number;
  contentHash: string | null;
  title: string | null;
  attempts: number;
};

/**
 * Claim up to `limit` documents for analysis. Marks them processing.
 */
export function claimPendingDocumentsForAnalysis(
  limit: number,
  now = new Date()
): AnalysisClaim[] {
  const db = getDb();
  const ts = now.toISOString();
  recoverExpiredAnalysisClaims(now);

  return db.transaction(() => {
    const rows = db
      .prepare(
        `SELECT d.id, d.content_hash, d.title, COALESCE(s.analysis_attempts, 0) as attempts
         FROM paperless_documents d
         LEFT JOIN document_summaries s ON s.document_id = d.id
         WHERE COALESCE(d.sync_status, 'synced') != 'missing'
           AND (
             s.id IS NULL
             OR (
               s.analysis_status IN ('pending', 'stale', 'error')
               AND COALESCE(s.analysis_attempts, 0) < ?
               AND (s.analysis_next_retry_at IS NULL OR s.analysis_next_retry_at <= ?)
             )
           )
         ORDER BY d.id
         LIMIT ?`
      )
      .all(MAX_ANALYSIS_ATTEMPTS, ts, limit) as Array<{
      id: number;
      content_hash: string | null;
      title: string | null;
      attempts: number;
    }>;

    const claimed: AnalysisClaim[] = [];
    for (const row of rows) {
      const existing = db
        .prepare(`SELECT id, analysis_attempts FROM document_summaries WHERE document_id = ?`)
        .get(row.id) as { id: number; analysis_attempts: number } | undefined;

      if (!existing) {
        db.prepare(
          `INSERT INTO document_summaries (
             document_id, analysis_status, analysis_attempts, analysis_claimed_at,
             analysis_claim_hash, created_at, updated_at
           ) VALUES (?, 'processing', 1, ?, ?, ?, ?)`
        ).run(row.id, ts, row.content_hash, ts, ts);
        claimed.push({
          documentId: row.id,
          contentHash: row.content_hash,
          title: row.title,
          attempts: 1,
        });
        continue;
      }

      const attempts = (existing.analysis_attempts ?? 0) + 1;
      db.prepare(
        `UPDATE document_summaries
         SET analysis_status = 'processing',
             analysis_attempts = ?,
             analysis_claimed_at = ?,
             analysis_claim_hash = ?,
             analysis_next_retry_at = NULL,
             updated_at = ?
         WHERE document_id = ?`
      ).run(attempts, ts, row.content_hash, ts, row.id);

      claimed.push({
        documentId: row.id,
        contentHash: row.content_hash,
        title: row.title,
        attempts,
      });
    }
    return claimed;
  })();
}

export function releaseAnalysisClaimAsPending(
  documentId: number,
  reason: string
): void {
  const db = getDb();
  const ts = nowIso();
  db.prepare(
    `UPDATE document_summaries
     SET analysis_status = 'pending',
         analysis_claimed_at = NULL,
         analysis_claim_hash = NULL,
         analysis_last_error = ?,
         updated_at = ?
     WHERE document_id = ?`
  ).run(reason, ts, documentId);
}

export function markAnalysisClaimFailed(
  documentId: number,
  errorMessage: string,
  attempts: number,
  retryImmediately = false
): void {
  const db = getDb();
  const ts = nowIso();
  const terminal = attempts >= MAX_ANALYSIS_ATTEMPTS;
  const nextRetry = terminal
    ? null
    : retryImmediately
      ? ts
    : new Date(
        Date.now() + ANALYSIS_RETRY_BASE_MS * Math.pow(2, Math.max(0, attempts - 1))
      ).toISOString();

  db.prepare(
    `UPDATE document_summaries
     SET analysis_status = ?,
         analysis_claimed_at = NULL,
         analysis_claim_hash = NULL,
         analysis_next_retry_at = ?,
         analysis_last_error = ?,
         short_summary = CASE
           WHEN analysis_status = 'processing' THEN ?
           ELSE short_summary
         END,
         updated_at = ?
     WHERE document_id = ?`
  ).run(
    terminal ? "error" : "pending",
    nextRetry,
    errorMessage,
    `Analysefehler: ${errorMessage}`,
    ts,
    documentId
  );
}

export function countIncompleteAnalyses(): number {
  const db = getDb();
  return (
    db
      .prepare(
        `SELECT COUNT(*) as c
         FROM paperless_documents d
         LEFT JOIN document_summaries s ON s.document_id = d.id
         WHERE COALESCE(d.sync_status, 'synced') != 'missing'
           AND (s.id IS NULL OR s.analysis_status != 'completed')`
      )
      .get() as { c: number }
  ).c;
}

/**
 * A later initial-ingestion retry gets a fresh bounded retry budget for
 * terminal failures. This keeps initialization self-healing without creating
 * an endless tight loop inside one run.
 */
export function resetTerminalAnalysisErrorsForInitial(): number {
  const db = getDb();
  const ts = nowIso();
  const result = db
    .prepare(
      `UPDATE document_summaries
       SET analysis_status = 'pending',
           analysis_attempts = 0,
           analysis_next_retry_at = NULL,
           updated_at = ?
       WHERE analysis_status = 'error'
         AND analysis_attempts >= ?`
    )
    .run(ts, MAX_ANALYSIS_ATTEMPTS);
  return result.changes;
}

export function getDocumentContentHash(documentId: number): string | null {
  const db = getDb();
  const row = db
    .prepare(`SELECT content_hash FROM paperless_documents WHERE id = ?`)
    .get(documentId) as { content_hash: string | null } | undefined;
  return row?.content_hash ?? null;
}

export function clearAnalysisClaimOnSuccess(documentId: number): void {
  const db = getDb();
  const ts = nowIso();
  db.prepare(
    `UPDATE document_summaries
     SET analysis_claimed_at = NULL,
         analysis_claim_hash = NULL,
         analysis_next_retry_at = NULL,
         analysis_last_error = NULL,
         updated_at = ?
     WHERE document_id = ?`
  ).run(ts, documentId);
}

export function listLocalActivePaperlessIds(): number[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT paperless_id FROM paperless_documents
       WHERE COALESCE(sync_status, 'synced') != 'missing'`
    )
    .all() as { paperless_id: number }[];
  return rows.map((r) => r.paperless_id);
}

export function markDocumentsMissing(paperlessIds: number[]): number {
  if (paperlessIds.length === 0) return 0;
  const db = getDb();
  const ts = nowIso();
  const stmt = db.prepare(
    `UPDATE paperless_documents
     SET sync_status = 'missing', updated_at = ?
     WHERE paperless_id = ? AND COALESCE(sync_status, 'synced') != 'missing'`
  );
  let changed = 0;
  const tx = db.transaction(() => {
    for (const id of paperlessIds) {
      changed += stmt.run(ts, id).changes;
    }
  });
  tx();
  return changed;
}

export function restoreDocumentIfPresent(paperlessId: number): void {
  const db = getDb();
  const ts = nowIso();
  db.prepare(
    `UPDATE paperless_documents
     SET sync_status = 'synced', updated_at = ?
     WHERE paperless_id = ? AND sync_status = 'missing'`
  ).run(ts, paperlessId);
}
