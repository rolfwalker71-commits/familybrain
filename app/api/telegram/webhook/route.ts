import { NextResponse } from "next/server";
import { ensureInitialized } from "@/lib/db/migrations";
import {
  getTelegramInboundMode,
  getTelegramWebhookSecret,
  hasTelegramConfigured,
} from "@/lib/telegram/notify";
import {
  processTelegramUpdate,
  type TelegramUpdate,
} from "@/lib/telegram/inbound";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Telegram Bot webhook. Auth via X-Telegram-Bot-Api-Secret-Token.
 * No session cookie — Telegram servers call this.
 */
export async function POST(request: Request) {
  ensureInitialized();

  if (!hasTelegramConfigured()) {
    return NextResponse.json({ ok: false, error: "not_configured" }, { status: 503 });
  }

  const secret = getTelegramWebhookSecret();
  const header = request.headers.get("x-telegram-bot-api-secret-token");
  if (!secret || !header || header !== secret) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  if (getTelegramInboundMode() !== "webhook") {
    // Accept but ignore if mode switched to poll — avoids double-handling confusion.
    return NextResponse.json({ ok: true, ignored: "mode_not_webhook" });
  }

  let update: TelegramUpdate;
  try {
    update = (await request.json()) as TelegramUpdate;
  } catch {
    return NextResponse.json({ ok: false, error: "bad_json" }, { status: 400 });
  }

  try {
    const result = await processTelegramUpdate(update);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.warn(
      "[telegram webhook]",
      err instanceof Error ? err.message : err
    );
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
