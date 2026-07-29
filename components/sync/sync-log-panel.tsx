"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Loader2,
  RefreshCw,
  ScrollText,
  SkipForward,
  XCircle,
} from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

const PAGE_LIMIT = 100;

function formatDate(value: string | null): string {
  if (!value) return "–";
  return new Intl.DateTimeFormat("de-CH", {
    dateStyle: "short",
    timeStyle: "medium",
  }).format(new Date(value));
}

function formatDuration(started: string, finished: string | null): string {
  if (!finished) return "läuft…";
  const ms = new Date(finished).getTime() - new Date(started).getTime();
  if (!Number.isFinite(ms) || ms < 0) return "–";
  if (ms < 1000) return `${ms} ms`;
  const sec = Math.round(ms / 1000);
  if (sec < 60) return `${sec} s`;
  const min = Math.floor(sec / 60);
  const rem = sec % 60;
  return rem ? `${min} min ${rem} s` : `${min} min`;
}

function parseSummary(value: string | null): Record<string, unknown> {
  if (!value) return {};
  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function statusMeta(status: string): {
  label: string;
  tone: "ok" | "error" | "running" | "muted";
  Icon: typeof CheckCircle2;
} {
  if (status === "success") {
    return { label: "OK", tone: "ok", Icon: CheckCircle2 };
  }
  if (status === "error") {
    return { label: "Problem", tone: "error", Icon: XCircle };
  }
  if (status === "running") {
    return { label: "Läuft", tone: "running", Icon: Loader2 };
  }
  if (status === "skipped") {
    return { label: "Übersprungen", tone: "muted", Icon: SkipForward };
  }
  return { label: status, tone: "muted", Icon: AlertTriangle };
}

function toneClasses(tone: "ok" | "error" | "running" | "muted"): string {
  if (tone === "ok") return "text-emerald-700 bg-emerald-50 border-emerald-200";
  if (tone === "error") return "text-destructive bg-destructive/5 border-destructive/30";
  if (tone === "running") return "text-[var(--brand-docs)] bg-[var(--brand-docs-soft)] border-[var(--brand-docs)]/30";
  return "text-muted-foreground bg-muted/40 border-border/60";
}

function summaryLine(summary: Record<string, unknown>): string {
  const parts = [
    `${Number(summary.created ?? 0)} neu`,
    `${Number(summary.updated ?? 0)} aktualisiert`,
    `${Number(summary.analyzed ?? 0)} analysiert`,
  ];
  const analysisFailed = Number(summary.analysisFailed ?? 0);
  if (analysisFailed > 0) parts.push(`${analysisFailed} Analysefehler`);
  const syncErrors = Number(summary.syncErrors ?? 0);
  if (syncErrors > 0) parts.push(`${syncErrors} Sync-Fehler`);
  const trilium =
    Number(summary.triliumCreated ?? 0) + Number(summary.triliumUpdated ?? 0);
  if (trilium > 0) parts.push(`Trilium ${trilium}`);
  return parts.join(" · ");
}

export function SyncLogPanel() {
  const [runs, setRuns] = useState<JobRun[]>([]);
  const [total, setTotal] = useState(0);
  const [selectedRun, setSelectedRun] = useState<number | null>(null);
  const [items, setItems] = useState<JobItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [writebackError, setWritebackError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const [runsRes, settingsRes] = await Promise.all([
      fetch(`/api/jobs/runs?limit=${PAGE_LIMIT}&offset=0`, {
        cache: "no-store",
      }),
      fetch("/api/settings", { cache: "no-store" }),
    ]);
    if (!runsRes.ok) {
      throw new Error("Protokoll konnte nicht geladen werden.");
    }
    const data = (await runsRes.json()) as { runs: JobRun[]; total: number };
    setRuns(data.runs);
    setTotal(data.total);
    if (settingsRes.ok) {
      const settings = await settingsRes.json().catch(() => ({}));
      setWritebackError(
        typeof settings.paperlessWritebackLastError === "string" &&
          settings.paperlessWritebackLastError.trim()
          ? settings.paperlessWritebackLastError
          : null
      );
    }
  }, []);

  useEffect(() => {
    const initial = window.setTimeout(() => {
      void refresh()
        .catch((err) =>
          setError(err instanceof Error ? err.message : String(err))
        )
        .finally(() => setLoading(false));
    }, 0);
    const timer = window.setInterval(() => {
      void refresh().catch(() => undefined);
    }, 8000);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(timer);
    };
  }, [refresh]);

  useEffect(() => {
    if (!selectedRun) {
      setItems([]);
      return;
    }
    void fetch(`/api/jobs/runs/${selectedRun}`, { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) throw new Error("Details konnten nicht geladen werden.");
        return res.json() as Promise<{ items: JobItem[] }>;
      })
      .then((data) => setItems(data.items))
      .catch((err) =>
        setError(err instanceof Error ? err.message : String(err))
      );
  }, [selectedRun]);

  const errorCount = runs.filter((r) => r.status === "error").length;
  const okCount = runs.filter((r) => r.status === "success").length;

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
        <CardTitle className="flex items-center gap-3">
          <IconCircle icon={ScrollText} tone="teal" size="sm" />
          Sync-Protokoll
        </CardTitle>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={loading}
          onClick={() => {
            setLoading(true);
            void refresh()
              .catch((err) =>
                setError(err instanceof Error ? err.message : String(err))
              )
              .finally(() => setLoading(false));
          }}
        >
          <RefreshCw className={loading ? "animate-spin" : undefined} />
          Aktualisieren
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Die letzten {PAGE_LIMIT} automatischen bzw. manuellen Sync-/Analyse-Läufe
          (Scheduler und «Jetzt synchronisieren und analysieren»). Reiner
          Paperless-Pull unter Status erscheint hier nicht.
        </p>

        <div className="flex flex-wrap gap-2 text-xs">
          <Badge variant="secondary">
            Angezeigt: {runs.length}
            {total > runs.length ? ` von ${total}` : ""}
          </Badge>
          <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">
            OK: {okCount}
          </Badge>
          <Badge variant="destructive">Probleme: {errorCount}</Badge>
        </div>

        {writebackError ? (
          <Alert variant="destructive">
            <AlertDescription className="text-xs break-words">
              Letzter Paperless-Writeback-Fehler: {writebackError}
            </AlertDescription>
          </Alert>
        ) : null}

        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        {loading && runs.length === 0 ? (
          <p className="text-sm text-muted-foreground">Lade Protokoll…</p>
        ) : runs.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Noch keine Läufe protokolliert.
          </p>
        ) : (
          <ul className="divide-y divide-border/60 rounded-xl border border-border/60">
            {runs.map((run) => {
              const meta = statusMeta(run.status);
              const summary = parseSummary(run.summary_json);
              const open = selectedRun === run.id;
              const StatusIcon = meta.Icon;
              return (
                <li key={run.id}>
                  <button
                    type="button"
                    className="flex w-full gap-3 px-3 py-3 text-left hover:bg-[var(--brand-docs-soft)]/35"
                    onClick={() =>
                      setSelectedRun(open ? null : run.id)
                    }
                  >
                    <span
                      className={`mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full border ${toneClasses(meta.tone)}`}
                      aria-hidden
                    >
                      <StatusIcon
                        className={`size-4 ${meta.tone === "running" ? "animate-spin" : ""}`}
                      />
                    </span>
                    <span className="min-w-0 flex-1 space-y-1">
                      <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="font-medium text-sm">
                          #{run.id} · {meta.label}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {run.trigger === "manual" ? "manuell" : "automatisch"}
                          {" · "}
                          {formatDuration(run.started_at, run.finished_at)}
                        </span>
                        <span className="ml-auto text-xs text-muted-foreground">
                          {formatDate(run.started_at)}
                        </span>
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {summaryLine(summary)}
                      </span>
                      {run.error_message ? (
                        <span className="block text-xs text-destructive break-words">
                          {run.error_message}
                        </span>
                      ) : null}
                    </span>
                    <span className="mt-1 shrink-0 text-muted-foreground">
                      {open ? (
                        <ChevronDown className="size-4" />
                      ) : (
                        <ChevronRight className="size-4" />
                      )}
                    </span>
                  </button>
                  {open ? (
                    <div className="border-t border-border/50 bg-muted/20 px-3 py-3">
                      <div className="mb-2 text-xs font-medium text-muted-foreground">
                        Phasen / Einträge
                      </div>
                      <div className="max-h-64 space-y-1 overflow-y-auto text-xs">
                        {items.length === 0 ? (
                          <p className="text-muted-foreground">Keine Details.</p>
                        ) : (
                          items.map((item) => {
                            const itemMeta = statusMeta(item.status);
                            return (
                              <div
                                key={item.id}
                                className="rounded-lg border border-border/50 bg-background/80 px-2.5 py-2"
                              >
                                <div className="font-medium">
                                  {item.title || item.item_kind}
                                  <span className="ml-2 font-normal text-muted-foreground">
                                    {itemMeta.label}
                                  </span>
                                </div>
                                {item.message ? (
                                  <div className="mt-0.5 text-muted-foreground break-words">
                                    {item.message}
                                  </div>
                                ) : null}
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
