export const SCHEDULER_ENABLED_KEY = "scheduler_enabled";
export const SCHEDULER_INTERVAL_KEY = "scheduler_interval_minutes";
export const SYNC_MODIFIED_CURSOR_KEY = "sync_modified_cursor";
export const SYNC_LAST_ID_RECONCILE_KEY = "sync_last_id_reconcile_at";
export const SYNC_LAST_FULL_RECONCILE_KEY = "sync_last_full_reconcile_at";
export const TRILIUM_SYNC_MODIFIED_CURSOR_KEY = "trilium_sync_modified_cursor";
export const TRILIUM_SYNC_LAST_FULL_RECONCILE_KEY =
  "trilium_sync_last_full_reconcile_at";
export const TRILIUM_INITIAL_SYNC_COMPLETE_KEY = "trilium_initial_sync_complete";
export const INITIAL_SYNC_COMPLETE_KEY = "initial_sync_complete";
export const INITIAL_INGESTION_COMPLETE_KEY = "initial_ingestion_complete";

export const DEFAULT_SCHEDULER_INTERVAL_MINUTES = 30;
export const MIN_SCHEDULER_INTERVAL_MINUTES = 5;
export const MAX_SCHEDULER_INTERVAL_MINUTES = 1440;

/** Overlap window so edge-of-window Paperless edits are not missed. */
export const DELTA_OVERLAP_MS = 2 * 60 * 60 * 1000;

export const ID_RECONCILE_INTERVAL_MS = 24 * 60 * 60 * 1000;
export const FULL_RECONCILE_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;

export const JOB_LEASE_MS = 45 * 60 * 1000;
export const ANALYSIS_CLAIM_LEASE_MS = 20 * 60 * 1000;
export const MAX_ANALYSIS_ATTEMPTS = 3;
export const MAX_ANALYSIS_PER_RUN = 50;
export const INITIAL_ANALYSIS_BATCH_SIZE = 10;
export const INITIAL_RETRY_INTERVAL_MS = 5 * 60 * 1000;
export const ANALYSIS_RETRY_BASE_MS = 5 * 60 * 1000;

export const JOB_TYPE_SYNC_ANALYZE = "sync_analyze";

export function clampSchedulerIntervalMinutes(value: unknown): number {
  const n =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number.parseInt(value, 10)
        : Number.NaN;
  if (!Number.isFinite(n)) return DEFAULT_SCHEDULER_INTERVAL_MINUTES;
  return Math.min(
    MAX_SCHEDULER_INTERVAL_MINUTES,
    Math.max(MIN_SCHEDULER_INTERVAL_MINUTES, Math.round(n))
  );
}

export function parseSchedulerEnabled(value: string | null | undefined): boolean {
  if (value == null || value === "") return true;
  return value === "1" || value.toLowerCase() === "true";
}
