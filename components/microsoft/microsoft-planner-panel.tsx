"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, ExternalLink, LayoutGrid, ListTodo, RefreshCw } from "lucide-react";
import {
  MicrosoftPlannerLogo,
  MicrosoftToDoLogo,
} from "@/components/branding/provider-logos";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { APP_ICON_STROKE } from "@/lib/branding/app-icons";
import { toSwissDate } from "@/lib/utils/dates";
import { showActionFeedback } from "@/lib/ui/action-feedback";
import { cn } from "@/lib/utils";

type PlannerTask = {
  id: string;
  title: string;
  percentComplete: number;
  status: "open" | "done";
  dueDate: string | null;
  planId: string;
  planTitle: string | null;
  bucketId: string | null;
  bucketName: string | null;
  etag: string;
  href: string;
};

type PlannerBucket = {
  id: string;
  name: string;
  planId: string;
};

type TodoTask = {
  id: string;
  listId: string;
  listTitle: string;
  title: string;
  dueDate: string | null;
  status: "open" | "done";
  overdue: boolean;
  href: string;
};

type TodoList = {
  id: string;
  displayName: string;
  wellknownListName: string | null;
};

type UnifiedRow =
  | { kind: "planner"; task: PlannerTask }
  | { kind: "todo"; task: TodoTask };

export function MicrosoftPlannerPanel() {
  const [plannerTasks, setPlannerTasks] = useState<PlannerTask[]>([]);
  const [todoTasks, setTodoTasks] = useState<TodoTask[]>([]);
  const [todoLists, setTodoLists] = useState<TodoList[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [showDone, setShowDone] = useState(false);
  const [bucketsByPlan, setBucketsByPlan] = useState<
    Record<string, PlannerBucket[]>
  >({});
  const [titleDraft, setTitleDraft] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [plannerRes, todoRes] = await Promise.all([
        fetch("/api/microsoft/planner/tasks"),
        fetch("/api/microsoft/todo/tasks"),
      ]);
      const plannerJson = await plannerRes.json();
      const todoJson = await todoRes.json();
      if (!plannerRes.ok) {
        throw new Error(plannerJson.error || "Planner laden fehlgeschlagen");
      }
      if (!todoRes.ok) {
        throw new Error(todoJson.error || "To Do laden fehlgeschlagen");
      }
      setPlannerTasks((plannerJson.tasks || []) as PlannerTask[]);
      setTodoTasks((todoJson.tasks || []) as TodoTask[]);
      setTodoLists((todoJson.lists || []) as TodoList[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const rows = useMemo((): UnifiedRow[] => {
    const planner: UnifiedRow[] = plannerTasks
      .filter((t) => (showDone ? true : t.status === "open"))
      .map((task) => ({ kind: "planner" as const, task }));
    const todo: UnifiedRow[] = todoTasks
      .filter((t) => (showDone ? true : t.status === "open"))
      .map((task) => ({ kind: "todo" as const, task }));
    const all = [...planner, ...todo];
    all.sort((a, b) => {
      const aOver =
        a.kind === "todo"
          ? a.task.overdue
          : Boolean(
              a.task.status === "open" &&
                a.task.dueDate &&
                a.task.dueDate < new Date().toISOString().slice(0, 10)
            );
      const bOver =
        b.kind === "todo"
          ? b.task.overdue
          : Boolean(
              b.task.status === "open" &&
                b.task.dueDate &&
                b.task.dueDate < new Date().toISOString().slice(0, 10)
            );
      if (aOver !== bOver) return aOver ? -1 : 1;
      const da = a.task.dueDate || "9999-99-99";
      const db = b.task.dueDate || "9999-99-99";
      const c = da.localeCompare(db);
      if (c !== 0) return c;
      return a.task.title.localeCompare(b.task.title, "de");
    });
    return all;
  }, [plannerTasks, todoTasks, showDone]);

  const openCount = useMemo(() => {
    const p = plannerTasks.filter((t) => t.status === "open").length;
    const t = todoTasks.filter((t) => t.status === "open").length;
    return p + t;
  }, [plannerTasks, todoTasks]);

  const rowKey = (row: UnifiedRow) =>
    row.kind === "planner" ? `planner:${row.task.id}` : `todo:${row.task.listId}:${row.task.id}`;

  async function ensureBuckets(planId: string) {
    if (bucketsByPlan[planId]) return bucketsByPlan[planId];
    const res = await fetch(
      `/api/microsoft/planner/tasks?planId=${encodeURIComponent(planId)}`
    );
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "Buckets laden fehlgeschlagen");
    const buckets = (json.buckets || []) as PlannerBucket[];
    setBucketsByPlan((prev) => ({ ...prev, [planId]: buckets }));
    return buckets;
  }

  async function patchPlanner(
    task: PlannerTask,
    patch: {
      percentComplete?: number;
      bucketId?: string;
      dueDate?: string | null;
    }
  ) {
    const key = `planner:${task.id}`;
    setBusyKey(key);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/microsoft/planner/tasks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          taskId: task.id,
          etag: task.etag,
          ...patch,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Update fehlgeschlagen");
      const updated = json.task as PlannerTask;
      setPlannerTasks((prev) =>
        prev.map((t) => (t.id === updated.id ? { ...t, ...updated } : t))
      );
      let msg = `«${task.title}» aktualisiert.`;
      if (typeof patch.percentComplete === "number") {
        msg =
          patch.percentComplete >= 100
            ? `«${task.title}» ist erledigt.`
            : `«${task.title}» wieder geöffnet.`;
      } else if (patch.dueDate !== undefined) {
        msg = patch.dueDate
          ? `«${task.title}» neu terminiert auf ${toSwissDate(patch.dueDate) || patch.dueDate}.`
          : `Termin bei «${task.title}» entfernt.`;
      } else if (patch.bucketId) {
        msg = `«${task.title}» in anderen Bucket verschoben.`;
      }
      setNotice(msg);
      showActionFeedback({
        headline: msg,
        detail: "Microsoft Planner",
        tone: "success",
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      showActionFeedback({
        headline: "Planner-Update fehlgeschlagen",
        detail: message,
        tone: "error",
      });
      await load();
    } finally {
      setBusyKey(null);
    }
  }

  async function patchTodo(
    task: TodoTask,
    patch: {
      status?: "notStarted" | "completed";
      dueDate?: string | null;
      title?: string;
      moveToListId?: string;
    }
  ) {
    const key = `todo:${task.listId}:${task.id}`;
    setBusyKey(key);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/microsoft/todo/tasks", {
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
      const updated = json.task as TodoTask;
      const moved = Boolean(patch.moveToListId && patch.moveToListId !== task.listId);
      setTodoTasks((prev) => {
        if (moved) {
          return prev
            .filter((t) => !(t.id === task.id && t.listId === task.listId))
            .concat(updated);
        }
        return prev.map((t) =>
          t.id === task.id && t.listId === task.listId ? { ...t, ...updated } : t
        );
      });
      let msg = `«${task.title}» aktualisiert.`;
      if (patch.status === "completed") msg = `«${task.title}» ist erledigt.`;
      else if (patch.status === "notStarted") msg = `«${task.title}» wieder geöffnet.`;
      else if (patch.title) msg = `«${task.title}» umbenannt.`;
      else if (patch.dueDate !== undefined) {
        msg = patch.dueDate
          ? `«${updated.title}» neu terminiert auf ${toSwissDate(patch.dueDate) || patch.dueDate}.`
          : `Termin bei «${updated.title}» entfernt.`;
      } else if (moved) {
        msg = `«${updated.title}» in «${updated.listTitle}» verschoben.`;
      }
      setNotice(msg);
      showActionFeedback({
        headline: msg,
        detail: "Microsoft To Do",
        tone: "success",
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      showActionFeedback({
        headline: "To-Do-Update fehlgeschlagen",
        detail: message,
        tone: "error",
      });
      await load();
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium">Planner &amp; To Do</p>
          <p className="text-xs text-muted-foreground">
            {openCount} offen
            {plannerTasks.length + todoTasks.length > openCount
              ? ` · ${plannerTasks.length + todoTasks.length - openCount} erledigt (Planner)`
              : null}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
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

      {loading && rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">Lade Aufgaben…</p>
      ) : null}

      {!loading && rows.length === 0 ? (
        <Card>
          <CardContent className="p-5 text-sm text-muted-foreground">
            Keine {showDone ? "" : "offenen "}Aufgaben in Planner oder To Do.
          </CardContent>
        </Card>
      ) : null}

      <ul className="space-y-2">
        {rows.map((row) => {
          const key = rowKey(row);
          const busy = busyKey === key;
          if (row.kind === "planner") {
            const task = row.task;
            const buckets = bucketsByPlan[task.planId] || [];
            return (
              <li key={key}>
                <Card>
                  <CardContent className="space-y-2 p-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="mb-1 flex items-center gap-1.5">
                          <MicrosoftPlannerLogo className="size-3.5" />
                          <span className="text-[10px] font-semibold uppercase tracking-wide text-teal-800">
                            Planner
                          </span>
                        </div>
                        <p className="text-sm font-medium leading-snug">
                          {task.title}
                        </p>
                        <p className="mt-0.5 text-[11px] text-muted-foreground">
                          {[
                            task.planTitle || "Plan",
                            task.bucketName,
                            task.dueDate
                              ? `fällig ${toSwissDate(task.dueDate)}`
                              : null,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                      </div>
                      <Badge
                        variant={
                          task.status === "done" ? "secondary" : "outline"
                        }
                        className="text-[10px]"
                      >
                        {task.status === "done"
                          ? "Erledigt"
                          : `${task.percentComplete}%`}
                      </Badge>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {task.status === "open" ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          disabled={busy}
                          onClick={() =>
                            void patchPlanner(task, { percentComplete: 100 })
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
                            void patchPlanner(task, { percentComplete: 0 })
                          }
                        >
                          Wieder öffnen
                        </Button>
                      )}

                      <input
                        type="date"
                        className="h-8 rounded-md border border-border bg-background px-2 text-xs"
                        disabled={busy}
                        value={task.dueDate || ""}
                        onChange={(e) => {
                          const dueDate = e.target.value || null;
                          if (dueDate === (task.dueDate || null)) return;
                          void patchPlanner(task, { dueDate });
                        }}
                        title="Fälligkeit neu setzen"
                      />

                      <div className="inline-flex items-center gap-1.5">
                        <LayoutGrid
                          className="size-3.5 text-muted-foreground"
                          strokeWidth={APP_ICON_STROKE}
                        />
                        <select
                          className="h-8 max-w-[12rem] rounded-md border border-border bg-background px-2 text-xs"
                          disabled={busy}
                          value={task.bucketId || ""}
                          onFocus={() => {
                            void ensureBuckets(task.planId).catch((err) =>
                              setError(
                                err instanceof Error ? err.message : String(err)
                              )
                            );
                          }}
                          onChange={(e) => {
                            const bucketId = e.target.value;
                            if (!bucketId || bucketId === task.bucketId) return;
                            void patchPlanner(task, { bucketId });
                          }}
                        >
                          {buckets.length === 0 ? (
                            <option value={task.bucketId || ""}>
                              {task.bucketName || "Bucket laden…"}
                            </option>
                          ) : (
                            buckets.map((b) => (
                              <option key={b.id} value={b.id}>
                                {b.name}
                              </option>
                            ))
                          )}
                        </select>
                      </div>

                      <a
                        href={task.href}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-primary underline-offset-2 hover:underline"
                      >
                        <ExternalLink
                          className="size-3"
                          strokeWidth={APP_ICON_STROKE}
                        />
                        In Planner
                      </a>
                    </div>
                  </CardContent>
                </Card>
              </li>
            );
          }

          const task = row.task;
          const draftKey = key;
          const titleValue = titleDraft[draftKey] ?? task.title;
          return (
            <li key={key}>
              <Card>
                <CardContent className="space-y-2 p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-center gap-1.5">
                        <MicrosoftToDoLogo className="size-3.5" />
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-violet-800">
                          To Do
                        </span>
                      </div>
                      <input
                        className="w-full rounded-md border border-transparent bg-transparent px-0 text-sm font-medium leading-snug outline-none focus:border-border focus:bg-background focus:px-2 focus:py-1"
                        disabled={busy}
                        value={titleValue}
                        onChange={(e) =>
                          setTitleDraft((prev) => ({
                            ...prev,
                            [draftKey]: e.target.value,
                          }))
                        }
                        onBlur={() => {
                          const next = (titleDraft[draftKey] ?? task.title).trim();
                          if (!next || next === task.title) {
                            setTitleDraft((prev) => {
                              const copy = { ...prev };
                              delete copy[draftKey];
                              return copy;
                            });
                            return;
                          }
                          void patchTodo(task, { title: next }).then(() => {
                            setTitleDraft((prev) => {
                              const copy = { ...prev };
                              delete copy[draftKey];
                              return copy;
                            });
                          });
                        }}
                        title="Titel bearbeiten"
                      />
                      <p className="text-[11px] text-muted-foreground">
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
                      variant={task.status === "done" ? "secondary" : "outline"}
                      className="text-[10px]"
                    >
                      {task.status === "done" ? "Erledigt" : "Offen"}
                    </Badge>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {task.status === "open" ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        disabled={busy}
                        onClick={() =>
                          void patchTodo(task, { status: "completed" })
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
                          void patchTodo(task, { status: "notStarted" })
                        }
                      >
                        Wieder öffnen
                      </Button>
                    )}

                    <input
                      type="date"
                      className="h-8 rounded-md border border-border bg-background px-2 text-xs"
                      disabled={busy}
                      value={task.dueDate || ""}
                      onChange={(e) => {
                        const dueDate = e.target.value || null;
                        if (dueDate === (task.dueDate || null)) return;
                        void patchTodo(task, { dueDate });
                      }}
                      title="Fälligkeit neu setzen"
                    />

                    <div className="inline-flex items-center gap-1.5">
                      <ListTodo
                        className="size-3.5 text-muted-foreground"
                        strokeWidth={APP_ICON_STROKE}
                      />
                      <select
                        className="h-8 max-w-[12rem] rounded-md border border-border bg-background px-2 text-xs"
                        disabled={busy || todoLists.length === 0}
                        value={task.listId}
                        onChange={(e) => {
                          const moveToListId = e.target.value;
                          if (!moveToListId || moveToListId === task.listId)
                            return;
                          void patchTodo(task, { moveToListId });
                        }}
                        title="In andere Liste verschieben"
                      >
                        {todoLists.length === 0 ? (
                          <option value={task.listId}>
                            {task.listTitle || "Liste"}
                          </option>
                        ) : (
                          todoLists.map((l) => (
                            <option key={l.id} value={l.id}>
                              {l.displayName}
                            </option>
                          ))
                        )}
                      </select>
                    </div>

                    <a
                      href={task.href}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-primary underline-offset-2 hover:underline"
                    >
                      <ExternalLink
                        className="size-3"
                        strokeWidth={APP_ICON_STROKE}
                      />
                      In To Do
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
