import { getDb } from "@/lib/db/client";
import { publicAiIconUrl } from "@/lib/db/queries";
import {
  publishInboxRefresh,
  publishRealtime,
  type AppNotifyPayload,
  type NotifyReason,
} from "@/lib/realtime/hub";
import { isLiveNotificationsEnabled } from "@/lib/realtime/prefs";
import {
  aircraftPublicUrl,
  coverPublicUrl,
  eventAiImagePublicUrl,
  mapPublicUrl,
} from "@/lib/trips/cover";
import { tripEventCommentImagePublicUrl } from "@/lib/trips/comment-images";
import { getTripById, getTripEventById } from "@/lib/trips/queries";
import {
  getFinanceExpenseById,
  getFinanceLedgerById,
} from "@/lib/finance-brain/queries";
import { expenseAiImagePublicUrl } from "@/lib/finance-brain/expense-image";
import { receiptPublicUrl } from "@/lib/finance-brain/receipts";
import { ledgerCoverPublicUrl } from "@/lib/finance-brain/cover";

export {
  isLiveNotificationsEnabled,
  setLiveNotificationsEnabled,
  getLiveNotificationsDurationSec,
  setLiveNotificationsDurationSec,
  isLiveNotificationsSoundEnabled,
  setLiveNotificationsSoundEnabled,
  LIVE_NOTIFICATIONS_DEFAULT_DURATION_SEC,
  LIVE_NOTIFICATIONS_MIN_DURATION_SEC,
  LIVE_NOTIFICATIONS_MAX_DURATION_SEC,
} from "@/lib/realtime/prefs";

function clip(raw: string | null | undefined, max: number): string | null {
  const t = (raw || "").replace(/\s+/g, " ").trim();
  if (!t) return null;
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

/** Publish a live toast notification (clients filter by their prefs). */
export function notifyAppChange(
  input: Omit<AppNotifyPayload, "detail"> & { detail?: string | null }
): void {
  // Global master switch (per-user prefs refine further on the client).
  if (!isLiveNotificationsEnabled()) return;

  const at = new Date().toISOString();
  const notification: AppNotifyPayload = {
    ...input,
    detail: clip(input.detail ?? null, 160),
    title: input.title ?? null,
    href: input.href ?? null,
    aiIconUrl: input.aiIconUrl ?? null,
    category: input.category ?? null,
    meta: input.meta ?? null,
  };

  publishRealtime({ topic: "notify", at, notification });

  if (!notification.skipWebPush) {
    void import("@/lib/push/dispatch")
      .then((m) => m.dispatchWebPush(notification))
      .catch(() => {
        /* optional */
      });
  }

  if (!notification.skipTelegram) {
    void import("@/lib/telegram/notify")
      .then((m) => m.notifyTelegramFromAppNotify(notification))
      .catch(() => {
        /* optional */
      });
  }
}

export function getDocumentRealtimeSnapshot(localId: number): {
  localId: number;
  paperlessId: number;
  title: string | null;
  correspondentName: string | null;
  documentTypeName: string | null;
  createdDate: string | null;
  category: string | null;
  aiIconUrl: string | null;
} | null {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT d.id, d.paperless_id, d.title, d.correspondent_name,
              d.document_type_name, d.created_date, d.ai_icon_path,
              s.category
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

export function notifyDocumentChange(input: {
  localId: number;
  reason: NotifyReason;
  headline: string;
  detail?: string | null;
  source: "paperless" | "buddy";
}): void {
  publishInboxRefresh();

  const snap = getDocumentRealtimeSnapshot(input.localId);
  if (!snap) return;

  const meta = [
    snap.correspondentName,
    snap.documentTypeName,
    snap.createdDate,
  ]
    .filter(Boolean)
    .join(" · ");

  notifyAppChange({
    domain: "documents",
    reason: input.reason,
    headline: input.headline,
    detail:
      input.detail ??
      (snap.category ? `Kategorie: ${snap.category}` : null),
    title: snap.title,
    href: `/documents/${snap.localId}`,
    aiIconUrl: snap.aiIconUrl,
    category: snap.category,
    meta: meta || `Paperless-ID ${snap.paperlessId}`,
    source: input.source,
    localId: snap.localId,
    paperlessId: snap.paperlessId,
  });
}

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

export function notifyDocumentTriageQueued(
  localId: number,
  reasonLabels: string[]
): void {
  notifyDocumentChange({
    localId,
    reason: "document_triage",
    headline: "Neuer Beleg zur Prüfung",
    detail:
      reasonLabels.length > 0
        ? reasonLabels.join(" · ")
        : "Bitte entscheiden: zahlen oder irrelevant.",
    source: "buddy",
  });
}

export function notifyDocumentTriageResolved(
  localId: number,
  action: "pay" | "ignore" | "done" | "ebill" | "twint" | "card" | "snooze"
): void {
  if (action === "snooze") {
    notifyDocumentChange({
      localId,
      reason: "document_triage",
      headline: "Prüfung pausiert",
      detail: "Erscheint später wieder in der Action-Inbox.",
      source: "buddy",
    });
    return;
  }
  const paidVia =
    action === "ebill"
      ? "eBill"
      : action === "twint"
        ? "Twint"
        : action === "card"
          ? "Kreditkarte"
          : null;
  const headline = paidVia
    ? `Bereits per ${paidVia} bezahlt`
    : action === "pay"
      ? "Als zu bezahlen markiert"
      : action === "ignore"
        ? "Beleg als irrelevant markiert"
        : "Beleg-Prüfung erledigt";
  notifyDocumentChange({
    localId,
    reason: "document_triage",
    headline,
    detail: paidVia
      ? `Als bezahlt markiert (${paidVia}) — Paperless «Bezahlt».`
      : action === "pay"
        ? "Erscheint unter Offene Rechnungen (Paperless «Zu bezahlen»)."
        : action === "ignore"
          ? "Nicht in der Zahlungspflicht-Liste."
          : "Aus der Prüfliste entfernt.",
    source: "buddy",
  });
}

/** Best visual for TravelBuddy push/toasts (event AI → flight/map → trip cover). */
function resolveTripNotifyImageUrl(input: {
  tripId: number;
  eventId?: number | null;
  commentImagePath?: string | null;
  overrideUrl?: string | null;
}): string | null {
  if (input.overrideUrl?.trim()) return input.overrideUrl.trim();
  if (input.commentImagePath) {
    const commentUrl = tripEventCommentImagePublicUrl(input.commentImagePath);
    if (commentUrl) return commentUrl;
  }
  if (input.eventId != null) {
    const event = getTripEventById(input.eventId);
    if (event) {
      const fromEvent =
        eventAiImagePublicUrl(event.ai_image_path) ||
        aircraftPublicUrl(event.aircraft_image_path) ||
        mapPublicUrl(event.map_image_path);
      if (fromEvent) return fromEvent;
    }
  }
  const trip = getTripById(input.tripId);
  return coverPublicUrl(trip?.cover_path) || null;
}

/** Best visual for FinanzBuddy push/toasts (expense AI → receipt → ledger cover). */
function resolveFinanceNotifyImageUrl(input: {
  ledgerId: number;
  expenseId?: number | null;
  overrideUrl?: string | null;
}): string | null {
  if (input.overrideUrl?.trim()) return input.overrideUrl.trim();
  if (input.expenseId != null) {
    const expense = getFinanceExpenseById(input.expenseId);
    if (expense) {
      const fromExpense =
        expenseAiImagePublicUrl(expense.ai_image_path) ||
        receiptPublicUrl(expense.receipt_path);
      if (fromExpense) return fromExpense;
    }
  }
  const ledger = getFinanceLedgerById(input.ledgerId);
  return ledgerCoverPublicUrl(ledger?.cover_path) || null;
}

export function notifyTripComment(input: {
  tripId: number;
  eventId: number;
  tripTitle: string | null;
  eventTitle: string | null;
  authorName: string | null;
  bodyPreview: string | null;
  /** Optional comment attachment path (filesystem) for push preview. */
  commentImagePath?: string | null;
  imageUrl?: string | null;
}): void {
  notifyAppChange({
    domain: "travel",
    reason: "trip_comment",
    headline: "Neuer Reise-Kommentar",
    detail: clip(
      [input.authorName, input.bodyPreview].filter(Boolean).join(": "),
      160
    ),
    title: input.eventTitle || input.tripTitle || `Reise #${input.tripId}`,
    href: `/trips/${input.tripId}`,
    aiIconUrl: resolveTripNotifyImageUrl({
      tripId: input.tripId,
      eventId: input.eventId,
      commentImagePath: input.commentImagePath,
      overrideUrl: input.imageUrl,
    }),
    category: null,
    meta: input.tripTitle,
    source: "travel",
    tripId: input.tripId,
  });
}

export function notifyTripEventUpdated(input: {
  tripId: number;
  eventId: number;
  tripTitle: string | null;
  eventTitle: string | null;
  imageUrl?: string | null;
}): void {
  notifyAppChange({
    domain: "travel",
    reason: "trip_event_updated",
    headline: "Reise-Ereignis aktualisiert",
    detail: "Eintrag geändert.",
    title: input.eventTitle || `Ereignis #${input.eventId}`,
    href: `/trips/${input.tripId}`,
    aiIconUrl: resolveTripNotifyImageUrl({
      tripId: input.tripId,
      eventId: input.eventId,
      overrideUrl: input.imageUrl,
    }),
    category: null,
    meta: input.tripTitle,
    source: "travel",
    tripId: input.tripId,
  });
}

export function notifyTripEventAiImage(input: {
  tripId: number;
  eventId: number;
  tripTitle: string | null;
  eventTitle: string | null;
  imageUrl?: string | null;
}): void {
  notifyAppChange({
    domain: "travel",
    reason: "trip_event_ai_image",
    headline: "KI-Bild für Ereignis",
    detail: "Neues Bild erzeugt oder hochgeladen.",
    title: input.eventTitle || `Ereignis #${input.eventId}`,
    href: `/trips/${input.tripId}`,
    aiIconUrl: resolveTripNotifyImageUrl({
      tripId: input.tripId,
      eventId: input.eventId,
      overrideUrl: input.imageUrl,
    }),
    category: null,
    meta: input.tripTitle,
    source: "travel",
    tripId: input.tripId,
  });
}

export function notifyFinanceExpense(input: {
  ledgerId: number;
  expenseId: number;
  ledgerTitle: string | null;
  description: string | null;
  amountLabel: string | null;
  reason: "finance_expense_created" | "finance_expense_updated";
  imageUrl?: string | null;
}): void {
  notifyAppChange({
    domain: "finance",
    reason: input.reason,
    headline:
      input.reason === "finance_expense_created"
        ? "Neue Ausgabe"
        : "Ausgabe aktualisiert",
    detail: input.amountLabel,
    title: input.description || `Ausgabe #${input.expenseId}`,
    href: `/finance-brain/${input.ledgerId}`,
    aiIconUrl: resolveFinanceNotifyImageUrl({
      ledgerId: input.ledgerId,
      expenseId: input.expenseId,
      overrideUrl: input.imageUrl,
    }),
    category: null,
    meta: input.ledgerTitle,
    source: "finance",
    ledgerId: input.ledgerId,
  });
}

export function notifyFinanceExpenseAiImage(input: {
  ledgerId: number;
  expenseId: number;
  ledgerTitle: string | null;
  description: string | null;
  imageUrl?: string | null;
}): void {
  notifyAppChange({
    domain: "finance",
    reason: "finance_expense_ai_image",
    headline: "KI-Belegbild erzeugt",
    detail: "Ausgabenbild aktualisiert.",
    title: input.description || `Ausgabe #${input.expenseId}`,
    href: `/finance-brain/${input.ledgerId}`,
    aiIconUrl: resolveFinanceNotifyImageUrl({
      ledgerId: input.ledgerId,
      expenseId: input.expenseId,
      overrideUrl: input.imageUrl,
    }),
    category: null,
    meta: input.ledgerTitle,
    source: "finance",
    ledgerId: input.ledgerId,
  });
}

export function notifyFinanceSettlement(input: {
  ledgerId: number;
  settlementId: number;
  ledgerTitle: string | null;
  amountLabel: string | null;
  imageUrl?: string | null;
}): void {
  notifyAppChange({
    domain: "finance",
    reason: "finance_settlement",
    headline: "Rückzahlung erfasst",
    detail: input.amountLabel,
    title: input.ledgerTitle || `Abrechnung #${input.ledgerId}`,
    href: `/finance-brain/${input.ledgerId}`,
    aiIconUrl: resolveFinanceNotifyImageUrl({
      ledgerId: input.ledgerId,
      overrideUrl: input.imageUrl,
    }),
    category: null,
    meta: null,
    source: "finance",
    ledgerId: input.ledgerId,
  });
}

export { publishInboxRefresh };
