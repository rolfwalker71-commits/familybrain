"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  CheckCircle2,
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
import Link from "next/link";

type SyncLogEntry = {
  id: number;
  created_at: string;
  direction: "pull" | "push" | string;
  status: "ok" | "error" | "skipped" | string;
  kind: string;
  source: string;
  field_name: string | null;
  field_value: string | null;
  document_local_id: number | null;
  paperless_id: number | null;
  document_title: string | null;
  message: string | null;
};

const PAGE_LIMIT = 100;

function formatDate(value: string | null): string {
  if (!value) return "–";
  return new Intl.DateTimeFormat("de-CH", {
    dateStyle: "short",
    timeStyle: "medium",
  }).format(new Date(value));
}

function directionLabel(direction: string): string {
  if (direction === "pull") return "Paperless → Buddy";
  if (direction === "push") return "Buddy → Paperless";
  return direction;
}

function statusMeta(status: string): {
  label: string;
  className: string;
  Icon: typeof CheckCircle2;
} {
  if (status === "ok") {
    return {
      label: "OK",
      className: "text-emerald-700 bg-emerald-50 border-emerald-200",
      Icon: CheckCircle2,
    };
  }
  if (status === "error") {
    return {
      label: "Fehler",
      className: "text-destructive bg-destructive/5 border-destructive/30",
      Icon: XCircle,
    };
  }
  return {
    label: "Übersprungen",
    className: "text-muted-foreground bg-muted/40 border-border/60",
    Icon: SkipForward,
  };
}

function sourceLabel(source: string): string {
  switch (source) {
    case "sync":
      return "Sync";
    case "writeback_analysis":
      return "Analyse-Writeback";
    case "writeback_link":
      return "Link-Writeback";
    case "writeback_status":
      return "Status-Writeback";
    case "mark_paid":
      return "Als beglichen";
    case "webhook":
      return "Webhook";
    default:
      return source;
  }
}

function kindLabel(kind: string): string {
  switch (kind) {
    case "custom_field":
      return "Custom Field";
    case "payment_flag":
      return "Zahlungsflag";
    case "tag":
      return "Tag";
    case "correspondent":
      return "Korrespondent";
    case "document_type":
      return "Dokumenttyp";
    case "batch":
      return "Batch";
    default:
      return kind;
  }
}

export function SyncLogPanel() {
  const [entries, setEntries] = useState<SyncLogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [directionFilter, setDirectionFilter] = useState<"all" | "pull" | "push">(
    "all"
  );

  const refresh = useCallback(async () => {
    const res = await fetch(
      `/api/paperless/sync-log?limit=${PAGE_LIMIT}&offset=0`,
      { cache: "no-store" }
    );
    if (!res.ok) throw new Error("Protokoll konnte nicht geladen werden.");
    const data = (await res.json()) as {
      entries: SyncLogEntry[];
      total: number;
    };
    setEntries(data.entries || []);
    setTotal(Number(data.total) || 0);
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
    }, 10000);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(timer);
    };
  }, [refresh]);

  const filtered =
    directionFilter === "all"
      ? entries
      : entries.filter((e) => e.direction === directionFilter);
  const pushCount = entries.filter((e) => e.direction === "push").length;
  const pullCount = entries.filter((e) => e.direction === "pull").length;
  const errorCount = entries.filter((e) => e.status === "error").length;

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
        <CardTitle className="flex items-center gap-3">
          <IconCircle icon={ScrollText} tone="teal" size="sm" />
          Paperless-Feldprotokoll
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
          Letzte Abgleiche von Custom Fields, Tags und Zahlungsflags zwischen
          Paperless und Buddy (max. {PAGE_LIMIT} Einträge). Scheduler-Läufe
          weiterhin unter <strong>Automation</strong>.
        </p>

        <div className="flex flex-wrap gap-2 text-xs">
          <Badge variant="secondary">
            Angezeigt: {filtered.length}
            {total > entries.length ? ` · gesamt ${total}` : ""}
          </Badge>
          <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">
            Push: {pushCount}
          </Badge>
          <Badge className="bg-sky-100 text-sky-800 hover:bg-sky-100">
            Pull: {pullCount}
          </Badge>
          <Badge variant="destructive">Fehler: {errorCount}</Badge>
        </div>

        <div className="flex flex-wrap gap-2">
          {(
            [
              ["all", "Alle"],
              ["push", "Buddy → Paperless"],
              ["pull", "Paperless → Buddy"],
            ] as const
          ).map(([id, label]) => (
            <Button
              key={id}
              type="button"
              size="sm"
              variant={directionFilter === id ? "default" : "outline"}
              onClick={() => setDirectionFilter(id)}
            >
              {label}
            </Button>
          ))}
        </div>

        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        {loading && entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">Lade Protokoll…</p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Noch keine Feld-Sync-Einträge. Nach Analyse-Writeback, Sync oder
            «Als beglichen» erscheinen sie hier.
          </p>
        ) : (
          <ul className="divide-y divide-border/60 rounded-xl border border-border/60">
            {filtered.map((entry) => {
              const meta = statusMeta(entry.status);
              const StatusIcon = meta.Icon;
              const isPush = entry.direction === "push";
              return (
                <li
                  key={entry.id}
                  className="flex gap-3 px-3 py-3 text-sm"
                >
                  <span
                    className={`mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full border ${meta.className}`}
                    aria-hidden
                  >
                    <StatusIcon className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${
                          isPush
                            ? "border-amber-200 bg-amber-50 text-amber-900"
                            : "border-sky-200 bg-sky-50 text-sky-900"
                        }`}
                      >
                        {isPush ? (
                          <ArrowUpFromLine className="size-3" />
                        ) : (
                          <ArrowDownToLine className="size-3" />
                        )}
                        {directionLabel(entry.direction)}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {kindLabel(entry.kind)} · {sourceLabel(entry.source)}
                      </span>
                      <span className="ml-auto text-xs text-muted-foreground">
                        {formatDate(entry.created_at)}
                      </span>
                    </div>
                    <div className="font-medium">
                      {entry.field_name || "—"}
                      {entry.field_value != null ? (
                        <span className="font-normal text-muted-foreground">
                          {" "}
                          ={" "}
                          <code className="rounded bg-muted px-1 text-xs">
                            {entry.field_value}
                          </code>
                        </span>
                      ) : null}
                      <span className="ml-2 text-xs font-normal text-muted-foreground">
                        {meta.label}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {entry.document_local_id ? (
                        <Link
                          href={`/documents/${entry.document_local_id}`}
                          className="hover:underline"
                        >
                          {entry.document_title ||
                            `Dokument #${entry.document_local_id}`}
                        </Link>
                      ) : (
                        entry.document_title || "—"
                      )}
                      {entry.paperless_id != null
                        ? ` · PL #${entry.paperless_id}`
                        : null}
                    </div>
                    {entry.message ? (
                      <div
                        className={`text-xs break-words ${
                          entry.status === "error"
                            ? "text-destructive"
                            : "text-muted-foreground"
                        }`}
                      >
                        {entry.message}
                      </div>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
