import { NextResponse } from "next/server";
import { ensureInitialized } from "@/lib/db/migrations";
import { isAuthError, requireAuth } from "@/lib/auth/current-user";
import { findRolfAppUserId } from "@/lib/calendar/ics-calendars";
import { zurichNowParts } from "@/lib/dashboard/day-briefing";
import {
  isDayCloseRitualComplete,
  isZurichWeekday,
  resolveDayCloseRitualStatus,
} from "@/lib/dashboard/day-close-ritual";
import { getTodayCalendarExcerpt } from "@/lib/calendar/agenda-feed";
import { listPendingMariCalendarStamps } from "@/lib/mari/calendar-stamp";
import { countPendingMailTriage } from "@/lib/mail/mail-analysis-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Lightweight status for the floating Tagesabschluss-Assistent. */
export async function GET() {
  ensureInitialized();
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  const userId = findRolfAppUserId();
  const { todayIso } = zurichNowParts();
  const weekday = isZurichWeekday(todayIso);

  const todayCalendar =
    userId != null
      ? await getTodayCalendarExcerpt(userId, 40).catch(() => [])
      : [];

  const ritual = await resolveDayCloseRitualStatus(
    userId,
    todayIso,
    todayCalendar
  );

  let mailTriageGoogle = 0;
  let mailTriageMicrosoft = 0;
  if (userId != null) {
    try {
      mailTriageGoogle = countPendingMailTriage(userId, "google");
    } catch {
      /* optional */
    }
    try {
      mailTriageMicrosoft = countPendingMailTriage(userId, "microsoft");
    } catch {
      /* optional */
    }
  }

  let ticketHourSuggestions = 0;
  try {
    ticketHourSuggestions = listPendingMariCalendarStamps({
      onOrBeforeDate: todayIso,
    }).length;
  } catch {
    /* optional */
  }

  return NextResponse.json({
    ok: true,
    todayIso,
    weekday,
    ritual,
    ritualComplete: isDayCloseRitualComplete(ritual),
    mailTriageGoogle,
    mailTriageMicrosoft,
    ticketHourSuggestions,
    googleConnected: ritual.googleDayDone !== null,
    microsoftConnected: ritual.microsoftDayDone !== null,
  });
}
