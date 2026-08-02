/** Client-safe activity log types & labels (no SQLite). */

export type ActivityEntityType =
  | "document"
  | "trip_event"
  | "finance_expense"
  | "trip"
  | "finance_ledger";

export type ActivityAction =
  | "analysis"
  | "ai_icon"
  | "ai_image"
  | "field_change"
  | "created"
  | "updated"
  | "deleted"
  | "linked"
  | "unlinked"
  | "triage"
  | "payment"
  | "comment"
  | "other";

export type ActivityLogRow = {
  id: number;
  created_at: string;
  entity_type: ActivityEntityType;
  entity_id: number;
  action: ActivityAction;
  summary: string;
  field_name: string | null;
  old_value: string | null;
  new_value: string | null;
  actor: string | null;
  source: string | null;
  metadata_json: string | null;
};

export const ACTIVITY_ACTION_LABELS: Record<ActivityAction, string> = {
  analysis: "Analyse",
  ai_icon: "KI-Icon",
  ai_image: "KI-Bild",
  field_change: "Feld",
  created: "Angelegt",
  updated: "Aktualisiert",
  deleted: "Gelöscht",
  linked: "Verknüpft",
  unlinked: "Entknüpft",
  triage: "Prüfung",
  payment: "Zahlung",
  comment: "Kommentar",
  other: "Sonstiges",
};
