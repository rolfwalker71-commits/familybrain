import { softTint } from "@/lib/ui/soft-tint";

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

/** Alle bekannten Status-IDs (Filter-UI), Reihenfolge wie MPHOTLINESETTINGS. */
export const ALL_STATUS_IDS = [
  11, 1, 3, 13, 6, 9, 7, 10, 4, 2, 12, 8, 5, 14, 15, 16,
] as const;

export type StatusId = (typeof ALL_STATUS_IDS)[number];

/** Kurze Chip-Labels wie im Mockup */
export function statusChipLabel(statusId: number, fallback?: string): string {
  if (statusId === 6) return "Warte auf Kunden";
  return STATUS_LABELS[statusId] || fallback || `Status ${statusId}`;
}

export function statusChipClass(statusId: number): string {
  switch (statusId) {
    case 11: // NEU
      return softTint.rose.chip;
    case 1: // Offen
      return softTint.sky.chip;
    case 3: // In Arbeit
      return softTint.teal.chip;
    case 13: // Aktualisiert
      return softTint.cyan.chip;
    case 6: // Warte auf Kunden
    case 9:
      return softTint.orange.chip;
    case 7: // Warte auf Hersteller
    case 10:
      return softTint.violet.chip;
    case 4: // Wieder geöffnet
      return softTint.amber.chip;
    case 14: // Eskalation
      return softTint.red.chip;
    case 2: // Gelöst
    case 12:
      return "border-border bg-muted/60 text-muted-foreground";
    case 5: // Geschlossen
    case 8:
      return "border-border bg-muted/40 text-muted-foreground";
    case 15: // On Hold
    case 16: // Abklärung Notwendig
      return softTint.slate.chip;
    default:
      return "border-border bg-muted/50 text-foreground";
  }
}

/** Volle Detail-Header-Leiste (Ticket-Titel), dezente Statusfarbe. */
export function statusDetailHeaderClass(statusId: number): string {
  switch (statusId) {
    case 11: // NEU
      return "border-b border-rose-200/80 bg-rose-50 text-rose-950 dark:border-rose-400/25 dark:bg-rose-500/15 dark:text-rose-100";
    case 1: // Offen
      return "border-b border-sky-200/80 bg-sky-50 text-sky-950 dark:border-sky-400/25 dark:bg-sky-500/15 dark:text-sky-100";
    case 3: // In Arbeit
      return "border-b border-teal-200/80 bg-teal-50 text-teal-950 dark:border-teal-400/25 dark:bg-teal-500/15 dark:text-teal-100";
    case 13: // Aktualisiert
      return "border-b border-cyan-200/80 bg-cyan-50 text-cyan-950 dark:border-cyan-400/25 dark:bg-cyan-500/15 dark:text-cyan-100";
    case 6: // Warte auf Kunden
    case 9:
      return "border-b border-orange-200/80 bg-orange-50 text-orange-950 dark:border-orange-400/25 dark:bg-orange-500/15 dark:text-orange-100";
    case 7: // Warte auf Hersteller
    case 10:
      return "border-b border-violet-200/80 bg-violet-50 text-violet-950 dark:border-violet-400/25 dark:bg-violet-500/15 dark:text-violet-100";
    case 4: // Wieder geöffnet
      return "border-b border-amber-200/80 bg-amber-50 text-amber-950 dark:border-amber-400/25 dark:bg-amber-500/15 dark:text-amber-100";
    case 14: // Eskalation
      return "border-b border-red-200/80 bg-red-50 text-red-950 dark:border-red-400/25 dark:bg-red-500/15 dark:text-red-100";
    case 2: // Gelöst
    case 12:
      return "border-b border-border/70 bg-muted/50 text-foreground";
    case 5: // Geschlossen
    case 8:
      return "border-b border-border/60 bg-muted/40 text-muted-foreground";
    case 15: // On Hold
    case 16: // Abklärung Notwendig
      return "border-b border-slate-200/80 bg-slate-50 text-slate-900 dark:border-slate-400/25 dark:bg-slate-500/15 dark:text-slate-100";
    default:
      return "border-b border-border/70 bg-muted/40 text-foreground";
  }
}

/** Sanfte Statusfarben für kompakte KPI-Chips in Aside-Widgets. */
export function statusAsideKpiClass(statusId: number): string {
  switch (statusId) {
    case 11:
      return softTint.rose.chip;
    case 1:
      return softTint.sky.chip;
    case 3:
      return softTint.teal.chip;
    case 13:
      return softTint.cyan.chip;
    case 6:
    case 9:
      return softTint.orange.chip;
    case 7:
    case 10:
      return softTint.violet.chip;
    case 4:
      return softTint.amber.chip;
    case 14:
      return softTint.red.chip;
    case 2:
    case 12:
      return "border-slate-300 bg-muted/60 text-muted-foreground dark:border-border";
    case 5:
    case 8:
      return "border-slate-300 bg-muted/40 text-muted-foreground dark:border-border";
    case 15:
    case 16:
      return softTint.slate.chip;
    default:
      return "border-slate-300 bg-muted/50 text-foreground dark:border-border";
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
