/** Fetch ECB reference rates via Frankfurter (no API key). */

export type ExchangeRateResult = {
  from: string;
  to: string;
  rate: number;
  date: string;
  source: "ECB";
};

/**
 * Returns how many units of `to` equal 1 unit of `from`
 * (matches finance_expenses.exchange_rate).
 */
export async function fetchEcbExchangeRate(input: {
  from: string;
  to: string;
  date?: string | null;
}): Promise<ExchangeRateResult> {
  const from = input.from.trim().toUpperCase();
  const to = input.to.trim().toUpperCase();
  if (!from || !to) throw new Error("Währungen erforderlich");
  if (from === to) {
    return {
      from,
      to,
      rate: 1,
      date: input.date?.slice(0, 10) || new Date().toISOString().slice(0, 10),
      source: "ECB",
    };
  }

  const datePart =
    input.date && /^\d{4}-\d{2}-\d{2}$/.test(input.date.slice(0, 10))
      ? input.date.slice(0, 10)
      : "latest";

  const url = new URL(
    `https://api.frankfurter.dev/v1/${datePart}`
  );
  url.searchParams.set("base", from);
  url.searchParams.set("symbols", to);

  const res = await fetch(url.toString(), {
    headers: { Accept: "application/json" },
    next: { revalidate: 0 },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      text || `EZB-Kurs konnte nicht geladen werden (${res.status})`
    );
  }
  const data = (await res.json()) as {
    amount?: number;
    base?: string;
    date?: string;
    rates?: Record<string, number>;
  };
  const rate = data.rates?.[to];
  if (typeof rate !== "number" || !Number.isFinite(rate) || rate <= 0) {
    throw new Error(`Kein EZB-Kurs für ${from} → ${to}`);
  }
  return {
    from,
    to,
    rate: Math.round(rate * 10000) / 10000,
    date: data.date || datePart,
    source: "ECB",
  };
}
