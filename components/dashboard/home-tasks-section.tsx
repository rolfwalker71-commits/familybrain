"use client";

import { useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import Link from "next/link";
import { Check, CheckSquare, ExternalLink, ListTodo } from "lucide-react";
import { AgendaAiIconThumb } from "@/components/calendar/agenda-ai-icon-thumb";
import { weekdayLabel } from "@/components/calendar/agenda-row";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { APP_ICON_STROKE } from "@/lib/branding/app-icons";
import { showActionFeedback } from "@/lib/ui/action-feedback";
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
  google: "Google Tasks",
  todo: "Outlook To Do",
  planner: "Planner",
};

const SOURCE_ORDER: HomeTaskRow["source"][] = ["planner", "todo", "google"];

function addDaysYmd(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Nur Fälligkeit heute oder morgen (nicht überfällig / später / ohne Datum). */
export function isFocusHomeTask(task: HomeTaskRow, today: string): boolean {
  if (!task.dueDate) return false;
  const tomorrow = addDaysYmd(today, 1);
  return task.dueDate === today || task.dueDate === tomorrow;
}

function dueLabel(dueDate: string | null, today: string, overdue: boolean) {
  if (overdue) return "Überfällig";
  if (!dueDate) return "Ohne Datum";
  if (dueDate === today) return "Heute";
  if (dueDate === addDaysYmd(today, 1)) return "Morgen";
  return weekdayLabel(dueDate);
}

function sortTasks(a: HomeTaskRow, b: HomeTaskRow): number {
  if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
  const da = a.dueDate || "9999-99-99";
  const db = b.dueDate || "9999-99-99";
  const c = da.localeCompare(db);
  if (c !== 0) return c;
  return a.title.localeCompare(b.title, "de");
}

function TaskRow({
  task,
  today,
  busy,
  justDone,
  dueValue,
  onDueDraft,
  onComplete,
  onReschedule,
}: {
  task: HomeTaskRow;
  today: string;
  busy: boolean;
  justDone?: boolean;
  dueValue: string;
  onDueDraft: (v: string) => void;
  onComplete: () => void;
  onReschedule: () => void;
}) {
  return (
    <li
      className={cn(
        "flex flex-wrap items-start gap-3 rounded-xl border px-2.5 py-2 sm:flex-nowrap transition-colors",
        justDone
          ? "border-emerald-300 bg-emerald-50"
          : "border-border/50 bg-muted/15"
      )}
    >
      <AgendaAiIconThumb
        itemId={`home-task-${task.key}`}
        title={task.title}
        kind="task"
        calendarName={SOURCE_LABEL[task.source]}
        location={task.subtitle}
        description={`${SOURCE_LABEL[task.source]} · ${task.subtitle}`}
        className="shrink-0"
        imgClassName="size-11 rounded-lg sm:size-12"
      />
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[14px] font-black leading-snug">{task.title}</p>
            {justDone ? (
              <p className="text-[12px] font-medium text-emerald-800">
                Als erledigt markiert
              </p>
            ) : (
              <p className="text-[12px] text-muted-foreground">
                <span
                  className={cn(task.overdue && "font-medium text-rose-700")}
                >
                  {dueLabel(task.dueDate, today, task.overdue)}
                </span>
                {task.subtitle ? ` · ${task.subtitle}` : ""}
              </p>
            )}
          </div>
          {!justDone ? (
            <a
              href={task.href}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-[11px] text-primary underline-offset-2 hover:underline"
            >
              <ExternalLink className="size-3" aria-hidden />
              öffnen
            </a>
          ) : null}
        </div>
        {!justDone ? (
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={busy}
              onClick={onComplete}
            >
              <Check className="size-3.5" strokeWidth={APP_ICON_STROKE} />
              Erledigen
            </Button>
            <Input
              type="date"
              className="h-8 w-auto min-w-[9.5rem]"
              value={dueValue}
              disabled={busy}
              onValueChange={onDueDraft}
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy || !dueValue || dueValue === (task.dueDate || "")}
              onClick={onReschedule}
            >
              Terminieren
            </Button>
          </div>
        ) : null}
      </div>
    </li>
  );
}

function SourceBlock({
  source,
  tasks,
  today,
  busyKey,
  justDoneKey,
  draftDue,
  setDraftDue,
  patch,
}: {
  source: HomeTaskRow["source"];
  tasks: HomeTaskRow[];
  today: string;
  busyKey: string | null;
  justDoneKey: string | null;
  draftDue: Record<string, string>;
  setDraftDue: Dispatch<SetStateAction<Record<string, string>>>;
  patch: (
    task: HomeTaskRow,
    action: "complete" | "reschedule",
    dueDate?: string | null
  ) => Promise<void>;
}) {
  if (tasks.length === 0) return null;
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-[13px] font-bold tracking-tight">
          {SOURCE_LABEL[source]}
        </h3>
        <span className="text-[11px] text-muted-foreground">
          {tasks.length}
        </span>
      </div>
      <ul className="space-y-2">
        {tasks.map((t) => (
          <TaskRow
            key={t.key}
            task={t}
            today={today}
            busy={busyKey === t.key}
            justDone={justDoneKey === t.key}
            dueValue={draftDue[t.key] ?? t.dueDate ?? ""}
            onDueDraft={(v) =>
              setDraftDue((prev) => ({ ...prev, [t.key]: v }))
            }
            onComplete={() => void patch(t, "complete")}
            onReschedule={() =>
              void patch(
                t,
                "reschedule",
                draftDue[t.key] ?? t.dueDate ?? null
              )
            }
          />
        ))}
      </ul>
    </div>
  );
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
  const doneKeysRef = useRef<Set<string>>(new Set());
  const [rows, setRows] = useState(items);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [justDoneKey, setJustDoneKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [draftDue, setDraftDue] = useState<Record<string, string>>({});

  useEffect(() => {
    setRows(items.filter((t) => !doneKeysRef.current.has(t.key)));
  }, [items]);

  const focusRows = useMemo(
    () => rows.filter((t) => isFocusHomeTask(t, today)).sort(sortTasks),
    [rows, today]
  );

  async function patch(
    task: HomeTaskRow,
    action: "complete" | "reschedule",
    dueDate?: string | null
  ) {
    setBusyKey(task.key);
    setError(null);
    setNotice(null);
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
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          (json as { error?: string }).error ||
            `Update fehlgeschlagen (${res.status})`
        );
      }
      if (action === "complete") {
        const msg = `«${task.title}» ist erledigt.`;
        setJustDoneKey(task.key);
        setNotice(msg);
        showActionFeedback({
          headline: msg,
          detail: `${SOURCE_LABEL[task.source]} · als erledigt markiert`,
          tone: "success",
        });
        doneKeysRef.current.add(task.key);
        window.setTimeout(() => {
          setRows((prev) => prev.filter((t) => t.key !== task.key));
          setJustDoneKey((k) => (k === task.key ? null : k));
        }, 900);
      } else {
        const nextDue = dueDate ?? null;
        setRows((prev) =>
          prev.map((t) =>
            t.key === task.key
              ? {
                  ...t,
                  dueDate: nextDue,
                  overdue: Boolean(nextDue && nextDue < today),
                  etag:
                    (json as { task?: { etag?: string } }).task?.etag ?? t.etag,
                }
              : t
          )
        );
        const msg = nextDue
          ? `«${task.title}» neu terminiert auf ${nextDue}.`
          : `Termin bei «${task.title}» entfernt.`;
        setNotice(msg);
        showActionFeedback({
          headline: msg,
          detail: SOURCE_LABEL[task.source],
          tone: "success",
        });
      }
      window.setTimeout(() => onChanged?.(), 500);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      showActionFeedback({
        headline: "Aufgabe konnte nicht aktualisiert werden",
        detail: message,
        tone: "error",
      });
    } finally {
      setBusyKey(null);
    }
  }

  const bySource = (list: HomeTaskRow[]) =>
    SOURCE_ORDER.map((source) => ({
      source,
      tasks: list.filter((t) => t.source === source),
    })).filter((g) => g.tasks.length > 0);

  const connected = hasGoogleScope || hasMicrosoftScope;

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
            Heute &amp; Morgen
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
      <CardContent className="space-y-4">
        {notice ? (
          <p
            className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-[13px] text-emerald-900"
            role="status"
          >
            {notice}
          </p>
        ) : null}
        {error ? (
          <p
            className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[13px] text-rose-900"
            role="alert"
          >
            {error}
          </p>
        ) : null}

        {!connected ? (
          <p className="text-[13px] text-muted-foreground">
            Noch keine Aufgaben-Quellen verbunden — unter{" "}
            <Link
              href="/account"
              className="font-medium underline-offset-2 hover:underline"
            >
              Konto
            </Link>{" "}
            Google Tasks und/oder Microsoft 365 verbinden.
          </p>
        ) : focusRows.length === 0 ? (
          <p className="text-[13px] text-muted-foreground">
            Keine Aufgaben mit Fälligkeit heute oder morgen.
          </p>
        ) : (
          bySource(focusRows).map(({ source, tasks }) => (
            <SourceBlock
              key={source}
              source={source}
              tasks={tasks}
              today={today}
              busyKey={busyKey}
              justDoneKey={justDoneKey}
              draftDue={draftDue}
              setDraftDue={setDraftDue}
              patch={patch}
            />
          ))
        )}
      </CardContent>
    </Card>
  );
}

/** Rechte Seitenleiste: weitere offene Aufgaben (nicht heute/morgen). */
export function HomeTasksOtherAside({
  items,
  today,
  onChanged,
}: {
  items: HomeTaskRow[];
  today: string;
  onChanged?: () => void;
}) {
  const doneKeysRef = useRef<Set<string>>(new Set());
  const [rows, setRows] = useState(items);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setRows(items.filter((t) => !doneKeysRef.current.has(t.key)));
  }, [items]);

  const other = useMemo(
    () =>
      rows.filter((t) => !isFocusHomeTask(t, today)).sort(sortTasks),
    [rows, today]
  );

  async function complete(task: HomeTaskRow) {
    setBusyKey(task.key);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/dashboard/tasks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: task.source,
          id: task.id,
          listId: task.listId,
          etag: task.etag,
          action: "complete",
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          (json as { error?: string }).error ||
            `Update fehlgeschlagen (${res.status})`
        );
      }
      const msg = `«${task.title}» ist erledigt.`;
      doneKeysRef.current.add(task.key);
      setRows((prev) => prev.filter((t) => t.key !== task.key));
      setNotice(msg);
      showActionFeedback({
        headline: msg,
        detail: `${SOURCE_LABEL[task.source]} · weitere Aufgaben`,
        tone: "success",
      });
      window.setTimeout(() => onChanged?.(), 400);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      showActionFeedback({
        headline: "Aufgabe konnte nicht aktualisiert werden",
        detail: message,
        tone: "error",
      });
    } finally {
      setBusyKey(null);
    }
  }

  if (other.length === 0 && !notice) return null;

  const bySource = SOURCE_ORDER.map((source) => ({
    source,
    count: other.filter((t) => t.source === source).length,
  })).filter((g) => g.count > 0);

  return (
    <Card className="border-border/70">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-[16px] font-black">
          <ListTodo
            className="size-4 text-muted-foreground"
            strokeWidth={APP_ICON_STROKE}
            absoluteStrokeWidth
            aria-hidden
          />
          Weitere Aufgaben
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-[25px] font-semibold tabular-nums">
          {other.length}
        </p>
        <p className="text-[13px] text-muted-foreground">
          Offen ausserhalb heute/morgen
          {bySource.length > 0
            ? ` · ${bySource
                .map((g) => `${g.count} ${SOURCE_LABEL[g.source]}`)
                .join(", ")}`
            : ""}
        </p>
        {notice ? (
          <p className="text-[12px] text-emerald-800" role="status">
            {notice}
          </p>
        ) : null}
        {error ? (
          <p className="text-[12px] text-destructive" role="alert">
            {error}
          </p>
        ) : null}
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => setOpen((v) => !v)}
        >
          {open ? "Liste schliessen" : "Liste zeigen"}
        </Button>
        {open ? (
          <ul className="max-h-72 space-y-2 overflow-y-auto">
            {other.slice(0, 40).map((t) => (
              <li
                key={t.key}
                className="rounded-lg border border-border/40 px-2 py-1.5"
              >
                <p className="truncate text-[13px] font-semibold leading-snug">
                  {t.title}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {dueLabel(t.dueDate, today, t.overdue)} ·{" "}
                  {SOURCE_LABEL[t.source]}
                </p>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    className="h-7"
                    disabled={busyKey === t.key}
                    onClick={() => void complete(t)}
                  >
                    <Check className="size-3" strokeWidth={APP_ICON_STROKE} />
                    Erledigen
                  </Button>
                  <a
                    href={t.href}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex h-7 items-center text-[11px] text-primary underline-offset-2 hover:underline"
                  >
                    öffnen
                  </a>
                </div>
              </li>
            ))}
          </ul>
        ) : null}
      </CardContent>
    </Card>
  );
}
