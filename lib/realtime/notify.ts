import { getDb } from "@/lib/db/client";
import { publicAiIconUrl } from "@/lib/db/queries";
import { getSetting, setSetting } from "@/lib/db/migrations";
import {
  publishInboxRefresh,
  publishRealtime,
  type DocumentNotifyPayload,
  type DocumentNotifyReason,
} from "@/lib/realtime/hub";

const LIVE_NOTIFICATIONS_KEY = "live_notifications_enabled";
const LIVE_NOTIFICATIONS_DURATION_KEY = "live_notifications_duration_sec";

const DEFAULT_DURATION_SEC = 9;
const MIN_DURATION_SEC = 3;
const MAX_DURATION_SEC = 60;

/** Default on — toast popups for document changes. */
export function isLiveNotificationsEnabled(): boolean {
  const stored = getSetting(LIVE_NOTIFICATIONS_KEY);
  if (stored == null || stored === "") return true;
  return stored === "1" || stored.toLowerCase() === "true";
}

export function setLiveNotificationsEnabled(enabled: boolean): void {
  setSetting(LIVE_NOTIFICATIONS_KEY, enabled ? "1" : "0");
}

/** How long a toast stays visible (seconds). */
export function getLiveNotificationsDurationSec(): number {
  const stored = getSetting(LIVE_NOTIFICATIONS_DURATION_KEY);
  const n = stored != null && stored !== "" ? Number.parseInt(stored, 10) : NaN;
  if (!Number.isFinite(n)) return DEFAULT_DURATION_SEC;
  return Math.min(MAX_DURATION_SEC, Math.max(MIN_DURATION_SEC, Math.round(n)));
}

export function setLiveNotificationsDurationSec(seconds: number): void {
  const n = Math.min(
    MAX_DURATION_SEC,
    Math.max(MIN_DURATION_SEC, Math.round(seconds))
  );
  setSetting(LIVE_NOTIFICATIONS_DURATION_KEY, String(n));
}

export {
  DEFAULT_DURATION_SEC as LIVE_NOTIFICATIONS_DEFAULT_DURATION_SEC,
  MIN_DURATION_SEC as LIVE_NOTIFICATIONS_MIN_DURATION_SEC,
  MAX_DURATION_SEC as LIVE_NOTIFICATIONS_MAX_DURATION_SEC,
};

export function getDocumentRealtimeSnapshot(
  localId: number
): Omit<
  DocumentNotifyPayload,
  "reason" | "headline" | "detail" | "source"
> | null {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT d.id, d.paperless_id, d.title, d.correspondent_name,
              d.document_type_name, d.created_date, d.ai_icon_path,
              s.category, s.short_summary
       FROM paperless_documents d
       LEFT JOIN document_summaries s ON s.document_id = d.id
       WHERE d.id = ?`
    )
    .get(localId) as
    | {
        id: number;
        paperless_id: number;
        title: string | null;
        correspondent_name: string | null;
        document_type_name: string | null;
        created_date: string | null;
        ai_icon_path: string | null;
        category: string | null;
        short_summary: string | null;
      }
    | undefined;

  if (!row) return null;

  return {
    localId: row.id,
    paperlessId: row.paperless_id,
    title: row.title,
    correspondentName: row.correspondent_name,
    documentTypeName: row.document_type_name,
    createdDate: row.created_date,
    category: row.category,
    aiIconUrl: publicAiIconUrl(row.ai_icon_path),
  };
}

function clip(raw: string | null | undefined, max: number): string | null {
  const t = (raw || "").replace(/\s+/g, " ").trim();
  if (!t) return null;
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

/**
 * Notify open UIs about a document change.
 * Always refreshes Action-Inbox. Toasts only when live notifications are enabled.
 */
export function notifyDocumentChange(input: {
  localId: number;
  reason: DocumentNotifyReason;
  headline: string;
  detail?: string | null;
  source: "paperless" | "buddy";
  /** Force toast even if setting is off (unused; kept for symmetry). */
  forceToast?: boolean;
}): void {
  const at = new Date().toISOString();
  publishRealtime({ topic: "inbox", at });

  const showToast = input.forceToast || isLiveNotificationsEnabled();
  if (!showToast) return;

  const snap = getDocumentRealtimeSnapshot(input.localId);
  if (!snap) return;

  let detail = input.detail ?? null;
  if (!detail && snap.category) {
    detail = `Kategorie: ${snap.category}`;
  }

  publishRealtime({
    topic: "document",
    at,
    document: {
      ...snap,
      reason: input.reason,
      headline: input.headline,
      detail: clip(detail, 160),
      source: input.source,
    },
  });
}

/** Paperless webhook ingest → toast + inbox. */
export function notifyWebhookDocument(input: {
  localId: number;
  isNew: boolean;
  changed: boolean;
}): void {
  if (input.isNew) {
    notifyDocumentChange({
      localId: input.localId,
      reason: "paperless_new",
      headline: "Neues Dokument aus Paperless",
      detail: "Via Webhook empfangen und synchronisiert.",
      source: "paperless",
    });
    return;
  }
  if (input.changed) {
    notifyDocumentChange({
      localId: input.localId,
      reason: "paperless_updated",
      headline: "Dokument aus Paperless aktualisiert",
      detail: "Metadaten oder Inhalt via Webhook nachgezogen.",
      source: "paperless",
    });
    return;
  }
  notifyDocumentChange({
    localId: input.localId,
    reason: "paperless_sync",
    headline: "Paperless-Webhook",
    detail: "Dokument bereits aktuell — Sync bestätigt.",
    source: "paperless",
  });
}

export function notifyAnalysisCompleted(
  localId: number,
  analysis: { category?: string | null; short_summary?: string | null }
): void {
  const parts: string[] = [];
  if (analysis.category) parts.push(`Kategorie: ${analysis.category}`);
  const summary = clip(analysis.short_summary, 100);
  if (summary) parts.push(summary);
  notifyDocumentChange({
    localId,
    reason: "analysis_completed",
    headline: "Analyse abgeschlossen",
    detail: parts.join(" · ") || "KI-Zusammenfassung gespeichert.",
    source: "buddy",
  });
}

export function notifyAiIconGenerated(
  localId: number,
  options?: { forced?: boolean }
): void {
  notifyDocumentChange({
    localId,
    reason: "ai_icon",
    headline: options?.forced ? "AI-Icon neu erzeugt" : "AI-Icon erzeugt",
    detail: "Dokumentbild für Listen und Detailansicht aktualisiert.",
    source: "buddy",
  });
}

export function notifyBuddyStatusChanged(
  localId: number,
  detail: string
): void {
  notifyDocumentChange({
    localId,
    reason: "buddy_status",
    headline: "Buddy-Status geändert",
    detail,
    source: "buddy",
  });
}

export function notifyMarkedPaid(localId: number): void {
  notifyDocumentChange({
    localId,
    reason: "mark_paid",
    headline: "Als bezahlt markiert",
    detail: "Lokal und ggf. in Paperless aktualisiert.",
    source: "buddy",
  });
}

/** Inbox-only refresh without toast (e.g. when notifications disabled). */
export { publishInboxRefresh };
