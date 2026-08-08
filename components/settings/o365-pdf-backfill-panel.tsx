"use client";

import { useCallback, useEffect, useState } from "react";
import { FileStack, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { IconCircle } from "@/components/layout/icon-circle";

type BackfillStatus = {
  enabled: boolean;
  sinceYmd: string;
  hasCursor: boolean;
  lastRunAt: string | null;
  lastError: string | null;
  complete: boolean;
  documentsFromO365: number;
  stats: {
    messagesSeen: number;
    pdfsUploaded: number;
    pdfsSkipped: number;
    pdfsFailed: number;
  };
};

export function O365PdfBackfillPanel() {
  const [status, setStatus] = useState<BackfillStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [sinceYmd, setSinceYmd] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/buddy/o365-pdf-backfill");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Status laden fehlgeschlagen");
      setStatus(json as BackfillStatus);
      setSinceYmd((json as BackfillStatus).sinceYmd);
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
      setMsg("Zeitraum gesetzt — Crawl startet von diesem Datum.");
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
          resetStats: !status?.hasCursor,
        }),
      });
      const res = await fetch("/api/jobs/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobType: "o365_pdf_backfill" }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Job starten fehlgeschlagen");
      setMsg(
        "Backfill gestartet — läuft in Batches weiter (Scheduler), bis der Zeitraum durch ist."
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
        body: JSON.stringify({ enabled: false }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Stoppen fehlgeschlagen");
      setStatus(json as BackfillStatus);
      setMsg("Backfill pausiert.");
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
          <IconCircle icon={FileStack} tone="teal" size="sm" />
          O365-PDFs → Paperless
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <p className="text-muted-foreground">
          PDF-Anhänge aus Outlook nach Paperless (Tags{" "}
          <span className="font-medium text-foreground">O365 · ANG · geschäftlich</span>
          ). Pro Mail auch manuell unter Microsoft → Öffnen. Historischer Crawl:
          Graph erlaubt Jahre zurück — Standard ca. 1 Jahr, Datum unten änderbar.
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

            <p className="text-xs text-muted-foreground">
              Docs aus O365: {status.documentsFromO365} · Mails gesehen:{" "}
              {status.stats.messagesSeen} · neu: {status.stats.pdfsUploaded} ·
              übersprungen: {status.stats.pdfsSkipped} · Fehler:{" "}
              {status.stats.pdfsFailed}
              {status.enabled || status.hasCursor
                ? " · Crawl aktiv"
                : status.complete
                  ? " · letzter Lauf fertig"
                  : ""}
              {status.lastRunAt
                ? ` · zuletzt ${new Date(status.lastRunAt).toLocaleString("de-CH")}`
                : ""}
            </p>
            {status.lastError ? (
              <p className="text-xs text-destructive">{status.lastError}</p>
            ) : null}

            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                disabled={busy}
                onClick={() => void startBackfill()}
              >
                {status.enabled || status.hasCursor
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
