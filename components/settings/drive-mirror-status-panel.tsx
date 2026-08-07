"use client";

import { useCallback, useEffect, useState } from "react";
import { HardDrive, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { IconCircle } from "@/components/layout/icon-circle";

type DriveStatus = {
  enabled: boolean;
  hasDriveScope: boolean;
  connected: boolean;
  rootFolderName: string;
  totalDocuments: number;
  mirrored: number;
  pending: number;
  percent: number;
  complete: boolean;
  lastRunAt: string | null;
  lastError: string | null;
};

export function DriveMirrorStatusPanel() {
  const [status, setStatus] = useState<DriveStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/buddy/drive-mirror");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Status laden fehlgeschlagen");
      setStatus(json as DriveStatus);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const t = window.setInterval(() => void load(), 15_000);
    return () => window.clearInterval(t);
  }, [load]);

  async function toggleEnabled(enabled: boolean) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/buddy/drive-mirror", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Speichern fehlgeschlagen");
      setStatus(json as DriveStatus);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function startMigration() {
    setBusy(true);
    setError(null);
    setMsg(null);
    try {
      const res = await fetch("/api/jobs/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobType: "drive_mirror" }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Job starten fehlgeschlagen");
      setMsg(
        "Drive-Migration gestartet — läuft im Hintergrund (mehrere Läufe bis 100 %)."
      );
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-3">
          <IconCircle icon={HardDrive} tone="teal" size="sm" />
          Drive-Spiegel · Ordner {status?.rootFolderName || "BUDDY"}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <p className="text-muted-foreground">
          Paperless-PDFs werden nach Google Drive gespiegelt (
          <span className="font-medium text-foreground">
            BUDDY/Jahr/Rubrik/…
          </span>
          ). Der Stand bleibt sichtbar — auch wenn alles synchron ist.
        </p>

        {loading && !status ? (
          <p className="text-muted-foreground">Lade…</p>
        ) : null}
        {error ? (
          <p className="text-destructive" role="alert">
            {error}
          </p>
        ) : null}
        {msg ? (
          <p className="text-emerald-700" role="status">
            {msg}
          </p>
        ) : null}

        {status ? (
          <>
            <div className="space-y-1.5">
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-medium text-foreground">
                  Migration {status.mirrored}/{status.totalDocuments}
                </span>
                <span className="tabular-nums text-muted-foreground">
                  {status.percent}%
                  {status.complete ? " · vollständig" : ""}
                </span>
              </div>
              <div
                className="h-2.5 overflow-hidden rounded-full bg-muted"
                role="progressbar"
                aria-valuenow={status.percent}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <div
                  className="h-full rounded-full bg-[var(--brand-docs)] transition-[width]"
                  style={{ width: `${status.percent}%` }}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Ausstehend: {status.pending}
                {status.lastRunAt
                  ? ` · letzter Lauf ${new Date(status.lastRunAt).toLocaleString("de-CH")}`
                  : " · noch kein Lauf"}
              </p>
              {status.lastError ? (
                <p className="text-xs text-amber-800">
                  Letzter Fehler: {status.lastError}
                </p>
              ) : null}
            </div>

            {!status.connected ? (
              <p className="text-amber-800">
                Google nicht verbunden — unter «Mein Google-Konto» verbinden.
              </p>
            ) : !status.hasDriveScope ? (
              <p className="text-amber-800">
                Drive-Recht fehlt — Google <strong>neu verbinden</strong> (Scope
                drive.file).
              </p>
            ) : null}

            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                className="accent-[var(--brand-docs)]"
                checked={status.enabled}
                disabled={busy}
                onChange={(e) => void toggleEnabled(e.target.checked)}
              />
              <span>Neue Dokumente automatisch nach Drive spiegeln</span>
            </label>

            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                disabled={
                  busy ||
                  !status.connected ||
                  !status.hasDriveScope ||
                  !status.enabled
                }
                onClick={() => void startMigration()}
              >
                {status.complete
                  ? "Erneut prüfen / Rest syncen"
                  : "Migration starten"}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => void load()}
              >
                <RefreshCw className="size-3.5" />
                Aktualisieren
              </Button>
            </div>
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}
