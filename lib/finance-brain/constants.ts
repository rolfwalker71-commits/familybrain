export const SPLIT_MODES = ["equal", "exact", "shares"] as const;
export type SplitMode = (typeof SPLIT_MODES)[number];

export const LEDGER_KINDS = ["split", "normal"] as const;
export type LedgerKind = (typeof LEDGER_KINDS)[number];

export const LEDGER_KIND_LABELS: Record<LedgerKind, string> = {
  split: "Split Abrechnung",
  normal: "Normal",
};

export const EXPENSE_DIRECTIONS = ["expense", "income"] as const;
export type ExpenseDirection = (typeof EXPENSE_DIRECTIONS)[number];

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
