/**
 * In-process pub/sub for live UI (single Node instance / Docker).
 */

export type NotifyDomain = "documents" | "travel" | "finance";

export type NotifyReason =
  | "paperless_new"
  | "paperless_updated"
  | "paperless_sync"
  | "analysis_completed"
  | "ai_icon"
  | "buddy_status"
  | "mark_paid"
  | "trip_comment"
  | "trip_event_updated"
  | "trip_event_ai_image"
  | "finance_expense_created"
  | "finance_expense_updated"
  | "finance_expense_ai_image"
  | "finance_settlement";

/** @deprecated use NotifyReason */
export type DocumentNotifyReason = NotifyReason;

export type AppNotifyPayload = {
  domain: NotifyDomain;
  reason: NotifyReason;
  headline: string;
  detail: string | null;
  title: string | null;
  href: string | null;
  aiIconUrl: string | null;
  category: string | null;
  meta: string | null;
  source: "paperless" | "buddy" | "travel" | "finance";
  /** Scope filters for per-user prefs */
  tripId?: number | null;
  ledgerId?: number | null;
  /** Legacy document fields (optional) */
  localId?: number | null;
  paperlessId?: number | null;
};

/** @deprecated use AppNotifyPayload */
export type DocumentNotifyPayload = AppNotifyPayload & {
  localId: number;
  paperlessId: number;
  correspondentName: string | null;
  documentTypeName: string | null;
  createdDate: string | null;
};

export type RealtimeEvent =
  | { topic: "inbox"; at: string }
  | { topic: "notify"; at: string; notification: AppNotifyPayload }
  /** @deprecated kept for older clients during deploy */
  | { topic: "document"; at: string; document: AppNotifyPayload };

type Listener = (event: RealtimeEvent) => void;

const listeners = new Set<Listener>();

export function publishRealtime(event: RealtimeEvent): void {
  for (const listener of listeners) {
    try {
      listener(event);
    } catch {
      /* ignore broken subscribers */
    }
  }
}

export function publishInboxRefresh(): void {
  publishRealtime({ topic: "inbox", at: new Date().toISOString() });
}

export function subscribeRealtime(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
