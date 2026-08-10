"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ImageIcon, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { IconCircle } from "@/components/layout/icon-circle";

type RegenJob = {
  status: "running" | "done" | "error";
  message?: string | null;
  error?: string | null;
  generated?: number;
  unique?: number;
  errors?: number;
  processed?: number;
};

async function readJsonSafe(res: Response): Promise<Record<string, unknown>> {
  const text = await res.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    const snippet = text.replace(/\s+/g, " ").trim().slice(0, 120);
    throw new Error(
      res.ok
        ? `Unerwartete Antwort (kein JSON): ${snippet || "(leer)"}`
        : `Serverfehler ${res.status}: ${snippet || res.statusText || "keine Details"}`
    );
  }
}

/**
 * Admin action: force-regenerate Google + Microsoft agenda AI thumbnails
 * for the current week (new prompts / style). Runs as a background job.
 */
export function SettingsAgendaAiIconsPanel() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPoll = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const applyJob = useCallback((job: RegenJob | null | undefined) => {
    if (!job) return;
    if (job.status === "running") {
      setBusy(true);
      setMessage(job.message || "Generiere…");
      setError(null);
      return;
    }
    setBusy(false);
    if (job.status === "done") {
      setMessage(job.message || "Fertig.");
      setError(null);
    } else if (job.status === "error") {
      setError(job.error || job.message || "Neugenerierung fehlgeschlagen");
      setMessage(null);
    }
  }, []);

  const pollOnce = useCallback(async () => {
    const res = await fetch("/api/calendar/ai-icons/regenerate", {
      cache: "no-store",
    });
    const data = await readJsonSafe(res);
    if (!res.ok) {
      throw new Error(
        typeof data.error === "string"
          ? data.error
          : "Status konnte nicht geladen werden"
      );
    }
    const job = (data.job as RegenJob | null) || null;
    applyJob(job);
    return Boolean(data.busy) || job?.status === "running";
  }, [applyJob]);

  const startPolling = useCallback(() => {
    stopPoll();
    pollRef.current = setInterval(() => {
      void pollOnce()
        .then((stillBusy) => {
          if (!stillBusy) stopPoll();
        })
        .catch((err) => {
          stopPoll();
          setBusy(false);
          setError(err instanceof Error ? err.message : String(err));
        });
    }, 2500);
  }, [pollOnce, stopPoll]);

  useEffect(() => {
    void pollOnce()
      .then((stillBusy) => {
        if (stillBusy) startPolling();
      })
      .catch(() => {
        /* ignore initial status errors */
      });
    return () => stopPoll();
  }, [pollOnce, startPolling, stopPoll]);

  async function regenerate() {
    setBusy(true);
    setMessage("Neugenerierung wird gestartet…");
    setError(null);
    try {
      const res = await fetch("/api/calendar/ai-icons/regenerate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ maxGenerate: 24 }),
      });
      const data = await readJsonSafe(res);
      if (!res.ok && res.status !== 202) {
        throw new Error(
          typeof data.error === "string"
            ? data.error
            : "Neugenerierung fehlgeschlagen"
        );
      }
      applyJob((data.job as RegenJob | null) || null);
      if (typeof data.message === "string") {
        setMessage(data.message);
      }
      startPolling();
      // Immediate follow-up in case the job finishes quickly
      void pollOnce().then((stillBusy) => {
        if (!stillBusy) stopPoll();
      });
    } catch (err) {
      setBusy(false);
      setError(err instanceof Error ? err.message : String(err));
      setMessage(null);
      stopPoll();
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-3">
          <IconCircle icon={ImageIcon} tone="teal" size="sm" />
          Kalender-KI-Bilder
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Erzeugt die Termin-Illustrationen für{" "}
          <strong className="font-medium text-foreground">
            Google- und Microsoft-Kalender
          </strong>{" "}
          der aktuellen Woche neu (Online-Meetings, Arbeit/Sport/Ferien,
          Fahrzeit). Läuft im Hintergrund — ICS-Abos und lokale Buddy-Einträge
          bleiben unberührt.
        </p>
        <Button
          type="button"
          variant="outline"
          disabled={busy}
          onClick={() => void regenerate()}
          className="gap-2"
        >
          {busy ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <RefreshCw className="size-4" aria-hidden />
          )}
          {busy ? "Generiere…" : "Google/O365-Bilder neu generieren"}
        </Button>
        {message ? (
          <p className="text-sm text-foreground" role="status">
            {message}
          </p>
        ) : null}
        {error ? (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
