import { formatCHF } from "@/lib/utils/format";
import { formatExpiryRelative } from "@/lib/utils/due-urgency";

export type BriefingStats = {
  openDueFinanceCount: number;
  openDueFinanceAmount: number;
  overdueDeadlinesCount: number;
  deadlinesNext30Days: number;
  warrantiesExpiringSoon: number;
  pendingAnalysis: number;
};

export type BriefingSamples = {
  topOpenInvoice?: {
    vendor: string | null;
    title: string | null;
    amount: number | null;
    currency: string | null;
  } | null;
  topWarranty?: {
    product_name: string | null;
    vendor: string | null;
    warranty_until: string | null;
  } | null;
};

/** Deterministic “Heute relevant” bullets from action stats + optional samples. */
export function buildDashboardBriefing(
  stats: BriefingStats,
  samples: BriefingSamples = {},
  today = new Date().toISOString().slice(0, 10)
): string[] {
  const lines: string[] = [];

  if (stats.overdueDeadlinesCount > 0) {
    lines.push(
      stats.overdueDeadlinesCount === 1
        ? "1 Frist ist überfällig"
        : `${stats.overdueDeadlinesCount} Fristen sind überfällig`
    );
  }

  if (stats.openDueFinanceCount > 0) {
    const amount =
      stats.openDueFinanceAmount > 0
        ? ` (${formatCHF(stats.openDueFinanceAmount)})`
        : "";
    lines.push(
      stats.openDueFinanceCount === 1
        ? `1 Rechnung offen / bald fällig${amount}`
        : `${stats.openDueFinanceCount} Rechnungen offen / bald fällig${amount}`
    );
  }

  const inv = samples.topOpenInvoice;
  if (inv && (inv.amount != null || inv.vendor || inv.title)) {
    const name = inv.vendor || inv.title || "Rechnung";
    const amt =
      inv.amount != null
        ? ` ${formatCHF(inv.amount, inv.currency || "CHF")}`
        : "";
    lines.push(`${name}${amt} offen`);
  }

  const w = samples.topWarranty;
  if (w?.warranty_until) {
    const name = w.product_name || w.vendor || "Garantie";
    lines.push(`${name}: ${formatExpiryRelative(w.warranty_until, today)}`);
  } else if (stats.warrantiesExpiringSoon > 0) {
    lines.push(
      stats.warrantiesExpiringSoon === 1
        ? "1 Garantie läuft bald ab"
        : `${stats.warrantiesExpiringSoon} Garantien laufen bald ab`
    );
  }

  if (stats.deadlinesNext30Days > 0 && stats.overdueDeadlinesCount === 0) {
    lines.push(
      stats.deadlinesNext30Days === 1
        ? "1 Frist in den nächsten 30 Tagen"
        : `${stats.deadlinesNext30Days} Fristen in den nächsten 30 Tagen`
    );
  }

  if (stats.pendingAnalysis > 0) {
    lines.push(
      stats.pendingAnalysis === 1
        ? "1 Dokument wartet auf Analyse"
        : `${stats.pendingAnalysis} Dokumente warten auf Analyse`
    );
  }

  // Deduplicate similar lines and cap.
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const line of lines) {
    const key = line.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(line);
    if (unique.length >= 5) break;
  }
  return unique;
}
