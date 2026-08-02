import type { AuthContext } from "@/lib/auth/current-user";
import { countPendingTriageDocuments } from "@/lib/mail/notify-triage";
import { buildInboxTaskBoard } from "@/lib/inbox/build-tasks";
import { getDb } from "@/lib/db/client";
import { getHomeAgenda } from "@/lib/trips/home-agenda";
import { toTimeInputValue } from "@/lib/utils/dates";

export type WidgetSummary = {
  id: "inbox" | "finance" | "travel";
  title: string;
  primary: string;
  secondary: string | null;
  href: string;
  count: number | null;
};

function countOpenUnpaid(): number {
  const row = getDb()
    .prepare(
      `SELECT COUNT(*) AS n FROM paperless_documents
       WHERE zu_bezahlen = 1
         AND COALESCE(bezahlt, 0) = 0
         AND COALESCE(sync_status, 'synced') != 'missing'`
    )
    .get() as { n: number };
  return Number(row?.n) || 0;
}

export function getMobileWidgetSummaries(auth: AuthContext): {
  widgets: WidgetSummary[];
  generatedAt: string;
} {
  const widgets: WidgetSummary[] = [];

  if (auth.isAdmin) {
    const board = buildInboxTaskBoard({ each: 50 });
    const triage = countPendingTriageDocuments();
    widgets.push({
      id: "inbox",
      title: "Prüfliste",
      primary:
        board.counts.open === 0
          ? "Alles erledigt"
          : `${board.counts.open} offen`,
      secondary:
        triage > 0 ? `${triage} Belege zur Prüfung` : "Action-Inbox",
      href: "/dashboard",
      count: board.counts.open,
    });

    const openPay = countOpenUnpaid();
    widgets.push({
      id: "finance",
      title: "Finanzen",
      primary:
        openPay === 0 ? "Keine offenen Rechnungen" : `${openPay} offen`,
      secondary: "Paperless · Zu bezahlen",
      href: "/finance",
      count: openPay,
    });
  } else {
    widgets.push({
      id: "inbox",
      title: "Buddy",
      primary: "Travel & Finanzen",
      secondary: "Tippen zum Öffnen",
      href: "/trips",
      count: null,
    });
    widgets.push({
      id: "finance",
      title: "FinanzBuddy",
      primary: "Abrechnungen",
      secondary: "Tippen zum Öffnen",
      href: "/finance-brain",
      count: null,
    });
  }

  const agenda = getHomeAgenda({
    isAdmin: auth.isAdmin,
    userId: auth.userId,
  });
  const today = agenda.days.find((d) => d.isToday);
  const nextEvent =
    today?.events[0] ||
    agenda.days.flatMap((d) => d.events)[0] ||
    null;

  if (nextEvent) {
    const time = toTimeInputValue(nextEvent.start_time);
    widgets.push({
      id: "travel",
      title: agenda.activeTrip?.title || "TravelBuddy",
      primary: nextEvent.title,
      secondary: [time, nextEvent.trip_title].filter(Boolean).join(" · ") || null,
      href: `/trips/${nextEvent.trip_id}`,
      count: today?.events.length ?? null,
    });
  } else if (agenda.activeTrip) {
    widgets.push({
      id: "travel",
      title: "TravelBuddy",
      primary: agenda.activeTrip.title,
      secondary: "Keine Termine heute",
      href: `/trips/${agenda.activeTrip.id}`,
      count: 0,
    });
  } else {
    widgets.push({
      id: "travel",
      title: "TravelBuddy",
      primary: "Keine aktive Reise",
      secondary: "Tippen für Übersicht",
      href: "/trips",
      count: 0,
    });
  }

  return { widgets, generatedAt: new Date().toISOString() };
}
