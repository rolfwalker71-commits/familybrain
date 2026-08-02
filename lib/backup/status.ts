import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

export type BackupStatusPayload = {
  source: "status-file" | "data-dir" | "none";
  ok: boolean;
  summary: string;
  lastSnapshotAt: string | null;
  lastCheckAt: string | null;
  lastCheckOk: boolean | null;
  restoreProofAt: string | null;
  repository: string | null;
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
    notes: ["Siehe docs/backup-restic.md für Betrieb auf der VM."],
    runbookPath,
    jsonExportsNote,
  };
}
