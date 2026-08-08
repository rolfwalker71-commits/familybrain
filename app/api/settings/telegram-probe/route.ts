import { NextResponse } from "next/server";
import { isAuthError, requireAdmin } from "@/lib/auth/current-user";
import { ensureInitialized } from "@/lib/db/migrations";
import { probeTelegram } from "@/lib/telegram/notify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Admin: Telegram Bot-Token / Chat-ID kurz prüfen. */
export async function POST() {
  ensureInitialized();
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth;

  const result = await probeTelegram();
  return NextResponse.json({
    ...result,
    hint: !result.configured
      ? "Bot-Token und Chat-ID unter Einstellungen → Backup & Hinweise speichern."
      : !result.ok
        ? `Telegram fehlgeschlagen: ${result.error}. Token, Chat-ID und ob der Bot angeschrieben wurde prüfen.`
        : "Telegram OK — Testnachricht gesendet.",
  });
}
