"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, ExternalLink, LayoutGrid, RefreshCw } from "lucide-react";
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

export function MicrosoftPlannerPanel() {
  const [tasks, setTasks] = useState<PlannerTask[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [showDone, setShowDone] = useState(false);
  const [bucketsByPlan, setBucketsByPlan] = useState<
    Record<string, PlannerBucket[]>
  >({});

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/microsoft/planner/tasks");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Laden fehlgeschlagen");
      setTasks((json.tasks || []) as PlannerTask[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const visible = useMemo(
    () => (showDone ? tasks : tasks.filter((t) => t.status === "open")),
    [tasks, showDone]
  );

  const openCount = useMemo(
    () => tasks.filter((t) => t.status === "open").length,
    [tasks]
  );

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

  async function patchTask(
    task: PlannerTask,
    patch: {
      percentComplete?: number;
      bucketId?: string;
      dueDate?: string | null;
    }
  ) {
    setBusyId(task.id);
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
      setTasks((prev) =>
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
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium">Mir zugewiesen</p>
          <p className="text-xs text-muted-foreground">
            {openCount} offen
            {tasks.length > openCount
              ? ` · ${tasks.length - openCount} erledigt`
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
          className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900"
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
        <p className="text-sm text-muted-foreground">Lade Planner-Aufgaben…</p>
      ) : null}

      {!loading && visible.length === 0 ? (
        <Card>
          <CardContent className="p-5 text-sm text-muted-foreground">
            Keine {showDone ? "" : "offenen "}Planner-Aufgaben gefunden.
          </CardContent>
        </Card>
      ) : null}

      <ul className="space-y-2">
        {visible.map((task) => {
          const busy = busyId === task.id;
          const buckets = bucketsByPlan[task.planId] || [];
          return (
            <li key={task.id}>
              <Card>
                <CardContent className="space-y-2 p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
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
                          void patchTask(task, { percentComplete: 100 })
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
                          void patchTask(task, { percentComplete: 0 })
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
                        void patchTask(task, { dueDate });
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
                          void patchTask(task, { bucketId });
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
        })}
      </ul>
    </div>
  );
}
