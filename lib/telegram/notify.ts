import { getAppPublicUrlSetting } from "@/lib/app-url";
import { getSetting, setSetting } from "@/lib/db/migrations";
import type { AppNotifyPayload } from "@/lib/realtime/hub";
import { signedPushMediaPath } from "@/lib/push/signed-media";

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

function clipTelegram(s: string, max: number): string {
  const t = s.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  return `${t.slice(0, Math.max(0, max - 1))}…`;
}

/** Same text shape as Web Push title/body (+ link). */
export function formatNotifyLikePush(notification: AppNotifyPayload): {
  headline: string;
  body: string;
  href: string | null;
  htmlCaption: string;
} {
  const headline = (notification.headline || "Buddy").trim() || "Buddy";
  const body =
    [notification.title, notification.detail].filter(Boolean).join(" — ") ||
    "Neue Benachrichtigung";
  const href = notification.href || "/dashboard";
  const link = absoluteBuddyHref(href);
  const htmlCaption = [
    `<b>${escapeHtml(headline)}</b>`,
    escapeHtml(body),
    link ? `<a href="${escapeHtml(link)}">In Buddy öffnen</a>` : "",
  ]
    .filter(Boolean)
    .join("\n");
  return { headline, body, href, htmlCaption };
}

export type TelegramMessageResult =
  | { ok: true; messageId: number | null }
  | { ok: false; skipped: string }
  | { ok: false; error: string };

async function telegramApi(
  token: string,
  method: string,
  body: BodyInit,
  contentType?: string
): Promise<TelegramMessageResult> {
  try {
    const headers: Record<string, string> = {};
    if (contentType) headers["Content-Type"] = contentType;
    const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: "POST",
      headers,
      body,
      signal: AbortSignal.timeout(20000),
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

  return telegramApi(
    token,
    "sendMessage",
    JSON.stringify({
      chat_id: chatId,
      text: parts.join("\n"),
      parse_mode: "HTML",
      disable_web_page_preview: true,
    }),
    "application/json"
  );
}

async function loadNotifyImageBuffer(
  aiIconUrl: string | null | undefined
): Promise<{ buffer: Buffer; filename: string; contentType: string } | null> {
  const signed = signedPushMediaPath(aiIconUrl);
  if (!signed) return null;

  const bases = [
    getAppPublicUrlSetting(),
    process.env.APP_PUBLIC_URL?.trim(),
    process.env.INTERNAL_APP_URL?.trim(),
    process.env.NEXT_PUBLIC_APP_URL?.trim(),
    "http://127.0.0.1:3000",
    "http://localhost:3000",
  ].filter((b): b is string => Boolean(b));

  for (const base of bases) {
    try {
      const url = new URL(signed, base.replace(/\/$/, "") + "/").toString();
      const res = await fetch(url, {
        signal: AbortSignal.timeout(10000),
        cache: "no-store",
      });
      if (!res.ok) continue;
      const buffer = Buffer.from(await res.arrayBuffer());
      if (buffer.byteLength < 80) continue;
      const contentType = (
        res.headers.get("content-type") || "image/jpeg"
      ).split(";")[0];
      const ext = contentType.includes("png")
        ? "png"
        : contentType.includes("webp")
          ? "webp"
          : "jpg";
      return { buffer, filename: `buddy-notify.${ext}`, contentType };
    } catch {
      /* try next base */
    }
  }
  return null;
}

async function sendTelegramPhoto(input: {
  captionHtml: string;
  buffer: Buffer;
  filename: string;
  contentType: string;
}): Promise<TelegramMessageResult> {
  const token = getTelegramBotToken();
  const chatId = getTelegramChatId();
  if (!token || !chatId) {
    return { ok: false, skipped: "not_configured" };
  }

  const form = new FormData();
  form.append("chat_id", chatId);
  form.append(
    "photo",
    new Blob([new Uint8Array(input.buffer)], { type: input.contentType }),
    input.filename
  );
  form.append("caption", clipTelegram(input.captionHtml, 1024));
  form.append("parse_mode", "HTML");

  return telegramApi(token, "sendPhoto", form);
}

/**
 * Mirror a Buddy live/push notification to Telegram (text + image when available).
 */
export async function dispatchTelegramNotify(
  notification: AppNotifyPayload
): Promise<TelegramMessageResult> {
  if (!hasTelegramConfigured()) {
    return { ok: false, skipped: "not_configured" };
  }

  const { headline, body, href, htmlCaption } =
    formatNotifyLikePush(notification);
  const image = await loadNotifyImageBuffer(notification.aiIconUrl);

  if (image) {
    const photo = await sendTelegramPhoto({
      captionHtml: htmlCaption,
      buffer: image.buffer,
      filename: image.filename,
      contentType: image.contentType,
    });
    if (photo.ok) return photo;
    // Fall through to text if photo upload failed
  }

  return sendTelegramMessage({
    headline,
    detail: body,
    href,
  });
}

/** Fire-and-forget for background / notifyAppChange. */
export function notifyTelegramMessage(input: {
  headline: string;
  detail?: string | null;
  href?: string | null;
}): void {
  void sendTelegramMessage(input).catch(() => {
    /* optional */
  });
}

export function notifyTelegramFromAppNotify(
  notification: AppNotifyPayload
): void {
  void dispatchTelegramNotify(notification).catch(() => {
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
    detail:
      "Verbindung ok. Live-/Push-Benachrichtigungen kommen hier mit Text und Bild an.",
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
