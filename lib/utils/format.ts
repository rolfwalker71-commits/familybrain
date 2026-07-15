export function formatCHF(amount: number | null | undefined, currency = "CHF"): string {
  if (amount == null || Number.isNaN(amount)) return "–";
  return new Intl.NumberFormat("de-CH", {
    style: "currency",
    currency: currency || "CHF",
  }).format(amount);
}

export function maskToken(token: string | null | undefined): string | null {
  if (!token) return null;
  if (token.length <= 8) return "••••••••";
  return `${token.slice(0, 4)}…${token.slice(-4)}`;
}
