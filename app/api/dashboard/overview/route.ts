import { NextResponse } from "next/server";
import { isAuthError, requireAdmin } from "@/lib/auth/current-user";
import {
  getDashboardOverview,
  parseOverviewPeriod,
} from "@/lib/dashboard/overview";
import { ensureInitialized } from "@/lib/db/migrations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  ensureInitialized();
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth;

  const { finalizeDuePaymentPlans } = await import(
    "@/lib/finance/payment-pipeline"
  );
  await finalizeDuePaymentPlans().catch(() => undefined);

  const { ensureSofascoreLogosMigrated } = await import("@/lib/hockey/logo");
  const { syncHockeyResultsIfDue } = await import(
    "@/lib/hockey/sync-results"
  );
  await ensureSofascoreLogosMigrated().catch((error) => {
    console.warn(
      "[hockey] Sofascore logo migration:",
      error instanceof Error ? error.message : error
    );
  });
  await syncHockeyResultsIfDue().catch((error) => {
    console.warn(
      "[hockey] Sofascore result sync:",
      error instanceof Error ? error.message : error
    );
  });

  const { searchParams } = new URL(request.url);
  const period = parseOverviewPeriod(searchParams.get("period"));
  const anchor = searchParams.get("anchor");
  const { resolveCalendarUserId } = await import("@/lib/calendar/ics-calendars");
  const calendarUserId = resolveCalendarUserId(auth);
  return NextResponse.json(
    await getDashboardOverview(period, anchor, calendarUserId)
  );
}
