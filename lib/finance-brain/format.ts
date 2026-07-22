export function formatMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat("de-CH", {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}

export function formatSignedMoney(amount: number, currency: string): string {
  const prefix = amount > 0 ? "+" : "";
  return `${prefix}${formatMoney(amount, currency)}`;
}

/** Format ISO date (YYYY-MM-DD) as de-CH short date, e.g. 22.07.2026. */
export function formatDateDe(isoDate: string | null | undefined): string {
  if (!isoDate || !/^\d{4}-\d{2}-\d{2}/.test(isoDate)) return "";
  const iso = isoDate.slice(0, 10);
  const [y, m, d] = iso.split("-").map(Number);
  return new Intl.DateTimeFormat("de-CH", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(y, m - 1, d));
}

export function isForeignCurrency(
  currency: string | null | undefined,
  baseCurrency: string | null | undefined
): boolean {
  const cur = (currency || "").trim().toUpperCase();
  const base = (baseCurrency || "").trim().toUpperCase();
  return Boolean(cur && base && cur !== base);
}

export function resolveExchangeRate(input: {
  amount: number;
  amountBase: number;
  currency: string;
  baseCurrency: string;
  exchangeRate?: number | null;
}): number {
  if (
    typeof input.exchangeRate === "number" &&
    Number.isFinite(input.exchangeRate) &&
    input.exchangeRate > 0
  ) {
    return input.exchangeRate;
  }
  if (isForeignCurrency(input.currency, input.baseCurrency) && input.amount !== 0) {
    return input.amountBase / input.amount;
  }
  return 1;
}

export function formatExchangeRateLine(input: {
  currency: string;
  baseCurrency: string;
  exchangeRate?: number | null;
  amount?: number;
  amountBase?: number;
}): string {
  const rate = resolveExchangeRate({
    amount: input.amount ?? 0,
    amountBase: input.amountBase ?? 0,
    currency: input.currency,
    baseCurrency: input.baseCurrency,
    exchangeRate: input.exchangeRate,
  });
  return `1 ${input.currency.toUpperCase()} = ${rate.toFixed(4)} ${input.baseCurrency.toUpperCase()}`;
}

/** Compact money + optional FX for list cards / mails. */
export function formatMoneyFxSummary(input: {
  amount: number;
  currency: string;
  amountBase: number;
  baseCurrency: string;
  exchangeRate?: number | null;
}): { primary: string; detail: string | null; hasFx: boolean } {
  const primary = formatMoney(input.amount, input.currency);
  if (!isForeignCurrency(input.currency, input.baseCurrency)) {
    return { primary, detail: null, hasFx: false };
  }
  const base = formatMoney(input.amountBase, input.baseCurrency);
  const rateLine = formatExchangeRateLine(input);
  return {
    primary,
    detail: `${base} · ${rateLine}`,
    hasFx: true,
  };
}
