/** How far back overdue items still count as actionable (KPIs / inbox). */
export const ACTION_OVERDUE_LOOKBACK_DAYS = 30;

/** Upcoming deadline horizon for dashboard KPIs. */
export const ACTION_DEADLINE_AHEAD_DAYS = 30;

/** Warranty “expiring soon” horizon for KPIs / inbox / sidebar. */
export const ACTION_WARRANTY_AHEAD_DAYS = 90;

/** Calendar-day distance from today (local) to an ISO date. Negative = overdue. */
export function daysUntil(
  isoDate: string | null | undefined,
  today = new Date().toISOString().slice(0, 10)
): number | null {
  if (!isoDate) return null;
  const date = isoDate.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const start = Date.UTC(
    Number(today.slice(0, 4)),
    Number(today.slice(5, 7)) - 1,
    Number(today.slice(8, 10))
  );
  const end = Date.UTC(
    Number(date.slice(0, 4)),
    Number(date.slice(5, 7)) - 1,
    Number(date.slice(8, 10))
  );
  return Math.round((end - start) / 86_400_000);
}

export type DueUrgency = "overdue" | "today" | "week" | "month" | "later" | "none";

export function dueUrgency(
  isoDate: string | null | undefined,
  today = new Date().toISOString().slice(0, 10)
): DueUrgency {
  const days = daysUntil(isoDate, today);
  if (days == null) return "none";
  if (days < 0) return "overdue";
  if (days === 0) return "today";
  if (days <= 7) return "week";
  if (days <= 30) return "month";
  return "later";
}

/** German relative due label, e.g. "In 4 Tagen fällig" / "Überfällig seit 8 Tagen". */
export function formatDueRelative(
  isoDate: string | null | undefined,
  today = new Date().toISOString().slice(0, 10)
): string {
  const days = daysUntil(isoDate, today);
  if (days == null) return "Kein Fälligkeitsdatum";
  if (days < 0) {
    const n = Math.abs(days);
    return n === 1 ? "1 Tag überfällig" : `${n} Tage überfällig`;
  }
  if (days === 0) return "Heute fällig";
  if (days === 1) return "Morgen fällig";
  return `In ${days} Tagen fällig`;
}

/** Relative label for warranty end dates. */
export function formatExpiryRelative(
  isoDate: string | null | undefined,
  today = new Date().toISOString().slice(0, 10)
): string {
  const days = daysUntil(isoDate, today);
  if (days == null) return "Kein Ablaufdatum";
  if (days < 0) {
    const n = Math.abs(days);
    return n === 1 ? "Seit 1 Tag abgelaufen" : `Seit ${n} Tagen abgelaufen`;
  }
  if (days === 0) return "Läuft heute ab";
  if (days === 1) return "Läuft morgen ab";
  return `Läuft in ${days} Tagen ab`;
}

export function dueUrgencyBadgeClass(urgency: DueUrgency): string {
  switch (urgency) {
    case "overdue":
      return "border-transparent bg-red-100 text-red-800 hover:bg-red-100 dark:bg-red-500/15 dark:text-red-400";
    case "today":
      return "border-transparent bg-red-100 text-red-700 hover:bg-red-100 dark:bg-red-500/15 dark:text-red-400";
    case "week":
      return "border-transparent bg-orange-100 text-orange-800 hover:bg-orange-100 dark:bg-orange-500/15 dark:text-orange-400";
    case "month":
      return "border-transparent bg-amber-100 text-amber-800 hover:bg-amber-100 dark:bg-amber-500/15 dark:text-amber-400";
    case "later":
      return "border-transparent bg-muted text-muted-foreground hover:bg-muted";
    default:
      return "";
  }
}

export function dueUrgencyTextClass(urgency: DueUrgency): string {
  switch (urgency) {
    case "overdue":
    case "today":
      return "text-red-700 dark:text-red-400";
    case "week":
      return "text-orange-700 dark:text-orange-400";
    case "month":
      return "text-amber-800 dark:text-amber-400";
    default:
      return "text-muted-foreground";
  }
}
