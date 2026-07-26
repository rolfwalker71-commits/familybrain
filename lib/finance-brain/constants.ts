export const SPLIT_MODES = ["equal", "coupleEqual", "exact", "shares"] as const;
export type SplitMode = (typeof SPLIT_MODES)[number];

export const LEDGER_KINDS = ["split", "normal"] as const;
export type LedgerKind = (typeof LEDGER_KINDS)[number];

export const LEDGER_KIND_LABELS: Record<LedgerKind, string> = {
  split: "Split Abrechnung",
  normal: "Normal",
};

export const EXPENSE_DIRECTIONS = ["expense", "income"] as const;
export type ExpenseDirection = (typeof EXPENSE_DIRECTIONS)[number];

/**
 * finance_expenses.pre_settled — open vs. settled variants.
 * 1 = nacherfasst («ausgeglichen»), 2 = Paar-Button («Manuell ausgeglichen»).
 */
export const EXPENSE_SETTLED_STATUS = {
  open: 0,
  preSettled: 1,
  manualCouple: 2,
} as const;
export type ExpenseSettledStatus =
  (typeof EXPENSE_SETTLED_STATUS)[keyof typeof EXPENSE_SETTLED_STATUS];

export function isExpenseSettled(preSettled: number | boolean | null | undefined): boolean {
  return Number(preSettled) !== EXPENSE_SETTLED_STATUS.open;
}

export function expenseSettledBadge(
  preSettled: number | boolean | null | undefined
): { label: string; title: string } | null {
  const v = Number(preSettled) || 0;
  if (v === EXPENSE_SETTLED_STATUS.manualCouple) {
    return {
      label: "Manuell ausgeglichen",
      title:
        "Paar hat untereinander ausgeglichen — Anteil als Rückzahlung gebucht, Saldo neutral",
    };
  }
  if (v === EXPENSE_SETTLED_STATUS.preSettled || v > 0) {
    return {
      label: "ausgeglichen",
      title:
        "Bereits ausgeglichen (nacherfasst) — zählt zu den Kosten, Saldo bleibt neutral",
    };
  }
  return null;
}

/** Hidden solo member for Normal cashbook ledgers (not shown in UI). */
export const NORMAL_SOLO_MEMBER_NAME = "Konto";

export const DEFAULT_BASE_CURRENCY = "CHF";

export const COMMON_CURRENCIES = [
  "CHF",
  "EUR",
  "USD",
  "GBP",
  "CAD",
  "AUD",
  "JPY",
  "SEK",
  "NOK",
  "DKK",
] as const;
