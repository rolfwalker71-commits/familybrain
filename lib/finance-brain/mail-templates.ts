import { formatMoney } from "@/lib/finance-brain/format";

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

function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function dateBadgeHtml(isoDate: string | null | undefined): string {
  if (!isoDate || !/^\d{4}-\d{2}-\d{2}/.test(isoDate)) {
    return `<div style="font-size:12px;color:#64748b;">Ohne Datum</div>`;
  }
  const iso = isoDate.slice(0, 10);
  const month = MONTH_SHORT_DE[Number(iso.slice(5, 7)) - 1] ?? "";
  const day = String(Number(iso.slice(8, 10)));
  const year = iso.slice(0, 4);
  return `
    <div style="width:72px;border-radius:10px;overflow:hidden;border:1px solid rgba(0,0,0,.08);box-shadow:0 2px 8px rgba(15,23,42,.12);font-family:system-ui,sans-serif;">
      <div style="background:linear-gradient(#ef4444,#b91c1c);color:#fff;text-align:center;font-size:11px;font-weight:900;padding:6px 4px;letter-spacing:.04em;">${month}</div>
      <div style="background:linear-gradient(#fff,#f1f5f9);text-align:center;padding:8px 4px;">
        <div style="font-size:11px;font-weight:800;color:#0f172a;">${escapeHtml(weekdayDe(iso))}</div>
        <div style="font-size:24px;font-weight:900;color:#0f172a;line-height:1.1;margin-top:2px;">${day}</div>
        <div style="font-size:12px;font-weight:700;color:#0f172a;margin-top:2px;">${year}</div>
      </div>
    </div>`;
}

export function buildExpenseMailHtml(input: {
  ledgerTitle: string;
  description: string | null;
  categoryLabel: string | null;
  amount: number;
  currency: string;
  amountBase: number;
  baseCurrency: string;
  paidByName: string;
  placeName: string | null;
  expenseDate: string | null;
  hasAiImage: boolean;
}): { subject: string; html: string; text: string } {
  const title = input.description?.trim() || "Ausgabe";
  const money = formatMoney(input.amount, input.currency);
  const base =
    input.currency !== input.baseCurrency
      ? ` (${formatMoney(input.amountBase, input.baseCurrency)})`
      : "";
  const category = input.categoryLabel || "Ausgabe";
  const subject = `FinanzBrain: ${title} · ${money}`;

  const html = `<!DOCTYPE html>
<html><body style="margin:0;padding:24px;background:#f8fafc;font-family:system-ui,-apple-system,sans-serif;color:#0f172a;">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0;">
    <div style="padding:14px 18px;background:#ffedd5;border-bottom:1px solid #fdba74;">
      <div style="font-size:12px;font-weight:700;color:#9a3412;letter-spacing:.04em;text-transform:uppercase;">FinanzBrain · Neue Ausgabe</div>
      <div style="font-size:14px;color:#7c2d12;margin-top:2px;">${escapeHtml(input.ledgerTitle)}</div>
    </div>
    <div style="padding:18px;display:flex;gap:16px;align-items:flex-start;">
      ${dateBadgeHtml(input.expenseDate)}
      <div style="flex:1;min-width:0;">
        <div style="font-size:18px;font-weight:800;line-height:1.25;">${escapeHtml(title)}</div>
        <div style="margin-top:8px;font-size:13px;color:#475569;">
          <span style="display:inline-block;background:#ffedd5;color:#9a3412;border-radius:4px;padding:2px 6px;font-size:10px;font-weight:700;text-transform:uppercase;margin-right:6px;">${escapeHtml(category)}</span>
          Bezahlt von ${escapeHtml(input.paidByName)} · <strong>${escapeHtml(money)}${escapeHtml(base)}</strong>
        </div>
        ${
          input.placeName
            ? `<div style="margin-top:6px;font-size:13px;color:#64748b;">Ort: ${escapeHtml(input.placeName)}</div>`
            : ""
        }
      </div>
      ${
        input.hasAiImage
          ? `<img src="cid:expense-ai" alt="" width="96" height="96" style="width:96px;height:96px;border-radius:8px;object-fit:cover;border:1px solid #e2e8f0;" />`
          : ""
      }
    </div>
    <div style="padding:12px 18px 18px;font-size:12px;color:#64748b;border-top:1px solid #f1f5f9;">
      Beleg-PDF im Anhang — geeignet für Paperless / FamilyBrain.
    </div>
  </div>
</body></html>`;

  const text = [
    `FinanzBrain: Neue Ausgabe in «${input.ledgerTitle}»`,
    title,
    `${category} · Bezahlt von ${input.paidByName} · ${money}${base}`,
    input.placeName ? `Ort: ${input.placeName}` : null,
    input.expenseDate ? `Datum: ${input.expenseDate}` : null,
    "PDF im Anhang.",
  ]
    .filter(Boolean)
    .join("\n");

  return { subject, html, text };
}

export function buildSettlementMailHtml(input: {
  ledgerTitle: string;
  fromName: string;
  toName: string;
  amount: number;
  currency: string;
  amountBase: number;
  baseCurrency: string;
  note: string | null;
  settledAt: string | null;
}): { subject: string; html: string; text: string } {
  const money = formatMoney(input.amount, input.currency);
  const base =
    input.currency !== input.baseCurrency
      ? ` (${formatMoney(input.amountBase, input.baseCurrency)})`
      : "";
  const subject = `FinanzBrain: Rückzahlung ${input.fromName} → ${input.toName} · ${money}`;

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
        <div style="margin-top:8px;font-size:15px;font-weight:700;">${escapeHtml(money)}${escapeHtml(base)}</div>
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
    `${input.fromName} → ${input.toName}: ${money}${base}`,
    input.note ? `Notiz: ${input.note}` : null,
    input.settledAt ? `Datum: ${input.settledAt}` : null,
    "PDF im Anhang.",
  ]
    .filter(Boolean)
    .join("\n");

  return { subject, html, text };
}
