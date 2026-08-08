import { randomBytes } from "node:crypto";
import { getAppPublicUrlSetting, absoluteAppUrl } from "@/lib/app-url";
import { getSetting, setSetting } from "@/lib/db/migrations";
import type { AppNotifyPayload } from "@/lib/realtime/hub";
import { signedPushMediaPath } from "@/lib/push/signed-media";
import {
  bindTelegramActionTokensToMessage,
  buildCalendarDoneKeyboard,
  buildTelegramActionsForNotify,
  mergeReplyMarkups,
  type TelegramReplyMarkup,
} from "@/lib/telegram/actions";

export const TELEGRAM_BOT_TOKEN_SETTING = "telegram_bot_token";
export const TELEGRAM_CHAT_ID_SETTING = "telegram_chat_id";
export const TELEGRAM_INBOUND_MODE_SETTING = "telegram_inbound_mode";
export const TELEGRAM_WEBHOOK_SECRET_SETTING = "telegram_webhook_secret";

export type TelegramInboundMode = "off" | "poll" | "webhook";

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

export function getTelegramInboundMode(): TelegramInboundMode {
  const raw = (
    getSetting(TELEGRAM_INBOUND_MODE_SETTING) ||
    process.env.TELEGRAM_INBOUND_MODE ||
    ""
  )
    .trim()
    .toLowerCase();
  if (raw === "webhook" || raw === "poll" || raw === "off") return raw;
  // Default: poll when configured (works without public URL).
  return hasTelegramConfigured() ? "poll" : "off";
}

export function setTelegramInboundMode(mode: TelegramInboundMode): void {
  setSetting(TELEGRAM_INBOUND_MODE_SETTING, mode);
}

export function getTelegramWebhookSecret(): string | null {
  return getSetting(TELEGRAM_WEBHOOK_SECRET_SETTING)?.trim() || null;
}

export function ensureTelegramWebhookSecret(): string {
  const existing = getTelegramWebhookSecret();
  if (existing) return existing;
  const secret = randomBytes(24).toString("base64url");
  setSetting(TELEGRAM_WEBHOOK_SECRET_SETTING, secret);
  return secret;
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

type TelegramApiJson = {
  ok?: boolean;
  description?: string;
  result?: unknown;
};

async function telegramFetch(
  token: string,
  method: string,
  body: BodyInit,
  contentType?: string
): Promise<{ httpOk: boolean; data: TelegramApiJson }> {
  const headers: Record<string, string> = {};
  if (contentType) headers["Content-Type"] = contentType;
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers,
    body,
    signal: AbortSignal.timeout(20000),
    cache: "no-store",
  });
  const data = (await res.json().catch(() => ({}))) as TelegramApiJson;
  return { httpOk: res.ok, data };
}

async function telegramApi(
  token: string,
  method: string,
  body: BodyInit,
  contentType?: string
): Promise<TelegramMessageResult> {
  try {
    const { httpOk, data } = await telegramFetch(
      token,
      method,
      body,
      contentType
    );
    if (!httpOk || data.ok === false) {
      return {
        ok: false,
        error: data.description || "Telegram API error",
      };
    }
    const result = data.result as { message_id?: number } | undefined;
    return {
      ok: true,
      messageId:
        typeof result?.message_id === "number" ? result.message_id : null,
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
  replyMarkup?: TelegramReplyMarkup | null;
  actionTokens?: string[];
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
    link ? `<a href="${escapeHtml(link)}">In Buddy öffnen</a>` : "",
  ].filter(Boolean);

  const payload: Record<string, unknown> = {
    chat_id: chatId,
    text: parts.join("\n"),
    parse_mode: "HTML",
    disable_web_page_preview: true,
  };
  if (input.replyMarkup?.inline_keyboard?.length) {
    payload.reply_markup = input.replyMarkup;
  }

  const result = await telegramApi(
    token,
    "sendMessage",
    JSON.stringify(payload),
    "application/json"
  );
  if (result.ok && result.messageId != null && input.actionTokens?.length) {
    bindTelegramActionTokensToMessage(input.actionTokens, result.messageId);
  }
  return result;
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
  replyMarkup?: TelegramReplyMarkup | null;
  actionTokens?: string[];
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
  if (input.replyMarkup?.inline_keyboard?.length) {
    form.append("reply_markup", JSON.stringify(input.replyMarkup));
  }

  const result = await telegramApi(token, "sendPhoto", form);
  if (result.ok && result.messageId != null && input.actionTokens?.length) {
    bindTelegramActionTokensToMessage(input.actionTokens, result.messageId);
  }
  return result;
}

/**
 * Mirror a Buddy live/push notification to Telegram (text + image when available).
 * Attaches inline actions for doc triage when applicable; evening digest may
 * include «Erledigt» buttons for open cloud calendar events.
 */
export async function dispatchTelegramNotify(
  notification: AppNotifyPayload,
  extra?: {
    replyMarkup?: TelegramReplyMarkup | null;
    actionTokens?: string[];
    hintLine?: string | null;
  }
): Promise<TelegramMessageResult> {
  if (!hasTelegramConfigured()) {
    return { ok: false, skipped: "not_configured" };
  }

  const built = buildTelegramActionsForNotify(notification);
  let calExtra: {
    replyMarkup: TelegramReplyMarkup | null;
    tokens: string[];
    hintLine: string | null;
  } | null = null;

  if (
    notification.reason === "evening_digest" ||
    notification.reason === "day_briefing"
  ) {
    try {
      const { findRolfAppUserId } = await import(
        "@/lib/calendar/ics-calendars"
      );
      const { getCalendarAgenda } = await import("@/lib/calendar/agenda-feed");
      const userId = findRolfAppUserId();
      if (userId != null) {
        const feed = await getCalendarAgenda({
          userId,
          range: "today",
          includeWeather: false,
        });
        const openCloud = (feed.items || []).filter(
          (it) =>
            (it.id.startsWith("gcal-") || it.id.startsWith("mscal-")) &&
            it.planningRelevant !== false &&
            !(it.title || "").trim().startsWith("✅")
        );
        calExtra = buildCalendarDoneKeyboard(openCloud, 3);
      }
    } catch (err) {
      console.warn(
        "[telegram] briefing calendar buttons:",
        err instanceof Error ? err.message : err
      );
    }
  }

  const replyMarkup = mergeReplyMarkups(
    built.replyMarkup,
    calExtra?.replyMarkup,
    extra?.replyMarkup
  );
  const actionTokens = [
    ...(built.tokens || []),
    ...(calExtra?.tokens || []),
    ...(extra?.actionTokens || []),
  ];
  const hint =
    extra?.hintLine || calExtra?.hintLine || built.hintLine;

  const { headline, body, href, htmlCaption } =
    formatNotifyLikePush(notification);
  const captionWithHint = hint
    ? `${htmlCaption}\n<i>${escapeHtml(hint)}</i>`
    : htmlCaption;
  const detailWithHint = hint ? `${body}\n${hint}` : body;

  const image = await loadNotifyImageBuffer(notification.aiIconUrl);

  if (image) {
    const photo = await sendTelegramPhoto({
      captionHtml: captionWithHint,
      buffer: image.buffer,
      filename: image.filename,
      contentType: image.contentType,
      replyMarkup,
      actionTokens,
    });
    if (photo.ok) return photo;
  }

  return sendTelegramMessage({
    headline,
    detail: detailWithHint,
    href,
    replyMarkup,
    actionTokens,
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

export async function answerTelegramCallbackQuery(input: {
  callbackQueryId: string;
  text?: string;
  showAlert?: boolean;
}): Promise<void> {
  const token = getTelegramBotToken();
  if (!token) return;
  await telegramFetch(
    token,
    "answerCallbackQuery",
    JSON.stringify({
      callback_query_id: input.callbackQueryId,
      text: input.text?.slice(0, 200),
      show_alert: Boolean(input.showAlert),
    }),
    "application/json"
  ).catch(() => {
    /* optional */
  });
}

export async function editTelegramReplyMarkup(input: {
  messageId: number;
  replyMarkup: TelegramReplyMarkup;
}): Promise<void> {
  const token = getTelegramBotToken();
  const chatId = getTelegramChatId();
  if (!token || !chatId) return;
  await telegramFetch(
    token,
    "editMessageReplyMarkup",
    JSON.stringify({
      chat_id: chatId,
      message_id: input.messageId,
      reply_markup: input.replyMarkup,
    }),
    "application/json"
  ).catch(() => {
    /* optional */
  });
}

export async function telegramGetUpdates(input: {
  offset?: number;
  timeoutSec?: number;
}): Promise<
  | { ok: true; updates: unknown[] }
  | { ok: false; error: string }
> {
  const token = getTelegramBotToken();
  if (!token) return { ok: false, error: "not_configured" };
  try {
    const { httpOk, data } = await telegramFetch(
      token,
      "getUpdates",
      JSON.stringify({
        offset: input.offset || undefined,
        timeout: input.timeoutSec ?? 0,
        allowed_updates: ["message", "callback_query"],
      }),
      "application/json"
    );
    if (!httpOk || data.ok === false) {
      return { ok: false, error: data.description || "getUpdates failed" };
    }
    const updates = Array.isArray(data.result) ? data.result : [];
    return { ok: true, updates };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function registerTelegramWebhook(request?: Request | null): Promise<{
  ok: boolean;
  url: string | null;
  error: string | null;
}> {
  const token = getTelegramBotToken();
  if (!token) {
    return { ok: false, url: null, error: "not_configured" };
  }
  const url = absoluteAppUrl("/api/telegram/webhook", request ?? undefined);
  if (!url.startsWith("https://") && !url.startsWith("http://localhost")) {
    // Telegram requires HTTPS except localhost
  }
  if (!url.startsWith("http")) {
    return {
      ok: false,
      url: null,
      error: "Öffentliche App-URL fehlt (Einstellungen).",
    };
  }
  const secret = ensureTelegramWebhookSecret();
  try {
    const { httpOk, data } = await telegramFetch(
      token,
      "setWebhook",
      JSON.stringify({
        url,
        secret_token: secret,
        allowed_updates: ["message", "callback_query"],
        drop_pending_updates: false,
      }),
      "application/json"
    );
    if (!httpOk || data.ok === false) {
      return {
        ok: false,
        url,
        error: data.description || "setWebhook failed",
      };
    }
    setTelegramInboundMode("webhook");
    return { ok: true, url, error: null };
  } catch (err) {
    return {
      ok: false,
      url,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function clearTelegramWebhook(): Promise<{
  ok: boolean;
  error: string | null;
}> {
  const token = getTelegramBotToken();
  if (!token) return { ok: false, error: "not_configured" };
  try {
    const { httpOk, data } = await telegramFetch(
      token,
      "deleteWebhook",
      JSON.stringify({ drop_pending_updates: false }),
      "application/json"
    );
    if (!httpOk || data.ok === false) {
      return { ok: false, error: data.description || "deleteWebhook failed" };
    }
    setTelegramInboundMode("poll");
    return { ok: true, error: null };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
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
  const mode = getTelegramInboundMode();
  const result = await sendTelegramMessage({
    headline: "Buddy · Telegram-Test",
    detail: [
      "Verbindung ok. Live-/Push-Benachrichtigungen kommen hier mit Text und Bild an.",
      mode === "off"
        ? "Aktionen: aus (Polling/Webhook in Einstellungen)."
        : mode === "webhook"
          ? "Aktionen: Webhook aktiv — Buttons & Antworten funktionieren."
          : "Aktionen: Polling aktiv — Buttons & Antworten funktionieren.",
      "Bei Belegen: Zahlen / Irrelevant / Später.",
    ].join("\n"),
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
