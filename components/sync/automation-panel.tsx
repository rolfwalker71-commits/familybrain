"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Clock3, Play, RefreshCw } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { IconCircle } from "@/components/layout/icon-circle";
import { cn } from "@/lib/utils";

type JobRun = {
  id: number;
  job_type?: string;
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

type InternalJobRow = {
  id: string;
  label: string;
  enabled: boolean;
  state: "active" | "due" | "scheduled" | "idle" | "off" | "blocked";
  nextAt: string | null;
  detail?: string | null;
  href?: string | null;
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
  activeRunLabel?: string | null;
  internalJobs?: InternalJobRow[];
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

function internalStateLabel(state: InternalJobRow["state"]): string {
  switch (state) {
    case "active":
      return "Läuft";
    case "due":
      return "Fällig";
    case "scheduled":
      return "Geplant";
    case "idle":
      return "Idle";
    case "blocked":
      return "Wartet";
    case "off":
      return "Aus";
    default:
      return state;
  }
}

function internalStateClass(state: InternalJobRow["state"]): string {
  switch (state) {
    case "active":
      return "bg-teal-700 text-white";
    case "due":
      return "bg-amber-100 text-amber-900";
    case "scheduled":
      return "bg-emerald-50 text-emerald-900 border border-emerald-200";
    case "blocked":
      return "bg-amber-50 text-amber-900 border border-amber-200";
    case "idle":
      return "bg-muted text-muted-foreground";
    case "off":
      return "bg-muted/60 text-muted-foreground";
    default:
      return "";
  }
}

function formatNextAt(iso: string | null, state: InternalJobRow["state"]): string {
  if (state === "off") return "—";
  if (state === "blocked") return "—";
  if (state === "idle" && !iso) return "—";
  if (state === "active") return "jetzt";
  if (state === "due") return "gleich / fällig";
  if (!iso) return "—";
  return formatDate(iso);
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
  const [enabled, setEnabled] = useState(true);
  const [intervalMinutes, setIntervalMinutes] = useState(30);
  const [selectedRun, setSelectedRun] = useState<number | null>(null);
  const [items, setItems] = useState<JobItem[]>([]);
  const [busy, setBusy] = useState<"save" | "run" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const [statusRes, runsRes] = await Promise.all([
      fetch("/api/jobs/status", { cache: "no-store" }),
      fetch(`/api/jobs/runs?limit=3&offset=0`, {
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
    setEnabled(nextStatus.settings.enabled);
    setIntervalMinutes(nextStatus.settings.intervalMinutes);
  }, []);

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
      const res = await fetch("/api/jobs/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobType: "sync_analyze" }),
      });
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

        {active ? (
          <div className="rounded-xl border border-border/60 p-3 text-sm">
            <p>
              Aktiv:{" "}
              <strong>
                {status?.activeRunLabel || active.job_type || "Job"}
              </strong>{" "}
              · {statusLabel(active.status)}
            </p>
            <Button
              size="sm"
              variant="outline"
              className="mt-2"
              disabled={busy !== null}
              onClick={() => {
                void (async () => {
                  setBusy("run");
                  try {
                    await fetch("/api/jobs/cancel", { method: "POST" });
                    await refresh();
                  } finally {
                    setBusy(null);
                  }
                })();
              }}
            >
              Job stoppen
            </Button>
          </div>
        ) : null}

        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        <div className="space-y-3">
          <h3 className="font-medium">Interne Jobs</h3>
          <p className="text-sm text-muted-foreground">
            Periodische Hintergrundarbeit — Kurzname, Status und nächster
            geplanter Lauf (Näherung über Scheduler / Throttles).
          </p>
          {(status?.internalJobs || []).length === 0 ? (
            <p className="text-sm text-muted-foreground">Noch keine Daten…</p>
          ) : (
            <ul className="divide-y divide-border/50 rounded-xl border border-border/60">
              {(status?.internalJobs || []).map((job) => {
                const body = (
                  <>
                    <span className="min-w-[9rem] font-medium text-foreground">
                      {job.label}
                    </span>
                    <Badge
                      variant="secondary"
                      className={cn(
                        "shrink-0 text-[0.625rem] font-medium",
                        internalStateClass(job.state)
                      )}
                    >
                      {internalStateLabel(job.state)}
                    </Badge>
                    <span className="tabular-nums text-muted-foreground">
                      {formatNextAt(job.nextAt, job.state)}
                    </span>
                    {job.detail ? (
                      <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                        {job.detail}
                      </span>
                    ) : null}
                  </>
                );
                return (
                  <li key={job.id}>
                    {job.href ? (
                      <Link
                        href={job.href}
                        className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-3 py-2.5 text-sm hover:bg-muted/40"
                      >
                        {body}
                      </Link>
                    ) : (
                      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-3 py-2.5 text-sm">
                        {body}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="space-y-3">
          <h3 className="font-medium">Laufhistorie</h3>
          <p className="text-sm text-muted-foreground">
            Kurze Vorschau der letzten Scheduler-/Analyse-Läufe. Custom-Field-
            Abgleiche (Paperless ↔ Buddy) findest du unter dem Tab{" "}
            <strong>Protokoll</strong>.
          </p>
          {runs.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Noch keine Läufe protokolliert.
            </p>
          ) : (
            <div className="space-y-2">
              {runs.slice(0, 3).map((run) => {
                const summary = parseSummary(run.summary_json);
                return (
                  <Button
                    key={run.id}
                    type="button"
                    variant="outline"
                    className="h-auto w-full justify-start rounded-xl p-3 text-left text-sm font-normal hover:bg-[var(--brand-docs-soft)]/40"
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
                  </Button>
                );
              })}
            </div>
          )}
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
