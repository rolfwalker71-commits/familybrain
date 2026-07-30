import type { DocumentAnalysis } from "@/lib/ai/schemas";

export type NormalizedLineItem = {
  description: string;
  amount: number | null;
  currency: string | null;
  quantity: number | null;
  unit: string | null;
};

/** Pull leading «7x ·» out of description into quantity when the model embedded it. */
export function normalizeLineItem(
  raw: {
    description?: string | null;
    amount?: number | null;
    currency?: string | null;
    quantity?: number | null;
    unit?: string | null;
  }
): NormalizedLineItem {
  let description = String(raw.description || "").trim();
  let quantity =
    raw.quantity != null && Number.isFinite(Number(raw.quantity))
      ? Number(raw.quantity)
      : null;
  const unit =
    raw.unit != null && String(raw.unit).trim()
      ? String(raw.unit).trim()
      : null;

  const embedded = description.match(
    /^(\d+(?:[.,]\d+)?)\s*[x×]\s*(?:·|-)?\s*/i
  );
  if (embedded) {
    const parsedQty = Number(String(embedded[1]).replace(",", "."));
    if (Number.isFinite(parsedQty) && (quantity == null || quantity === 1)) {
      quantity = parsedQty;
    }
    description = description.slice(embedded[0].length).trim();
  }

  return {
    description: description || "Position",
    amount:
      raw.amount != null && Number.isFinite(Number(raw.amount))
        ? Number(raw.amount)
        : null,
    currency: raw.currency ?? null,
    quantity,
    unit,
  };
}

export function normalizeLineItems(
  items: DocumentAnalysis["line_items"] | null | undefined
): NormalizedLineItem[] {
  return (items || []).map((item) => normalizeLineItem(item));
}

export function resolveInvoiceTotal(input: {
  amounts: Array<{
    amount?: number | null;
    currency?: string | null;
    label?: string | null;
  }>;
  financialItems: Array<{
    amount?: number | null;
    currency?: string | null;
  }>;
}): { amount: number; currency: string } | null {
  const totalLabel =
    /^(gesamt(betrag)?|total|endbetrag|rechnungsbetrag|zu\s*zahlen|summe|brutto|zahlbetrag)\b/i;
  for (const a of input.amounts) {
    if (a.amount == null || !Number.isFinite(Number(a.amount))) continue;
    const label = (a.label || "").trim();
    if (label && totalLabel.test(label)) {
      return {
        amount: Number(a.amount),
        currency: a.currency || "CHF",
      };
    }
  }
  const finance = input.financialItems[0];
  if (finance?.amount != null && Number.isFinite(Number(finance.amount))) {
    return {
      amount: Number(finance.amount),
      currency: finance.currency || "CHF",
    };
  }
  return null;
}

/** Ensure amounts includes a Gesamtbetrag row when financial total exists. */
export function ensureGesamtbetragAmount(
  analysis: DocumentAnalysis
): DocumentAnalysis["amounts"] {
  const amounts = [...(analysis.amounts || [])];
  const hasTotal = amounts.some((a) => {
    const label = (a.label || "").trim();
    return (
      label &&
      /^(gesamt(betrag)?|total|endbetrag|rechnungsbetrag|zu\s*zahlen|summe|brutto|zahlbetrag)\b/i.test(
        label
      )
    );
  });
  if (hasTotal) return amounts;

  const finance = (analysis.financial_items || []).find(
    (f) => f.amount != null && Number.isFinite(Number(f.amount))
  );
  if (!finance?.amount) return amounts;

  amounts.push({
    amount: Number(finance.amount),
    currency: finance.currency || "CHF",
    label: "Gesamtbetrag",
  });
  return amounts;
}
