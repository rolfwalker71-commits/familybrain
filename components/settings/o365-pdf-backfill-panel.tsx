"use client";

import { useCallback, useEffect, useState } from "react";
import { FileStack, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { IconCircle } from "@/components/layout/icon-circle";

type LiveProgress = {
  active: boolean;
  step: string;
  subject: string | null;
  receivedDateTime: string | null;
  messageIndex: number;
  messageTotal: number;
  pdfsUploadedThisBatch: number;
  pdfsMaxThisBatch: number;
  detail: string | null;
  updatedAt: string;
};

type BackfillStatus = {
  enabled: boolean;
  sinceYmd: string;
  hasCursor: boolean;
  lastRunAt: string | null;
  lastAttemptAt: string | null;
  lastError: string | null;
  lastNote: string | null;
  complete: boolean;
  phase: "idle" | "queued" | "running_or_waiting" | "error" | "complete";
  documentsFromO365: number;
  live: LiveProgress | null;
  stats: {
    messagesSeen: number;
    messagesWithPdf?: number;
    pdfsUploaded: number;
    pdfsSkipped: number;
    pdfsFailed: number;
  };
  job?: {
    o365Running: boolean;
    otherRunning: boolean;
    activeLabel: string | null;
  };
  scheduler?: {
    enabled: boolean;
    intervalMinutes: number;
    nextTickAt: string | null;
  };
};

function phaseLabel(status: BackfillStatus): string {
  if (status.live?.active) return "Batch arbeitet…";
  if (status.job?.o365Running) return "Batch läuft gerade…";
  if (status.job?.otherRunning) {
    return `Wartet — anderer Job aktiv (${status.job.activeLabel || "?"})`;
  }
  if (status.lastError) return "Fehler (siehe unten)";
  if (status.complete) return "Crawl fertig";
  if (status.enabled || status.hasCursor) {
    if (!status.lastRunAt && !status.lastAttemptAt) {
      return "Warteschlange an — noch kein Batch gestartet/beendet";
    }
    if (!status.lastRunAt && status.lastAttemptAt) {
      return "Versuch lief — Batch noch ohne Erfolg (Fehler oder Abbruch)";
    }
    return "Crawl aktiv — nächster Batch per Scheduler / «Weiter»";
  }
  return "Pausiert / idle";
}

function fmtTs(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("de-CH");
  } catch {
    return iso;
  }
}

function fmtMailDate(iso: string | null | undefined): string {
  if (!iso) return "ohne Datum";
  try {
    return new Date(iso).toLocaleString("de-CH", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

function ProgressBar(props: {
  value: number;
  max: number;
  label: string;
}) {
  const max = Math.max(1, props.max);
  const pct = Math.min(100, Math.round((props.value / max) * 100));
  return (
    <div className="space-y-1">
      <div className="flex justify-between gap-2 text-[11px] text-muted-foreground">
        <span>{props.label}</span>
        <span>
          {props.value}/{props.max} ({pct}%)
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-[var(--brand-docs,#0d9488)] transition-[width] duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export function O365PdfBackfillPanel() {
  const [status, setStatus] = useState<BackfillStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [sinceYmd, setSinceYmd] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/buddy/o365-pdf-backfill");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Status laden fehlgeschlagen");
      setStatus(json as BackfillStatus);
      setSinceYmd((json as BackfillStatus).sinceYmd);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const live = Boolean(status?.live?.active || status?.job?.o365Running);
    const t = window.setInterval(() => void load(), live ? 1_500 : 5_000);
    return () => window.clearInterval(t);
  }, [load, status?.live?.active, status?.job?.o365Running]);

  async function saveSince() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/buddy/o365-pdf-backfill", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sinceYmd, resetStats: true }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Speichern fehlgeschlagen");
      setStatus(json as BackfillStatus);
      setMsg(
        "Zeitraum gesetzt — Crawl-Zähler genullt. «Docs in Buddy» bleibt. Danach Batch starten."
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function startBackfill() {
    setBusy(true);
    setError(null);
    setMsg(null);
    try {
      await fetch("/api/buddy/o365-pdf-backfill", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled: true,
          sinceYmd: sinceYmd || undefined,
        }),
      });
      const res = await fetch("/api/jobs/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobType: "o365_pdf_backfill" }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Job starten fehlgeschlagen");
      setMsg("Batch gestartet — Live-Fortschritt aktualisiert sich unten.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function stopBackfill() {
    setBusy(true);
    try {
      const res = await fetch("/api/buddy/o365-pdf-backfill", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: false }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Stoppen fehlgeschlagen");
      setStatus(json as BackfillStatus);
      setMsg("Backfill pausiert (Cursor bleibt erhalten).");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const live = status?.live?.active ? status.live : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-3">
          <IconCircle icon={FileStack} tone="teal" size="sm" />
          O365-PDFs → Paperless
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <p className="text-muted-foreground">
          PDF-Anhänge aus Outlook nach Paperless (Tags{" "}
          <span className="font-medium text-foreground">
            O365 · ANG · geschäftlich
          </span>
          ). Catch-up läuft in Blöcken (bis ~400 Mails / 40 neue PDFs) und
          verkettet sich automatisch alle paar Sekunden — nicht nur alle
          Scheduler-Minuten. Hochgeladen werden nur PDFs. Manuelle Imports
          zählen unter{" "}
          <span className="font-medium text-foreground">Docs in Buddy</span>,
          nicht unter den Crawl-Batch-Zählern.
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
            <div className="flex flex-wrap items-end gap-2">
              <label className="block space-y-1 text-xs">
                <span className="font-medium text-muted-foreground">
                  Ab Datum (YYYY-MM-DD)
                </span>
                <input
                  type="date"
                  className="h-9 rounded-lg border border-border bg-background px-2 text-sm"
                  value={sinceYmd}
                  onChange={(e) => setSinceYmd(e.target.value)}
                  disabled={busy}
                />
              </label>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={busy || !sinceYmd}
                onClick={() => void saveSince()}
              >
                Zeitraum setzen
              </Button>
            </div>

            {live ? (
              <div className="space-y-2.5 rounded-lg border border-teal-600/30 bg-teal-500/5 px-3 py-3 text-xs">
                <p className="font-medium text-foreground">
                  Gerade aktiv
                  <span className="ml-2 font-normal text-muted-foreground">
                    (aktualisiert ~1,5 s)
                  </span>
                </p>
                <p className="text-sm text-foreground">
                  <span className="text-muted-foreground">Mail: </span>
                  {live.subject || "—"}
                </p>
                <p className="text-muted-foreground">
                  Empfangen: {fmtMailDate(live.receivedDateTime)}
                  {live.detail ? ` · ${live.detail}` : ""}
                </p>
                {live.messageTotal > 0 ? (
                  <ProgressBar
                    label="Mails in diesem Lauf"
                    value={live.messageIndex}
                    max={live.messageTotal}
                  />
                ) : (
                  <div className="h-2 animate-pulse rounded-full bg-muted" />
                )}
                <ProgressBar
                  label="PDFs neu (Lauf-Limit)"
                  value={live.pdfsUploadedThisBatch}
                  max={live.pdfsMaxThisBatch}
                />
              </div>
            ) : null}

            <div className="space-y-1.5 rounded-lg border border-border/60 bg-muted/20 px-3 py-2.5 text-xs">
              <p className="font-medium text-foreground">
                Status: {phaseLabel(status)}
              </p>
              <p className="text-muted-foreground">
                <span className="font-medium text-foreground">
                  Docs in Buddy (O365): {status.documentsFromO365}
                </span>
                {" · "}
                Crawl — Mails: {status.stats.messagesSeen} · mit PDF:{" "}
                {status.stats.messagesWithPdf ?? 0} · neu:{" "}
                {status.stats.pdfsUploaded} · übersprungen:{" "}
                {status.stats.pdfsSkipped} · Fehler: {status.stats.pdfsFailed}
              </p>
              <p className="text-muted-foreground">
                Letzter erfolgreicher Batch: {fmtTs(status.lastRunAt)}
                {" · "}
                Letzter Versuch: {fmtTs(status.lastAttemptAt)}
                {status.scheduler
                  ? ` · Scheduler ${status.scheduler.enabled ? "an" : "aus"} (${status.scheduler.intervalMinutes} Min)`
                  : ""}
              </p>
              {status.lastNote ? (
                <p className="text-foreground/90">{status.lastNote}</p>
              ) : null}
              {status.lastError ? (
                <p className="text-destructive">{status.lastError}</p>
              ) : null}
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                disabled={
                  busy ||
                  Boolean(status.job?.o365Running) ||
                  Boolean(live)
                }
                onClick={() => void startBackfill()}
              >
                {live || status.job?.o365Running
                  ? "Batch läuft…"
                  : status.enabled || status.hasCursor
                    ? "Weiter / Batch starten"
                    : "Backfill starten"}
              </Button>
              {status.enabled || status.hasCursor ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() => void stopBackfill()}
                >
                  Pausieren
                </Button>
              ) : null}
              <Button
                type="button"
                size="sm"
                variant="ghost"
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
