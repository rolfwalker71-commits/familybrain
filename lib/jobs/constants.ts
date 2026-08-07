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
/** Per-batch size when draining Paperless → Qdrant embeddings. */
export const PAPERLESS_EMBED_BATCH_SIZE = 50;
/** Max Paperless docs to embed per job run (multiple batches). */
export const MAX_PAPERLESS_EMBED_PER_RUN = 250;
/** Max Trilium notes to embed per job run. */
export const MAX_TRILIUM_EMBED_PER_RUN = 200;
export const INITIAL_RETRY_INTERVAL_MS = 5 * 60 * 1000;
export const ANALYSIS_RETRY_BASE_MS = 5 * 60 * 1000;

export const JOB_TYPE_SYNC_ANALYZE = "sync_analyze";
/** Drain pending document AI analysis only (no Paperless sync). */
export const JOB_TYPE_ANALYZE_PENDING = "analyze_pending";
/** Generate AI icons for documents that still miss one. */
export const JOB_TYPE_AI_ICONS_MISSING = "ai_icons_missing";
/** Force-regenerate AI icons for all analyzed documents. */
export const JOB_TYPE_AI_ICONS_REGENERATE = "ai_icons_regenerate";
/** Re-push completed analyses to Paperless custom fields/tags. */
export const JOB_TYPE_PAPERLESS_WRITEBACK = "paperless_writeback";
/** Mirror Paperless PDFs into Google Drive folder BUDDY. */
export const JOB_TYPE_DRIVE_MIRROR = "drive_mirror";

export const BACKGROUND_JOB_TYPES = [
  JOB_TYPE_SYNC_ANALYZE,
  JOB_TYPE_ANALYZE_PENDING,
  JOB_TYPE_AI_ICONS_MISSING,
  JOB_TYPE_AI_ICONS_REGENERATE,
  JOB_TYPE_PAPERLESS_WRITEBACK,
  JOB_TYPE_DRIVE_MIRROR,
] as const;

export type BackgroundJobType = (typeof BACKGROUND_JOB_TYPES)[number];

export function isBackgroundJobType(value: unknown): value is BackgroundJobType {
  return (
    typeof value === "string" &&
    (BACKGROUND_JOB_TYPES as readonly string[]).includes(value)
  );
}

export function jobTypeLabel(jobType: string): string {
  switch (jobType) {
    case JOB_TYPE_SYNC_ANALYZE:
      return "Sync & Analyse";
    case JOB_TYPE_ANALYZE_PENDING:
      return "AI-Analyse";
    case JOB_TYPE_AI_ICONS_MISSING:
      return "KI-Icons (fehlend)";
    case JOB_TYPE_AI_ICONS_REGENERATE:
      return "KI-Icons (alle neu)";
    case JOB_TYPE_PAPERLESS_WRITEBACK:
      return "Paperless-Writeback";
    case JOB_TYPE_DRIVE_MIRROR:
      return "Drive-Spiegel (BUDDY)";
    default:
      return jobType;
  }
}

/** Per-document batch sizes inside durable background runners. */
export const ANALYZE_PENDING_BATCH_SIZE = 10;
export const AI_ICONS_MISSING_BATCH_SIZE = 5;
export const PAPERLESS_WRITEBACK_BATCH_SIZE = 25;
/** Docs per Drive mirror batch inside one job run. */
export const DRIVE_MIRROR_BATCH_SIZE = 8;
/** Max docs mirrored per job run. */
export const MAX_DRIVE_MIRROR_PER_RUN = 40;

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
