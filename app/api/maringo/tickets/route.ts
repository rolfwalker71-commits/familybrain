import { NextResponse } from "next/server";
import { ensureInitialized } from "@/lib/db/migrations";
import { isAuthError, requireAuth } from "@/lib/auth/current-user";
import { MariApiError } from "@/lib/mari/client";
import { hasMariConfig } from "@/lib/mari/config";
import { parseStatusIdsParam, WORK_STATUS_IDS } from "@/lib/mari/status";
import { listMyTickets } from "@/lib/mari/tickets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  ensureInitialized();
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  if (!hasMariConfig()) {
    return NextResponse.json(
      {
        error:
          "MARI nicht konfiguriert. Unter Einstellungen → Maringo Credentials hinterlegen.",
        configured: false,
        tickets: [],
      },
      { status: 503 }
    );
  }

  try {
    const url = new URL(request.url);
    const statuses = parseStatusIdsParam(
      url.searchParams.get("status"),
      WORK_STATUS_IDS
    );
    const overdueOnly = url.searchParams.get("overdue") === "1";
    const tickets = await listMyTickets({ statuses, overdueOnly });
    return NextResponse.json({
      configured: true,
      tickets,
      statuses,
      overdueOnly,
    });
  } catch (err) {
    const message =
      err instanceof MariApiError
        ? err.message
        : err instanceof Error
          ? err.message
          : String(err);
    const status = err instanceof MariApiError ? err.status || 502 : 502;
    return NextResponse.json({ error: message, tickets: [] }, { status });
  }
}
