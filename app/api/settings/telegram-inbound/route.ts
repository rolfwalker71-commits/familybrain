import { NextResponse } from "next/server";
import { z } from "zod";
import { isAuthError, requireAuth } from "@/lib/auth/current-user";
import { ensureInitialized } from "@/lib/db/migrations";
import { absoluteAppUrl } from "@/lib/app-url";
import {
  clearTelegramWebhook,
  getTelegramInboundMode,
  hasTelegramConfigured,
  registerTelegramWebhook,
  setTelegramInboundMode,
  type TelegramInboundMode,
} from "@/lib/telegram/notify";
import {
  getTelegramPollRuntimeStatus,
  startTelegramPollLoop,
} from "@/lib/telegram/poll";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  action: z.enum(["status", "enable_poll", "enable_webhook", "disable"]),
});

export async function GET(request: Request) {
  ensureInitialized();
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  const mode = getTelegramInboundMode();
  return NextResponse.json({
    configured: hasTelegramConfigured(),
    mode,
    webhookUrl: absoluteAppUrl("/api/telegram/webhook", request),
    poll: getTelegramPollRuntimeStatus(),
  });
}

export async function POST(request: Request) {
  ensureInitialized();
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await request.json());
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Ungültige Anfrage" },
      { status: 400 }
    );
  }

  if (body.action === "status") {
    return NextResponse.json({
      configured: hasTelegramConfigured(),
      mode: getTelegramInboundMode(),
      webhookUrl: absoluteAppUrl("/api/telegram/webhook", request),
      poll: getTelegramPollRuntimeStatus(),
    });
  }

  if (!hasTelegramConfigured()) {
    return NextResponse.json(
      { error: "Telegram nicht konfiguriert (Token + Chat-ID)." },
      { status: 400 }
    );
  }

  if (body.action === "enable_poll") {
    const cleared = await clearTelegramWebhook();
    setTelegramInboundMode("poll");
    startTelegramPollLoop();
    return NextResponse.json({
      ok: cleared.ok,
      mode: "poll" as TelegramInboundMode,
      error: cleared.error,
      poll: getTelegramPollRuntimeStatus(),
    });
  }

  if (body.action === "enable_webhook") {
    const registered = await registerTelegramWebhook(request);
    return NextResponse.json({
      ok: registered.ok,
      mode: getTelegramInboundMode(),
      webhookUrl: registered.url,
      error: registered.error,
      poll: getTelegramPollRuntimeStatus(),
    });
  }

  // disable
  await clearTelegramWebhook().catch(() => null);
  setTelegramInboundMode("off");
  return NextResponse.json({
    ok: true,
    mode: "off" as TelegramInboundMode,
    poll: getTelegramPollRuntimeStatus(),
  });
}
