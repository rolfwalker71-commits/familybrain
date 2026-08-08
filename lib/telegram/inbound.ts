import { getSetting, setSetting } from "@/lib/db/migrations";
import {
  executeTelegramActionToken,
  matchTextToMessageAction,
} from "@/lib/telegram/actions";
import { listTelegramActionsForMessage } from "@/lib/telegram/action-tokens";
import {
  answerTelegramCallbackQuery,
  editTelegramReplyMarkup,
  getTelegramChatId,
  sendTelegramMessage,
} from "@/lib/telegram/notify";

export type TelegramUpdate = {
  update_id: number;
  message?: {
    message_id: number;
    chat?: { id?: number | string };
    text?: string;
    reply_to_message?: { message_id?: number };
  };
  callback_query?: {
    id: string;
    data?: string;
    from?: { id?: number };
    message?: {
      message_id?: number;
      chat?: { id?: number | string };
      reply_markup?: unknown;
    };
  };
};

function chatIdMatches(chatId: string | number | undefined | null): boolean {
  const configured = getTelegramChatId();
  if (!configured || chatId == null) return false;
  return String(chatId) === String(configured);
}

const HELP_TEXT = [
  "Buddy · Telegram-Aktionen",
  "",
  "Bei Beleg-Benachrichtigungen:",
  "• Buttons Zahlen / Irrelevant / Später",
  "• oder antworten: zahlen · irrelevant · später",
  "",
  "Beim Abend-Digest: Termine per ✅-Button oder «erledigt».",
  "",
  "/help — diese Hilfe",
].join("\n");

/**
 * Process one Telegram Update (webhook or getUpdates).
 * Only the configured chat_id is accepted.
 */
export async function processTelegramUpdate(
  update: TelegramUpdate
): Promise<{ handled: boolean; detail?: string }> {
  if (update.callback_query) {
    const cq = update.callback_query;
    const chatId = cq.message?.chat?.id;
    if (!chatIdMatches(chatId)) {
      await answerTelegramCallbackQuery({
        callbackQueryId: cq.id,
        text: "Unbekannter Chat.",
        showAlert: true,
      });
      return { handled: false, detail: "chat_mismatch" };
    }
    const token = (cq.data || "").trim();
    if (!token) {
      await answerTelegramCallbackQuery({
        callbackQueryId: cq.id,
        text: "Keine Aktion.",
      });
      return { handled: true, detail: "empty" };
    }
    const result = await executeTelegramActionToken(token);
    await answerTelegramCallbackQuery({
      callbackQueryId: cq.id,
      text: result.message.slice(0, 180),
      showAlert: !result.ok,
    });
    if (result.ok && cq.message?.message_id != null) {
      // Drop keyboard after successful action (keep caption/text).
      await editTelegramReplyMarkup({
        messageId: cq.message.message_id,
        replyMarkup: { inline_keyboard: [] },
      });
      await sendTelegramMessage({
        headline: "Buddy",
        detail: result.message,
      });
    }
    return { handled: true, detail: result.ok ? "ok" : result.message };
  }

  const msg = update.message;
  if (!msg?.text) return { handled: false };
  if (!chatIdMatches(msg.chat?.id)) {
    return { handled: false, detail: "chat_mismatch" };
  }

  const text = msg.text.trim();
  if (/^\/(start|help)(@\w+)?$/i.test(text)) {
    await sendTelegramMessage({
      headline: "Buddy",
      detail: HELP_TEXT,
    });
    return { handled: true, detail: "help" };
  }

  const replyId = msg.reply_to_message?.message_id;
  if (replyId == null) {
    // Bare keywords without reply — ignore silently (avoid noise).
    return { handled: false, detail: "no_reply" };
  }

  const actions = listTelegramActionsForMessage(replyId);
  const token = matchTextToMessageAction(text, actions);
  if (!token) {
    await sendTelegramMessage({
      headline: "Buddy",
      detail:
        "Keine passende Aktion. Antworte mit zahlen / irrelevant / später / erledigt — oder tippe einen Button.",
    });
    return { handled: true, detail: "no_match" };
  }

  const result = await executeTelegramActionToken(token);
  await sendTelegramMessage({
    headline: result.ok ? "Buddy" : "Buddy · Fehler",
    detail: result.message,
  });
  if (result.ok) {
    await editTelegramReplyMarkup({
      messageId: replyId,
      replyMarkup: { inline_keyboard: [] },
    });
  }
  return { handled: true, detail: result.ok ? "ok" : result.message };
}

export const TELEGRAM_UPDATE_OFFSET_KEY = "telegram_update_offset";

export function getTelegramUpdateOffset(): number {
  const raw = getSetting(TELEGRAM_UPDATE_OFFSET_KEY);
  const n = raw ? Number(raw) : 0;
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function setTelegramUpdateOffset(offset: number): void {
  setSetting(TELEGRAM_UPDATE_OFFSET_KEY, String(Math.max(0, Math.floor(offset))));
}
