import { getAppPublicUrlSetting } from "@/lib/app-url";
import { getSetting, setSetting } from "@/lib/db/migrations";

export const TELEGRAM_BOT_TOKEN_SETTING = "telegram_bot_token";
export const TELEGRAM_CHAT_ID_SETTING = "telegram_chat_id";

export function getTelegramBotToken(): string | null {
  return (
    getSetting(TELEGRAM_BOT_TOKEN_SETTING)?.trim() ||
    process.env.TELEGRAM_BOT_TOKEN?.trim() ||
    null
  );
}

export function getTelegramChatId(): string | null {
  return (
    getSetting(TELEGRAM_CHAT_ID_SETTING)?.trim() ||
    process.env.TELEGRAM_CHAT_ID?.trim() ||
    null
  );
}

export function saveTelegramBotToken(value: string | null): void {
  setSetting(TELEGRAM_BOT_TOKEN_SETTING, value?.trim() || null);
}

export function saveTelegramChatId(value: string | null): void {
  setSetting(TELEGRAM_CHAT_ID_SETTING, value?.trim() || null);
}

export function hasTelegramConfigured(): boolean {
  return Boolean(getTelegramBotToken() && getTelegramChatId());
}

function maskToken(token: string | null): string | null {
  if (!token) return null;
  if (token.length <= 8) return "••••";
  return `${token.slice(0, 4)}…${token.slice(-4)}`;
}

export function getTelegramBotTokenMasked(): string | null {
  return maskToken(getTelegramBotToken());
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

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

export type TelegramMessageResult =
  | { ok: true; messageId: number | null }
  | { ok: false; skipped: string }
  | { ok: false; error: string };

/**
 * Nachricht an die konfigurierte Telegram-Chat-ID.
 * Fehler werden nicht geworfen — Aufrufer kann fire-and-forget nutzen.
 */
export async function sendTelegramMessage(input: {
  headline: string;
  detail?: string | null;
  href?: string | null;
}): Promise<TelegramMessageResult> {
  const token = getTelegramBotToken();
  const chatId = getTelegramChatId();
  if (!token || !chatId) {
    return { ok: false, skipped: "not_configured" };
  }

  const headline = (input.headline || "").trim() || "Buddy";
  const detail = (input.detail || "").trim();
  const link = absoluteBuddyHref(input.href);
  const parts = [
    `<b>${escapeHtml(headline)}</b>`,
    detail ? escapeHtml(detail) : "",
    link
      ? `<a href="${escapeHtml(link)}">In Buddy öffnen</a>`
      : "",
  ].filter(Boolean);

  try {
    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: parts.join("\n"),
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
      signal: AbortSignal.timeout(12000),
      cache: "no-store",
    });
    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      description?: string;
      result?: { message_id?: number };
    };
    if (!res.ok || data.ok === false) {
      return {
        ok: false,
        error: data.description || `HTTP ${res.status}`,
      };
    }
    return {
      ok: true,
      messageId:
        typeof data.result?.message_id === "number"
          ? data.result.message_id
          : null,
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/** Fire-and-forget für Hintergrund-Jobs. */
export function notifyTelegramMessage(input: {
  headline: string;
  detail?: string | null;
  href?: string | null;
}): void {
  void sendTelegramMessage(input).catch(() => {
    /* optional */
  });
}

/** Kurzer Connectivity-Check für Einstellungen. */
export async function probeTelegram(): Promise<{
  configured: boolean;
  ok: boolean;
  error: string | null;
  messageId: number | null;
}> {
  if (!hasTelegramConfigured()) {
    return {
      configured: false,
      ok: false,
      error: "not_configured",
      messageId: null,
    };
  }
  const result = await sendTelegramMessage({
    headline: "Buddy · Telegram-Test",
    detail: "Verbindung ok. Nachrichten kommen hier an.",
    href: "/",
  });
  if (result.ok) {
    return {
      configured: true,
      ok: true,
      error: null,
      messageId: result.messageId,
    };
  }
  return {
    configured: true,
    ok: false,
    error: "skipped" in result ? result.skipped : result.error,
    messageId: null,
  };
}
