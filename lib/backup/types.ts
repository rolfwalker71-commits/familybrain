export type BackupActionKind =
  | "backup"
  | "forget"
  | "check"
  | "error"
  | string;

export type BackupRunAction = {
  at: string;
  kind: BackupActionKind;
  ok: boolean;
  summary?: string | null;
  startedAt?: string | null;
  finishedAt?: string | null;
  durationSeconds?: number | null;
  snapshotId?: string | null;
  filesNew?: number | null;
  filesChanged?: number | null;
  filesUnmodified?: number | null;
  /** Bytes newly stored (uncompressed logical) */
  dataAdded?: number | null;
  /** Bytes after packing/compression in repo */
  dataAddedPacked?: number | null;
  totalBytesProcessed?: number | null;
  /** Last lines of that run's log */
  logTail?: string | null;
};

export type BackupStatusPayload = {
  source: "status-file" | "data-dir" | "none";
  ok: boolean;
  summary: string;
  lastSnapshotAt: string | null;
  lastCheckAt: string | null;
  lastCheckOk: boolean | null;
  restoreProofAt: string | null;
  repository: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  durationSeconds: number | null;
  snapshotId: string | null;
  filesNew: number | null;
  filesChanged: number | null;
  filesUnmodified: number | null;
  dataAdded: number | null;
  dataAddedPacked: number | null;
  totalBytesProcessed: number | null;
  logTail: string | null;
  /** Newest first, max 20 */
  recentActions: BackupRunAction[];
  notes: string[];
  runbookPath: string;
  jsonExportsNote: string;
};

export function formatBackupBytes(bytes: number | null | undefined): string {
  if (bytes == null || !Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  const units = ["KiB", "MiB", "GiB", "TiB"];
  let v = bytes / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${v < 10 ? v.toFixed(2) : v < 100 ? v.toFixed(1) : Math.round(v)} ${units[i]}`;
}
