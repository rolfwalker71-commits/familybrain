"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronDown, HardDrive, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  formatBackupBytes,
  type BackupRunAction,
  type BackupStatusPayload,
} from "@/lib/backup/types";
import { cn } from "@/lib/utils";
import { toSwissDate } from "@/lib/utils/dates";

function fmtWhen(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    if (!Number.isFinite(d.getTime())) return iso;
    return `${toSwissDate(iso.slice(0, 10))} ${d.toLocaleTimeString("de-CH", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })}`;
  } catch {
    return iso;
  }
}

function fmtDuration(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return "—";
  const s = Math.round(seconds);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  if (m < 60) return `${m}m ${rem}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

function actionLabel(kind: string): string {
  switch (kind) {
    case "backup":
      return "Backup";
    case "forget":
      return "Forget/Prune";
    case "check":
      return "Check";
    case "error":
      return "Fehler";
    default:
      return kind;
  }
}

function ActionRow({ action }: { action: BackupRunAction }) {
  return (
    <li className="border-b border-border/50 py-2 last:border-0">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={action.ok ? "secondary" : "outline"}>
          {action.ok ? "OK" : "Fail"}
        </Badge>
        <span className="text-xs font-medium">{actionLabel(action.kind)}</span>
        <span className="text-xs tabular-nums text-muted-foreground">
          {fmtWhen(action.at)}
        </span>
        {action.durationSeconds != null ? (
          <span className="text-xs text-muted-foreground">
            · {fmtDuration(action.durationSeconds)}
          </span>
        ) : null}
      </div>
      <p className="mt-0.5 text-xs text-muted-foreground">
        {action.summary || "—"}
        {action.snapshotId ? (
          <>
            {" "}
            · <code className="text-[10px]">{action.snapshotId.slice(0, 12)}</code>
          </>
        ) : null}
      </p>
      {(action.dataAdded != null || action.totalBytesProcessed != null) && (
        <p className="mt-0.5 text-xs tabular-nums text-muted-foreground">
          Neu: {formatBackupBytes(action.dataAdded)}
          {action.dataAddedPacked != null
            ? ` (${formatBackupBytes(action.dataAddedPacked)} packed)`
            : ""}
          {action.totalBytesProcessed != null
            ? ` · gelesen: ${formatBackupBytes(action.totalBytesProcessed)}`
            : ""}
          {action.filesNew != null
            ? ` · Dateien +${action.filesNew}/~${action.filesChanged ?? 0}`
            : ""}
        </p>
      )}
    </li>
  );
}

function headerWhen(data: BackupStatusPayload | null): string {
  if (!data) return "";
  return fmtWhen(data.finishedAt || data.lastSnapshotAt || data.startedAt);
}

export function BackupStatusPanel() {
  const [data, setData] = useState<BackupStatusPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showLog, setShowLog] = useState(false);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/backup-status");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Laden fehlgeschlagen");
      setData(json as BackupStatusPayload);
    } catch (err) {
      setData(null);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const when = headerWhen(data);

  return (
    <Card className="border-border/70">
      <CardContent className="p-4">
        <div className="flex items-start gap-2">
          <Button
            type="button"
            variant="ghost"
            className="flex h-auto min-w-0 flex-1 items-start gap-2 rounded-md p-0 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
          >
            <HardDrive className="mt-0.5 size-4 shrink-0 text-[var(--brand-settings)]" />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-semibold">Backup-Status (restic)</p>
                {error ? (
                  <Badge variant="outline">Fehler</Badge>
                ) : loading && !data ? (
                  <span className="text-xs text-muted-foreground">Lädt…</span>
                ) : data ? (
                  <Badge variant={data.ok ? "secondary" : "outline"}>
                    {data.ok ? "OK" : "Prüfen"}
                  </Badge>
                ) : null}
                {!open && when ? (
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {when}
                  </span>
                ) : null}
              </div>
              {open ? (
                <p className="text-xs text-muted-foreground">
                  Betriebsstatus der VM-Sicherung — getrennt von Modul-JSON-Exporten.
                </p>
              ) : null}
            </div>
            <ChevronDown
              className={cn(
                "mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform",
                open && "rotate-180"
              )}
              aria-hidden
            />
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="shrink-0"
            disabled={loading}
            onClick={(e) => {
              e.stopPropagation();
              void load();
            }}
          >
            <RefreshCw className="size-3.5 sm:mr-1" />
            <span className="hidden sm:inline">Aktualisieren</span>
          </Button>
        </div>

        {open ? (
          <div className="mt-3 space-y-3">
            {error ? (
              <p className="text-sm text-destructive">{error}</p>
            ) : loading && !data ? (
              <p className="text-sm text-muted-foreground">Lade Status…</p>
            ) : data ? (
              <div className="space-y-3 text-sm">
                <p className="text-muted-foreground">{data.summary}</p>

                <dl className="grid gap-1.5 sm:grid-cols-2">
                  <div>
                    <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">
                      Start
                    </dt>
                    <dd className="tabular-nums">{fmtWhen(data.startedAt)}</dd>
                  </div>
                  <div>
                    <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">
                      Ende
                    </dt>
                    <dd className="tabular-nums">
                      {fmtWhen(data.finishedAt || data.lastSnapshotAt)}
                      {data.durationSeconds != null
                        ? ` · ${fmtDuration(data.durationSeconds)}`
                        : ""}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">
                      Letzter Snapshot
                    </dt>
                    <dd className="tabular-nums">
                      {fmtWhen(data.lastSnapshotAt)}
                      {data.snapshotId ? (
                        <>
                          {" "}
                          ·{" "}
                          <code className="text-[10px]">
                            {data.snapshotId.slice(0, 12)}
                          </code>
                        </>
                      ) : null}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">
                      Letzter Check
                    </dt>
                    <dd className="tabular-nums">
                      {fmtWhen(data.lastCheckAt)}
                      {data.lastCheckOk == null
                        ? ""
                        : data.lastCheckOk
                          ? " · ok"
                          : " · fehlgeschlagen"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">
                      Neu im Repo
                    </dt>
                    <dd className="tabular-nums">
                      {formatBackupBytes(data.dataAdded)}
                      {data.dataAddedPacked != null
                        ? ` (${formatBackupBytes(data.dataAddedPacked)} packed)`
                        : ""}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">
                      Gelesen / Dateien
                    </dt>
                    <dd className="tabular-nums">
                      {formatBackupBytes(data.totalBytesProcessed)}
                      {data.filesNew != null
                        ? ` · +${data.filesNew} neu, ~${data.filesChanged ?? 0} geändert`
                        : ""}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">
                      Restore-Nachweis
                    </dt>
                    <dd className="tabular-nums">
                      {fmtWhen(data.restoreProofAt)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">
                      Repository
                    </dt>
                    <dd className="truncate">{data.repository || "—"}</dd>
                  </div>
                </dl>

                {data.logTail ? (
                  <div className="space-y-1">
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-xs"
                      onClick={() => setShowLog((v) => !v)}
                    >
                      {showLog ? "Log ausblenden" : "Letztes Log anzeigen"}
                    </Button>
                    {showLog ? (
                      <pre className="max-h-48 overflow-auto rounded-md bg-muted/50 p-2 text-[11px] leading-relaxed whitespace-pre-wrap">
                        {data.logTail}
                      </pre>
                    ) : null}
                  </div>
                ) : null}

                <div>
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    Letzte restic-Aktionen
                    {data.recentActions.length > 0
                      ? ` (${Math.min(20, data.recentActions.length)})`
                      : ""}
                  </p>
                  {data.recentActions.length === 0 ? (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Noch keine Historie — erscheint nach dem nächsten Lauf mit
                      aktualisiertem Backup-Skript (siehe Runbook).
                    </p>
                  ) : (
                    <ul className="mt-1 max-h-64 overflow-auto">
                      {data.recentActions.slice(0, 20).map((action, i) => (
                        <ActionRow
                          key={`${action.at}-${action.kind}-${i}`}
                          action={action}
                        />
                      ))}
                    </ul>
                  )}
                </div>

                <p className="text-xs text-muted-foreground">
                  {data.jsonExportsNote}
                </p>
                <p className="text-xs text-muted-foreground">
                  Runbook:{" "}
                  <code className="text-[11px]">{data.runbookPath}</code>
                  {data.notes.length > 0 ? ` · ${data.notes.join(" · ")}` : ""}
                </p>
              </div>
            ) : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
