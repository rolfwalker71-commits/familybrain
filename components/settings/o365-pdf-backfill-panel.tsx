"use client";

import { useCallback, useEffect, useState } from "react";
import { FileStack, RefreshCw, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { IconCircle } from "@/components/layout/icon-circle";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

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

type LogEntry = {
  at: string;
  receivedAt: string | null;
  receivedYmd: string | null;
  subject: string;
  outcome: string;
  pdfNew?: number;
  pdfFailed?: number;
  detail?: string | null;
};

type LiveSyncStatus = {
  enabled: boolean;
  intervalMinutes: number;
  watermark: string | null;
  lastRunAt: string | null;
  lastAttemptAt: string | null;
  lastError: string | null;
  lastNote: string | null;
  blockedByBackfill: boolean;
};

type BackfillStatus = {
  enabled: boolean;
  sinceYmd: string;
  hasCursor: boolean;
  reachedYmd: string | null;
  lastRunAt: string | null;
  lastAttemptAt: string | null;
  lastError: string | null;
  lastNote: string | null;
  complete: boolean;
  phase: "idle" | "queued" | "running_or_waiting" | "error" | "complete";
  documentsFromO365: number;
  live: LiveProgress | null;
  liveSync?: LiveSyncStatus;
  limits?: {
    messagesPerRun: number;
    pdfsPerRun: number;
  };
  log: LogEntry[];
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
    if (status.enabled) {
      return "Crawl aktiv — verkettet automatisch (Stop beendet die Kette)";
    }
    return "Pausiert — Cursor bleibt · «Weiter» setzt fort";
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

function fmtYmd(ymd: string | null | undefined): string {
  if (!ymd) return "—";
  try {
    return new Date(`${ymd}T12:00:00`).toLocaleDateString("de-CH", {
      dateStyle: "medium",
    });
  } catch {
    return ymd;
  }
}

function outcomeLabel(outcome: string): string {
  switch (outcome) {
    case "uploaded":
      return "Neu";
    case "skipped_already":
      return "Bereits";
    case "skipped_no_pdf":
      return "Kein PDF";
    case "attachment_error":
      return "Anhang-Fehler";
    case "upload_error":
      return "Upload-Fehler";
    case "stopped":
      return "Stop";
    default:
      return outcome;
  }
}

function outcomeClass(outcome: string): string {
  if (outcome === "uploaded") return "bg-emerald-100 text-emerald-900";
  if (outcome === "skipped_already") return "bg-slate-100 text-slate-700";
  if (outcome === "skipped_no_pdf") return "bg-muted text-muted-foreground";
  if (outcome === "stopped") return "bg-amber-100 text-amber-950";
  return "bg-rose-100 text-rose-900";
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
  /** Prevent poll from overwriting the date input while editing. */
  const [sinceDirty, setSinceDirty] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/buddy/o365-pdf-backfill");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Status laden fehlgeschlagen");
      const next = json as BackfillStatus;
      setStatus(next);
      setSinceYmd((prev) => (sinceDirty ? prev : next.sinceYmd));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [sinceDirty]);

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
      // Stop any running catch-up before resetting the window
      await fetch("/api/buddy/o365-pdf-backfill", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stop: true }),
      }).catch(() => undefined);
      const res = await fetch("/api/buddy/o365-pdf-backfill", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sinceYmd, resetStats: true }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Speichern fehlgeschlagen");
      setStatus(json as BackfillStatus);
      setSinceYmd((json as BackfillStatus).sinceYmd);
      setSinceDirty(false);
      setMsg(
        "Zeitraum gesetzt — laufender Batch gestoppt, Cursor/Zähler/Log genullt. Danach «Backfill starten»."
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  /** Continue or start without resetting the Graph cursor. */
  async function startBackfill() {
    setBusy(true);
    setError(null);
    setMsg(null);
    try {
      await fetch("/api/buddy/o365-pdf-backfill", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: true }),
      });
      const res = await fetch("/api/jobs/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobType: "o365_pdf_backfill" }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Job starten fehlgeschlagen");
      setMsg(
        status?.hasCursor
          ? "Fortsetzung gestartet — Cursor bleibt, kein Neustart ab Startdatum."
          : "Batch gestartet — chronologisch ab Startdatum (älteste → neueste)."
      );
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
        body: JSON.stringify({ stop: true }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Stoppen fehlgeschlagen");
      setStatus(json as BackfillStatus);
      setMsg(
        "Stop — Kette und Job-Lease beendet. Offene Paperless-Uploads brechen kooperativ ab (max. ~45 s). Cursor bleibt."
      );
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function setLiveEnabled(enabled: boolean) {
    setBusy(true);
    setError(null);
    setMsg(null);
    try {
      const res = await fetch("/api/buddy/o365-pdf-backfill", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ liveEnabled: enabled }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Speichern fehlgeschlagen");
      setStatus(json as BackfillStatus);
      setMsg(
        enabled
          ? "Laufender Import aktiviert (Standard war aus). Catch-up hat Vorrang."
          : "Laufender Import deaktiviert."
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function saveLiveInterval(minutes: number) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/buddy/o365-pdf-backfill", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ liveIntervalMinutes: minutes }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Intervall speichern fehlgeschlagen");
      setStatus(json as BackfillStatus);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function runLiveOnce() {
    setBusy(true);
    setError(null);
    setMsg(null);
    try {
      const res = await fetch("/api/jobs/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobType: "o365_pdf_live" }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Live-Job starten fehlgeschlagen");
      setMsg("Live-Import gestartet (ein Durchlauf).");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const live = status?.live?.active ? status.live : null;
  const liveSync = status?.liveSync;
  const log = status?.log || [];
  const mailCap =
    status?.limits?.messagesPerRun || live?.messageTotal || 800;
  const pdfCap = status?.limits?.pdfsPerRun || live?.pdfsMaxThisBatch || 80;

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
          ). Reihenfolge:{" "}
          <span className="font-medium text-foreground">
            älteste → neueste
          </span>{" "}
          ab Startdatum. Catch-up in Blöcken (~
          {status?.limits?.messagesPerRun ?? 800} Mails /{" "}
          {status?.limits?.pdfsPerRun ?? 80} neue PDFs), parallel
          prüfen/hochladen, verkettet sich automatisch —{" "}
          <span className="font-medium text-foreground">Stop</span> beendet die
          Kette. «Weiter» setzt am Cursor fort (kein Neustart).
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
            <div className="space-y-2 rounded-lg border border-border/60 px-3 py-2.5 text-xs">
              <p className="font-medium text-foreground">
                Laufender Import (neue Mails)
              </p>
              <p className="text-muted-foreground">
                Periodisch nur PDFs seit Wasserzeichen —{" "}
                <span className="font-medium text-foreground">standardmässig aus</span>
                , damit der historische Catch-up nicht gestört wird. Während
                aktivem Catch-up wartet Live automatisch.
              </p>
              <label className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  className="accent-teal-700"
                  checked={Boolean(liveSync?.enabled)}
                  disabled={busy}
                  onChange={(e) => void setLiveEnabled(e.target.checked)}
                />
                <span>Neue PDF-Anhänge automatisch importieren</span>
              </label>
              <div className="flex flex-wrap items-end gap-2">
                <label className="block space-y-1">
                  <span className="font-medium text-muted-foreground">
                    Intervall (Minuten)
                  </span>
                  <input
                    type="number"
                    min={5}
                    max={120}
                    className="h-9 w-24 rounded-lg border border-border bg-background px-2 text-sm"
                    value={liveSync?.intervalMinutes ?? 15}
                    disabled={busy || !liveSync?.enabled}
                    onChange={(e) => {
                      const n = Number(e.target.value);
                      if (Number.isFinite(n)) {
                        setStatus((prev) =>
                          prev?.liveSync
                            ? {
                                ...prev,
                                liveSync: {
                                  ...prev.liveSync,
                                  intervalMinutes: n,
                                },
                              }
                            : prev
                        );
                      }
                    }}
                    onBlur={(e) => {
                      const n = Number(e.target.value);
                      if (Number.isFinite(n)) void saveLiveInterval(n);
                    }}
                  />
                </label>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={
                    busy ||
                    !liveSync?.enabled ||
                    Boolean(status.enabled) ||
                    Boolean(status.job?.o365Running)
                  }
                  onClick={() => void runLiveOnce()}
                >
                  Jetzt einmal prüfen
                </Button>
              </div>
              {liveSync ? (
                <div className="space-y-1 text-muted-foreground">
                  <p>
                    Wasserzeichen:{" "}
                    <span className="font-medium text-foreground">
                      {fmtTs(liveSync.watermark)}
                    </span>
                    {" · "}
                    letzter Lauf: {fmtTs(liveSync.lastRunAt)}
                  </p>
                  {liveSync.blockedByBackfill ? (
                    <p className="text-amber-800">
                      Catch-up aktiv — Live-Import pausiert automatisch.
                    </p>
                  ) : null}
                  {liveSync.lastNote ? (
                    <p className="text-foreground/90">{liveSync.lastNote}</p>
                  ) : null}
                  {liveSync.lastError ? (
                    <p className="text-destructive">{liveSync.lastError}</p>
                  ) : null}
                </div>
              ) : null}
            </div>

            <div className="flex flex-wrap items-end gap-2">
              <label className="block space-y-1 text-xs">
                <span className="font-medium text-muted-foreground">
                  Ab Datum (YYYY-MM-DD)
                </span>
                <input
                  type="date"
                  className="h-9 rounded-lg border border-border bg-background px-2 text-sm"
                  value={sinceYmd}
                  onChange={(e) => {
                    setSinceDirty(true);
                    setSinceYmd(e.target.value);
                  }}
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
                Zeitraum setzen (Neustart)
              </Button>
              {sinceDirty ? (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={busy}
                  onClick={() => {
                    setSinceDirty(false);
                    setSinceYmd(status.sinceYmd);
                  }}
                >
                  Zurücksetzen
                </Button>
              ) : null}
            </div>
            <p className="text-[11px] text-muted-foreground">
              «Zeitraum setzen» stoppt einen laufenden Batch und löscht Cursor,
              Zähler und Log — nur für einen bewussten Neustart. Für Fortsetzen
              nach Pause: «Weiter».
            </p>

            <div className="rounded-lg border border-teal-600/25 bg-teal-500/5 px-3 py-2.5 text-xs">
              <p className="font-medium text-foreground">
                Fortschritt (chronologisch)
              </p>
              <p className="mt-1 text-muted-foreground">
                Start:{" "}
                <span className="font-medium text-foreground">
                  {fmtYmd(status.sinceYmd)}
                </span>
                {" · "}
                bisher erreicht:{" "}
                <span className="font-medium text-foreground">
                  {fmtYmd(status.reachedYmd)}
                </span>
                {status.hasCursor ? " · Cursor aktiv (Fortsetzung möglich)" : ""}
              </p>
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
                <ProgressBar
                  label="Mails in diesem Lauf"
                  value={live.messageIndex}
                  max={mailCap}
                />
                <ProgressBar
                  label="PDFs neu (Lauf-Limit)"
                  value={live.pdfsUploadedThisBatch}
                  max={pdfCap}
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

            <div className="space-y-2 rounded-lg border border-border/60 px-3 py-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-medium text-foreground">
                  Crawl-Log (neueste zuerst)
                </p>
                <p className="text-[11px] text-muted-foreground">
                  Datum = Empfangen — für «Ab Datum» beim 2. Versuch nutzbar
                </p>
              </div>
              {log.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  Noch keine Log-Einträge in diesem Crawl.
                </p>
              ) : (
                <ul className="max-h-64 space-y-1.5 overflow-y-auto text-xs">
                  {log.slice(0, 80).map((e, i) => (
                    <li
                      key={`${e.at}-${i}`}
                      className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 border-b border-border/40 pb-1.5 last:border-0"
                    >
                      <span className="shrink-0 tabular-nums text-muted-foreground">
                        {e.receivedYmd
                          ? fmtYmd(e.receivedYmd)
                          : fmtMailDate(e.receivedAt)}
                      </span>
                      <Badge
                        variant="secondary"
                        className={cn(
                          "shrink-0 text-[10px] font-medium",
                          outcomeClass(e.outcome)
                        )}
                      >
                        {outcomeLabel(e.outcome)}
                        {e.pdfNew ? ` · ${e.pdfNew}` : ""}
                        {e.pdfFailed ? ` · ${e.pdfFailed}✗` : ""}
                      </Badge>
                      <span className="min-w-0 flex-1 truncate text-foreground">
                        {e.subject}
                      </span>
                      {e.detail ? (
                        <span className="basis-full truncate text-[11px] text-muted-foreground">
                          {e.detail}
                        </span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
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
                    ? "Weiter (fortsetzen)"
                    : "Backfill starten"}
              </Button>
              {status.enabled ||
              status.hasCursor ||
              live ||
              status.job?.o365Running ? (
                <Button
                  type="button"
                  size="sm"
                  variant="destructive"
                  disabled={busy}
                  onClick={() => void stopBackfill()}
                >
                  <Square className="size-3.5 fill-current" />
                  Stop / Abbrechen
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
