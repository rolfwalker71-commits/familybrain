import { getSetting, setSetting } from "@/lib/db/migrations";
import {
  buildDayBriefingFacts,
  buildDayBriefingPayload,
  formatContextPulse,
  resolveBriefingMode,
  zurichNowParts,
} from "@/lib/dashboard/day-briefing";
import {
  isZurichWeekday,
  resolveDayCloseRitualStatus,
} from "@/lib/dashboard/day-close-ritual";
import { getDashboardOverview } from "@/lib/dashboard/overview";
import { countMailAppliedToday } from "@/lib/mail/mail-applied-links";
import { notifyAppChange } from "@/lib/realtime/notify";

const MORNING_SENT_KEY = "day_briefing_last_sent_date";
const EVENING_SENT_KEY = "evening_digest_last_sent_date";

/** Morning window 07:00–09:30 Zurich. */
function inMorningWindow(hour: number, minute: number): boolean {
  const mins = hour * 60 + minute;
  return mins >= 7 * 60 && mins < 9 * 60 + 30;
}

/**
 * Evening: weekdays 18:30–19:30 (Tagesabschluss), weekends 19:45–21:30.
 */
function inEveningWindow(
  hour: number,
  minute: number,
  weekday: boolean
): boolean {
  const mins = hour * 60 + minute;
  if (weekday) {
    return mins >= 18 * 60 + 30 && mins < 19 * 60 + 30;
  }
  return mins >= 19 * 60 + 45 && mins < 21 * 60 + 30;
}

async function briefingForUser(userId: number) {
  const overview = await getDashboardOverview("month", undefined, userId);
  const { todayIso, hour, hm } = zurichNowParts();
  const facts = buildDayBriefingFacts({
    todayIso,
    hour,
    nowHm: hm,
    todayCalendar: overview.todayCalendar,
    chips: overview.chips,
    driveMirror: overview.driveMirror
      ? {
          percent: overview.driveMirror.percent,
          pending: overview.driveMirror.pending,
        }
      : null,
    upcomingBirthdays: overview.upcomingBirthdays,
    mailAppliedToday: countMailAppliedToday(userId, todayIso),
    tasksOverdue: (overview.tasks.items || []).filter((t) => t.overdue)
      .length,
  });
  return { facts, overview };
}

/**
 * Once per day (per window): push morning context / evening digest.
 * Called from the in-process scheduler tick.
 */
export async function maybeDispatchBriefingPushes(
  userId: number | null | undefined
): Promise<{ morning?: boolean; evening?: boolean }> {
  if (userId == null) return {};
  const { todayIso, hour, minute } = zurichNowParts();
  const out: { morning?: boolean; evening?: boolean } = {};

  try {
    if (
      inMorningWindow(hour, minute) &&
      getSetting(MORNING_SENT_KEY) !== todayIso
    ) {
      const { facts } = await briefingForUser(userId);
      const pulse = formatContextPulse(facts);
      const payload = await buildDayBriefingPayload(facts, {
        withAi: true,
        aiTimeoutMs: 4000,
      });
      notifyAppChange({
        domain: "documents",
        reason: "day_briefing",
        headline: pulse.headline,
        detail: payload.prose || pulse.detail,
        title: "Tageslage",
        href: "/",
        source: "buddy",
        aiIconUrl: null,
        category: "briefing",
        meta: resolveBriefingMode(hour),
      });
      setSetting(MORNING_SENT_KEY, todayIso);
      out.morning = true;
    }

    const weekday = isZurichWeekday(todayIso);
    if (
      inEveningWindow(hour, minute, weekday) &&
      getSetting(EVENING_SENT_KEY) !== todayIso
    ) {
      const built = await briefingForUser(userId);
      const facts = { ...built.facts, mode: "evening" as const };
      const payload = await buildDayBriefingPayload(facts, {
        withAi: true,
        aiTimeoutMs: 4000,
      });
      const ritual = await resolveDayCloseRitualStatus(
        userId,
        todayIso,
        built.overview.todayCalendar || []
      );
      const ritualBits = [
        ritual.calendarOpen > 0
          ? `${ritual.calendarOpen} Termin(e) prüfen`
          : "Termine geprüft",
        ritual.googleDayDone === false ? "Gmail-Tagesanalyse offen" : null,
        ritual.microsoftDayDone === false
          ? "Outlook-Tagesanalyse offen"
          : null,
        ritual.googleDayDone === true ? "Gmail-Analyse ✓" : null,
        ritual.microsoftDayDone === true ? "Outlook-Analyse ✓" : null,
      ].filter(Boolean);
      const openLine = payload.open.slice(0, 2).join(" · ");
      const doneLine = payload.done.slice(0, 2).join(" · ");
      const eveningDetail = [
        weekday ? `Tagesabschluss 18:30: ${ritualBits.join(" · ")}` : null,
        payload.prose || [doneLine, openLine].filter(Boolean).join(" — "),
      ]
        .filter(Boolean)
        .join("\n");
      notifyAppChange({
        domain: "documents",
        reason: "evening_digest",
        headline: weekday ? "Tagesabschluss" : "Abend-Digest",
        detail: eveningDetail,
        title: weekday ? "Tagesabschluss" : "Abend-Digest",
        href: weekday ? "/google?tab=calendar" : "/",
        source: "buddy",
        aiIconUrl: null,
        category: "briefing",
        meta: "evening",
      });
      setSetting(EVENING_SENT_KEY, todayIso);
      out.evening = true;
    }
  } catch (error) {
    console.warn(
      "[briefing] push failed:",
      error instanceof Error ? error.message : error
    );
  }

  return out;
}
