export type TemporalStatus = "active" | "expiring_soon" | "expired" | "unknown";

export function resolveTemporalStatus(
  isoDate: string | null | undefined,
  soonDays = 90
): TemporalStatus {
  if (!isoDate) return "unknown";
  const date = isoDate.slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);
  if (date < today) return "expired";
  const soon = new Date();
  soon.setDate(soon.getDate() + soonDays);
  if (date <= soon.toISOString().slice(0, 10)) return "expiring_soon";
  return "active";
}

export function temporalStatusBadgeClass(status: TemporalStatus): string {
  switch (status) {
    case "active":
      return "border-transparent bg-emerald-100 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-500/15 dark:text-emerald-400";
    case "expiring_soon":
      return "border-transparent bg-orange-100 text-orange-700 hover:bg-orange-100 dark:bg-orange-500/15 dark:text-orange-400";
    case "expired":
      return "border-transparent bg-red-100 text-red-700 hover:bg-red-100 dark:bg-red-500/15 dark:text-red-400";
    default:
      return "";
  }
}

export function temporalStatusLabel(status: string | null | undefined): string {
  switch (status) {
    case "active":
      return "Aktiv";
    case "expiring_soon":
      return "Läuft bald ab";
    case "expired":
      return "Abgelaufen";
    default:
      return "Unbekannt";
  }
}

/** Alias for warranty list – same labels */
export const warrantyStatusLabel = temporalStatusLabel;

export function deadlineTypeLabel(type: string | null | undefined): string {
  switch (type) {
    case "cancellation":
      return "Kündigung";
    case "payment":
      return "Zahlung";
    case "warranty":
      return "Garantie";
    case "notice":
      return "Frist";
    default:
      return type || "Sonstiges";
  }
}
