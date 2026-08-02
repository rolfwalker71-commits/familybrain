/** Client-safe triage types & labels (no Node/SQLite imports). */

export type TriageStatus =
  | "pending"
  | "pay"
  | "ignored"
  | "done"
  | "ebill"
  | "twint"
  | "card";

export type TriageReason =
  | "invoice"
  | "high_amount"
  | "warranty"
  | "deadline"
  | "travel";

export type TriageAction =
  | "pay"
  | "ignore"
  | "done"
  | "ebill"
  | "twint"
  | "card"
  | "snooze";

export const TRIAGE_REASON_LABELS: Record<TriageReason, string> = {
  invoice: "Rechnung",
  high_amount: "Hoher Betrag",
  warranty: "Garantie",
  deadline: "Frist",
  travel: "Reise",
};

/** Human-readable triage outcome (inbox + document detail). */
export const TRIAGE_STATUS_LABELS: Record<TriageStatus, string> = {
  pending: "Zur Prüfung",
  pay: "Muss bezahlt werden",
  ignored: "Irrelevant",
  done: "Erledigt",
  ebill: "eBill",
  twint: "Twint",
  card: "Kreditkarte",
};
