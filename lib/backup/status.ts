import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

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

type StatusFile = {
  lastSnapshotAt?: string | null;
  lastCheckAt?: string | null;
  lastCheckOk?: boolean | null;
  restoreProofAt?: string | null;
  repository?: string | null;
  summary?: string | null;
  notes?: string[];
  startedAt?: string | null;
  finishedAt?: string | null;
  durationSeconds?: number | null;
  snapshotId?: string | null;
  filesNew?: number | null;
  filesChanged?: number | null;
  filesUnmodified?: number | null;
  dataAdded?: number | null;
  dataAddedPacked?: number | null;
  totalBytesProcessed?: number | null;
  logTail?: string | null;
  recentActions?: unknown;
};

const EMPTY_METRICS = {
  startedAt: null as string | null,
  finishedAt: null as string | null,
  durationSeconds: null as number | null,
  snapshotId: null as string | null,
  filesNew: null as number | null,
  filesChanged: null as number | null,
  filesUnmodified: null as number | null,
  dataAdded: null as number | null,
  dataAddedPacked: null as number | null,
  totalBytesProcessed: null as number | null,
  logTail: null as string | null,
  recentActions: [] as BackupRunAction[],
};

function dataRoot(): string {
  return process.env.BUDDY_DATA_DIR || join(process.cwd(), "data");
}

function statusFilePath(): string {
  return (
    process.env.BUDDY_BACKUP_STATUS_FILE ||
    join(dataRoot(), "backup-status.json")
  );
}

function parseIso(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const t = Date.parse(value);
  return Number.isFinite(t) ? new Date(t).toISOString() : value.trim();
}

function parseNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function parseAction(raw: unknown): BackupRunAction | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const at = parseIso(o.at) || parseIso(o.finishedAt) || parseIso(o.startedAt);
  if (!at) return null;
  const kind =
    typeof o.kind === "string" && o.kind.trim() ? o.kind.trim() : "backup";
  return {
    at,
    kind,
    ok: o.ok !== false,
    summary: typeof o.summary === "string" ? o.summary : null,
    startedAt: parseIso(o.startedAt),
    finishedAt: parseIso(o.finishedAt),
    durationSeconds: parseNumber(o.durationSeconds),
    snapshotId: typeof o.snapshotId === "string" ? o.snapshotId : null,
    filesNew: parseNumber(o.filesNew),
    filesChanged: parseNumber(o.filesChanged),
    filesUnmodified: parseNumber(o.filesUnmodified),
    dataAdded: parseNumber(o.dataAdded),
    dataAddedPacked: parseNumber(o.dataAddedPacked),
    totalBytesProcessed: parseNumber(o.totalBytesProcessed),
    logTail: typeof o.logTail === "string" ? o.logTail : null,
  };
}

function parseRecentActions(raw: unknown): BackupRunAction[] {
  if (!Array.isArray(raw)) return [];
  const out: BackupRunAction[] = [];
  for (const item of raw) {
    const a = parseAction(item);
    if (a) out.push(a);
    if (out.length >= 20) break;
  }
  return out;
}

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

export function getBackupStatus(): BackupStatusPayload {
  const runbookPath = "docs/backup-restic.md";
  const jsonExportsNote =
    "JSON-Export in TravelBuddy/FinanzBuddy ist kein vollständiges Disaster-Recovery — nur Moduldaten.";

  const file = statusFilePath();
  if (existsSync(file)) {
    try {
      const raw = JSON.parse(readFileSync(file, "utf8")) as StatusFile;
      const lastSnapshotAt = parseIso(raw.lastSnapshotAt);
      const lastCheckAt = parseIso(raw.lastCheckAt);
      const lastCheckOk =
        typeof raw.lastCheckOk === "boolean" ? raw.lastCheckOk : null;
      const restoreProofAt = parseIso(raw.restoreProofAt);
      const notes = Array.isArray(raw.notes)
        ? raw.notes.map(String).filter(Boolean)
        : [];
      const recentActions = parseRecentActions(raw.recentActions);
      const ok =
        Boolean(lastSnapshotAt) &&
        (lastCheckOk === null || lastCheckOk === true);
      return {
        source: "status-file",
        ok,
        summary:
          raw.summary?.trim() ||
          (ok
            ? "Backup-Statusdatei vorhanden."
            : "Backup-Status unvollständig oder Check fehlgeschlagen."),
        lastSnapshotAt,
        lastCheckAt,
        lastCheckOk,
        restoreProofAt,
        repository: raw.repository?.trim() || null,
        startedAt: parseIso(raw.startedAt),
        finishedAt: parseIso(raw.finishedAt) || lastSnapshotAt,
        durationSeconds: parseNumber(raw.durationSeconds),
        snapshotId:
          typeof raw.snapshotId === "string" ? raw.snapshotId : null,
        filesNew: parseNumber(raw.filesNew),
        filesChanged: parseNumber(raw.filesChanged),
        filesUnmodified: parseNumber(raw.filesUnmodified),
        dataAdded: parseNumber(raw.dataAdded),
        dataAddedPacked: parseNumber(raw.dataAddedPacked),
        totalBytesProcessed: parseNumber(raw.totalBytesProcessed),
        logTail: typeof raw.logTail === "string" ? raw.logTail : null,
        recentActions,
        notes,
        runbookPath,
        jsonExportsNote,
      };
    } catch {
      /* fall through */
    }
  }

  const dataDir = dataRoot();
  if (existsSync(dataDir)) {
    try {
      const st = statSync(dataDir);
      return {
        source: "data-dir",
        ok: false,
        summary:
          "Keine backup-status.json — restic-Status noch nicht gemeldet. Lokales data/-Verzeichnis ist vorhanden.",
        lastSnapshotAt: st.mtime.toISOString(),
        lastCheckAt: null,
        lastCheckOk: null,
        restoreProofAt: null,
        repository: null,
        ...EMPTY_METRICS,
        notes: [
          `Lege ${file} an (Cron nach restic backup/check), siehe Runbook.`,
        ],
        runbookPath,
        jsonExportsNote,
      };
    } catch {
      /* fall through */
    }
  }

  return {
    source: "none",
    ok: false,
    summary: "Kein Backup-Status und kein data/-Verzeichnis gefunden.",
    lastSnapshotAt: null,
    lastCheckAt: null,
    lastCheckOk: null,
    restoreProofAt: null,
    repository: null,
    ...EMPTY_METRICS,
    notes: ["Siehe docs/backup-restic.md für Betrieb auf der VM."],
    runbookPath,
    jsonExportsNote,
  };
}
