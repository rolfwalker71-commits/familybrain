/** Client-safe Action-Inbox task types (no Node/SQLite). */

export type InboxSourceKind =
  | "triage"
  | "deadline"
  | "invoice"
  | "warranty"
  | "analysis";

export type InboxTaskStatus = "open" | "snoozed" | "done" | "dismissed";

export type InboxTaskAction =
  | "snooze"
  | "done"
  | "dismiss"
  | "reopen"
  | "mark_paid";

export type InboxTriagePayload = {
  id: number;
  title: string | null;
  correspondent_name: string | null;
  category: string | null;
  short_summary: string | null;
  amount: number | null;
  currency: string | null;
  due_date: string | null;
  vendor: string | null;
  reasons: Array<"invoice" | "high_amount" | "warranty" | "deadline" | "travel">;
  ai_icon_url: string | null;
  tax_year?: number | null;
  tax_suggested?: boolean;
};

export type InboxTask = {
  /** Stable key: `${sourceKind}:${sourceId}` */
  id: string;
  sourceKind: InboxSourceKind;
  sourceId: string;
  title: string;
  subtitle: string | null;
  href: string;
  dueDate: string | null;
  priority: number;
  status: InboxTaskStatus;
  snoozedUntil: string | null;
  completedAt: string | null;
  amount: number | null;
  currency: string | null;
  aiIconUrl: string | null;
  category: string | null;
  paperlessId: number | null;
  documentLocalId: number | null;
  triage: InboxTriagePayload | null;
  analysisBucket: "pending" | "error" | "stale" | null;
  analysisCount: number | null;
};

export type InboxTaskBoard = {
  open: InboxTask[];
  snoozed: InboxTask[];
  completed: InboxTask[];
  counts: {
    open: number;
    snoozed: number;
    completed: number;
  };
};

export function inboxTaskId(
  kind: InboxSourceKind,
  sourceId: string | number
): string {
  return `${kind}:${sourceId}`;
}

export const INBOX_SOURCE_LABELS: Record<InboxSourceKind, string> = {
  triage: "Prüfung",
  deadline: "Frist",
  invoice: "Rechnung",
  warranty: "Garantie",
  analysis: "Analyse",
};
