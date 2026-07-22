import fs from "fs";
import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFPage,
  type PDFImage,
} from "pdf-lib";
import {
  formatDateDe,
  formatExchangeRateLine,
  formatMoney,
  isForeignCurrency,
  resolveExchangeRate,
} from "@/lib/finance-brain/format";
import { LEDGER_SUMMARY_AI_THUMB_PX, loadScaledJpeg } from "@/lib/finance-brain/image-scale";

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const OUTER = 28;

const MONTH_SHORT_DE = [
  "JAN",
  "FEB",
  "MAR",
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

const C = {
  pageBg: rgb(0.973, 0.98, 0.988),
  card: rgb(1, 1, 1),
  border: rgb(0.886, 0.91, 0.941),
  headerBg: rgb(1, 0.929, 0.835),
  headerBorder: rgb(0.992, 0.729, 0.455),
  headerLabel: rgb(0.604, 0.204, 0.071),
  headerTitle: rgb(0.486, 0.176, 0.071),
  ink: rgb(0.059, 0.09, 0.165),
  muted: rgb(0.392, 0.455, 0.545),
  soft: rgb(0.945, 0.961, 0.976),
  badgeBg: rgb(1, 0.929, 0.835),
  badgeFg: rgb(0.604, 0.204, 0.071),
  redTop: rgb(0.937, 0.267, 0.267),
  white: rgb(1, 1, 1),
  foot: rgb(0.976, 0.98, 0.984),
};

function toPdfSafeText(raw: string): string {
  return raw
    .replace(/\u2192/g, "->")
    .replace(/\u2190/g, "<-")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\u2026/g, "...")
    .replace(/\u00B7/g, "-")
    .replace(/\u2013|\u2014/g, "-")
    .replace(/\p{Extended_Pictographic}\s*/gu, "")
    .replace(/[\uFE0E\uFE0F\u200D]/g, "");
}

function weekdayDe(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return new Intl.DateTimeFormat("de-CH", { weekday: "long" }).format(date);
}

function wrapText(
  text: string,
  font: PDFFont,
  size: number,
  maxWidth: number
): string[] {
  const safe = toPdfSafeText(text);
  const words = safe.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [""];
  const lines: string[] = [];
  let current = words[0];
  for (let i = 1; i < words.length; i++) {
    const next = `${current} ${words[i]}`;
    if (font.widthOfTextAtSize(next, size) <= maxWidth) {
      current = next;
    } else {
      lines.push(current);
      current = words[i];
    }
  }
  lines.push(current);
  return lines;
}

function drawRoundedRect(
  page: PDFPage,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  fill: ReturnType<typeof rgb>,
  border?: ReturnType<typeof rgb>
) {
  // Approximate rounded corners with overlapping rects + corner circles.
  const rr = Math.min(r, w / 2, h / 2);
  page.drawRectangle({
    x: x + rr,
    y,
    width: w - 2 * rr,
    height: h,
    color: fill,
  });
  page.drawRectangle({
    x,
    y: y + rr,
    width: w,
    height: h - 2 * rr,
    color: fill,
  });
  for (const [cx, cy] of [
    [x + rr, y + rr],
    [x + w - rr, y + rr],
    [x + rr, y + h - rr],
    [x + w - rr, y + h - rr],
  ] as const) {
    page.drawCircle({ x: cx, y: cy, size: rr, color: fill });
  }
  if (border) {
    page.drawRectangle({
      x,
      y,
      width: w,
      height: h,
      borderColor: border,
      borderWidth: 1.25,
    });
  }
}

function drawDateBadge(
  page: PDFPage,
  bold: PDFFont,
  isoDate: string | null | undefined,
  x: number,
  topY: number,
  w = 92,
  h = 118
) {
  const bottom = topY - h;
  const rr = 12;
  const border = rgb(0.85, 0.87, 0.9);

  // Rounded white body (no square border overlay).
  drawRoundedRect(page, x, bottom, w, h, rr, C.white);

  // Soft outer ring via slightly larger rounded stroke approximation
  page.drawRectangle({
    x: x + rr,
    y: bottom,
    width: w - 2 * rr,
    height: 1,
    color: border,
  });
  page.drawRectangle({
    x: x + rr,
    y: topY - 1,
    width: w - 2 * rr,
    height: 1,
    color: border,
  });
  page.drawRectangle({
    x,
    y: bottom + rr,
    width: 1,
    height: h - 2 * rr,
    color: border,
  });
  page.drawRectangle({
    x: x + w - 1,
    y: bottom + rr,
    width: 1,
    height: h - 2 * rr,
    color: border,
  });

  const headerH = 28;
  const headerBottom = topY - headerH;
  // Red header with rounded top corners
  page.drawRectangle({
    x: x + rr,
    y: headerBottom,
    width: w - 2 * rr,
    height: headerH,
    color: C.redTop,
  });
  page.drawRectangle({
    x,
    y: headerBottom,
    width: w,
    height: Math.max(0, headerH - rr),
    color: C.redTop,
  });
  page.drawCircle({ x: x + rr, y: topY - rr, size: rr, color: C.redTop });
  page.drawCircle({
    x: x + w - rr,
    y: topY - rr,
    size: rr,
    color: C.redTop,
  });

  const iso =
    isoDate && /^\d{4}-\d{2}-\d{2}/.test(isoDate) ? isoDate.slice(0, 10) : null;
  const month = iso ? MONTH_SHORT_DE[Number(iso.slice(5, 7)) - 1] : "---";
  const day = iso ? String(Number(iso.slice(8, 10))) : "-";
  const year = iso ? iso.slice(0, 4) : "----";
  const weekday = iso ? toPdfSafeText(weekdayDe(iso)) : "Ohne Datum";

  const monthSize = 12;
  page.drawText(month, {
    x: x + (w - bold.widthOfTextAtSize(month, monthSize)) / 2,
    y: topY - headerH + 9,
    size: monthSize,
    font: bold,
    color: C.white,
  });

  const bodyTop = topY - headerH - 10;
  const wdSize = 11;
  page.drawText(weekday, {
    x: x + Math.max(4, (w - bold.widthOfTextAtSize(weekday, wdSize)) / 2),
    y: bodyTop - wdSize,
    size: wdSize,
    font: bold,
    color: C.ink,
  });

  const daySize = 34;
  page.drawText(day, {
    x: x + (w - bold.widthOfTextAtSize(day, daySize)) / 2,
    y: bodyTop - wdSize - daySize - 6,
    size: daySize,
    font: bold,
    color: C.ink,
  });

  const yearSize = 13;
  page.drawText(year, {
    x: x + (w - bold.widthOfTextAtSize(year, yearSize)) / 2,
    y: bottom + 14,
    size: yearSize,
    font: bold,
    color: C.ink,
  });
}

function drawLabeledRow(
  page: PDFPage,
  font: PDFFont,
  bold: PDFFont,
  label: string,
  value: string,
  x: number,
  y: number,
  labelW: number,
  valueMaxW: number,
  labelSize = 12,
  valueSize = 15
): number {
  const safeLabel = toPdfSafeText(label);
  const lines = wrapText(value, bold, valueSize, valueMaxW);
  page.drawText(safeLabel, {
    x,
    y,
    size: labelSize,
    font,
    color: C.muted,
  });
  let yy = y;
  for (const line of lines) {
    page.drawText(line, {
      x: x + labelW,
      y: yy,
      size: valueSize,
      font: bold,
      color: C.ink,
    });
    yy -= valueSize + 4;
  }
  return yy - 10;
}

async function embedOptionalPng(
  pdf: PDFDocument,
  filePath: string | null | undefined
): Promise<PDFImage | null> {
  if (!filePath || !fs.existsSync(filePath)) return null;
  try {
    return await pdf.embedPng(fs.readFileSync(filePath));
  } catch {
    try {
      return await pdf.embedJpg(fs.readFileSync(filePath));
    } catch {
      return null;
    }
  }
}

async function embedOptionalScaledJpeg(
  pdf: PDFDocument,
  filePath: string | null | undefined,
  maxEdge: number
): Promise<PDFImage | null> {
  const bytes = await loadScaledJpeg(filePath, maxEdge);
  if (!bytes) return null;
  try {
    return await pdf.embedJpg(bytes);
  } catch {
    return null;
  }
}

export async function buildExpensePdfBuffer(input: {
  ledgerTitle: string;
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
  aiImagePath?: string | null;
  expenseId: number;
}): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([PAGE_W, PAGE_H]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  // Page background
  page.drawRectangle({
    x: 0,
    y: 0,
    width: PAGE_W,
    height: PAGE_H,
    color: C.pageBg,
  });

  const cardX = OUTER;
  const cardW = PAGE_W - OUTER * 2;
  const cardBottom = OUTER;
  const cardTop = PAGE_H - OUTER;
  const cardH = cardTop - cardBottom;
  const pad = 28;
  const contentX = cardX + pad;
  const contentRight = cardX + cardW - pad;
  const contentW = contentRight - contentX;
  const footH = 52;

  drawRoundedRect(page, cardX, cardBottom, cardW, cardH, 14, C.card, C.border);

  // Header band
  const headerH = 86;
  const headerBottom = cardTop - headerH;
  page.drawRectangle({
    x: cardX,
    y: headerBottom,
    width: cardW,
    height: headerH,
    color: C.headerBg,
  });
  page.drawRectangle({
    x: cardX,
    y: headerBottom,
    width: cardW,
    height: 1.5,
    color: C.headerBorder,
  });

  const eyebrow = "FINANZBRAIN  ·  NEUE AUSGABE";
  page.drawText(eyebrow, {
    x: contentX,
    y: cardTop - 32,
    size: 13,
    font: bold,
    color: C.headerLabel,
  });

  const ledgerLines = wrapText(input.ledgerTitle, bold, 22, contentW);
  let ledgerY = cardTop - 58;
  for (const line of ledgerLines.slice(0, 2)) {
    page.drawText(line, {
      x: contentX,
      y: ledgerY,
      size: 22,
      font: bold,
      color: C.headerTitle,
    });
    ledgerY -= 26;
  }

  // Top body: date badge + title (no AI image here)
  let y = headerBottom - 36;
  const badgeW = 100;
  const badgeH = 128;
  drawDateBadge(page, bold, input.expenseDate, contentX, y, badgeW, badgeH);

  const titleX = contentX + badgeW + 22;
  const titleMaxW = Math.max(160, contentRight - titleX);
  const title = input.description?.trim() || "Ausgabe";
  const titleSize = 26;
  const titleLines = wrapText(title, bold, titleSize, titleMaxW);
  let titleY = y - 8;
  for (const line of titleLines.slice(0, 3)) {
    page.drawText(line, {
      x: titleX,
      y: titleY - titleSize,
      size: titleSize,
      font: bold,
      color: C.ink,
    });
    titleY -= titleSize + 6;
  }

  const category = toPdfSafeText(input.categoryLabel || "Ausgabe");
  const chipPadX = 10;
  const chipSize = 11;
  const chipW =
    bold.widthOfTextAtSize(category.toUpperCase(), chipSize) + chipPadX * 2;
  const chipH = 22;
  const chipY = titleY - chipH - 8;
  page.drawRectangle({
    x: titleX,
    y: chipY,
    width: chipW,
    height: chipH,
    color: C.badgeBg,
  });
  page.drawText(category.toUpperCase(), {
    x: titleX + chipPadX,
    y: chipY + 6,
    size: chipSize,
    font: bold,
    color: C.badgeFg,
  });

  // Detail rows below badge
  y = y - badgeH - 28;
  page.drawRectangle({
    x: contentX,
    y: y + 8,
    width: contentW,
    height: 1,
    color: C.border,
  });

  const img = await embedOptionalPng(pdf, input.aiImagePath);
  const imgMax = 260;
  let imgW = 0;
  let imgH = 0;
  if (img) {
    const scale = Math.min(imgMax / img.width, imgMax / img.height, 1);
    imgW = img.width * scale;
    imgH = img.height * scale;
  }

  const labelW = 168;
  // Leave room on the right for the bottom AI image when present
  const valueMaxW = Math.max(
    140,
    contentW - labelW - (img ? imgW + 24 : 0)
  );
  const hasFx = isForeignCurrency(input.currency, input.baseCurrency);
  const rate = resolveExchangeRate({
    amount: input.amount,
    amountBase: input.amountBase,
    currency: input.currency,
    baseCurrency: input.baseCurrency,
    exchangeRate: input.exchangeRate,
  });

  const rows: Array<[string, string]> = [
    ["Wer hat bezahlt", input.paidByName],
  ];
  if (hasFx) {
    rows.push([
      `Betrag (${input.currency})`,
      formatMoney(input.amount, input.currency),
    ]);
    rows.push([
      `Betrag (${input.baseCurrency})`,
      formatMoney(input.amountBase, input.baseCurrency),
    ]);
    rows.push([
      "Wechselkurs",
      formatExchangeRateLine({
        currency: input.currency,
        baseCurrency: input.baseCurrency,
        exchangeRate: rate,
      }),
    ]);
  } else {
    rows.push(["Betrag", formatMoney(input.amount, input.currency)]);
  }
  rows.push(["Wann", formatDateDe(input.expenseDate) || "-"]);
  rows.push(["Wo", input.placeName?.trim() || "-"]);
  rows.push(["Kategorie", input.categoryLabel || "Ausgabe"]);
  if (input.note?.trim()) {
    rows.push(["Notiz", input.note.trim()]);
  }
  rows.push(["Beleg-ID", String(input.expenseId)]);

  y -= 12;
  const detailsBottomMin = cardBottom + footH + (img ? imgH + 28 : 16);
  for (const [label, value] of rows) {
    y = drawLabeledRow(
      page,
      font,
      bold,
      label,
      value,
      contentX,
      y,
      labelW,
      valueMaxW,
      13,
      16
    );
    if (y < detailsBottomMin) break;
  }

  // AI image bottom-right, above footer
  if (img && imgW > 0 && imgH > 0) {
    const imgBottom = cardBottom + footH + 16;
    page.drawRectangle({
      x: contentRight - imgW - 4,
      y: imgBottom - 4,
      width: imgW + 8,
      height: imgH + 8,
      color: C.soft,
      borderColor: C.border,
      borderWidth: 1,
    });
    page.drawImage(img, {
      x: contentRight - imgW,
      y: imgBottom,
      width: imgW,
      height: imgH,
    });
  }

  // Footer
  page.drawRectangle({
    x: cardX,
    y: cardBottom,
    width: cardW,
    height: footH,
    color: C.foot,
  });
  page.drawRectangle({
    x: cardX,
    y: cardBottom + footH,
    width: cardW,
    height: 1,
    color: C.border,
  });
  page.drawText("Beleg-PDF - geeignet fuer Paperless / FamilyBrain", {
    x: contentX,
    y: cardBottom + 22,
    size: 11,
    font,
    color: C.muted,
  });

  return Buffer.from(await pdf.save());
}

export async function buildSettlementPdfBuffer(input: {
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
  settlementId: number;
}): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([PAGE_W, PAGE_H]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  page.drawRectangle({
    x: 0,
    y: 0,
    width: PAGE_W,
    height: PAGE_H,
    color: C.pageBg,
  });

  const cardX = OUTER;
  const cardW = PAGE_W - OUTER * 2;
  const cardBottom = OUTER;
  const cardTop = PAGE_H - OUTER;
  const cardH = cardTop - cardBottom;
  const pad = 28;
  const contentX = cardX + pad;

  drawRoundedRect(page, cardX, cardBottom, cardW, cardH, 14, C.card, C.border);

  const headerH = 86;
  const headerBottom = cardTop - headerH;
  page.drawRectangle({
    x: cardX,
    y: headerBottom,
    width: cardW,
    height: headerH,
    color: rgb(0.8, 0.984, 0.945),
  });
  page.drawRectangle({
    x: cardX,
    y: headerBottom,
    width: cardW,
    height: 1.5,
    color: rgb(0.369, 0.918, 0.831),
  });

  page.drawText("FINANZBRAIN  ·  RUECKZAHLUNG", {
    x: contentX,
    y: cardTop - 32,
    size: 13,
    font: bold,
    color: rgb(0.067, 0.369, 0.349),
  });
  page.drawText(toPdfSafeText(input.ledgerTitle), {
    x: contentX,
    y: cardTop - 58,
    size: 22,
    font: bold,
    color: rgb(0.075, 0.306, 0.29),
  });

  let y = headerBottom - 36;
  drawDateBadge(page, bold, input.settledAt?.slice(0, 10) ?? null, contentX, y);

  const money = formatMoney(input.amount, input.currency);
  const hasFx = isForeignCurrency(input.currency, input.baseCurrency);
  const titleX = contentX + 122;
  page.drawText(
    toPdfSafeText(`${input.fromName} -> ${input.toName}`),
    {
      x: titleX,
      y: y - 30,
      size: 24,
      font: bold,
      color: C.ink,
    }
  );

  y = y - 150;
  const labelW = 168;
  const valueMaxW = PAGE_W - OUTER * 2 - pad * 2 - labelW;
  const rows: Array<[string, string]> = [
    ["Von", input.fromName],
    ["An", input.toName],
  ];
  if (hasFx) {
    rows.push([`Betrag (${input.currency})`, money]);
    rows.push([
      `Betrag (${input.baseCurrency})`,
      formatMoney(input.amountBase, input.baseCurrency),
    ]);
    rows.push([
      "Wechselkurs",
      formatExchangeRateLine({
        currency: input.currency,
        baseCurrency: input.baseCurrency,
        exchangeRate: input.exchangeRate,
        amount: input.amount,
        amountBase: input.amountBase,
      }),
    ]);
  } else {
    rows.push(["Betrag", money]);
  }
  rows.push(["Wann", formatDateDe(input.settledAt) || "-"]);
  rows.push(["Notiz", input.note?.trim() || "-"]);
  rows.push(["Beleg-ID", String(input.settlementId)]);

  for (const [label, value] of rows) {
    y = drawLabeledRow(
      page,
      font,
      bold,
      label,
      value,
      contentX,
      y,
      labelW,
      valueMaxW,
      13,
      16
    );
  }

  const footH = 52;
  page.drawRectangle({
    x: cardX,
    y: cardBottom,
    width: cardW,
    height: footH,
    color: C.foot,
  });
  page.drawText("Beleg-PDF - geeignet fuer Paperless / FamilyBrain", {
    x: contentX,
    y: cardBottom + 22,
    size: 11,
    font,
    color: C.muted,
  });

  return Buffer.from(await pdf.save());
}

export type LedgerExpensePdfItem = {
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
  aiImagePath?: string | null;
};

export async function buildLedgerExpensesPdfBuffer(input: {
  ledgerTitle: string;
  baseCurrency: string;
  expenses: LedgerExpensePdfItem[];
}): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const totalBase = input.expenses.reduce((s, e) => s + e.amountBase, 0);

  function newPage() {
    const p = pdf.addPage([PAGE_W, PAGE_H]);
    p.drawRectangle({
      x: 0,
      y: 0,
      width: PAGE_W,
      height: PAGE_H,
      color: C.pageBg,
    });
    return p;
  }

  let page = newPage();
  const margin = OUTER;
  const contentW = PAGE_W - margin * 2;
  let y = PAGE_H - margin;

  page.drawRectangle({
    x: margin,
    y: y - 78,
    width: contentW,
    height: 78,
    color: C.headerBg,
    borderColor: C.headerBorder,
    borderWidth: 1,
  });
  page.drawText("FINANZBRAIN  ·  ALLE AUSGABEN", {
    x: margin + 16,
    y: y - 28,
    size: 12,
    font: bold,
    color: C.headerLabel,
  });
  const titleLines = wrapText(input.ledgerTitle, bold, 20, contentW - 32);
  page.drawText(titleLines[0] || toPdfSafeText(input.ledgerTitle), {
    x: margin + 16,
    y: y - 52,
    size: 20,
    font: bold,
    color: C.headerTitle,
  });
  page.drawText(
    toPdfSafeText(
      `${input.expenses.length} Ausgaben · Summe ${formatMoney(totalBase, input.baseCurrency)}`
    ),
    {
      x: margin + 16,
      y: y - 70,
      size: 11,
      font,
      color: C.headerLabel,
    }
  );
  y -= 98;

  for (const exp of input.expenses) {
    const badgeW = 72;
    const badgeH = 96;
    const padX = 12;
    const padY = 12;
    const img = await embedOptionalScaledJpeg(
      pdf,
      exp.aiImagePath,
      LEDGER_SUMMARY_AI_THUMB_PX
    );
    const imgSize = LEDGER_SUMMARY_AI_THUMB_PX;
    let imgW = 0;
    let imgH = 0;
    if (img) {
      const scale = Math.min(imgSize / img.width, imgSize / img.height, 1);
      imgW = img.width * scale;
      imgH = img.height * scale;
    }

    const textX = margin + padX + badgeW + 14;
    const textRight = margin + contentW - padX - (img ? imgW + 12 : 0);
    const textW = Math.max(120, textRight - textX);
    const title = exp.description?.trim() || "Ausgabe";
    const titleLinesExp = wrapText(title, bold, 14, textW).slice(0, 2);

    const hasFx = isForeignCurrency(exp.currency, exp.baseCurrency);
    const rate = resolveExchangeRate({
      amount: exp.amount,
      amountBase: exp.amountBase,
      currency: exp.currency,
      baseCurrency: exp.baseCurrency,
      exchangeRate: exp.exchangeRate,
    });

    const detailRaw = [
      `Bezahlt von: ${exp.paidByName}`,
      hasFx
        ? `Betrag: ${formatMoney(exp.amount, exp.currency)} / ${formatMoney(exp.amountBase, exp.baseCurrency)}`
        : `Betrag: ${formatMoney(exp.amount, exp.currency)}`,
      hasFx
        ? `Kurs: ${formatExchangeRateLine({
            currency: exp.currency,
            baseCurrency: exp.baseCurrency,
            exchangeRate: rate,
          })}`
        : null,
      exp.placeName?.trim() ? `Ort: ${exp.placeName.trim()}` : null,
      exp.note?.trim() ? `Notiz: ${exp.note.trim()}` : null,
      `Beleg-ID: ${exp.expenseId}`,
    ].filter(Boolean) as string[];

    const detailWrapped = detailRaw.flatMap((line) =>
      wrapText(line, font, 10, textW).slice(0, 2)
    );

    // Measure text column: title (16/line) + category (20) + details (13/line)
    const textColH =
      4 + // top inset before title
      titleLinesExp.length * 16 +
      20 + // category
      detailWrapped.length * 13 +
      8; // bottom breathing room

    const cardH =
      Math.max(badgeH, imgH, textColH) + padY * 2;

    if (y - cardH < margin + 24) {
      page = newPage();
      y = PAGE_H - margin;
    }

    page.drawRectangle({
      x: margin,
      y: y - cardH,
      width: contentW,
      height: cardH,
      color: C.card,
      borderColor: C.border,
      borderWidth: 1,
    });

    const innerX = margin + padX;
    const innerTop = y - padY;
    drawDateBadge(page, bold, exp.expenseDate, innerX, innerTop, badgeW, badgeH);

    let ty = innerTop - 4;
    for (const line of titleLinesExp) {
      page.drawText(line, {
        x: textX,
        y: ty - 14,
        size: 14,
        font: bold,
        color: C.ink,
      });
      ty -= 16;
    }

    page.drawText(toPdfSafeText(exp.categoryLabel || "Ausgabe").toUpperCase(), {
      x: textX,
      y: ty - 12,
      size: 9,
      font: bold,
      color: C.badgeFg,
    });
    ty -= 20;

    for (const wline of detailWrapped) {
      page.drawText(wline, {
        x: textX,
        y: ty - 10,
        size: 10,
        font,
        color: C.muted,
      });
      ty -= 13;
    }

    if (img && imgW > 0) {
      page.drawImage(img, {
        x: margin + contentW - padX - imgW,
        y: innerTop - imgH,
        width: imgW,
        height: imgH,
      });
    }

    y -= cardH + 12;
  }

  if (input.expenses.length === 0) {
    page.drawText("Noch keine Ausgaben.", {
      x: margin,
      y: y - 20,
      size: 12,
      font,
      color: C.muted,
    });
  }

  return Buffer.from(await pdf.save());
}
