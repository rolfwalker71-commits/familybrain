"use client";

import { useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import Link from "next/link";
import { Check, CheckSquare, ChevronDown, ExternalLink, LayoutGrid } from "lucide-react";
import { AgendaAiIconThumb } from "@/components/calendar/agenda-ai-icon-thumb";
import { weekdayLabel } from "@/components/calendar/agenda-row";
import {
  GoogleTasksLogo,
  MicrosoftPlannerLogo,
} from "@/components/branding/provider-logos";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { APP_ICON_STROKE } from "@/lib/branding/app-icons";
import { showActionFeedback } from "@/lib/ui/action-feedback";
import { toSwissDate } from "@/lib/utils/dates";
import { cn } from "@/lib/utils";

export type HomeTaskRow = {
  key: string;
  id: string;
  source: "google" | "todo" | "planner";
  title: string;
  dueDate: string | null;
  overdue: boolean;
  subtitle: string;
  accountLabel?: string | null;
  bucketLabel?: string | null;
  href: string;
  listId: string | null;
  etag: string | null;
  listTitle?: string;
  planId?: string | null;
  bucketId?: string | null;
};

type PlannerBucketOption = { id: string; name: string };

const SOURCE_LABEL: Record<HomeTaskRow["source"], string> = {
  google: "Google Tasks",
  todo: "Outlook To Do",
  planner: "Planner",
};

const SOURCE_ORDER: HomeTaskRow["source"][] = ["planner", "todo", "google"];

const ACCOUNT_CHIP: Record<HomeTaskRow["source"], string> = {
  google: "border-sky-200/80 bg-sky-100 text-sky-950",
  todo: "border-violet-200/80 bg-violet-100 text-violet-950",
  planner: "border-teal-200/80 bg-teal-100 text-teal-950",
};

const BUCKET_CHIP: Record<HomeTaskRow["source"], string> = {
  google: "border-sky-200/60 bg-sky-50 text-sky-900",
  todo: "border-violet-200/60 bg-violet-50 text-violet-900",
  planner: "border-teal-200/60 bg-teal-50 text-teal-900",
};

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

function accountChipLabel(task: HomeTaskRow): string {
  const raw = (task.accountLabel || "").trim();
  if (task.source === "google") return raw || "Privat · Google";
  if (raw) return raw;
  if (task.source === "todo") return "Arbeit · Microsoft";
  return "Arbeit · Planner";
}

function bucketChipLabel(task: HomeTaskRow): string | null {
  const raw = (task.bucketLabel || task.listTitle || "").trim();
  if (raw) return raw;
  const sub = (task.subtitle || "").trim();
  if (!sub) return null;
  if (task.source === "planner" && sub.includes(" · ")) {
    return sub.split(" · ").slice(1).join(" · ") || null;
  }
  return sub;
}

function TaskChips({ task }: { task: HomeTaskRow }) {
  const account = accountChipLabel(task);
  const bucket = bucketChipLabel(task);
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Badge
        variant="outline"
        className={cn(
          "h-5 rounded-md border px-1.5 text-[10px] font-semibold",
          ACCOUNT_CHIP[task.source]
        )}
      >
        {account}
      </Badge>
      {bucket ? (
        <Badge
          variant="outline"
          className={cn(
            "h-5 max-w-[14rem] truncate rounded-md border px-1.5 text-[10px] font-medium",
            BUCKET_CHIP[task.source]
          )}
          title={bucket}
        >
          {bucket}
        </Badge>
      ) : null}
    </div>
  );
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
  onMoveBucket,
  buckets,
  onEnsureBuckets,
  compact,
}: {
  task: HomeTaskRow;
  today: string;
  busy: boolean;
  justDone?: boolean;
  dueValue: string;
  onDueDraft: (v: string) => void;
  onComplete: () => void;
  onReschedule: () => void;
  onMoveBucket?: (bucketId: string) => void;
  buckets?: PlannerBucketOption[];
  onEnsureBuckets?: () => void;
  compact?: boolean;
}) {
  return (
    <li
      className={cn(
        "flex flex-wrap items-start gap-3 rounded-xl border px-2.5 py-2 sm:flex-nowrap transition-colors",
        justDone
          ? "border-emerald-300 bg-emerald-50"
          : task.source === "google"
            ? "border-sky-200/80 bg-sky-50/40"
            : task.source === "todo"
              ? "border-violet-200/70 bg-violet-50/30"
              : "border-teal-200/70 bg-teal-50/30"
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
        imgClassName={cn(
          "rounded-lg",
          compact ? "size-9 sm:size-10" : "size-11 sm:size-12"
        )}
      />
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0 space-y-1">
            <p className="text-[14px] font-black leading-snug">{task.title}</p>
            {justDone ? (
              <p className="text-[12px] font-medium text-emerald-800">
                Als erledigt markiert
              </p>
            ) : (
              <>
                <p className="text-[12px] text-muted-foreground">
                  <span
                    className={cn(task.overdue && "font-medium text-rose-700")}
                  >
                    {dueLabel(task.dueDate, today, task.overdue)}
                  </span>
                  {` · ${SOURCE_LABEL[task.source]}`}
                </p>
                <TaskChips task={task} />
              </>
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
            {task.source === "planner" && task.planId && onMoveBucket ? (
              <div className="inline-flex items-center gap-1.5">
                <LayoutGrid
                  className="size-3.5 text-muted-foreground"
                  strokeWidth={APP_ICON_STROKE}
                  aria-hidden
                />
                <select
                  className="h-8 max-w-[12rem] rounded-md border border-border bg-background px-2 text-[12px]"
                  disabled={busy}
                  value={task.bucketId || ""}
                  title="Planner-Bucket"
                  aria-label="Planner-Bucket"
                  onFocus={() => onEnsureBuckets?.()}
                  onChange={(e) => {
                    const bucketId = e.target.value;
                    if (!bucketId || bucketId === (task.bucketId || "")) return;
                    onMoveBucket(bucketId);
                  }}
                >
                  {(buckets || []).length === 0 ? (
                    <option value={task.bucketId || ""}>
                      {task.bucketLabel || "Bucket laden…"}
                    </option>
                  ) : (
                    (buckets || []).map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))
                  )}
                </select>
              </div>
            ) : null}
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
  bucketsByPlan,
  ensureBuckets,
  compact,
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
    action: "complete" | "reschedule" | "moveBucket",
    dueDate?: string | null,
    bucketId?: string
  ) => Promise<void>;
  bucketsByPlan: Record<string, PlannerBucketOption[]>;
  ensureBuckets: (planId: string) => void;
  compact?: boolean;
}) {
  if (tasks.length === 0) return null;
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-[13px] font-bold tracking-tight">
          {SOURCE_LABEL[source]}
          {source === "google" ? (
            <span className="ml-1.5 text-[11px] font-medium text-sky-800">
              privat
            </span>
          ) : source === "todo" || source === "planner" ? (
            <span className="ml-1.5 text-[11px] font-medium text-violet-800">
              Arbeit
            </span>
          ) : null}
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
            onMoveBucket={
              t.source === "planner"
                ? (bucketId) => void patch(t, "moveBucket", undefined, bucketId)
                : undefined
            }
            buckets={
              t.planId ? bucketsByPlan[t.planId] || undefined : undefined
            }
            onEnsureBuckets={
              t.planId ? () => ensureBuckets(t.planId!) : undefined
            }
            compact={compact}
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
  const [laterOpen, setLaterOpen] = useState(false);
  const [bucketsByPlan, setBucketsByPlan] = useState<
    Record<string, PlannerBucketOption[]>
  >({});
  const bucketsLoadingRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    setRows(items.filter((t) => !doneKeysRef.current.has(t.key)));
  }, [items]);

  const focusRows = useMemo(
    () => rows.filter((t) => isFocusHomeTask(t, today)).sort(sortTasks),
    [rows, today]
  );

  const laterRows = useMemo(
    () =>
      rows.filter((t) => !isFocusHomeTask(t, today)).sort(sortTasks),
    [rows, today]
  );

  function ensureBuckets(planId: string) {
    if (!planId || bucketsByPlan[planId] || bucketsLoadingRef.current.has(planId)) {
      return;
    }
    bucketsLoadingRef.current.add(planId);
    void (async () => {
      try {
        const res = await fetch(
          `/api/microsoft/planner/tasks?planId=${encodeURIComponent(planId)}`
        );
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(
            (json as { error?: string }).error ||
              "Buckets konnten nicht geladen werden."
          );
        }
        const buckets = ((json as { buckets?: PlannerBucketOption[] }).buckets ||
          []) as PlannerBucketOption[];
        setBucketsByPlan((prev) => ({ ...prev, [planId]: buckets }));
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        bucketsLoadingRef.current.delete(planId);
      }
    })();
  }

  async function patch(
    task: HomeTaskRow,
    action: "complete" | "reschedule" | "moveBucket",
    dueDate?: string | null,
    bucketId?: string
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
          bucketId: action === "moveBucket" ? bucketId : undefined,
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
      } else if (action === "moveBucket") {
        const updated = (json as {
          task?: {
            etag?: string;
            bucketId?: string | null;
            bucketName?: string | null;
            planTitle?: string | null;
          };
        }).task;
        const nextBucketId = updated?.bucketId ?? bucketId ?? task.bucketId;
        const nextBucketName =
          updated?.bucketName ??
          (bucketId
            ? bucketsByPlan[task.planId || ""]?.find((b) => b.id === bucketId)
                ?.name
            : null) ??
          task.bucketLabel;
        const plan = updated?.planTitle || task.accountLabel || "Planner";
        setRows((prev) =>
          prev.map((t) =>
            t.key === task.key
              ? {
                  ...t,
                  bucketId: nextBucketId ?? null,
                  bucketLabel: nextBucketName ?? null,
                  subtitle: [plan, nextBucketName].filter(Boolean).join(" · "),
                  etag: updated?.etag ?? t.etag,
                }
              : t
          )
        );
        const msg = nextBucketName
          ? `«${task.title}» nach «${nextBucketName}» verschoben.`
          : `«${task.title}» in anderen Bucket verschoben.`;
        setNotice(msg);
        showActionFeedback({
          headline: msg,
          detail: "Microsoft Planner",
          tone: "success",
        });
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
          ? `«${task.title}» neu terminiert auf ${toSwissDate(nextDue)}.`
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
                className="inline-flex items-center gap-1.5 font-medium underline-offset-2 hover:underline"
              >
                <MicrosoftPlannerLogo className="size-3.5" />
                Planner
              </Link>
            ) : null}
            {hasGoogleScope ? (
              <Link
                href="/google?tab=tasks"
                className="inline-flex items-center gap-1.5 font-medium underline-offset-2 hover:underline"
              >
                <GoogleTasksLogo className="size-3.5" />
                Google Tasks
              </Link>
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
              bucketsByPlan={bucketsByPlan}
              ensureBuckets={ensureBuckets}
            />
          ))
        )}

        {connected && laterRows.length > 0 ? (
          <div className="border-t border-border/60 pt-3">
            <button
              type="button"
              className="flex w-full items-center justify-between gap-2 rounded-lg px-1 py-1.5 text-left hover:bg-muted/40"
              onClick={() => setLaterOpen((v) => !v)}
              aria-expanded={laterOpen}
            >
              <span className="text-[13px] font-bold tracking-tight">
                Später fällig
                <span className="ml-2 font-medium text-muted-foreground">
                  {laterRows.length}
                </span>
              </span>
              <ChevronDown
                className={cn(
                  "size-4 shrink-0 text-muted-foreground transition-transform",
                  laterOpen && "rotate-180"
                )}
                aria-hidden
              />
            </button>
            {laterOpen ? (
              <div className="mt-3 space-y-4">
                {bySource(laterRows).map(({ source, tasks }) => (
                  <SourceBlock
                    key={`later-${source}`}
                    source={source}
                    tasks={tasks}
                    today={today}
                    busyKey={busyKey}
                    justDoneKey={justDoneKey}
                    draftDue={draftDue}
                    setDraftDue={setDraftDue}
                    patch={patch}
                    bucketsByPlan={bucketsByPlan}
                    ensureBuckets={ensureBuckets}
                    compact
                  />
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
