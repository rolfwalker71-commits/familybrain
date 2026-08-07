import { NextResponse } from "next/server";
import { isAuthError, requireAdmin } from "@/lib/auth/current-user";
import {
  getDashboardOverview,
  parseOverviewPeriod,
} from "@/lib/dashboard/overview";
import {
  getCachedOverview,
  setCachedOverview,
  invalidateOverviewCache,
} from "@/lib/dashboard/overview-cache";
import { ensureInitialized } from "@/lib/db/migrations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Side jobs must not block first paint — run after kicking off response path. */
function runOverviewBackgroundJobs(
  calendarUserId: number | null,
  request: Request
): void {
  void (async () => {
    try {
      const { finalizeDuePaymentPlans } = await import(
        "@/lib/finance/payment-pipeline"
      );
      await finalizeDuePaymentPlans().catch(() => undefined);
    } catch {
      /* ignore */
    }

    // Mail AI triage: same trigger as /mail list, without blocking overview
    if (calendarUserId != null) {
      try {
        const { getTodayMailExcerpt } = await import("@/lib/mail/gmail");
        const { syncMailAnalysesForItems } = await import(
          "@/lib/mail/sync-mail-analysis"
        );
        const mailItems = await getTodayMailExcerpt(
          calendarUserId,
          10,
          request
        );
        const sync = await syncMailAnalysesForItems(
          calendarUserId,
          mailItems,
          { maxAi: 3, request }
        );
        if (
          sync.analyzed > 0 ||
          sync.withSuggestions > 0 ||
          sync.skippedHeuristic > 0 ||
          sync.errors > 0
        ) {
          invalidateOverviewCache(calendarUserId);
        }
      } catch (error) {
        console.warn(
          "[mail] overview background sync:",
          error instanceof Error ? error.message : error
        );
      }
    }

    let syncUpdated = 0;
    try {
      const { ensureSofascoreLogosMigrated } = await import(
        "@/lib/hockey/logo"
      );
      await ensureSofascoreLogosMigrated().catch((error) => {
        console.warn(
          "[hockey] Sofascore logo migration:",
          error instanceof Error ? error.message : error
        );
      });
      const { syncHockeyResultsIfDue } = await import(
        "@/lib/hockey/sync-results"
      );
      const syncSummary = await syncHockeyResultsIfDue().catch((error) => {
        console.warn(
          "[hockey] Sofascore result sync:",
          error instanceof Error ? error.message : error
        );
        return null;
      });
      syncUpdated = syncSummary?.updated ?? 0;
    } catch (error) {
      console.warn(
        "[hockey] background sync:",
        error instanceof Error ? error.message : error
      );
    }

    if (calendarUserId == null) return;
    try {
      const { writeHockeyResultsToGoogleCalendars } = await import(
        "@/lib/google/hockey-writeback"
      );
      await writeHockeyResultsToGoogleCalendars(calendarUserId, {
        force: syncUpdated > 0,
        request,
      }).catch((error) => {
        console.warn(
          "[hockey] Google result writeback:",
          error instanceof Error ? error.message : error
        );
      });
    } catch (error) {
      console.warn(
        "[hockey] writeback import:",
        error instanceof Error ? error.message : error
      );
    }
  })();
}

export async function GET(request: Request) {
  ensureInitialized();
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth;

  const { resolveCalendarUserId } = await import(
    "@/lib/calendar/ics-calendars"
  );
  const calendarUserId = resolveCalendarUserId(auth);

  // Do not await — overview paint must not wait for Sofascore / Google writeback
  runOverviewBackgroundJobs(calendarUserId, request);

  const { searchParams } = new URL(request.url);
  const period = parseOverviewPeriod(searchParams.get("period"));
  const anchor = searchParams.get("anchor");
  const fresh = searchParams.get("fresh") === "1";

  if (!fresh) {
    const cached = getCachedOverview(calendarUserId, period, anchor);
    if (cached) {
      return NextResponse.json(cached, {
        headers: { "X-Overview-Cache": "hit" },
      });
    }
  }

  const payload = await getDashboardOverview(period, anchor, calendarUserId);
  setCachedOverview(calendarUserId, period, anchor, payload);
  return NextResponse.json(payload, {
    headers: { "X-Overview-Cache": fresh ? "bypass" : "miss" },
  });
}
