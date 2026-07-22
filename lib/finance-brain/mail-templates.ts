import {
  formatDateDe,
  formatExchangeRateLine,
  formatMoney,
  isForeignCurrency,
  resolveExchangeRate,
} from "@/lib/finance-brain/format";

const MONTH_SHORT_DE = [
  "JAN",
  "FEB",
  "MÄR",
  "APR",
  "MAI",
  "JUN",
  "JUL",
  "AUG",
  "SEP",
  "OKT",
  "NOV",
  "DEZ",
] as const;

function weekdayDe(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return new Intl.DateTimeFormat("de-CH", { weekday: "long" }).format(date);
}

export function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function dateBadgeHtml(isoDate: string | null | undefined): string {
  if (!isoDate || !/^\d{4}-\d{2}-\d{2}/.test(isoDate)) {
    return `<div style="font-size:12px;color:#64748b;">Ohne Datum</div>`;
  }
  const iso = isoDate.slice(0, 10);
  const month = MONTH_SHORT_DE[Number(iso.slice(5, 7)) - 1] ?? "";
  const day = String(Number(iso.slice(8, 10)));
  const year = iso.slice(0, 4);
  return `
    <div style="width:72px;border-radius:10px;overflow:hidden;border:1px solid rgba(0,0,0,.08);box-shadow:0 2px 8px rgba(15,23,42,.12);font-family:system-ui,sans-serif;flex-shrink:0;">
      <div style="background:linear-gradient(#ef4444,#b91c1c);color:#fff;text-align:center;font-size:11px;font-weight:900;padding:6px 4px;letter-spacing:.04em;">${month}</div>
      <div style="background:linear-gradient(#fff,#f1f5f9);text-align:center;padding:8px 4px;">
        <div style="font-size:11px;font-weight:800;color:#0f172a;">${escapeHtml(weekdayDe(iso))}</div>
        <div style="font-size:24px;font-weight:900;color:#0f172a;line-height:1.1;margin-top:2px;">${day}</div>
        <div style="font-size:12px;font-weight:700;color:#0f172a;margin-top:2px;">${year}</div>
      </div>
    </div>`;
}

export type ExpenseMailFields = {
  expenseId: number;
  description: string | null;
  categoryLabel: string | null;
  amount: number;
  currency: string;
  amountBase: number;
  baseCurrency: string;
  exchangeRate?: number;
  paidByName: string;
  placeName: string | null;
  expenseDate: string | null;
  note?: string | null;
  hasAiImage: boolean;
  aiCid?: string;
};

function moneyLines(input: {
  amount: number;
  currency: string;
  amountBase: number;
  baseCurrency: string;
  exchangeRate?: number;
}): { money: string; fxHtml: string; fxText: string } {
  const money = formatMoney(input.amount, input.currency);
  if (!isForeignCurrency(input.currency, input.baseCurrency)) {
    return { money, fxHtml: "", fxText: "" };
  }
  const rate = resolveExchangeRate(input);
  const baseMoney = formatMoney(input.amountBase, input.baseCurrency);
  const rateLine = formatExchangeRateLine({
    ...input,
    exchangeRate: rate,
  });
  return {
    money,
    fxHtml: `
      <div style="margin-top:4px;font-size:12px;color:#64748b;">
        ${escapeHtml(input.currency)}: <strong>${escapeHtml(money)}</strong>
        · ${escapeHtml(input.baseCurrency)}: <strong>${escapeHtml(baseMoney)}</strong>
        · Kurs: ${escapeHtml(rateLine)}
      </div>`,
    fxText: `${input.currency}: ${money}; ${input.baseCurrency}: ${baseMoney}; Kurs: ${rateLine}`,
  };
}

function expenseCardHtml(input: ExpenseMailFields): string {
  const title = input.description?.trim() || "Ausgabe";
  const category = input.categoryLabel || "Ausgabe";
  const { money, fxHtml } = moneyLines(input);
  const cid = input.aiCid || `expense-ai-${input.expenseId}`;
  return `
    <div style="background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0;margin-bottom:16px;">
      <div style="padding:14px 16px;display:flex;gap:14px;align-items:flex-start;">
        ${dateBadgeHtml(input.expenseDate)}
        <div style="flex:1;min-width:0;">
          <div style="font-size:17px;font-weight:800;line-height:1.25;color:#0f172a;">${escapeHtml(title)}</div>
          <div style="margin-top:8px;font-size:13px;color:#475569;">
            <span style="display:inline-block;background:#ffedd5;color:#9a3412;border-radius:4px;padding:2px 6px;font-size:10px;font-weight:700;text-transform:uppercase;margin-right:6px;">${escapeHtml(category)}</span>
            Bezahlt von ${escapeHtml(input.paidByName)} · <strong>${escapeHtml(money)}</strong>
          </div>
          ${fxHtml}
          ${
            input.placeName
              ? `<div style="margin-top:6px;font-size:13px;color:#64748b;">Ort: ${escapeHtml(input.placeName)}</div>`
              : ""
          }
          ${
            input.note?.trim()
              ? `<div style="margin-top:6px;font-size:13px;color:#64748b;">Notiz: ${escapeHtml(input.note.trim())}</div>`
              : ""
          }
        </div>
        ${
          input.hasAiImage
            ? `<img src="cid:${escapeHtml(cid)}" alt="" width="96" height="96" style="width:96px;height:96px;border-radius:8px;object-fit:cover;border:1px solid #e2e8f0;flex-shrink:0;" />`
            : ""
        }
      </div>
    </div>`;
}

export function buildExpenseMailHtml(
  input: Omit<ExpenseMailFields, "expenseId" | "aiCid"> & {
    ledgerTitle: string;
    expenseId?: number;
  }
): { subject: string; html: string; text: string } {
  const title = input.description?.trim() || "Ausgabe";
  const { money, fxText } = moneyLines(input);
  const category = input.categoryLabel || "Ausgabe";
  const subject = `FinanzBrain: ${title} · ${money}`;
  const card = expenseCardHtml({
    ...input,
    expenseId: input.expenseId ?? 0,
    aiCid: "expense-ai",
  });

  const html = `<!DOCTYPE html>
<html><body style="margin:0;padding:24px;background:#f8fafc;font-family:system-ui,-apple-system,sans-serif;color:#0f172a;">
  <div style="max-width:560px;margin:0 auto;">
    <div style="padding:14px 18px;background:#ffedd5;border:1px solid #fdba74;border-radius:12px 12px 0 0;">
      <div style="font-size:12px;font-weight:700;color:#9a3412;letter-spacing:.04em;text-transform:uppercase;">FinanzBrain · Neue Ausgabe</div>
      <div style="font-size:14px;color:#7c2d12;margin-top:2px;">${escapeHtml(input.ledgerTitle)}</div>
    </div>
    <div style="border:1px solid #e2e8f0;border-top:0;border-radius:0 0 12px 12px;overflow:hidden;background:#fff;">
      <div style="padding:16px 16px 4px;">${card}</div>
      <div style="padding:12px 18px 18px;font-size:12px;color:#64748b;border-top:1px solid #f1f5f9;">
        Beleg-PDF im Anhang — geeignet für Paperless / FamilyBrain.
      </div>
    </div>
  </div>
</body></html>`;

  const text = [
    `FinanzBrain: Neue Ausgabe in «${input.ledgerTitle}»`,
    title,
    `${category} · Bezahlt von ${input.paidByName} · ${money}`,
    fxText || null,
    input.placeName ? `Ort: ${input.placeName}` : null,
    input.note?.trim() ? `Notiz: ${input.note.trim()}` : null,
    input.expenseDate
      ? `Datum: ${formatDateDe(input.expenseDate) || input.expenseDate}`
      : null,
    "PDF im Anhang.",
  ]
    .filter(Boolean)
    .join("\n");

  return { subject, html, text };
}

export function buildLedgerExpensesMailHtml(input: {
  ledgerTitle: string;
  baseCurrency: string;
  expenses: ExpenseMailFields[];
}): { subject: string; html: string; text: string } {
  const count = input.expenses.length;
  const totalBase = input.expenses.reduce((s, e) => s + e.amountBase, 0);
  const totalLabel = formatMoney(totalBase, input.baseCurrency);
  const subject = `FinanzBrain: ${input.ledgerTitle} · ${count} Ausgaben · ${totalLabel}`;

  const cards = input.expenses
    .map((e) =>
      expenseCardHtml({
        ...e,
        aiCid: e.aiCid || `expense-ai-${e.expenseId}`,
      })
    )
    .join("");

  const html = `<!DOCTYPE html>
<html><body style="margin:0;padding:24px;background:#f8fafc;font-family:system-ui,-apple-system,sans-serif;color:#0f172a;">
  <div style="max-width:600px;margin:0 auto;">
    <div style="padding:16px 18px;background:#ffedd5;border:1px solid #fdba74;border-radius:12px;margin-bottom:16px;">
      <div style="font-size:12px;font-weight:700;color:#9a3412;letter-spacing:.04em;text-transform:uppercase;">FinanzBrain · Alle Ausgaben</div>
      <div style="font-size:20px;font-weight:800;color:#7c2d12;margin-top:4px;">${escapeHtml(input.ledgerTitle)}</div>
      <div style="font-size:13px;color:#9a3412;margin-top:6px;">${count} Ausgaben · Summe ${escapeHtml(totalLabel)}</div>
    </div>
    ${
      cards ||
      `<div style="padding:18px;color:#64748b;background:#fff;border-radius:12px;border:1px solid #e2e8f0;">Noch keine Ausgaben.</div>`
    }
    <div style="padding:12px 4px;font-size:12px;color:#64748b;">
      Übersicht-PDF im Anhang — geeignet für Paperless / FamilyBrain.
    </div>
  </div>
</body></html>`;

  const textLines = [
    `FinanzBrain: Alle Ausgaben «${input.ledgerTitle}»`,
    `${count} Ausgaben · Summe ${totalLabel}`,
    "",
    ...input.expenses.flatMap((e) => {
      const { money, fxText } = moneyLines(e);
      return [
        `— ${e.description?.trim() || "Ausgabe"}`,
        `  ${e.categoryLabel || "Ausgabe"} · ${e.paidByName} · ${money}`,
        fxText ? `  ${fxText}` : null,
        e.placeName ? `  Ort: ${e.placeName}` : null,
        e.note?.trim() ? `  Notiz: ${e.note.trim()}` : null,
        e.expenseDate ? `  Datum: ${formatDateDe(e.expenseDate) || e.expenseDate}` : null,
        "",
      ].filter(Boolean) as string[];
    }),
    "PDF im Anhang.",
  ];

  return { subject, html, text: textLines.join("\n") };
}

export function buildSettlementMailHtml(input: {
  ledgerTitle: string;
  fromName: string;
  toName: string;
  amount: number;
  currency: string;
  amountBase: number;
  baseCurrency: string;
  exchangeRate?: number;
  note: string | null;
  settledAt: string | null;
}): { subject: string; html: string; text: string } {
  const { money, fxHtml, fxText } = moneyLines(input);
  const subject = `FinanzBrain: Rückzahlung ${input.fromName} → ${input.toName} · ${money}`;
  const settledLabel = formatDateDe(input.settledAt);

  const html = `<!DOCTYPE html>
<html><body style="margin:0;padding:24px;background:#f8fafc;font-family:system-ui,-apple-system,sans-serif;color:#0f172a;">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0;">
    <div style="padding:14px 18px;background:#ccfbf1;border-bottom:1px solid #5eead4;">
      <div style="font-size:12px;font-weight:700;color:#115e59;letter-spacing:.04em;text-transform:uppercase;">FinanzBrain · Rückzahlung</div>
      <div style="font-size:14px;color:#134e4a;margin-top:2px;">${escapeHtml(input.ledgerTitle)}</div>
    </div>
    <div style="padding:18px;display:flex;gap:16px;align-items:flex-start;">
      ${dateBadgeHtml(input.settledAt?.slice(0, 10))}
      <div style="flex:1;min-width:0;">
        <div style="font-size:18px;font-weight:800;line-height:1.25;">
          ${escapeHtml(input.fromName)} → ${escapeHtml(input.toName)}
        </div>
        <div style="margin-top:8px;font-size:15px;font-weight:700;">${escapeHtml(money)}</div>
        ${fxHtml}
        ${
          input.note
            ? `<div style="margin-top:8px;font-size:13px;color:#64748b;">${escapeHtml(input.note)}</div>`
            : ""
        }
      </div>
    </div>
    <div style="padding:12px 18px 18px;font-size:12px;color:#64748b;border-top:1px solid #f1f5f9;">
      Beleg-PDF im Anhang — geeignet für Paperless / FamilyBrain.
    </div>
  </div>
</body></html>`;

  const text = [
    `FinanzBrain: Rückzahlung in «${input.ledgerTitle}»`,
    `${input.fromName} → ${input.toName}: ${money}`,
    fxText || null,
    input.note ? `Notiz: ${input.note}` : null,
    settledLabel ? `Datum: ${settledLabel}` : null,
    "PDF im Anhang.",
  ]
    .filter(Boolean)
    .join("\n");

  return { subject, html, text };
}
