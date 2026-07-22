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
