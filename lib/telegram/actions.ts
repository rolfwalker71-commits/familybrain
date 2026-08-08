import type { AppNotifyPayload } from "@/lib/realtime/hub";
import { resolveDocumentTriage } from "@/lib/documents/triage";
import { findRolfAppUserId } from "@/lib/calendar/ics-calendars";
import { markGoogleEventDone } from "@/lib/google/calendar-review";
import { markMicrosoftEventDone } from "@/lib/microsoft/calendar-review";
import {
  hasGoogleCalendarEventsWriteScope,
  isGoogleMailConnected,
} from "@/lib/google/oauth";
import {
  hasMicrosoftCalendarScope,
  isMicrosoftConnected,
} from "@/lib/microsoft/oauth";
import { getAppPublicUrlSetting } from "@/lib/app-url";
import { parseGoogleCalendarSourceId } from "@/lib/google/calendars";
import { parseMicrosoftCalendarSourceId } from "@/lib/microsoft/calendars";
import {
  bindTelegramActionTokensToMessage,
  consumeTelegramActionToken,
  createTelegramActionToken,
  getTelegramActionPayload,
  type TelegramActionPayload,
} from "@/lib/telegram/action-tokens";

export type TelegramInlineButton = {
  text: string;
  callback_data?: string;
  url?: string;
};

export type TelegramReplyMarkup = {
  inline_keyboard: TelegramInlineButton[][];
};

export type BuiltTelegramActions = {
  replyMarkup: TelegramReplyMarkup | null;
  tokens: string[];
  hintLine: string | null;
};

function absoluteBuddyHref(href: string | null | undefined): string | null {
  if (!href?.trim()) return null;
  const path = href.trim().startsWith("/") ? href.trim() : `/${href.trim()}`;
  const origin =
    getAppPublicUrlSetting() ||
    process.env.APP_PUBLIC_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    null;
  if (!origin) return path;
  try {
    return new URL(path, origin.replace(/\/$/, "") + "/").toString();
  } catch {
    return path;
  }
}

function isFreshTriageNotify(n: AppNotifyPayload): boolean {
  if (n.reason !== "document_triage" || n.localId == null) return false;
  const h = (n.headline || "").toLowerCase();
  if (/pausiert|irrelevant|bezahlt|erledigt|zu bezahlen/.test(h)) {
    return false;
  }
  return true;
}

/**
 * Inline buttons for actionable notifications (doc triage + open link).
 */
export function buildTelegramActionsForNotify(
  notification: AppNotifyPayload
): BuiltTelegramActions {
  const tokens: string[] = [];
  const rows: TelegramInlineButton[][] = [];

  if (isFreshTriageNotify(notification) && notification.localId != null) {
    const docId = notification.localId;
    const pay = createTelegramActionToken({
      type: "doc_triage",
      documentLocalId: docId,
      action: "pay",
    });
    const ignore = createTelegramActionToken({
      type: "doc_triage",
      documentLocalId: docId,
      action: "ignore",
    });
    const snooze = createTelegramActionToken({
      type: "doc_triage",
      documentLocalId: docId,
      action: "snooze",
    });
    tokens.push(pay, ignore, snooze);
    rows.push([
      { text: "Zahlen", callback_data: pay },
      { text: "Irrelevant", callback_data: ignore },
      { text: "Später", callback_data: snooze },
    ]);
  }

  const link = absoluteBuddyHref(notification.href || "/");
  if (link?.startsWith("http")) {
    rows.push([{ text: "In Buddy öffnen", url: link }]);
  }

  if (rows.length === 0) {
    return { replyMarkup: null, tokens: [], hintLine: null };
  }

  const hintLine =
    tokens.length > 0
      ? "Oder antworte: zahlen · irrelevant · später"
      : null;

  return {
    replyMarkup: { inline_keyboard: rows },
    tokens,
    hintLine,
  };
}

/** Calendar «Erledigt» buttons for up to `limit` open cloud events. */
export function buildCalendarDoneKeyboard(
  items: Array<{
    id: string;
    calendarId?: string | null;
    title: string;
  }>,
  limit = 3
): BuiltTelegramActions {
  const tokens: string[] = [];
  const rows: TelegramInlineButton[][] = [];
  let n = 0;
  for (const item of items) {
    if (n >= limit) break;
    const title = (item.title || "").trim();
    if (title.startsWith("✅")) continue;
    const sourceId = item.calendarId || "";
    const id = item.id || "";
    const googleCal = parseGoogleCalendarSourceId(sourceId);
    const msCal = parseMicrosoftCalendarSourceId(sourceId);
    let provider: "google" | "microsoft" | null = null;
    let calendarId = "";
    let eventId = "";
    if (googleCal && id.startsWith("gcal-")) {
      const prefix = `gcal-${googleCal}-`;
      if (!id.startsWith(prefix)) continue;
      eventId = id.slice(prefix.length);
      if (!eventId) continue;
      provider = "google";
      calendarId = googleCal;
    } else if (msCal && id.startsWith("mscal-")) {
      const prefix = `mscal-${msCal}-`;
      if (!id.startsWith(prefix)) continue;
      eventId = id.slice(prefix.length);
      if (!eventId) continue;
      provider = "microsoft";
      calendarId = msCal;
    } else {
      continue;
    }
    const token = createTelegramActionToken({
      type: "cal_done",
      provider,
      calendarId,
      eventId,
      title: title.slice(0, 80),
    });
    tokens.push(token);
    const label = `✅ ${(title.replace(/^➡️\s*/, "").slice(0, 28) || "Termin")}`;
    rows.push([{ text: label, callback_data: token }]);
    n += 1;
  }
  if (!rows.length) {
    return { replyMarkup: null, tokens: [], hintLine: null };
  }
  return {
    replyMarkup: { inline_keyboard: rows },
    tokens,
    hintLine: "Tippe einen Termin oder antworte «erledigt» auf die Nachricht.",
  };
}

export function mergeReplyMarkups(
  ...parts: Array<TelegramReplyMarkup | null | undefined>
): TelegramReplyMarkup | null {
  const rows: TelegramInlineButton[][] = [];
  for (const p of parts) {
    if (p?.inline_keyboard?.length) rows.push(...p.inline_keyboard);
  }
  if (!rows.length) return null;
  return { inline_keyboard: rows.slice(0, 8) };
}

export async function executeTelegramAction(
  payload: TelegramActionPayload
): Promise<{ ok: boolean; message: string }> {
  if (payload.type === "noop") {
    return { ok: true, message: payload.label || "Ok." };
  }

  if (payload.type === "doc_triage") {
    const result = await resolveDocumentTriage({
      documentLocalId: payload.documentLocalId,
      action: payload.action,
      snoozeDays: payload.action === "snooze" ? 7 : undefined,
      taxRelevant: false,
      taxYear: null,
    });
    if (!result.ok) {
      return { ok: false, message: result.error || "Triage fehlgeschlagen." };
    }
    const labels: Record<typeof payload.action, string> = {
      pay: "Als zu bezahlen markiert.",
      ignore: "Als irrelevant markiert.",
      done: "Prüfung erledigt.",
      snooze: "Um 7 Tage zurückgestellt.",
    };
    return { ok: true, message: labels[payload.action] };
  }

  if (payload.type === "cal_done") {
    const userId = findRolfAppUserId();
    if (userId == null) {
      return { ok: false, message: "Kein Kalender-User." };
    }
    try {
      if (payload.provider === "google") {
        if (
          !isGoogleMailConnected(userId) ||
          !hasGoogleCalendarEventsWriteScope(userId)
        ) {
          return {
            ok: false,
            message: "Google-Kalender Schreibrecht fehlt.",
          };
        }
        await markGoogleEventDone(userId, payload.calendarId, payload.eventId);
      } else {
        if (
          !isMicrosoftConnected(userId) ||
          !hasMicrosoftCalendarScope(userId)
        ) {
          return { ok: false, message: "Microsoft-Kalender nicht verbunden." };
        }
        await markMicrosoftEventDone(userId, payload.eventId);
      }
      const t = payload.title ? `«${payload.title}»` : "Termin";
      return { ok: true, message: `${t} als erledigt markiert.` };
    } catch (err) {
      return {
        ok: false,
        message: err instanceof Error ? err.message : String(err),
      };
    }
  }

  return { ok: false, message: "Unbekannte Aktion." };
}

export async function executeTelegramActionToken(
  token: string
): Promise<{ ok: boolean; message: string }> {
  const payload = getTelegramActionPayload(token);
  if (!payload) {
    return { ok: false, message: "Aktion abgelaufen oder ungültig." };
  }
  const result = await executeTelegramAction(payload);
  if (result.ok) consumeTelegramActionToken(token);
  return result;
}

export { bindTelegramActionTokensToMessage };

/** Map free-text reply to preferred action among message tokens. */
export function matchTextToMessageAction(
  text: string,
  actions: Array<{ token: string; payload: TelegramActionPayload }>
): string | null {
  const t = text.trim().toLowerCase().replace(/^\/+/, "");
  if (!t || !actions.length) return null;

  const want = (pred: (p: TelegramActionPayload) => boolean) =>
    actions.find((a) => pred(a.payload))?.token ?? null;

  if (/^(erledigt|done|ok|fertig|✅)/.test(t)) {
    return (
      want((p) => p.type === "cal_done") ||
      want((p) => p.type === "doc_triage" && p.action === "done") ||
      want((p) => p.type === "doc_triage" && p.action === "pay") ||
      actions[0]?.token ||
      null
    );
  }
  if (/^(zahlen|pay|rechnung)/.test(t)) {
    return want((p) => p.type === "doc_triage" && p.action === "pay");
  }
  if (/^(irrelevant|ignore|nein|skip)/.test(t)) {
    return want((p) => p.type === "doc_triage" && p.action === "ignore");
  }
  if (/^(später|spaeter|snooze|morgen)/.test(t)) {
    return want((p) => p.type === "doc_triage" && p.action === "snooze");
  }
  return null;
}
