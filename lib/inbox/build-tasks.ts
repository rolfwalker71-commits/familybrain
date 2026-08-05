import { getDb } from "@/lib/db/client";
import { listOpenUnpaidInvoices, publicAiIconUrl } from "@/lib/db/queries";
import {
  countPendingTriageDocuments,
  listPendingTriageDocuments,
} from "@/lib/documents/triage";
import { paymentMethodLabel } from "@/lib/finance/payment-methods";
import {
  ACTION_OVERDUE_LOOKBACK_DAYS,
  ACTION_WARRANTY_AHEAD_DAYS,
} from "@/lib/utils/due-urgency";
import {
  effectiveTaskStatus,
  listCompletedInboxStates,
  listInboxTaskStates,
  type InboxTaskStateRow,
} from "@/lib/inbox/task-state";
import {
  inboxTaskId,
  type InboxTask,
  type InboxTaskBoard,
  type InboxSourceKind,
  type InboxTriagePayload,
} from "@/lib/inbox/types";

function daysFromNow(days: number): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + days);
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, "0"),
    String(d.getDate()).padStart(2, "0"),
  ].join("-");
}

function daysAgo(days: number): string {
  return daysFromNow(-days);
}

function todayIso(): string {
  return daysFromNow(0);
}

function applyState(
  task: InboxTask,
  state: InboxTaskStateRow | undefined
): InboxTask {
  const status = effectiveTaskStatus(state);
  return {
    ...task,
    status,
    snoozedUntil: state?.snoozed_until ?? null,
    completedAt: state?.completed_at ?? null,
  };
}

function sortByPriority(a: InboxTask, b: InboxTask): number {
  if (b.priority !== a.priority) return b.priority - a.priority;
  const ad = a.dueDate || "9999";
  const bd = b.dueDate || "9999";
  return ad.localeCompare(bd);
}

function hydrateCompletedFromState(
  states: InboxTaskStateRow[],
  liveById: Map<string, InboxTask>
): InboxTask[] {
  const out: InboxTask[] = [];
  for (const state of states) {
    const id = inboxTaskId(state.source_kind, state.source_id);
    const live = liveById.get(id);
    if (live) {
      out.push({
        ...live,
        status: state.status,
        snoozedUntil: state.snoozed_until,
        completedAt: state.completed_at,
      });
      continue;
    }
    out.push({
      id,
      sourceKind: state.source_kind,
      sourceId: state.source_id,
      title: titleForGhost(state),
      subtitle: state.note,
      href: hrefForGhost(state),
      dueDate: null,
      priority: 0,
      status: state.status,
      snoozedUntil: state.snoozed_until,
      completedAt: state.completed_at,
      amount: null,
      currency: null,
      aiIconUrl: null,
      category: null,
      paperlessId: null,
      documentLocalId: null,
      triage: null,
      analysisBucket: state.source_kind === "analysis"
        ? (state.source_id as "pending" | "error" | "stale")
        : null,
      analysisCount: null,
      paymentPipeline: null,
    });
  }
  return out;
}

function titleForGhost(state: InboxTaskStateRow): string {
  switch (state.source_kind) {
    case "triage":
      return `Beleg #${state.source_id}`;
    case "deadline":
      return `Frist #${state.source_id}`;
    case "invoice":
      return `Rechnung #${state.source_id}`;
    case "warranty":
      return `Garantie #${state.source_id}`;
    case "analysis":
      return `Analyse (${state.source_id})`;
    default:
      return `Aufgabe ${state.source_id}`;
  }
}

function hrefForGhost(state: InboxTaskStateRow): string {
  switch (state.source_kind) {
    case "triage":
    case "invoice":
      return `/documents/${state.source_id}`;
    case "deadline":
      return `/deadlines`;
    case "warranty":
      return `/warranties`;
    case "analysis":
      return `/documents?analysis=${state.source_id}`;
    default:
      return "/dashboard";
  }
}

export function buildInboxTaskBoard(limits = { each: 12 }): InboxTaskBoard {
  const db = getDb();
  const today = todayIso();
  const soon = daysFromNow(ACTION_WARRANTY_AHEAD_DAYS);
  const overdueSince = daysAgo(ACTION_OVERDUE_LOOKBACK_DAYS);
  const limit = limits.each;
  const states = listInboxTaskStates();

  const candidates: InboxTask[] = [];

  const triagePendingTotal = countPendingTriageDocuments();
  // Show more triage rows so multi-select is useful; full queue via discard-all.
  const triagePending = listPendingTriageDocuments(Math.max(limit, 40));
  for (const row of triagePending) {
    const triage: InboxTriagePayload = {
      id: row.id,
      title: row.title,
      correspondent_name: row.correspondent_name,
      category: row.category,
      short_summary: row.short_summary,
      amount: row.amount,
      currency: row.currency,
      due_date: row.due_date,
      vendor: row.vendor,
      reasons: row.reasons,
      ai_icon_url: row.ai_icon_url,
      tax_year: row.tax_year,
      tax_suggested: row.tax_suggested,
    };
    candidates.push({
      id: inboxTaskId("triage", row.id),
      sourceKind: "triage",
      sourceId: String(row.id),
      title:
        row.vendor ||
        row.correspondent_name ||
        row.title ||
        "Dokument prüfen",
      subtitle: row.short_summary,
      href: `/documents/${row.id}`,
      dueDate: row.due_date,
      priority: 90,
      status: "open",
      snoozedUntil: null,
      completedAt: null,
      amount: row.amount,
      currency: row.currency,
      aiIconUrl: row.ai_icon_url,
      category: row.category,
      paperlessId: row.paperless_id,
      documentLocalId: row.id,
      triage,
      analysisBucket: null,
      analysisCount: null,
      paymentPipeline: null,
    });
  }

  const overdueDeadlines = db
    .prepare(
      `SELECT dl.id, dl.title, dl.deadline_date,
              d.id AS document_local_id, d.title AS document_title,
              d.ai_icon_path,
              (SELECT s.category FROM document_summaries s WHERE s.document_id = d.id LIMIT 1) AS category
       FROM deadlines dl
       JOIN paperless_documents d ON d.id = dl.document_id
       WHERE dl.status = 'open'
         AND dl.deadline_date IS NOT NULL
         AND dl.deadline_date < ?
         AND dl.deadline_date >= ?
         AND (dl.snoozed_until IS NULL OR TRIM(dl.snoozed_until) = '' OR dl.snoozed_until < ?)
       ORDER BY dl.deadline_date ASC
       LIMIT ?`
    )
    .all(today, overdueSince, today, limit) as Array<{
    id: number;
    title: string;
    deadline_date: string;
    document_local_id: number;
    document_title: string | null;
    ai_icon_path: string | null;
    category: string | null;
  }>;

  for (const row of overdueDeadlines) {
    candidates.push({
      id: inboxTaskId("deadline", row.id),
      sourceKind: "deadline",
      sourceId: String(row.id),
      title: row.title,
      subtitle: row.document_title,
      href: `/documents/${row.document_local_id}`,
      dueDate: row.deadline_date,
      priority: 100,
      status: "open",
      snoozedUntil: null,
      completedAt: null,
      amount: null,
      currency: null,
      aiIconUrl: publicAiIconUrl(row.ai_icon_path),
      category: row.category,
      paperlessId: null,
      documentLocalId: row.document_local_id,
      triage: null,
      analysisBucket: null,
      analysisCount: null,
      paymentPipeline: null,
    });
  }

  const openUnpaid = listOpenUnpaidInvoices(Math.max(limit, 12));
  for (const row of openUnpaid) {
    const planned =
      row.payment_planned_date && row.payment_planned_date.trim()
        ? row.payment_planned_date.slice(0, 10)
        : null;
    const inPipeline = Boolean(planned && planned >= today);
    const overdue =
      !inPipeline && row.due_date != null && row.due_date < today ? 95 : 75;
    candidates.push({
      id: inboxTaskId("invoice", row.id),
      sourceKind: "invoice",
      sourceId: String(row.id),
      title:
        row.vendor ||
        row.correspondent_name ||
        row.title ||
        "Offene Rechnung",
      subtitle: row.title,
      href: `/documents/${row.id}`,
      dueDate: inPipeline ? planned : row.due_date,
      priority: inPipeline ? 70 : overdue,
      status: "open",
      snoozedUntil: null,
      completedAt: null,
      amount: row.amount,
      currency: row.currency,
      aiIconUrl: row.ai_icon_url ?? null,
      category: row.category ?? null,
      paperlessId: row.paperless_id,
      documentLocalId: row.id,
      triage: null,
      analysisBucket: null,
      analysisCount: null,
      paymentPipeline: inPipeline
        ? {
            plannedDate: planned!,
            method: row.payment_method ?? null,
            methodLabel: paymentMethodLabel(row.payment_method),
          }
        : null,
    });
  }

  const warranties = db
    .prepare(
      `SELECT w.id, w.product_name, w.vendor, w.warranty_until,
              d.id AS document_local_id, d.title AS document_title,
              d.ai_icon_path,
              (SELECT s.category FROM document_summaries s WHERE s.document_id = d.id LIMIT 1) AS category
       FROM devices_and_warranties w
       JOIN paperless_documents d ON d.id = w.document_id
       WHERE w.warranty_until IS NOT NULL
         AND w.warranty_until >= ?
         AND w.warranty_until <= ?
       ORDER BY w.warranty_until ASC
       LIMIT ?`
    )
    .all(today, soon, limit) as Array<{
    id: number;
    product_name: string | null;
    vendor: string | null;
    warranty_until: string;
    document_local_id: number;
    document_title: string | null;
    ai_icon_path: string | null;
    category: string | null;
  }>;

  for (const row of warranties) {
    candidates.push({
      id: inboxTaskId("warranty", row.id),
      sourceKind: "warranty",
      sourceId: String(row.id),
      title: row.product_name || row.vendor || "Garantie läuft ab",
      subtitle: row.document_title,
      href: `/documents/${row.document_local_id}`,
      dueDate: row.warranty_until,
      priority: 55,
      status: "open",
      snoozedUntil: null,
      completedAt: null,
      amount: null,
      currency: null,
      aiIconUrl: publicAiIconUrl(row.ai_icon_path),
      category: row.category,
      paperlessId: null,
      documentLocalId: row.document_local_id,
      triage: null,
      analysisBucket: null,
      analysisCount: null,
      paymentPipeline: null,
    });
  }

  const analysisPending = (
    db
      .prepare(
        `SELECT COUNT(*) as c
         FROM paperless_documents d
         LEFT JOIN document_summaries s ON s.document_id = d.id
         WHERE COALESCE(d.sync_status, 'synced') != 'missing'
           AND (
             s.analysis_status IS NULL
             OR s.analysis_status IN ('pending', 'stale')
           )`
      )
      .get() as { c: number }
  ).c;
  const analysisError = (
    db
      .prepare(
        `SELECT COUNT(*) as c FROM document_summaries WHERE analysis_status = 'error'`
      )
      .get() as { c: number }
  ).c;
  const analysisStale = (
    db
      .prepare(
        `SELECT COUNT(*) as c FROM document_summaries WHERE analysis_status = 'stale'`
      )
      .get() as { c: number }
  ).c;

  const analysisBuckets: Array<{
    bucket: "pending" | "error" | "stale";
    count: number;
    priority: number;
    title: string;
    href: string;
  }> = [
    {
      bucket: "error",
      count: analysisError,
      priority: 45,
      title: "Fehlerhafte Analysen",
      href: "/documents?analysis=error",
    },
    {
      bucket: "stale",
      count: analysisStale,
      priority: 30,
      title: "Veraltete Analysen",
      href: "/documents?analysis=stale",
    },
    {
      bucket: "pending",
      count: analysisPending,
      priority: 25,
      title: "Ausstehende Analysen",
      href: "/sync",
    },
  ];

  for (const bucket of analysisBuckets) {
    if (bucket.count <= 0) continue;
    candidates.push({
      id: inboxTaskId("analysis", bucket.bucket),
      sourceKind: "analysis",
      sourceId: bucket.bucket,
      title: bucket.title,
      subtitle: `${bucket.count} Dokumente`,
      href: bucket.href,
      dueDate: null,
      priority: bucket.priority,
      status: "open",
      snoozedUntil: null,
      completedAt: null,
      amount: null,
      currency: null,
      aiIconUrl: null,
      category: null,
      paperlessId: null,
      documentLocalId: null,
      triage: null,
      analysisBucket: bucket.bucket,
      analysisCount: bucket.count,
      paymentPipeline: null,
    });
  }

  const liveById = new Map<string, InboxTask>();
  const open: InboxTask[] = [];
  const snoozed: InboxTask[] = [];

  for (const raw of candidates) {
    const state = states.get(raw.id);
    const task = applyState(raw, state);
    liveById.set(task.id, task);
    if (task.status === "done" || task.status === "dismissed") continue;
    if (task.status === "snoozed") snoozed.push(task);
    else open.push(task);
  }

  open.sort(sortByPriority);
  snoozed.sort(sortByPriority);

  const completedStates = listCompletedInboxStates(undefined, 40);
  const completed = hydrateCompletedFromState(completedStates, liveById);

  return {
    open,
    snoozed,
    completed,
    counts: {
      open: open.length,
      snoozed: snoozed.length,
      completed: completed.length,
    },
    triagePendingTotal,
  };
}

export function findLiveTask(
  sourceKind: InboxSourceKind,
  sourceId: string
): InboxTask | null {
  const board = buildInboxTaskBoard({ each: 50 });
  const id = inboxTaskId(sourceKind, sourceId);
  return (
    board.open.find((t) => t.id === id) ||
    board.snoozed.find((t) => t.id === id) ||
    board.completed.find((t) => t.id === id) ||
    null
  );
}
