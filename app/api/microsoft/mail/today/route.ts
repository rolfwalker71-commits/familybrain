import { NextResponse } from "next/server";
import { isAuthError, requireModule } from "@/lib/auth/current-user";
import { ensureInitialized } from "@/lib/db/migrations";
import { listMicrosoftMailForRange } from "@/lib/microsoft/mail-day";
import { resolveMailAnalysisRange } from "@/lib/mail/mail-analysis-range";
import {
  isMicrosoftConnected,
  resolveMicrosoftUserId,
} from "@/lib/microsoft/oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Thread expansion can take a while for busy mailboxes. */
export const maxDuration = 120;

export async function GET(request: Request) {
  ensureInitialized();
  const auth = await requireModule("microsoft");
  if (isAuthError(auth)) return auth;
  const userId = resolveMicrosoftUserId(auth);
  if (userId == null || !isMicrosoftConnected(userId)) {
    return NextResponse.json(
      { error: "Microsoft 365 nicht verbunden." },
      { status: 400 }
    );
  }
  const url = new URL(request.url);
  const range = resolveMailAnalysisRange({
    from: url.searchParams.get("from"),
    to: url.searchParams.get("to"),
    date:
      url.searchParams.get("date")?.trim() ||
      url.searchParams.get("day")?.trim() ||
      null,
  });
  if ("error" in range) {
    return NextResponse.json({ error: range.error }, { status: 400 });
  }
  try {
    const data = await listMicrosoftMailForRange(
      userId,
      range.fromYmd,
      range.toYmd
    );
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
