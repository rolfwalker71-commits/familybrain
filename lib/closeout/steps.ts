/** Step model for the floating Tagesabschluss-Assistent. */

export type CloseoutProvider = "google" | "microsoft";

export type CloseoutStepId =
  | "calendar"
  | "triage"
  | "day-analysis"
  | "ticket-hours"
  | "done";

export type CloseoutStepDef = {
  id: CloseoutStepId;
  title: string;
  hint: string;
  /** Deep link into the hub / maringo. */
  href: string;
  cta: string;
  /** Short illustration caption shown in the active step. */
  visualLabel: string;
};

export type CloseoutStatusPayload = {
  todayIso: string;
  weekday: boolean;
  ritual: {
    calendarOpen: number;
    googleDayDone: boolean | null;
    microsoftDayDone: boolean | null;
  };
  ritualComplete: boolean;
  mailTriageGoogle: number;
  mailTriageMicrosoft: number;
  ticketHourSuggestions: number;
  googleConnected: boolean;
  microsoftConnected: boolean;
};

export function closeoutStepsFor(
  provider: CloseoutProvider
): CloseoutStepDef[] {
  const base = provider === "google" ? "/google" : "/microsoft";
  const label = provider === "google" ? "Gmail" : "Outlook";
  return [
    {
      id: "calendar",
      title: "Offene Termine prüfen",
      hint: "Erledigen, verschieben oder bestätigen.",
      href: `${base}?tab=calendar`,
      cta: `Zu ${provider === "google" ? "Google" : "Outlook"}-Kalender`,
      visualLabel: "Kalender",
    },
    {
      id: "triage",
      title: "Mail-Triage",
      hint: "Offene Vorschläge prüfen oder überspringen.",
      href: `${base}?tab=triage`,
      cta: `Zu ${label}-Triage`,
      visualLabel: "Triage",
    },
    {
      id: "day-analysis",
      title: `${label}-Tagesanalyse`,
      hint: "Posteingang analysieren und Vorschläge übernehmen.",
      href: `${base}?tab=mail&view=tagesanalysen`,
      cta: "Tagesanalyse öffnen",
      visualLabel: "Analyse",
    },
    {
      id: "ticket-hours",
      title: "Ticket-Stunden buchen",
      hint: "Gestempelte Ticket-Termine prüfen und buchen.",
      href: "/maringo?tab=hours",
      cta: "Zu Stunden-Vorschlägen",
      visualLabel: "Stunden",
    },
    {
      id: "done",
      title: "Abschluss bestätigen",
      hint: "Alles erledigt — Ritual abschließen.",
      href: "/dashboard",
      cta: "Zur Übersicht",
      visualLabel: "Fertig",
    },
  ];
}

export function stepDone(
  stepId: CloseoutStepId,
  provider: CloseoutProvider,
  status: CloseoutStatusPayload
): boolean {
  switch (stepId) {
    case "calendar":
      return status.ritual.calendarOpen <= 0;
    case "triage":
      return provider === "google"
        ? status.mailTriageGoogle <= 0
        : status.mailTriageMicrosoft <= 0;
    case "day-analysis": {
      const flag =
        provider === "google"
          ? status.ritual.googleDayDone
          : status.ritual.microsoftDayDone;
      // null = not connected → treat as N/A done
      return flag !== false;
    }
    case "ticket-hours":
      return status.ticketHourSuggestions <= 0;
    case "done":
      return (
        stepDone("calendar", provider, status) &&
        stepDone("triage", provider, status) &&
        stepDone("day-analysis", provider, status) &&
        stepDone("ticket-hours", provider, status)
      );
    default:
      return false;
  }
}

export function stepDetail(
  stepId: CloseoutStepId,
  provider: CloseoutProvider,
  status: CloseoutStatusPayload
): string {
  switch (stepId) {
    case "calendar":
      return status.ritual.calendarOpen > 0
        ? `${status.ritual.calendarOpen} offen`
        : "Keine offen";
    case "triage": {
      const n =
        provider === "google"
          ? status.mailTriageGoogle
          : status.mailTriageMicrosoft;
      return n > 0 ? `${n} offen` : "Keine offen";
    }
    case "day-analysis": {
      const flag =
        provider === "google"
          ? status.ritual.googleDayDone
          : status.ritual.microsoftDayDone;
      if (flag === null) return "Nicht verbunden";
      return flag ? "Erledigt" : "Noch offen";
    }
    case "ticket-hours":
      return status.ticketHourSuggestions > 0
        ? `${status.ticketHourSuggestions} Vorschlag${status.ticketHourSuggestions === 1 ? "" : "e"}`
        : "Keine offen";
    case "done":
      return stepDone("done", provider, status) ? "Bereit" : "Noch offen";
    default:
      return "";
  }
}

export function firstOpenStepIndex(
  provider: CloseoutProvider,
  status: CloseoutStatusPayload
): number {
  const steps = closeoutStepsFor(provider);
  const idx = steps.findIndex((s) => !stepDone(s.id, provider, status));
  return idx < 0 ? steps.length - 1 : idx;
}

export function openStepCount(
  provider: CloseoutProvider,
  status: CloseoutStatusPayload
): number {
  return closeoutStepsFor(provider).filter(
    (s) => s.id !== "done" && !stepDone(s.id, provider, status)
  ).length;
}
