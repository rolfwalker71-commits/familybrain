export const SPLIT_MODES = ["equal", "exact", "shares"] as const;
export type SplitMode = (typeof SPLIT_MODES)[number];

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
