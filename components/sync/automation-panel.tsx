"use client";

import { useCallback, useEffect, useState } from "react";
import { Clock3, Play, RefreshCw } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { IconCircle } from "@/components/layout/icon-circle";

type JobRun = {
  id: number;
  trigger: string;
  status: string;
  started_at: string;
  finished_at: string | null;
  summary_json: string | null;
  error_message: string | null;
};

type JobItem = {
  id: number;
  item_kind: string;
  title: string | null;
  status: string;
  message: string | null;
  created_at: string;
};

type StatusResponse = {
  settings: { enabled: boolean; intervalMinutes: number };
  scheduler: {
    nextTickAt: string | null;
    lastTickAt: string | null;
    initialComplete: boolean;
  };
  initialization: { syncComplete: boolean; complete: boolean };
  activeRun: JobRun | null;
};

function formatDate(value: string | null): string {
  if (!value) return "–";
  return new Intl.DateTimeFormat("de-CH", {
    dateStyle: "short",
    timeStyle: "medium",
  }).format(new Date(value));
}

function statusLabel(status: string): string {
  if (status === "running") return "Läuft";
  if (status === "success") return "Erfolgreich";
  if (status === "error") return "Fehler";
  return status;
}

function parseSummary(value: string | null): Record<string, unknown> {
  if (!value) return {};
  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export function AutomationPanel() {
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [runs, setRuns] = useState<JobRun[]>([]);
  const [totalRuns, setTotalRuns] = useState(0);
  const [offset, setOffset] = useState(0);
  const [enabled, setEnabled] = useState(true);
  const [intervalMinutes, setIntervalMinutes] = useState(30);
  const [selectedRun, setSelectedRun] = useState<number | null>(null);
  const [items, setItems] = useState<JobItem[]>([]);
  const [busy, setBusy] = useState<"save" | "run" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pageSize = 10;

  const refresh = useCallback(async () => {
    const [statusRes, runsRes] = await Promise.all([
      fetch("/api/jobs/status", { cache: "no-store" }),
      fetch(`/api/jobs/runs?limit=${pageSize}&offset=${offset}`, {
        cache: "no-store",
      }),
    ]);
    if (!statusRes.ok || !runsRes.ok) {
      throw new Error("Automationsstatus konnte nicht geladen werden.");
    }
    const nextStatus = (await statusRes.json()) as StatusResponse;
    const nextRuns = (await runsRes.json()) as {
      runs: JobRun[];
      total: number;
    };
    setStatus(nextStatus);
    setRuns(nextRuns.runs);
    setTotalRuns(nextRuns.total);
    setEnabled(nextStatus.settings.enabled);
    setIntervalMinutes(nextStatus.settings.intervalMinutes);
  }, [offset]);

  useEffect(() => {
    const initialTimer = window.setTimeout(() => {
      void refresh().catch((err) =>
        setError(err instanceof Error ? err.message : String(err))
      );
    }, 0);
    const timer = window.setInterval(() => {
      void refresh().catch(() => undefined);
    }, 5000);
    return () => {
      window.clearTimeout(initialTimer);
      window.clearInterval(timer);
    };
  }, [refresh]);

  useEffect(() => {
    if (!selectedRun) return;
    void fetch(`/api/jobs/runs/${selectedRun}`, { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) throw new Error("Laufdetails konnten nicht geladen werden.");
        return res.json() as Promise<{ items: JobItem[] }>;
      })
      .then((data) => setItems(data.items))
      .catch((err) =>
        setError(err instanceof Error ? err.message : String(err))
      );
  }, [selectedRun, status?.activeRun?.id]);

  async function saveSettings() {
    setBusy("save");
    setError(null);
    try {
      const res = await fetch("/api/jobs/status", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled, intervalMinutes }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Speichern fehlgeschlagen");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  async function runNow() {
    setBusy("run");
    setError(null);
    try {
      const res = await fetch("/api/jobs/run", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Start fehlgeschlagen");
      await new Promise((resolve) => window.setTimeout(resolve, 500));
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  const initialComplete = status?.initialization.complete ?? false;
  const active = status?.activeRun ?? null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-3">
          <IconCircle icon={Clock3} tone="teal" size="sm" />
          Automatischer Sync und Analyse
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="rounded-xl border border-border/60 bg-[var(--brand-docs-soft)]/50 p-4 text-sm">
          {initialComplete ? (
            <>
              Initialisierung abgeschlossen. Nächster Lauf:{" "}
              <strong className="text-[var(--brand-docs)]">
                {formatDate(status?.scheduler.nextTickAt ?? null)}
              </strong>
            </>
          ) : (
            <>
              <strong>Initialisierung läuft selbständig im Hintergrund.</strong>{" "}
              Zuerst werden alle Paperless-Dokumente synchronisiert und danach
              vollständig analysiert. Das reguläre Intervall startet erst nach
              erfolgreichem Abschluss.
            </>
          )}
          {active ? (
            <div className="mt-2">
              Aktiver Lauf #{active.id} seit {formatDate(active.started_at)}
            </div>
          ) : null}
        </div>

        <div className="grid gap-4 md:grid-cols-[auto_180px_auto] md:items-end">
          <label className="flex items-center gap-2 pb-2 text-sm">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(event) => setEnabled(event.target.checked)}
              className="size-4"
            />
            Automatik aktiv
          </label>
          <div className="space-y-2">
            <Label htmlFor="schedulerInterval">Intervall in Minuten</Label>
            <Input
              id="schedulerInterval"
              type="number"
              min={5}
              max={1440}
              className="rounded-xl"
              value={intervalMinutes}
              onChange={(event) =>
                setIntervalMinutes(Number(event.target.value))
              }
            />
          </div>
          <Button
            variant="outline"
            className="w-full md:w-auto"
            disabled={
              busy !== null ||
              intervalMinutes < 5 ||
              intervalMinutes > 1440
            }
            onClick={() => void saveSettings()}
          >
            {busy === "save" ? "Speichert…" : "Automatik speichern"}
          </Button>
        </div>

        <Button
          onClick={() => void runNow()}
          className="w-full bg-[var(--brand-docs)] text-white hover:bg-[var(--brand-docs)]/90"
          disabled={busy !== null || Boolean(active)}
        >
          {active ? (
            <RefreshCw className="animate-spin" />
          ) : (
            <Play />
          )}
          {busy === "run"
            ? "Startet…"
            : "Jetzt synchronisieren und analysieren"}
        </Button>

        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        <div className="space-y-3">
          <h3 className="font-medium">Laufhistorie</h3>
          {runs.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Noch keine Läufe protokolliert.
            </p>
          ) : (
            <div className="space-y-2">
              {runs.map((run) => {
                const summary = parseSummary(run.summary_json);
                return (
                  <button
                    key={run.id}
                    type="button"
                    className="w-full rounded-xl border border-border/60 p-3 text-left text-sm hover:bg-[var(--brand-docs-soft)]/40"
                    onClick={() => {
                      if (selectedRun === run.id) {
                        setSelectedRun(null);
                        setItems([]);
                      } else {
                        setSelectedRun(run.id);
                      }
                    }}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-medium">
                        #{run.id} · {statusLabel(run.status)} ·{" "}
                        {run.trigger === "manual" ? "manuell" : "automatisch"}
                      </span>
                      <span className="text-muted-foreground">
                        {formatDate(run.started_at)}
                      </span>
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {Number(summary.created ?? 0)} neu ·{" "}
                      {Number(summary.updated ?? 0)} aktualisiert ·{" "}
                      {Number(summary.analyzed ?? 0)} analysiert ·{" "}
                      {Number(summary.analysisFailed ?? 0)} Analysefehler
                    </div>
                    {run.error_message ? (
                      <div className="mt-1 text-xs text-destructive">
                        {run.error_message}
                      </div>
                    ) : null}
                  </button>
                );
              })}
            </div>
          )}

          <div className="flex items-center justify-between">
            <Button
              size="sm"
              variant="outline"
              disabled={offset === 0}
              onClick={() => setOffset(Math.max(0, offset - pageSize))}
            >
              Zurück
            </Button>
            <span className="text-xs text-muted-foreground">
              {totalRuns === 0 ? 0 : offset + 1}–
              {Math.min(offset + pageSize, totalRuns)} von {totalRuns}
            </span>
            <Button
              size="sm"
              variant="outline"
              disabled={offset + pageSize >= totalRuns}
              onClick={() => setOffset(offset + pageSize)}
            >
              Weiter
            </Button>
          </div>
        </div>

        {selectedRun ? (
          <div className="space-y-2 rounded-xl border border-border/60 bg-[var(--brand-docs-soft)]/30 p-3">
            <h3 className="font-medium">Details zu Lauf #{selectedRun}</h3>
            <div className="max-h-80 space-y-1 overflow-y-auto text-xs">
              {items.map((item) => (
                <div key={item.id} className="border-b border-border/60 py-2">
                  <span className="font-medium">
                    {item.title || item.item_kind}
                  </span>
                  {" · "}
                  {statusLabel(item.status)}
                  {item.message ? ` · ${item.message}` : ""}
                </div>
              ))}
              {items.length === 0 ? "Keine Einträge." : null}
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
