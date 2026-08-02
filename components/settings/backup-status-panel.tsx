"use client";

import { useCallback, useEffect, useState } from "react";
import { HardDrive, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { BackupStatusPayload } from "@/lib/backup/status";
import { toSwissDate } from "@/lib/utils/dates";

function fmtWhen(iso: string | null): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    if (!Number.isFinite(d.getTime())) return iso;
    return `${toSwissDate(iso.slice(0, 10))} ${d.toLocaleTimeString("de-CH", {
      hour: "2-digit",
      minute: "2-digit",
    })}`;
  } catch {
    return iso;
  }
}

export function BackupStatusPanel() {
  const [data, setData] = useState<BackupStatusPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

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

  return (
    <Card className="border-border/70">
      <CardContent className="space-y-3 p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="flex items-start gap-2">
            <HardDrive className="mt-0.5 size-4 text-[var(--brand-settings)]" />
            <div>
              <p className="text-sm font-semibold">Backup-Status (restic)</p>
              <p className="text-xs text-muted-foreground">
                Betriebsstatus der VM-Sicherung — getrennt von Modul-JSON-Exporten.
              </p>
            </div>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={loading}
            onClick={() => void load()}
          >
            <RefreshCw className="mr-1 size-3.5" />
            Aktualisieren
          </Button>
        </div>

        {error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : loading && !data ? (
          <p className="text-sm text-muted-foreground">Lade Status…</p>
        ) : data ? (
          <div className="space-y-2 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={data.ok ? "secondary" : "outline"}>
                {data.ok ? "OK" : "Prüfen"}
              </Badge>
              <span className="text-muted-foreground">{data.summary}</span>
            </div>
            <dl className="grid gap-1.5 sm:grid-cols-2">
              <div>
                <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  Letzter Snapshot
                </dt>
                <dd className="tabular-nums">{fmtWhen(data.lastSnapshotAt)}</dd>
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
                  Restore-Nachweis
                </dt>
                <dd className="tabular-nums">{fmtWhen(data.restoreProofAt)}</dd>
              </div>
              <div>
                <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  Repository
                </dt>
                <dd className="truncate">{data.repository || "—"}</dd>
              </div>
            </dl>
            <p className="text-xs text-muted-foreground">{data.jsonExportsNote}</p>
            <p className="text-xs text-muted-foreground">
              Runbook: <code className="text-[11px]">{data.runbookPath}</code>
              {data.notes.length > 0 ? ` · ${data.notes.join(" · ")}` : ""}
            </p>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
