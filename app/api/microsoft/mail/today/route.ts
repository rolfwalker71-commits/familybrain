import { NextResponse } from "next/server";
import { isAuthError, requireAuth } from "@/lib/auth/current-user";
import { ensureInitialized } from "@/lib/db/migrations";
import { listMicrosoftMailForDay } from "@/lib/microsoft/mail-day";
import { zurichYmd } from "@/lib/microsoft/time";
import {
  isMicrosoftConnected,
  resolveMicrosoftUserId,
} from "@/lib/microsoft/oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  ensureInitialized();
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;
  const userId = resolveMicrosoftUserId(auth);
  if (userId == null || !isMicrosoftConnected(userId)) {
    return NextResponse.json(
      { error: "Microsoft 365 nicht verbunden." },
      { status: 400 }
    );
  }
  const url = new URL(request.url);
  const day =
    url.searchParams.get("date")?.trim() ||
    url.searchParams.get("day")?.trim() ||
    zurichYmd();
  try {
    const data = await listMicrosoftMailForDay(userId, day);
    return NextResponse.json({
      ...data,
      todayIso: data.dayIso,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 502 }
    );
  }
}
