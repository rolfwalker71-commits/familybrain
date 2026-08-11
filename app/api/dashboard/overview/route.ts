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

  const { ownerKeyFromAuth } = await import("@/lib/auth/owner-key");
  const ownerKey = ownerKeyFromAuth(auth);

  // Refresh ticket snapshot when due; await only if status universe expanded.
  try {
    const {
      syncMariTicketsIfDue,
      mariTicketsSyncNeedsForce,
    } = await import("@/lib/mari/sync-tickets-if-due");
    if (mariTicketsSyncNeedsForce()) {
      await syncMariTicketsIfDue();
    } else {
      void syncMariTicketsIfDue().catch((error) => {
        console.warn(
          "[mari] overview ticket sync:",
          error instanceof Error ? error.message : error
        );
      });
    }
  } catch (error) {
    console.warn(
      "[mari] overview ticket sync:",
      error instanceof Error ? error.message : error
    );
  }

  if (!fresh) {
    const cached = getCachedOverview(calendarUserId, period, anchor);
    if (cached) {
      // Ticket widget follows live filter prefs / snapshot (cheap, no MARI).
      try {
        const { getMariTicketsWatchState } = await import(
          "@/lib/mari/sync-tickets-if-due"
        );
        const st = getMariTicketsWatchState(ownerKey);
        cached.mariTickets = {
          configured: st.configured,
          employeeNumber: st.employeeNumber,
          lastPollAt: st.lastPollAt,
          countsByStatus: st.countsByStatus,
          total: st.total,
          recentChanges: st.recentChanges.map((c) => ({
            at: c.at,
            issueId: c.issueId,
            title: c.title,
            detail: c.detail,
          })),
        };
      } catch {
        /* keep cached mariTickets */
      }
      return NextResponse.json(cached, {
        headers: { "X-Overview-Cache": "hit" },
      });
    }
  }

  const payload = await getDashboardOverview(
    period,
    anchor,
    calendarUserId,
    ownerKey
  );
  setCachedOverview(calendarUserId, period, anchor, payload);
  return NextResponse.json(payload, {
    headers: { "X-Overview-Cache": fresh ? "bypass" : "miss" },
  });
}
