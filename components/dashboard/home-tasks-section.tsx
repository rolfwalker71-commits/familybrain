"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Check, CheckSquare, ExternalLink } from "lucide-react";
import { AgendaAiIconThumb } from "@/components/calendar/agenda-ai-icon-thumb";
import { weekdayLabel } from "@/components/calendar/agenda-row";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { APP_ICON_STROKE } from "@/lib/branding/app-icons";
import { cn } from "@/lib/utils";

export type HomeTaskRow = {
  key: string;
  id: string;
  source: "google" | "todo" | "planner";
  title: string;
  dueDate: string | null;
  overdue: boolean;
  subtitle: string;
  href: string;
  listId: string | null;
  etag: string | null;
  listTitle?: string;
};

const SOURCE_LABEL: Record<HomeTaskRow["source"], string> = {
  google: "Google",
  todo: "To Do",
  planner: "Planner",
};

function dueLabel(dueDate: string | null, today: string, overdue: boolean) {
  if (overdue) return "Überfällig";
  if (!dueDate) return "Ohne Datum";
  if (dueDate === today) return "Heute";
  return weekdayLabel(dueDate);
}

export function HomeTasksSection({
  items,
  today,
  hasGoogleScope,
  hasMicrosoftScope,
  onChanged,
}: {
  items: HomeTaskRow[];
  today: string;
  hasGoogleScope: boolean;
  hasMicrosoftScope: boolean;
  onChanged?: () => void;
}) {
  const [rows, setRows] = useState(items);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draftDue, setDraftDue] = useState<Record<string, string>>({});

  useEffect(() => {
    setRows(items);
  }, [items]);

  async function patch(
    task: HomeTaskRow,
    action: "complete" | "reschedule",
    dueDate?: string | null
  ) {
    setBusyKey(task.key);
    setError(null);
    try {
      const res = await fetch("/api/dashboard/tasks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: task.source,
          id: task.id,
          listId: task.listId,
          etag: task.etag,
          action,
          dueDate: action === "reschedule" ? dueDate ?? null : undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Update fehlgeschlagen");
      if (action === "complete") {
        setRows((prev) => prev.filter((t) => t.key !== task.key));
      } else {
        setRows((prev) =>
          prev.map((t) =>
            t.key === task.key
              ? {
                  ...t,
                  dueDate: dueDate ?? null,
                  overdue: Boolean(dueDate && dueDate < today),
                  etag: json.task?.etag ?? t.etag,
                }
              : t
          )
        );
      }
      onChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <Card className="border-border/70">
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-[16px] font-black">
            <CheckSquare
              className="size-4 text-muted-foreground"
              strokeWidth={APP_ICON_STROKE}
              absoluteStrokeWidth
              aria-hidden
            />
            Aufgaben · 7 Tage
          </CardTitle>
          <div className="flex flex-wrap gap-2 text-[12px] text-muted-foreground">
            {hasMicrosoftScope ? (
              <Link
                href="/microsoft?tab=planner"
                className="underline-offset-2 hover:underline"
              >
                Planner →
              </Link>
            ) : null}
            {hasGoogleScope ? (
              <a
                href="https://tasks.google.com/"
                target="_blank"
                rel="noreferrer"
                className="underline-offset-2 hover:underline"
              >
                Google Tasks →
              </a>
            ) : null}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {!hasGoogleScope && !hasMicrosoftScope ? (
          <p className="text-[13px] text-muted-foreground">
            Noch keine Aufgaben-Quellen verbunden — unter{" "}
            <Link
              href="/account"
              className="font-medium underline-offset-2 hover:underline"
            >
              Konto
            </Link>{" "}
            Google Tasks und/oder Microsoft 365 (To Do / Planner) verbinden.
          </p>
        ) : rows.length === 0 ? (
          <p className="text-[13px] text-muted-foreground">
            Keine offenen Aufgaben in den nächsten 7 Tagen.
          </p>
        ) : (
          <ul className="space-y-2">
            {rows.map((t) => {
              const busy = busyKey === t.key;
              const dueValue = draftDue[t.key] ?? t.dueDate ?? "";
              return (
                <li
                  key={t.key}
                  className="flex flex-wrap items-start gap-3 rounded-xl border border-border/50 bg-muted/15 px-2.5 py-2 sm:flex-nowrap"
                >
                  <AgendaAiIconThumb
                    itemId={`home-task-${t.key}`}
                    title={t.title}
                    kind="task"
                    calendarName={SOURCE_LABEL[t.source]}
                    location={t.subtitle}
                    description={`${SOURCE_LABEL[t.source]} · ${t.subtitle}`}
                    className="shrink-0"
                    imgClassName="size-11 rounded-lg sm:size-12"
                  />
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-[14px] font-black leading-snug">
                          {t.title}
                        </p>
                        <p className="text-[12px] text-muted-foreground">
                          <span
                            className={cn(
                              t.overdue && "font-medium text-rose-700"
                            )}
                          >
                            {dueLabel(t.dueDate, today, t.overdue)}
                          </span>
                          {" · "}
                          {SOURCE_LABEL[t.source]}
                          {t.subtitle ? ` · ${t.subtitle}` : ""}
                        </p>
                      </div>
                      <a
                        href={t.href}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-[11px] text-primary underline-offset-2 hover:underline"
                      >
                        <ExternalLink className="size-3" aria-hidden />
                        öffnen
                      </a>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        disabled={busy}
                        onClick={() => void patch(t, "complete")}
                      >
                        <Check
                          className="size-3.5"
                          strokeWidth={APP_ICON_STROKE}
                        />
                        Erledigen
                      </Button>
                      <Input
                        type="date"
                        className="h-8 w-auto min-w-[9.5rem]"
                        value={dueValue}
                        disabled={busy}
                        onValueChange={(v) =>
                          setDraftDue((prev) => ({ ...prev, [t.key]: v }))
                        }
                      />
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={
                          busy || !dueValue || dueValue === (t.dueDate || "")
                        }
                        onClick={() =>
                          void patch(t, "reschedule", dueValue || null)
                        }
                      >
                        Terminieren
                      </Button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        {error ? (
          <p className="text-[13px] text-destructive">{error}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}
