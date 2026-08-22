"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Check, ExternalLink, ListTodo, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { APP_ICON_STROKE } from "@/lib/branding/app-icons";
import { toSwissDate } from "@/lib/utils/dates";
import { showActionFeedback } from "@/lib/ui/action-feedback";
import { cn } from "@/lib/utils";

type GoogleTask = {
  id: string;
  listId: string;
  listTitle: string;
  title: string;
  notes: string | null;
  dueDate: string | null;
  status: string;
  overdue: boolean;
  href: string;
};

type GoogleTaskList = {
  id: string;
  title: string;
};

function isDone(status: string): boolean {
  return status.toLowerCase() === "completed";
}

export function GoogleTasksPanel() {
  const [tasks, setTasks] = useState<GoogleTask[]>([]);
  const [lists, setLists] = useState<GoogleTaskList[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [showDone, setShowDone] = useState(false);
  const [listFilter, setListFilter] = useState<string>("all");
  const [connected, setConnected] = useState(true);
  const [hasTasksScope, setHasTasksScope] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/google/tasks?managed=1&horizon=45&includeCompleted=${showDone ? "1" : "0"}`
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Laden fehlgeschlagen");
      setConnected(Boolean(json.connected));
      setHasTasksScope(Boolean(json.hasTasksScope));
      setLists((json.lists || []) as GoogleTaskList[]);
      setTasks((json.tasks || []) as GoogleTask[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [showDone]);

  useEffect(() => {
    void load();
  }, [load]);

  const visible = useMemo(() => {
    let rows = showDone ? tasks : tasks.filter((t) => !isDone(t.status));
    if (listFilter !== "all") {
      rows = rows.filter((t) => t.listId === listFilter);
    }
    return rows;
  }, [tasks, showDone, listFilter]);

  const openCount = useMemo(
    () => tasks.filter((t) => !isDone(t.status)).length,
    [tasks]
  );

  async function patchTask(
    task: GoogleTask,
    patch: {
      status?: "needsAction" | "completed";
      dueDate?: string | null;
      targetListId?: string;
    }
  ) {
    const key = `${task.listId}:${task.id}`;
    setBusyKey(key);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/google/tasks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          taskId: task.id,
          listId: task.listId,
          ...patch,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Update fehlgeschlagen");
      const updated = json.task as GoogleTask;
      const oldKey = `${task.listId}:${task.id}`;
      const newKey = `${updated.listId}:${updated.id}`;
      setTasks((prev) => {
        const without = prev.filter(
          (t) => `${t.listId}:${t.id}` !== oldKey && `${t.listId}:${t.id}` !== newKey
        );
        if (!showDone && isDone(updated.status)) return without;
        return [...without, updated].sort((a, b) => {
          const aDone = isDone(a.status) ? 1 : 0;
          const bDone = isDone(b.status) ? 1 : 0;
          if (aDone !== bDone) return aDone - bDone;
          if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
          return (a.dueDate || "9999").localeCompare(b.dueDate || "9999");
        });
      });
      let msg = `«${task.title}» aktualisiert.`;
      if (patch.status === "completed") {
        msg = `«${task.title}» ist erledigt.`;
      } else if (patch.status === "needsAction") {
        msg = `«${task.title}» wieder geöffnet.`;
      } else if (patch.dueDate !== undefined) {
        msg = patch.dueDate
          ? `«${task.title}» neu terminiert auf ${toSwissDate(patch.dueDate)}.`
          : `Termin bei «${task.title}» entfernt.`;
      } else if (patch.targetListId) {
        msg = `«${task.title}» in «${updated.listTitle || "andere Liste"}» verschoben.`;
      }
      setNotice(msg);
      showActionFeedback({
        headline: msg,
        detail: "Google Tasks · privat",
        tone: "success",
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      showActionFeedback({
        headline: "Google-Task-Update fehlgeschlagen",
        detail: message,
        tone: "error",
      });
      await load();
    } finally {
      setBusyKey(null);
    }
  }

  if (!connected) {
    return (
      <Card className="border-sky-200/70 bg-sky-50/40 dark:border-sky-400/30 dark:bg-sky-500/10">
        <CardContent className="space-y-2 p-5 text-sm">
          <p className="font-medium text-sky-950">Google nicht verbunden</p>
          <p className="text-muted-foreground">
            Unter{" "}
            <Link href="/account" className="underline-offset-2 hover:underline">
              Konto
            </Link>{" "}
            Google verbinden, um private Tasks zu sehen.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (!hasTasksScope) {
    return (
      <Card className="border-sky-200/70 bg-sky-50/40 dark:border-sky-400/30 dark:bg-sky-500/10">
        <CardContent className="space-y-2 p-5 text-sm">
          <p className="font-medium text-sky-950">Tasks-Recht fehlt</p>
          <p className="text-muted-foreground">
            Bitte Google unter Konto neu verbinden (Scope Tasks).
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium text-sky-950">Private Aufgaben</p>
          <p className="text-xs text-muted-foreground">
            {openCount} offen
            {tasks.length > openCount
              ? ` · ${tasks.length - openCount} erledigt`
              : null}
            {" · "}Google Tasks
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            className="h-8 max-w-[12rem] rounded-md border border-sky-200/80 bg-sky-50/50 px-2 text-xs dark:border-sky-400/30 dark:bg-sky-500/10"
            value={listFilter}
            onChange={(e) => setListFilter(e.target.value)}
            aria-label="Liste filtern"
          >
            <option value="all">Alle Listen</option>
            {lists.map((l) => (
              <option key={l.id} value={l.id}>
                {l.title}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={showDone}
              onChange={(e) => setShowDone(e.target.checked)}
            />
            Erledigte zeigen
          </label>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={loading}
            onClick={() => void load()}
          >
            <RefreshCw
              className={cn("size-3.5", loading && "animate-spin")}
              strokeWidth={APP_ICON_STROKE}
            />
            Aktualisieren
          </Button>
        </div>
      </div>

      {notice ? (
        <p
          className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:border-emerald-400/30 dark:bg-emerald-500/12 dark:text-emerald-100"
          role="status"
        >
          {notice}
        </p>
      ) : null}
      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}

      {loading && tasks.length === 0 ? (
        <p className="text-sm text-muted-foreground">Lade Google Tasks…</p>
      ) : null}

      {!loading && visible.length === 0 ? (
        <Card className="border-sky-200/60">
          <CardContent className="p-5 text-sm text-muted-foreground">
            Keine {showDone ? "" : "offenen "}Google-Tasks gefunden.
          </CardContent>
        </Card>
      ) : null}

      <ul className="space-y-2">
        {visible.map((task) => {
          const key = `${task.listId}:${task.id}`;
          const busy = busyKey === key;
          const done = isDone(task.status);
          return (
            <li key={key}>
              <Card className="border-sky-200/70 bg-sky-50/30 dark:border-sky-400/30 dark:bg-sky-500/10">
                <CardContent className="space-y-2 p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium leading-snug">
                        {task.title}
                      </p>
                      <p className="mt-0.5 text-[0.6875rem] text-muted-foreground">
                        {[
                          task.listTitle || "Liste",
                          task.dueDate
                            ? `fällig ${toSwissDate(task.dueDate)}`
                            : "ohne Datum",
                          task.overdue ? "überfällig" : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </div>
                    <Badge
                      variant={done ? "secondary" : "outline"}
                      className={cn(
                        "text-[0.625rem]",
                        !done &&
                          "border-sky-300/80 bg-sky-100/80 text-sky-950 dark:border-sky-400/40 dark:bg-sky-500/20 dark:text-sky-100"
                      )}
                    >
                      {done ? "Erledigt" : "Privat"}
                    </Badge>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {!done ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        disabled={busy}
                        onClick={() =>
                          void patchTask(task, { status: "completed" })
                        }
                      >
                        <Check
                          className="size-3.5"
                          strokeWidth={APP_ICON_STROKE}
                        />
                        Erledigen
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={() =>
                          void patchTask(task, { status: "needsAction" })
                        }
                      >
                        Wieder öffnen
                      </Button>
                    )}

                    <input
                      type="date"
                      className="h-8 rounded-md border border-sky-200/80 bg-background px-2 text-xs"
                      disabled={busy || done}
                      value={task.dueDate || ""}
                      onChange={(e) => {
                        const dueDate = e.target.value || null;
                        if (dueDate === (task.dueDate || null)) return;
                        void patchTask(task, { dueDate });
                      }}
                      title="Fälligkeit neu setzen"
                    />

                    <div className="inline-flex items-center gap-1.5">
                      <ListTodo
                        className="size-3.5 text-sky-700/80"
                        strokeWidth={APP_ICON_STROKE}
                      />
                      <select
                        className="h-8 max-w-[12rem] rounded-md border border-sky-200/80 bg-background px-2 text-xs"
                        disabled={busy || done || lists.length === 0}
                        value={task.listId}
                        title="Liste wechseln"
                        aria-label="Google-Task-Liste"
                        onChange={(e) => {
                          const targetListId = e.target.value;
                          if (!targetListId || targetListId === task.listId)
                            return;
                          void patchTask(task, { targetListId });
                        }}
                      >
                        {lists.map((l) => (
                          <option key={l.id} value={l.id}>
                            {l.title}
                          </option>
                        ))}
                      </select>
                    </div>

                    <a
                      href={task.href}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-sky-800 underline-offset-2 hover:underline"
                    >
                      <ExternalLink
                        className="size-3"
                        strokeWidth={APP_ICON_STROKE}
                      />
                      In Google Tasks
                    </a>
                  </div>
                </CardContent>
              </Card>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
