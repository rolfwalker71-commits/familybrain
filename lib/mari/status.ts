/** Arbeitsfilter — Status-IDs aus MPHOTLINESETTINGS SETTING=1 */
export const WORK_STATUS_IDS = [1, 3, 4, 6, 7, 11, 13, 14] as const;

export type WorkStatusId = (typeof WORK_STATUS_IDS)[number];

export const STATUS_LABELS: Record<number, string> = {
  11: "NEU",
  1: "Offen",
  3: "In Arbeit",
  13: "Aktualisiert",
  6: "Warte auf Kunden",
  9: "Beim Kunden nachfassen",
  7: "Warte auf Hersteller",
  10: "Beim Hersteller nachfassen",
  4: "Wieder geöffnet",
  2: "Gelöst",
  12: "Gelöst - Wartet",
  8: "Verrechnet",
  5: "Geschlossen",
  14: "Eskalation",
  15: "On Hold",
  16: "Abklärung Notwendig",
};

/** Kurze Chip-Labels wie im Mockup */
export function statusChipLabel(statusId: number, fallback?: string): string {
  if (statusId === 6) return "Warte auf Kunden";
  return STATUS_LABELS[statusId] || fallback || `Status ${statusId}`;
}

export function statusChipClass(statusId: number): string {
  switch (statusId) {
    case 11: // NEU
      return "border-rose-200/90 bg-rose-50 text-rose-900";
    case 1: // Offen
      return "border-sky-200/90 bg-sky-50 text-sky-950";
    case 3: // In Arbeit
      return "border-teal-200/90 bg-teal-50 text-teal-950";
    case 13: // Aktualisiert
      return "border-cyan-200/90 bg-cyan-50 text-cyan-950";
    case 6: // Warte auf Kunden
    case 9:
      return "border-orange-200/90 bg-orange-50 text-orange-950";
    case 7: // Warte auf Hersteller
    case 10:
      return "border-violet-200/90 bg-violet-50 text-violet-950";
    case 4: // Wieder geöffnet
      return "border-amber-200/90 bg-amber-50 text-amber-950";
    case 14: // Eskalation
      return "border-red-200/90 bg-red-50 text-red-950";
    case 2: // Gelöst
    case 12:
      return "border-border bg-muted/60 text-muted-foreground";
    case 5: // Geschlossen
    case 8:
      return "border-border bg-muted/40 text-muted-foreground";
    default:
      return "border-border bg-muted/50 text-foreground";
  }
}

export function isWorkStatusId(id: number): id is WorkStatusId {
  return (WORK_STATUS_IDS as readonly number[]).includes(id);
}

export function parseStatusIdsParam(
  raw: string | null,
  fallback: readonly number[] = WORK_STATUS_IDS
): number[] {
  if (!raw || !raw.trim()) return [...fallback];
  const ids = raw
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isInteger(n) && n > 0);
  const uniq = [...new Set(ids)];
  return uniq.length > 0 ? uniq : [...fallback];
}

export const PRIORITY_LABELS: Record<number, string> = {
  1: "Eskalation",
  2: "Hoch",
  3: "Mittel",
  4: "Normal",
  5: "Niedrig",
};
