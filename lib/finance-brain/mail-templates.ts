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

/** Matches Soft-UI CalendarDateBadge (full weekday). */
function weekdayLongDe(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return new Intl.DateTimeFormat("de-CH", { weekday: "long" }).format(date);
}

/** Soft-UI sage palette (matches --brand-finance / globals.css). */
const BRAND = {
  finance: "#3f6b52",
  financeSoft: "#d9e4d1",
  ink: "#14201c",
  muted: "#5b6b66",
  border: "#d7e0dc",
  page: "#eef2f0",
  card: "#ffffff",
} as const;

export function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function dateBadgeHtml(isoDate: string | null | undefined): string {
  if (!isoDate || !/^\d{4}-\d{2}-\d{2}/.test(isoDate)) {
    return `<div style="font-size:12px;color:${BRAND.muted};">Ohne Datum</div>`;
  }
  const iso = isoDate.slice(0, 10);
  const month = MONTH_SHORT_DE[Number(iso.slice(5, 7)) - 1] ?? "";
  const day = String(Number(iso.slice(8, 10)));
  const year = iso.slice(0, 4);
  const weekday = weekdayLongDe(iso);
  return `
    <div style="width:72px;border-radius:8px;overflow:hidden;border:1px solid ${BRAND.border};box-shadow:0 1px 2px rgba(20,32,28,.08),0 4px 10px rgba(20,32,28,.06);font-family:system-ui,sans-serif;flex-shrink:0;background:${BRAND.card};">
      <div style="background:${BRAND.financeSoft};color:${BRAND.finance};text-align:center;font-size:11px;font-weight:900;padding:3px 1px 2px;letter-spacing:.04em;text-transform:uppercase;line-height:1;">${month}</div>
      <div style="background:${BRAND.card};text-align:center;padding:3px 1px 4px;">
        <div style="font-size:8.5px;font-weight:600;color:${BRAND.muted};line-height:1.1;letter-spacing:-0.02em;">${escapeHtml(weekday)}</div>
        <div style="font-size:19px;font-weight:900;color:${BRAND.ink};line-height:1;margin-top:2px;font-variant-numeric:tabular-nums;">${day}</div>
        <div style="font-size:9px;font-weight:700;color:${BRAND.muted};margin-top:2px;line-height:1;font-variant-numeric:tabular-nums;">${year}</div>
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
  const cur = input.currency.toUpperCase();
  const base = input.baseCurrency.toUpperCase();
  return {
    money,
    fxHtml: `
      <div style="margin-top:8px;font-size:13px;color:${BRAND.muted};line-height:1.55;">
        <div>Währung: <strong style="color:${BRAND.ink};">${escapeHtml(cur)}</strong></div>
        <div>FW Betrag: <strong style="color:${BRAND.ink};">${escapeHtml(money)}</strong></div>
        <div style="font-size:14px;font-weight:700;color:${BRAND.ink};">Betrag ${escapeHtml(base)}: ${escapeHtml(baseMoney)}</div>
        <div>Kurs: <strong style="color:${BRAND.ink};">${escapeHtml(rateLine)}</strong></div>
      </div>`,
    fxText: [
      `Währung: ${cur}`,
      `FW Betrag: ${money}`,
      `Betrag ${base}: ${baseMoney}`,
      `Kurs: ${rateLine}`,
    ].join("\n"),
  };
}

function expenseCardHtml(input: ExpenseMailFields): string {
  const title = input.description?.trim() || "Ausgabe";
  const category = input.categoryLabel || "Ausgabe";
  const { money, fxHtml } = moneyLines(input);
  const cid = input.aiCid || `expense-ai-${input.expenseId}`;
  const hasFx = Boolean(fxHtml);
  return `
    <div style="background:${BRAND.card};border-radius:12px;overflow:hidden;border:1px solid ${BRAND.border};margin-bottom:16px;">
      <div style="padding:14px 16px;display:flex;gap:14px;align-items:flex-start;">
        ${dateBadgeHtml(input.expenseDate)}
        <div style="flex:1;min-width:0;">
          <div style="font-size:17px;font-weight:800;line-height:1.25;color:${BRAND.ink};">${escapeHtml(title)}</div>
          <div style="margin-top:8px;font-size:13px;color:${BRAND.muted};">
            <span style="display:inline-block;background:${BRAND.financeSoft};color:${BRAND.finance};border-radius:4px;padding:2px 6px;font-size:10px;font-weight:700;text-transform:uppercase;margin-right:6px;">${escapeHtml(category)}</span>
            Bezahlt von ${escapeHtml(input.paidByName)}${hasFx ? "" : ` · <strong style="color:${BRAND.ink};">${escapeHtml(money)}</strong>`}
          </div>
          ${fxHtml}
          ${
            input.placeName
              ? `<div style="margin-top:6px;font-size:13px;color:${BRAND.muted};">Ort: ${escapeHtml(input.placeName)}</div>`
              : ""
          }
          ${
            input.note?.trim()
              ? `<div style="margin-top:6px;font-size:13px;color:${BRAND.muted};">Notiz: ${escapeHtml(input.note.trim())}</div>`
              : ""
          }
        </div>
        ${
          input.hasAiImage
            ? `<img src="cid:${escapeHtml(cid)}" alt="" width="72" height="72" style="width:72px;height:72px;border-radius:8px;object-fit:cover;border:1px solid ${BRAND.border};flex-shrink:0;" />`
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
  const subject = `FinanzBuddy: ${title} · ${money}`;
  const card = expenseCardHtml({
    ...input,
    expenseId: input.expenseId ?? 0,
    aiCid: "expense-ai",
  });

  const html = `<!DOCTYPE html>
<html><body style="margin:0;padding:24px;background:${BRAND.page};font-family:system-ui,-apple-system,sans-serif;color:${BRAND.ink};">
  <div style="max-width:640px;margin:0 auto;">
    <div style="padding:14px 18px;background:${BRAND.financeSoft};border:1px solid ${BRAND.border};border-radius:12px 12px 0 0;">
      <div style="font-size:12px;font-weight:700;color:${BRAND.finance};letter-spacing:.04em;text-transform:uppercase;">FinanzBuddy · Neue Ausgabe</div>
      <div style="font-size:14px;color:${BRAND.finance};margin-top:2px;font-weight:600;">${escapeHtml(input.ledgerTitle)}</div>
    </div>
    <div style="border:1px solid ${BRAND.border};border-top:0;border-radius:0 0 12px 12px;overflow:hidden;background:${BRAND.card};">
      <div style="padding:16px 16px 4px;">${card}</div>
      <div style="padding:12px 18px 18px;font-size:12px;color:${BRAND.muted};border-top:1px solid ${BRAND.page};">
        Beleg-PDF im Anhang — geeignet für Paperless / FamilyBrain.
      </div>
    </div>
  </div>
</body></html>`;

  const text = [
    `FinanzBuddy: Neue Ausgabe in «${input.ledgerTitle}»`,
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
  const subject = `FinanzBuddy: ${input.ledgerTitle} · ${count} Ausgaben · ${totalLabel}`;

  const cards = input.expenses
    .map((e) =>
      expenseCardHtml({
        ...e,
        aiCid: e.aiCid || `expense-ai-${e.expenseId}`,
      })
    )
    .join("");

  const html = `<!DOCTYPE html>
<html><body style="margin:0;padding:24px;background:${BRAND.page};font-family:system-ui,-apple-system,sans-serif;color:${BRAND.ink};">
  <div style="max-width:600px;margin:0 auto;">
    <div style="padding:16px 18px;background:${BRAND.financeSoft};border:1px solid ${BRAND.border};border-radius:12px;margin-bottom:16px;">
      <div style="font-size:12px;font-weight:700;color:${BRAND.finance};letter-spacing:.04em;text-transform:uppercase;">FinanzBuddy · Alle Ausgaben</div>
      <div style="font-size:20px;font-weight:800;color:${BRAND.finance};margin-top:4px;">${escapeHtml(input.ledgerTitle)}</div>
      <div style="font-size:13px;color:${BRAND.finance};margin-top:6px;">${count} Ausgaben · Summe ${escapeHtml(totalLabel)}</div>
    </div>
    ${
      cards ||
      `<div style="padding:18px;color:${BRAND.muted};background:${BRAND.card};border-radius:12px;border:1px solid ${BRAND.border};">Noch keine Ausgaben.</div>`
    }
    <div style="padding:12px 4px;font-size:12px;color:${BRAND.muted};">
      Übersicht-PDF im Anhang — geeignet für Paperless / FamilyBrain.
    </div>
  </div>
</body></html>`;

  const textLines = [
    `FinanzBuddy: Alle Ausgaben «${input.ledgerTitle}»`,
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
  const subject = `FinanzBuddy: Rückzahlung ${input.fromName} → ${input.toName} · ${money}`;
  const settledLabel = formatDateDe(input.settledAt);

  const html = `<!DOCTYPE html>
<html><body style="margin:0;padding:24px;background:${BRAND.page};font-family:system-ui,-apple-system,sans-serif;color:${BRAND.ink};">
  <div style="max-width:560px;margin:0 auto;background:${BRAND.card};border-radius:12px;overflow:hidden;border:1px solid ${BRAND.border};">
    <div style="padding:14px 18px;background:${BRAND.financeSoft};border-bottom:1px solid ${BRAND.border};">
      <div style="font-size:12px;font-weight:700;color:${BRAND.finance};letter-spacing:.04em;text-transform:uppercase;">FinanzBuddy · Rückzahlung</div>
      <div style="font-size:14px;color:${BRAND.finance};margin-top:2px;font-weight:600;">${escapeHtml(input.ledgerTitle)}</div>
    </div>
    <div style="padding:18px;display:flex;gap:16px;align-items:flex-start;">
      ${dateBadgeHtml(input.settledAt?.slice(0, 10))}
      <div style="flex:1;min-width:0;">
        <div style="font-size:18px;font-weight:800;line-height:1.25;color:${BRAND.ink};">
          ${escapeHtml(input.fromName)} → ${escapeHtml(input.toName)}
        </div>
        <div style="margin-top:8px;font-size:15px;font-weight:700;color:${BRAND.ink};">${escapeHtml(money)}</div>
        ${fxHtml}
        ${
          input.note
            ? `<div style="margin-top:8px;font-size:13px;color:${BRAND.muted};">${escapeHtml(input.note)}</div>`
            : ""
        }
      </div>
    </div>
    <div style="padding:12px 18px 18px;font-size:12px;color:${BRAND.muted};border-top:1px solid ${BRAND.page};">
      Beleg-PDF im Anhang — geeignet für Paperless / FamilyBrain.
    </div>
  </div>
</body></html>`;

  const text = [
    `FinanzBuddy: Rückzahlung in «${input.ledgerTitle}»`,
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
