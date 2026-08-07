import { listOpenUnpaidInvoices } from "@/lib/db/queries";

export type FinanceMatchCandidate = {
  documentId: number;
  title: string | null;
  vendor: string | null;
  amount: number | null;
  currency: string | null;
  dueDate: string | null;
  score: number;
};

function norm(raw: string | null | undefined): string {
  return (raw || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9äöü]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function amountClose(
  a: number | null | undefined,
  b: number | null | undefined
): boolean {
  if (a == null || b == null || !Number.isFinite(a) || !Number.isFinite(b)) {
    return false;
  }
  const diff = Math.abs(a - b);
  return diff < 0.05 || diff / Math.max(Math.abs(a), Math.abs(b), 1) < 0.01;
}

function vendorOverlap(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.includes(b) || b.includes(a)) return 0.85;
  const aw = new Set(a.split(" ").filter((w) => w.length > 2));
  const bw = b.split(" ").filter((w) => w.length > 2);
  if (aw.size === 0 || bw.length === 0) return 0;
  let hit = 0;
  for (const w of bw) if (aw.has(w)) hit += 1;
  return hit / Math.max(aw.size, bw.length);
}

/**
 * Match mail-extracted vendor/amount against open «Zu bezahlen» invoices.
 */
export function matchOpenInvoiceFromMail(input: {
  vendor?: string | null;
  amount?: number | null;
  currency?: string | null;
}): FinanceMatchCandidate | null {
  const vendorN = norm(input.vendor);
  const amount = input.amount;
  if (!vendorN && amount == null) return null;

  const open = listOpenUnpaidInvoices(40);
  let best: FinanceMatchCandidate | null = null;

  for (const inv of open) {
    const invVendor = norm(inv.vendor || inv.correspondent_name || inv.title);
    const vScore = vendorOverlap(vendorN, invVendor);
    const aOk = amountClose(amount, inv.amount);
    let score = 0;
    if (vScore >= 0.5 && aOk) score = 0.9 + vScore * 0.1;
    else if (aOk && amount != null) score = 0.55 + vScore * 0.2;
    else if (vScore >= 0.75) score = 0.5 + vScore * 0.2;
    else continue;

    if (input.currency && inv.currency) {
      if (
        input.currency.toUpperCase() !== inv.currency.toUpperCase() &&
        score < 0.85
      ) {
        score *= 0.85;
      }
    }

    if (!best || score > best.score) {
      best = {
        documentId: inv.id,
        title: inv.title,
        vendor: inv.vendor || inv.correspondent_name,
        amount: inv.amount,
        currency: inv.currency,
        dueDate: inv.due_date,
        score,
      };
    }
  }

  return best && best.score >= 0.55 ? best : null;
}
