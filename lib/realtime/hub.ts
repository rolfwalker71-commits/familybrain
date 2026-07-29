/**
 * In-process pub/sub for live UI (single Node instance / Docker).
 * Publishers: webhooks, analysis, icons, status writes.
 * Subscribers: SSE → Action-Inbox refresh + optional toast notifications.
 */

export type DocumentNotifyReason =
  | "paperless_new"
  | "paperless_updated"
  | "paperless_sync"
  | "analysis_completed"
  | "ai_icon"
  | "buddy_status"
  | "mark_paid";

export type DocumentNotifyPayload = {
  localId: number;
  paperlessId: number;
  title: string | null;
  correspondentName: string | null;
  documentTypeName: string | null;
  createdDate: string | null;
  category: string | null;
  aiIconUrl: string | null;
  /** Machine reason key */
  reason: DocumentNotifyReason;
  /** Short German headline shown in the toast */
  headline: string;
  /** Extra detail line (category, summary snippet, …) */
  detail: string | null;
  source: "paperless" | "buddy";
};

export type RealtimeEvent =
  | { topic: "inbox"; at: string }
  | { topic: "document"; at: string; document: DocumentNotifyPayload };

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
