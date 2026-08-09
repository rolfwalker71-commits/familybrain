import { NextResponse } from "next/server";
import { ensureInitialized } from "@/lib/db/migrations";
import { isAuthError, requireAuth } from "@/lib/auth/current-user";
import { MariApiError, requireMariConfig } from "@/lib/mari/client";
import { hasMariConfig } from "@/lib/mari/config";
import { parseStatusIdsParam, WORK_STATUS_IDS } from "@/lib/mari/status";
import {
  listMyTickets,
  normalizeMariEmployeeNumber,
} from "@/lib/mari/tickets";

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
    const cfg = requireMariConfig();
    const url = new URL(request.url);
    const statuses = parseStatusIdsParam(
      url.searchParams.get("status"),
      WORK_STATUS_IDS
    );
    const overdueOnly = url.searchParams.get("overdue") === "1";
    const handledByParam =
      url.searchParams.get("handledBy") ||
      url.searchParams.get("employee") ||
      null;
    const handledBy =
      normalizeMariEmployeeNumber(handledByParam) ||
      normalizeMariEmployeeNumber(cfg.employeeNumber);
    if (!handledBy) {
      return NextResponse.json(
        { error: "Personalnummer ungültig (z.B. M1010).", tickets: [] },
        { status: 400 }
      );
    }
    const tickets = await listMyTickets({
      statuses,
      overdueOnly,
      employeeNumber: handledBy,
    });
    return NextResponse.json({
      configured: true,
      tickets,
      statuses,
      overdueOnly,
      handledBy,
      defaultHandledBy: cfg.employeeNumber.trim().toUpperCase(),
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
