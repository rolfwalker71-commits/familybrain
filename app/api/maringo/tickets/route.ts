import { NextResponse } from "next/server";
import { ensureInitialized } from "@/lib/db/migrations";
import { isAuthError, requireModule } from "@/lib/auth/current-user";
import { zurichNowParts } from "@/lib/dashboard/day-briefing";
import { MariApiError, requireMariConfig } from "@/lib/mari/client";
import { hasMariConfig } from "@/lib/mari/config";
import { mapPrimaryMariCalendarStampsByIssueIds } from "@/lib/mari/calendar-stamp";
import { parseCardCodesParam } from "@/lib/mari/customers";
import { parseStatusIdsParam, WORK_STATUS_IDS } from "@/lib/mari/status";
import {
  listMyTickets,
  normalizeMariEmployeeNumber,
  type MariTicketListItem,
} from "@/lib/mari/tickets";
import { getAppUserById } from "@/lib/users/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function stampsForTickets(tickets: MariTicketListItem[]) {
  return mapPrimaryMariCalendarStampsByIssueIds(
    tickets.map((t) => t.issueId),
    zurichNowParts().todayIso
  );
}

export async function GET(request: Request) {
  ensureInitialized();
  const auth = await requireModule("maringo");
  if (isAuthError(auth)) return auth;

  if (!hasMariConfig()) {
    return NextResponse.json(
      {
        error:
          "MARI nicht konfiguriert. Unter Einstellungen → Maringo Credentials hinterlegen.",
        configured: false,
        tickets: [],
        calendarStamps: {},
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
    const cardCodes = parseCardCodesParam(url.searchParams.get("cardCodes"));

    if (cardCodes.length > 0) {
      const tickets = await listMyTickets({
        statuses,
        overdueOnly,
        cardCodes,
      });
      return NextResponse.json({
        configured: true,
        tickets,
        calendarStamps: stampsForTickets(tickets),
        statuses,
        overdueOnly,
        cardCodes,
        filterMode: "customer" as const,
        defaultHandledBy:
          normalizeMariEmployeeNumber(
            auth.userId != null
              ? getAppUserById(auth.userId)?.mari_employee_number
              : null
          ) || cfg.employeeNumber.trim().toUpperCase(),
      });
    }

    const handledByParam =
      url.searchParams.get("handledBy") ||
      url.searchParams.get("employee") ||
      null;
    const userEmp =
      auth.userId != null
        ? getAppUserById(auth.userId)?.mari_employee_number
        : null;
    const handledBy =
      normalizeMariEmployeeNumber(handledByParam) ||
      normalizeMariEmployeeNumber(userEmp) ||
      normalizeMariEmployeeNumber(cfg.employeeNumber);
    if (!handledBy) {
      return NextResponse.json(
        {
          error: "Personalnummer ungültig (z.B. M1010).",
          tickets: [],
          calendarStamps: {},
        },
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
      calendarStamps: stampsForTickets(tickets),
      statuses,
      overdueOnly,
      handledBy,
      filterMode: "handler" as const,
      defaultHandledBy:
        normalizeMariEmployeeNumber(userEmp) ||
        cfg.employeeNumber.trim().toUpperCase(),
    });
  } catch (err) {
    const message =
      err instanceof MariApiError
        ? err.message
        : err instanceof Error
          ? err.message
          : String(err);
    const status = err instanceof MariApiError ? err.status || 502 : 502;
    return NextResponse.json(
      { error: message, tickets: [], calendarStamps: {} },
      { status }
    );
  }
}
