/**
 * Virtueller Wochentags-Termin «Tagesabschluss» 18:30 (Europe/Zurich)
 * — nur in Buddy (Dashboard), nicht in Google/Outlook.
 */
import type { AgendaItem } from "@/lib/dashboard/overview";

export const DAY_CLOSE_RITUAL_ID = "buddy-day-close";
export const DAY_CLOSE_TIME = "18:30";
export const DAY_CLOSE_END_TIME = "18:45";

export function isDayCloseRitualId(id: string | null | undefined): boolean {
  return Boolean(id && id.startsWith(DAY_CLOSE_RITUAL_ID));
}

/** Mo–Fr in Europe/Zurich für ein YYYY-MM-DD. */
export function isZurichWeekday(ymd: string): boolean {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Zurich",
    weekday: "short",
  }).formatToParts(new Date(`${ymd}T12:00:00Z`));
  const wd = parts.find((p) => p.type === "weekday")?.value || "";
  return wd !== "Sat" && wd !== "Sun";
}

export type DayCloseRitualStatus = {
  calendarOpen: number;
  googleDayDone: boolean | null;
  microsoftDayDone: boolean | null;
};

function ritualSubtitle(status?: DayCloseRitualStatus | null): string {
  const bits: string[] = [
    "Termine prüfen · Tagesanalysen · Ticket-Stunden",
  ];
  if (status) {
    if (status.calendarOpen > 0) {
      bits.push(`${status.calendarOpen} Termin(e) offen`);
    }
    const analyses: string[] = [];
    if (status.googleDayDone === false) analyses.push("Gmail-Analyse fehlt");
    if (status.microsoftDayDone === false) analyses.push("Outlook-Analyse fehlt");
    if (status.googleDayDone === true) analyses.push("Gmail ✓");
    if (status.microsoftDayDone === true) analyses.push("Outlook ✓");
    if (analyses.length) bits.push(analyses.join(" · "));
  }
  return bits.join(" · ");
}

export function isDayCloseRitualComplete(
  status?: DayCloseRitualStatus | null
): boolean {
  if (!status) return false;
  if (status.calendarOpen > 0) return false;
  if (status.googleDayDone === false) return false;
  if (status.microsoftDayDone === false) return false;
  return true;
}

export function buildDayCloseRitualItem(
  todayIso: string,
  status?: DayCloseRitualStatus | null
): AgendaItem {
  const done = isDayCloseRitualComplete(status);
  return {
    id: DAY_CLOSE_RITUAL_ID,
    kind: "deadline",
    date: todayIso,
    title: done ? "✅ Tagesabschluss" : "Tagesabschluss",
    subtitle: ritualSubtitle(status),
    amount: null,
    currency: null,
    documentId: null,
    href: "/maringo?tab=hours",
    badge: "Ritual",
    time: DAY_CLOSE_TIME,
    endTime: DAY_CLOSE_END_TIME,
    accentColor: "#0f766e",
    calendarId: "buddy-ritual",
    calendarName: "Buddy",
    /** Zählt als sichtbarer Termin, aber nicht als Cloud-Review. */
    planningRelevant: true,
    description:
      "Virtueller Buddy-Termin (nicht im Google-/Outlook-Kalender).\n" +
      "1) Offene Termine erledigen, verschieben oder bestätigen\n" +
      "2) Gmail- und Outlook-Tagesanalyse laufen lassen\n" +
      "3) Stunden aus Ticket-Terminen prüfen und buchen (Maringo → Stunden)",
  };
}

/** Hängt den Ritual-Termin an die heutige Agenda (nur Wochentage). */
export function withDayCloseRitual(
  items: AgendaItem[],
  todayIso: string,
  status?: DayCloseRitualStatus | null
): AgendaItem[] {
  if (!isZurichWeekday(todayIso)) {
    return items.filter((i) => !isDayCloseRitualId(i.id));
  }
  const without = items.filter((i) => !isDayCloseRitualId(i.id));
  const ritual = buildDayCloseRitualItem(todayIso, status);
  return [...without, ritual].sort((a, b) => {
    const dc = a.date.localeCompare(b.date);
    if (dc !== 0) return dc;
    return (a.time || "99:99").localeCompare(b.time || "99:99");
  });
}

export async function resolveDayCloseRitualStatus(
  userId: number | null | undefined,
  todayIso: string,
  todayCalendar: Array<{
    id: string;
    title: string;
    date: string;
    planningRelevant?: boolean | null;
  }>
): Promise<DayCloseRitualStatus> {
  const planning = todayCalendar.filter(
    (i) =>
      i.date === todayIso &&
      i.planningRelevant !== false &&
      !isDayCloseRitualId(i.id)
  );
  const calendarOpen = planning.filter(
    (i) => !(i.title || "").trim().startsWith("✅")
  ).length;

  let googleDayDone: boolean | null = null;
  let microsoftDayDone: boolean | null = null;

  if (userId != null) {
    try {
      const { isGoogleMailConnected } = await import("@/lib/google/oauth");
      if (isGoogleMailConnected(userId)) {
        const { getGoogleMailDayCached } = await import(
          "@/lib/google/mail-day-analysis-job"
        );
        googleDayDone = Boolean(getGoogleMailDayCached(userId, todayIso));
      }
    } catch {
      /* optional */
    }
    try {
      const { isMicrosoftConnected } = await import("@/lib/microsoft/oauth");
      if (isMicrosoftConnected(userId)) {
        const { getMsMailDayCached } = await import(
          "@/lib/microsoft/mail-day-analysis-job"
        );
        microsoftDayDone = Boolean(getMsMailDayCached(userId, todayIso));
      }
    } catch {
      /* optional */
    }
  }

  return { calendarOpen, googleDayDone, microsoftDayDone };
}
