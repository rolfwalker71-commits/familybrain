import { formatMoney } from "@/lib/finance-brain/format";
import { roundMoney } from "@/lib/finance-brain/settlement";
import type {
  TravelDiaryExpense,
  TravelDiaryModel,
} from "@/lib/trips/travel-diary";

export type DiaryStatBucket = {
  label: string;
  amountBase: number;
  count: number;
  sharePct: number;
};

export type TravelDiaryStats = {
  baseCurrency: string;
  totalBase: number;
  expenseCount: number;
  byPayer: DiaryStatBucket[];
  byCategory: DiaryStatBucket[];
  byPersonShare: DiaryStatBucket[];
};

export type DiaryStatsExpenseInput = {
  amountBase: number;
  currency?: string;
  baseCurrency?: string;
  categoryLabel?: string | null;
  paidByName: string;
  shares?: Array<{
    displayName: string;
    shareAmountBase: number;
  }>;
};

function pct(part: number, total: number): number {
  if (!(total > 0)) return 0;
  return Math.round((part / total) * 1000) / 10;
}

function bucketsFromMap(
  map: Map<string, { amountBase: number; count: number }>,
  totalBase: number
): DiaryStatBucket[] {
  return [...map.entries()]
    .map(([label, v]) => ({
      label,
      amountBase: roundMoney(v.amountBase),
      count: v.count,
      sharePct: pct(v.amountBase, totalBase),
    }))
    .sort(
      (a, b) =>
        b.amountBase - a.amountBase ||
        a.label.localeCompare(b.label, "de")
    );
}

/** Aggregates expenses for the diary stats page (mail + PDF). */
export function buildTravelDiaryStatsFromExpenses(
  expenses: DiaryStatsExpenseInput[],
  baseCurrencyHint?: string | null
): TravelDiaryStats | null {
  if (expenses.length === 0) return null;

  const baseCurrency =
    baseCurrencyHint ||
    expenses[0]?.baseCurrency ||
    expenses[0]?.currency ||
    "CHF";

  let totalBase = 0;
  const byPayer = new Map<string, { amountBase: number; count: number }>();
  const byCategory = new Map<string, { amountBase: number; count: number }>();
  const byShare = new Map<string, { amountBase: number; count: number }>();

  for (const e of expenses) {
    const amount = Number(e.amountBase) || 0;
    totalBase += amount;

    const payer = e.paidByName?.trim() || "Unbekannt";
    const payerEntry = byPayer.get(payer) || { amountBase: 0, count: 0 };
    payerEntry.amountBase += amount;
    payerEntry.count += 1;
    byPayer.set(payer, payerEntry);

    const category = e.categoryLabel?.trim() || "Keine Kategorie";
    const catEntry = byCategory.get(category) || { amountBase: 0, count: 0 };
    catEntry.amountBase += amount;
    catEntry.count += 1;
    byCategory.set(category, catEntry);

    const shares = e.shares || [];
    if (shares.length > 0) {
      for (const s of shares) {
        const name = s.displayName?.trim() || "Unbekannt";
        const shareAmt = Number(s.shareAmountBase) || 0;
        const shareEntry = byShare.get(name) || { amountBase: 0, count: 0 };
        shareEntry.amountBase += shareAmt;
        shareEntry.count += 1;
        byShare.set(name, shareEntry);
      }
    }
  }

  totalBase = roundMoney(totalBase);

  return {
    baseCurrency,
    totalBase,
    expenseCount: expenses.length,
    byPayer: bucketsFromMap(byPayer, totalBase),
    byCategory: bucketsFromMap(byCategory, totalBase),
    byPersonShare: bucketsFromMap(byShare, totalBase),
  };
}

export function buildTravelDiaryStats(
  model: TravelDiaryModel
): TravelDiaryStats | null {
  const expenses: TravelDiaryExpense[] = [
    ...model.events.flatMap((e) => e.expenses),
    ...model.orphanExpenses,
  ];
  return buildTravelDiaryStatsFromExpenses(expenses, model.baseCurrency);
}

export function formatDiaryStatMoney(
  amount: number,
  currency: string
): string {
  return formatMoney(amount, currency);
}
