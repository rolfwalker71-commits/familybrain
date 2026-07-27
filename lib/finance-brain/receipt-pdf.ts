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
import { isWeatherCommentBody } from "@/lib/trips/map-context";

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

/** Soft-UI sage palette — matches --brand-finance / globals.css */
const C = {
  pageBg: rgb(0.933, 0.949, 0.941), // #eef2f0
  card: rgb(1, 1, 1),
  border: rgb(0.843, 0.878, 0.863), // #d7e0dc
  headerBg: rgb(0.851, 0.894, 0.82), // #d9e4d1
  headerBorder: rgb(0.843, 0.878, 0.863),
  headerLabel: rgb(0.247, 0.42, 0.322), // #3f6b52
  headerTitle: rgb(0.247, 0.42, 0.322),
  ink: rgb(0.078, 0.125, 0.11), // #14201c
  muted: rgb(0.357, 0.42, 0.4), // #5b6b66
  soft: rgb(0.933, 0.949, 0.941),
  badgeBg: rgb(0.851, 0.894, 0.82),
  badgeFg: rgb(0.247, 0.42, 0.322),
  monthBg: rgb(0.851, 0.894, 0.82),
  monthFg: rgb(0.247, 0.42, 0.322),
  white: rgb(1, 1, 1),
  foot: rgb(0.933, 0.949, 0.941),
  /** Diary expense cards vs white activity cards. */
  diaryExpenseBg: rgb(0.894, 0.937, 0.91), // #e4efe8
  diaryExpenseBorder: rgb(0.561, 0.678, 0.604), // #8fad9a
  diaryExpenseAccent: rgb(0.184, 0.365, 0.271), // #2f5d45
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

function weekdayLongDe(isoDate: string): string {
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

/** Preserve explicit newlines, then wrap each paragraph. */
function wrapMultilineText(
  text: string,
  font: PDFFont,
  size: number,
  maxWidth: number
): string[] {
  const paragraphs = text.replace(/\r\n/g, "\n").split("\n");
  const lines: string[] = [];
  for (const para of paragraphs) {
    if (!para.trim()) {
      lines.push("");
      continue;
    }
    lines.push(...wrapText(para, font, size, maxWidth));
  }
  return lines.length ? lines : [""];
}

function drawRoundedFill(
  page: PDFPage,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  fill: ReturnType<typeof rgb>
) {
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
}

function drawRoundedRect(
  page: PDFPage,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  fill: ReturnType<typeof rgb>,
  border?: ReturnType<typeof rgb>,
  borderWidth = 1.25
) {
  const rr = Math.min(r, w / 2, h / 2);
  if (border) {
    // Border via slightly larger rounded fill — avoid sharp border rect overlay
    drawRoundedFill(
      page,
      x - borderWidth,
      y - borderWidth,
      w + borderWidth * 2,
      h + borderWidth * 2,
      rr + borderWidth,
      border
    );
  }
  drawRoundedFill(page, x, y, w, h, rr, fill);
}

function drawRoundedTopBand(
  page: PDFPage,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  fill: ReturnType<typeof rgb>
) {
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
    y,
    width: w,
    height: Math.max(0, h - rr),
    color: fill,
  });
  page.drawCircle({ x: x + rr, y: y + h - rr, size: rr, color: fill });
  page.drawCircle({ x: x + w - rr, y: y + h - rr, size: rr, color: fill });
}

function drawRoundedBottomBand(
  page: PDFPage,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  fill: ReturnType<typeof rgb>
) {
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
    height: Math.max(0, h - rr),
    color: fill,
  });
  page.drawCircle({ x: x + rr, y: y + rr, size: rr, color: fill });
  page.drawCircle({ x: x + w - rr, y: y + rr, size: rr, color: fill });
}

function drawDateBadge(
  page: PDFPage,
  bold: PDFFont,
  isoDate: string | null | undefined,
  x: number,
  topY: number,
  w = 78,
  h = 86,
  time?: string | null
) {
  const bottom = topY - h;
  const rr = Math.min(8, w / 4, h / 5);

  // Order inside badge: month → weekday (full) → day → year (no time)
  drawRoundedRect(page, x, bottom, w, h, rr, C.card, C.border, 1);

  const headerH = 16;
  const headerBottom = topY - headerH;
  page.drawRectangle({
    x: x + rr,
    y: headerBottom,
    width: w - 2 * rr,
    height: headerH,
    color: C.monthBg,
  });
  page.drawRectangle({
    x,
    y: headerBottom,
    width: w,
    height: Math.max(0, headerH - rr),
    color: C.monthBg,
  });
  page.drawCircle({ x: x + rr, y: topY - rr, size: rr, color: C.monthBg });
  page.drawCircle({
    x: x + w - rr,
    y: topY - rr,
    size: rr,
    color: C.monthBg,
  });

  const iso =
    isoDate && /^\d{4}-\d{2}-\d{2}/.test(isoDate) ? isoDate.slice(0, 10) : null;
  const month = iso ? MONTH_SHORT_DE[Number(iso.slice(5, 7)) - 1] : "---";
  const day = iso ? String(Number(iso.slice(8, 10))) : "-";
  const year = iso ? iso.slice(0, 4) : "----";
  const weekday = iso ? toPdfSafeText(weekdayLongDe(iso)) : "-";

  const monthSize = 11;
  const daySize = h >= 80 ? 19 : 16;
  const metaSize = 7;
  const gap = 2;
  const topPad = 3;
  const bottomPad = 3;
  const sidePad = 3;

  page.drawText(month, {
    x: x + (w - bold.widthOfTextAtSize(month, monthSize)) / 2,
    y: topY - headerH + Math.max(2, (headerH - monthSize) / 2),
    size: monthSize,
    font: bold,
    color: C.monthFg,
  });

  // Pack from top: weekday → day → year
  let cursor = topY - headerH - topPad - metaSize;
  let weekdaySize = metaSize;
  while (
    weekdaySize > 5 &&
    bold.widthOfTextAtSize(weekday, weekdaySize) > w - sidePad * 2
  ) {
    weekdaySize -= 0.5;
  }
  page.drawText(weekday, {
    x: x + Math.max(sidePad, (w - bold.widthOfTextAtSize(weekday, weekdaySize)) / 2),
    y: cursor,
    size: weekdaySize,
    font: bold,
    color: C.muted,
  });
  cursor -= gap + daySize;
  page.drawText(day, {
    x: x + (w - bold.widthOfTextAtSize(day, daySize)) / 2,
    y: cursor,
    size: daySize,
    font: bold,
    color: C.ink,
  });
  cursor = Math.max(bottom + bottomPad, cursor - gap - metaSize);
  page.drawText(year, {
    x: x + (w - bold.widthOfTextAtSize(year, metaSize)) / 2,
    y: cursor,
    size: metaSize,
    font: bold,
    color: C.muted,
  });

  const timeLabel = time?.trim() ? toPdfSafeText(time.trim()) : "";
  if (timeLabel) {
    const timeSize = 8;
    page.drawText(timeLabel, {
      x: x + Math.max(0, (w - bold.widthOfTextAtSize(timeLabel, timeSize)) / 2),
      y: bottom - timeSize - 3,
      size: timeSize,
      font: bold,
      color: C.muted,
    });
  }
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
  valueSize = 15,
  emphasize = false
): number {
  const safeLabel = toPdfSafeText(label);
  const useLabelSize = emphasize ? labelSize + 1 : labelSize;
  const useValueSize = emphasize ? valueSize + 1 : valueSize;
  const labelFont = emphasize ? bold : font;
  const lines = wrapText(value, bold, useValueSize, valueMaxW);
  page.drawText(safeLabel, {
    x,
    y,
    size: useLabelSize,
    font: labelFont,
    color: emphasize ? C.ink : C.muted,
  });
  let yy = y;
  for (const line of lines) {
    page.drawText(line, {
      x: x + labelW,
      y: yy,
      size: useValueSize,
      font: bold,
      color: C.ink,
    });
    yy -= useValueSize + 4;
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
  shares?: Array<{
    displayName: string;
    shareAmountBase: number;
    isPayer: boolean;
  }>;
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

  const CARD_RADIUS = 22;

  drawRoundedRect(page, cardX, cardBottom, cardW, cardH, CARD_RADIUS, C.card, C.border);

  // Header band
  const headerH = 86;
  const headerBottom = cardTop - headerH;
  drawRoundedTopBand(
    page,
    cardX,
    headerBottom,
    cardW,
    headerH,
    CARD_RADIUS,
    C.headerBg
  );
  page.drawRectangle({
    x: cardX,
    y: headerBottom,
    width: cardW,
    height: 1.5,
    color: C.headerBorder,
  });

  const eyebrow = "FINANZBUDDY  ·  NEUE AUSGABE";
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
  const badgeW = 78;
  const badgeH = 86;
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
  const imgMax = 160;
  let imgW = 0;
  let imgH = 0;
  if (img) {
    const scale = Math.min(imgMax / img.width, imgMax / img.height, 1);
    imgW = img.width * scale;
    imgH = img.height * scale;
  }

  // Detail rows use full content width — AI image sits bottom-right, not beside values
  const labelW = 140;
  const valueMaxW = Math.max(220, contentW - labelW - 12);
  const hasFx = isForeignCurrency(input.currency, input.baseCurrency);
  const rate = resolveExchangeRate({
    amount: input.amount,
    amountBase: input.amountBase,
    currency: input.currency,
    baseCurrency: input.baseCurrency,
    exchangeRate: input.exchangeRate,
  });

  const rows: Array<[string, string, boolean?]> = [
    ["Wer hat bezahlt", input.paidByName],
  ];
  if (hasFx) {
    rows.push(["Währung", input.currency.toUpperCase()]);
    rows.push(["FW Betrag", formatMoney(input.amount, input.currency)]);
    rows.push([
      `Betrag ${input.baseCurrency.toUpperCase()}`,
      formatMoney(input.amountBase, input.baseCurrency),
      true,
    ]);
    rows.push([
      "Kurs",
      formatExchangeRateLine({
        currency: input.currency,
        baseCurrency: input.baseCurrency,
        exchangeRate: rate,
      }),
    ]);
  } else {
    rows.push(["Betrag", formatMoney(input.amount, input.currency), true]);
  }
  rows.push(["Wann", formatDateDe(input.expenseDate) || "-"]);
  rows.push(["Wo", input.placeName?.trim() || "-"]);
  rows.push(["Kategorie", input.categoryLabel || "Ausgabe"]);
  if (input.note?.trim()) {
    rows.push(["Notiz", input.note.trim()]);
  }
  if (input.shares?.length) {
    rows.push([
      `Anteile (${input.shares.length})`,
      input.shares
        .map((s) => {
          const money = formatMoney(s.shareAmountBase, input.baseCurrency);
          return `${s.displayName}${s.isPayer ? " (gezahlt)" : ""}: ${money}`;
        })
        .join(" · "),
    ]);
  }
  rows.push(["Beleg-ID", String(input.expenseId)]);

  y -= 12;
  const detailsBottomMin = cardBottom + footH + (img ? imgH + 28 : 16);
  for (const [label, value, emphasize] of rows) {
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
      16,
      Boolean(emphasize)
    );
    if (y < detailsBottomMin) break;
  }

  // AI image bottom-right, above footer
  if (img && imgW > 0 && imgH > 0) {
    const imgBottom = cardBottom + footH + 16;
    const framePad = 4;
    const frameR = 14;
    drawRoundedRect(
      page,
      contentRight - imgW - framePad,
      imgBottom - framePad,
      imgW + framePad * 2,
      imgH + framePad * 2,
      frameR,
      C.soft,
      C.border,
      1
    );
    page.drawImage(img, {
      x: contentRight - imgW,
      y: imgBottom,
      width: imgW,
      height: imgH,
    });
  }

  // Footer
  drawRoundedBottomBand(
    page,
    cardX,
    cardBottom,
    cardW,
    footH,
    CARD_RADIUS,
    C.foot
  );
  page.drawRectangle({
    x: cardX,
    y: cardBottom + footH,
    width: cardW,
    height: 1,
    color: C.border,
  });
  page.drawText("Beleg-PDF - geeignet fuer Paperless / TripBook", {
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

  const CARD_RADIUS = 22;

  drawRoundedRect(page, cardX, cardBottom, cardW, cardH, CARD_RADIUS, C.card, C.border);

  const headerH = 86;
  const headerBottom = cardTop - headerH;
  drawRoundedTopBand(
    page,
    cardX,
    headerBottom,
    cardW,
    headerH,
    CARD_RADIUS,
    C.headerBg
  );
  page.drawRectangle({
    x: cardX,
    y: headerBottom,
    width: cardW,
    height: 1.5,
    color: C.headerBorder,
  });

  page.drawText("FINANZBUDDY  ·  RUECKZAHLUNG", {
    x: contentX,
    y: cardTop - 32,
    size: 13,
    font: bold,
    color: C.headerLabel,
  });
  page.drawText(toPdfSafeText(input.ledgerTitle), {
    x: contentX,
    y: cardTop - 58,
    size: 22,
    font: bold,
    color: C.headerTitle,
  });

  let y = headerBottom - 36;
  const badgeW = 78;
  const badgeH = 86;
  drawDateBadge(
    page,
    bold,
    input.settledAt?.slice(0, 10) ?? null,
    contentX,
    y,
    badgeW,
    badgeH
  );

  const money = formatMoney(input.amount, input.currency);
  const hasFx = isForeignCurrency(input.currency, input.baseCurrency);
  const titleX = contentX + badgeW + 22;
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

  y = y - badgeH - 28;
  const labelW = 168;
  const valueMaxW = PAGE_W - OUTER * 2 - pad * 2 - labelW;
  const rows: Array<[string, string, boolean?]> = [
    ["Von", input.fromName],
    ["An", input.toName],
  ];
  if (hasFx) {
    rows.push(["Währung", input.currency.toUpperCase()]);
    rows.push(["FW Betrag", money]);
    rows.push([
      `Betrag ${input.baseCurrency.toUpperCase()}`,
      formatMoney(input.amountBase, input.baseCurrency),
      true,
    ]);
    rows.push([
      "Kurs",
      formatExchangeRateLine({
        currency: input.currency,
        baseCurrency: input.baseCurrency,
        exchangeRate: input.exchangeRate,
        amount: input.amount,
        amountBase: input.amountBase,
      }),
    ]);
  } else {
    rows.push(["Betrag", money, true]);
  }
  rows.push(["Wann", formatDateDe(input.settledAt) || "-"]);
  rows.push(["Notiz", input.note?.trim() || "-"]);
  rows.push(["Beleg-ID", String(input.settlementId)]);

  for (const [label, value, emphasize] of rows) {
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
      16,
      Boolean(emphasize)
    );
  }

  const footH = 52;
  drawRoundedBottomBand(
    page,
    cardX,
    cardBottom,
    cardW,
    footH,
    CARD_RADIUS,
    C.foot
  );
  page.drawText("Beleg-PDF - geeignet fuer Paperless / TripBook", {
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
  activityLabel?: string | null;
  shares?: Array<{
    displayName: string;
    shareAmountBase: number;
    isPayer: boolean;
  }>;
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
  page.drawText("FINANZBUDDY  ·  ALLE AUSGABEN", {
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
    const badgeW = 70;
    const badgeH = 78;
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

    const detailLines: Array<{
      text: string;
      emphasize?: boolean;
      share?: boolean;
    }> = [
      { text: `Bezahlt von: ${exp.paidByName}` },
      ...(hasFx
        ? [
            { text: `Währung: ${exp.currency.toUpperCase()}` },
            { text: `FW Betrag: ${formatMoney(exp.amount, exp.currency)}` },
            {
              text: `Betrag ${exp.baseCurrency.toUpperCase()}: ${formatMoney(exp.amountBase, exp.baseCurrency)}`,
              emphasize: true,
            },
            {
              text: `Kurs: ${formatExchangeRateLine({
                currency: exp.currency,
                baseCurrency: exp.baseCurrency,
                exchangeRate: rate,
              })}`,
            },
          ]
        : [
            {
              text: `Betrag: ${formatMoney(exp.amount, exp.currency)}`,
              emphasize: true,
            },
          ]),
      ...(exp.placeName?.trim()
        ? [{ text: `Ort: ${exp.placeName.trim()}` }]
        : []),
      ...(exp.note?.trim() ? [{ text: `Notiz: ${exp.note.trim()}` }] : []),
      ...(exp.shares?.length
        ? [
            {
              text: `Anteile (${exp.shares.length}): ${exp.shares
                .map((s) => {
                  const money = formatMoney(
                    s.shareAmountBase,
                    exp.baseCurrency
                  );
                  return `${s.displayName}${s.isPayer ? " (gezahlt)" : ""} ${money}`;
                })
                .join(" · ")}`,
              share: true as const,
            },
          ]
        : []),
      { text: `Beleg-ID: ${exp.expenseId}` },
    ];

    const detailWrapped = detailLines.flatMap((line) => {
      const size = "share" in line && line.share ? 8 : line.emphasize ? 11 : 10;
      const useBold = Boolean(line.emphasize);
      return wrapText(line.text, useBold ? bold : font, size, textW).map(
        (wline) => ({
          text: wline,
          emphasize: Boolean(line.emphasize),
          share: Boolean("share" in line && line.share),
        })
      );
    });

    // Measure text column: title (16/line) + category (20) + details
    const textColH =
      4 +
      titleLinesExp.length * 16 +
      20 +
      detailWrapped.reduce(
        (h, line) => h + (line.share ? 10 : line.emphasize ? 14 : 13),
        0
      ) +
      8;

    const cardH =
      Math.max(badgeH, imgH, textColH) + padY * 2;

    if (y - cardH < margin + 24) {
      page = newPage();
      y = PAGE_H - margin;
    }

    drawRoundedRect(
      page,
      margin,
      y - cardH,
      contentW,
      cardH,
      16,
      C.card,
      C.border,
      1
    );

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
      const size = wline.share ? 8 : wline.emphasize ? 11 : 10;
      page.drawText(wline.text, {
        x: textX,
        y: ty - size,
        size,
        font: wline.emphasize ? bold : font,
        color: wline.share ? C.muted : C.ink,
      });
      ty -= wline.share ? 10 : wline.emphasize ? 14 : 13;
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

export async function buildTripLedgerSummaryPdfBuffer(model: {
  ledgerTitle: string;
  tripTitle: string | null;
  baseCurrency: string;
  exportedAt: string;
  expenses: Array<{
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
    activityLabel?: string | null;
    aiImagePath?: string | null;
    shares?: Array<{
      displayName: string;
      shareAmountBase: number;
      isPayer: boolean;
    }>;
  }>;
  totalExpenseBase: number;
  totalSettlementsBase: number;
  members: Array<{
    displayName: string;
    paidBase: number;
    settlementsPaidBase: number;
    netBalance: number;
  }>;
  settlements: Array<{
    fromName: string;
    toName: string;
    amountBase: number;
    settledAt: string | null;
  }>;
  openDebts: Array<{ fromName: string; toName: string; amount: number }>;
}): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const headline = model.tripTitle || model.ledgerTitle;
  const stand =
    formatDateDe(model.exportedAt.slice(0, 10)) ||
    model.exportedAt.slice(0, 10);

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

  const ensureSpace = (need: number) => {
    if (y - need < margin + 40) {
      page = newPage();
      y = PAGE_H - margin;
    }
  };

  // Header
  page.drawRectangle({
    x: margin,
    y: y - 78,
    width: contentW,
    height: 78,
    color: C.headerBg,
    borderColor: C.headerBorder,
    borderWidth: 1,
  });
  page.drawText("FINANZBUDDY  ·  REISE-UEBERSICHT", {
    x: margin + 16,
    y: y - 28,
    size: 12,
    font: bold,
    color: C.headerLabel,
  });
  const titleLines = wrapText(headline, bold, 18, contentW - 32);
  page.drawText(titleLines[0] || toPdfSafeText(headline), {
    x: margin + 16,
    y: y - 50,
    size: 18,
    font: bold,
    color: C.headerTitle,
  });
  page.drawText(
    toPdfSafeText(
      `${model.expenses.length} Ausgaben · Summe ${formatMoney(model.totalExpenseBase, model.baseCurrency)} · Stand ${stand}`
    ),
    {
      x: margin + 16,
      y: y - 68,
      size: 10,
      font,
      color: C.headerLabel,
    }
  );
  y -= 98;

  // Expense cards (same structure as ledger summary)
  for (const exp of model.expenses) {
    const badgeW = 70;
    const badgeH = 78;
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
    const titleLinesExp = wrapText(title, bold, 13, textW).slice(0, 2);

    const hasFx = isForeignCurrency(exp.currency, exp.baseCurrency);
    const detailLines: string[] = [
      `Bezahlt von: ${exp.paidByName}`,
      ...(hasFx
        ? [
            `FW Betrag: ${formatMoney(exp.amount, exp.currency)}`,
            `Betrag ${model.baseCurrency}: ${formatMoney(exp.amountBase, model.baseCurrency)}`,
          ]
        : [`Betrag: ${formatMoney(exp.amount, exp.currency)}`]),
    ];
    if (exp.placeName) detailLines.push(`Ort: ${exp.placeName}`);
    if (exp.note?.trim()) detailLines.push(`Notiz: ${exp.note.trim()}`);
    if (exp.activityLabel) detailLines.push(`Aktivitaet: ${exp.activityLabel}`);

    const shareHeader = exp.shares?.length
      ? `Anteile (${exp.shares.length}):`
      : null;
    const shareBody = exp.shares?.length
      ? exp.shares
          .map((s) => {
            const money = formatMoney(s.shareAmountBase, model.baseCurrency);
            return `${s.displayName}${s.isPayer ? " (gezahlt)" : ""} ${money}`;
          })
          .join(" · ")
      : null;

    const detailWrapped = detailLines.flatMap((line) =>
      wrapText(line, font, 10, textW).map((t) => t)
    );
    const shareWrapped = shareBody
      ? wrapText(shareBody, font, 8, textW)
      : [];
    const textColH =
      titleLinesExp.length * 15 +
      16 +
      detailWrapped.length * 12 +
      (shareHeader ? 10 : 0) +
      shareWrapped.length * 10 +
      8;
    const cardH =
      Math.max(badgeH, imgH, textColH) + padY * 2;

    ensureSpace(cardH + 16);
    const cardBottom = y - cardH;
    drawRoundedRect(
      page,
      margin,
      cardBottom,
      contentW,
      cardH,
      10,
      C.card,
      C.border,
      1
    );

    const innerX = margin + padX;
    const innerTop = y - padY;
    drawDateBadge(page, bold, exp.expenseDate, innerX, innerTop, badgeW, badgeH);

    let ty = innerTop - 4;
    for (const line of titleLinesExp) {
      page.drawText(line, {
        x: textX,
        y: ty - 13,
        size: 13,
        font: bold,
        color: C.ink,
      });
      ty -= 15;
    }
    page.drawText(toPdfSafeText(exp.categoryLabel || "Ausgabe").toUpperCase(), {
      x: textX,
      y: ty - 11,
      size: 9,
      font: bold,
      color: C.badgeFg,
    });
    ty -= 16;
    for (const line of detailWrapped) {
      page.drawText(toPdfSafeText(line), {
        x: textX,
        y: ty - 10,
        size: 10,
        font,
        color: C.ink,
      });
      ty -= 12;
    }
    if (shareHeader) {
      page.drawText(toPdfSafeText(shareHeader), {
        x: textX,
        y: ty - 8,
        size: 8,
        font: bold,
        color: C.badgeFg,
      });
      ty -= 10;
      for (const line of shareWrapped) {
        page.drawText(toPdfSafeText(line), {
          x: textX,
          y: ty - 8,
          size: 8,
          font,
          color: C.ink,
        });
        ty -= 10;
      }
    }
    if (img && imgW > 0) {
      page.drawImage(img, {
        x: margin + contentW - padX - imgW,
        y: innerTop - imgH,
        width: imgW,
        height: imgH,
      });
    }
    y -= cardH + 10;
  }

  // Summary
  ensureSpace(120);
  page.drawText("Zusammenfassung", {
    x: margin,
    y: y - 16,
    size: 14,
    font: bold,
    color: C.ink,
  });
  y -= 34;
  const summaryBits = [
    `Summe Ausgaben: ${formatMoney(model.totalExpenseBase, model.baseCurrency)}`,
    `Ausgleich gezahlt: ${formatMoney(model.totalSettlementsBase, model.baseCurrency)}`,
    `Offene Vorschlaege: ${model.openDebts.length}`,
  ];
  for (const bit of summaryBits) {
    page.drawText(toPdfSafeText(bit), {
      x: margin,
      y: y - 12,
      size: 11,
      font,
      color: C.ink,
    });
    y -= 16;
  }
  y -= 10;

  // Chart
  ensureSpace(40 + model.members.length * 58);
  page.drawText("Wer hat bisher bezahlt / Netto", {
    x: margin,
    y: y - 14,
    size: 14,
    font: bold,
    color: C.ink,
  });
  y -= 28;
  const maxAbs = Math.max(
    1,
    ...model.members.flatMap((m) => [
      Math.abs(m.paidBase),
      Math.abs(m.settlementsPaidBase),
      Math.abs(m.netBalance),
    ])
  );
  const barMaxW = contentW - 160;

  for (const m of model.members) {
    ensureSpace(56);
    page.drawText(toPdfSafeText(m.displayName), {
      x: margin,
      y: y - 12,
      size: 11,
      font: bold,
      color: C.ink,
    });
    y -= 18;
    const rows: Array<[string, number, ReturnType<typeof rgb>]> = [
      ["Bezahlt", m.paidBase, C.headerLabel],
      ["Ausgleich", m.settlementsPaidBase, rgb(0.42, 0.56, 0.48)],
      [
        "Netto",
        m.netBalance,
        m.netBalance >= 0 ? C.headerLabel : rgb(0.7, 0.33, 0.33),
      ],
    ];
    for (const [label, value, color] of rows) {
      const w = Math.max(2, (Math.abs(value) / maxAbs) * barMaxW);
      page.drawText(label, {
        x: margin,
        y: y - 8,
        size: 8,
        font,
        color: C.muted,
      });
      page.drawRectangle({
        x: margin + 70,
        y: y - 10,
        width: w,
        height: 8,
        color,
      });
      page.drawText(
        toPdfSafeText(formatMoney(value, model.baseCurrency)),
        {
          x: margin + 70 + w + 6,
          y: y - 8,
          size: 8,
          font: bold,
          color: C.ink,
        }
      );
      y -= 14;
    }
    y -= 6;
  }

  // Settlements
  ensureSpace(80);
  page.drawText("Ausgleichsstatus", {
    x: margin,
    y: y - 14,
    size: 14,
    font: bold,
    color: C.ink,
  });
  y -= 28;
  if (model.settlements.length === 0) {
    page.drawText("Noch keine Ausgleichszahlungen.", {
      x: margin,
      y: y - 12,
      size: 10,
      font,
      color: C.muted,
    });
    y -= 18;
  } else {
    for (const s of model.settlements) {
      ensureSpace(18);
      const line = `${s.fromName} -> ${s.toName}: ${formatMoney(s.amountBase, model.baseCurrency)} (${formatDateDe(s.settledAt) || "-"})`;
      page.drawText(toPdfSafeText(line), {
        x: margin,
        y: y - 11,
        size: 10,
        font,
        color: C.ink,
      });
      y -= 15;
    }
  }
  for (const d of model.openDebts) {
    ensureSpace(18);
    const line = `Offen: ${d.fromName} -> ${d.toName}: ${formatMoney(d.amount, model.baseCurrency)}`;
    page.drawText(toPdfSafeText(line), {
      x: margin,
      y: y - 11,
      size: 10,
      font,
      color: C.muted,
    });
    y -= 15;
  }

  return Buffer.from(await pdf.save());
}

export async function buildTravelDiaryPdfBuffer(model: {
  tripTitle: string;
  destination: string | null;
  startDate: string | null;
  endDate: string | null;
  exportedAt: string;
  events: Array<{
    title: string;
    eventType: string;
    startDate: string | null;
    endDate: string | null;
    startTime: string | null;
    endTime: string | null;
    location: string | null;
    provider: string | null;
    notes: string | null;
    aiImagePath: string | null;
    comments: Array<{
      authorName: string;
      body: string;
      createdAt: string;
      imagePath?: string | null;
      avatarPath?: string | null;
    }>;
    expenses: Array<{
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
      aiImagePath: string | null;
      shares?: Array<{
        displayName: string;
        shareAmountBase: number;
        isPayer: boolean;
      }>;
    }>;
  }>;
  orphanExpenses: Array<{
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
    aiImagePath: string | null;
    shares?: Array<{
      displayName: string;
      shareAmountBase: number;
      isPayer: boolean;
    }>;
  }>;
  ledgerTitle: string | null;
}): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const margin = OUTER;
  const contentW = PAGE_W - margin * 2;
  let page = pdf.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - margin;

  function ensureSpace(need: number) {
    if (y - need < margin + 24) {
      page = pdf.addPage([PAGE_W, PAGE_H]);
      y = PAGE_H - margin;
    }
  }

  const range = [
    formatDateDe(model.startDate) || null,
    formatDateDe(model.endDate) || null,
  ]
    .filter(Boolean)
    .join(" - ");

  page.drawText("TRAVELBUDDY  ·  REISETAGEBUCH", {
    x: margin,
    y: y - 14,
    size: 11,
    font: bold,
    color: C.headerLabel,
  });
  y -= 28;
  const titleLines = wrapText(model.tripTitle, bold, 18, contentW);
  for (const line of titleLines) {
    page.drawText(line, {
      x: margin,
      y: y - 16,
      size: 18,
      font: bold,
      color: C.ink,
    });
    y -= 22;
  }
  const meta = [
    range || null,
    model.destination?.trim() || null,
    `${model.events.length} Aktivitaeten`,
  ]
    .filter(Boolean)
    .join(" · ");
  if (meta) {
    page.drawText(toPdfSafeText(meta), {
      x: margin,
      y: y - 12,
      size: 11,
      font,
      color: C.muted,
    });
    y -= 22;
  }
  y -= 8;

  async function drawExpenseMini(
    exp: (typeof model.events)[0]["expenses"][0]
  ) {
    const badgeW = 56;
    const badgeH = 64;
    const padX = 12;
    const padY = 10;
    const accentW = 5;
    const indent = 8;
    const cardX = margin + indent;
    const cardW = contentW - indent;
    const thumb = await loadScaledJpeg(exp.aiImagePath);
    let img: PDFImage | null = null;
    let imgW = 0;
    let imgH = 0;
    if (thumb) {
      img = await pdf.embedJpg(thumb);
      imgW = 56;
      imgH = 56;
    }
    const textX = cardX + padX + accentW + badgeW + 10;
    const textW =
      cardW - padX * 2 - accentW - badgeW - 10 - (img ? imgW + 8 : 0);
    const title = exp.description?.trim() || "Ausgabe";
    const titleLinesExp = wrapText(title, bold, 11, textW);
    const moneyLabel = formatMoney(exp.amountBase, exp.baseCurrency);
    const detailLines: string[] = [
      `Bezahlt von: ${exp.paidByName}`,
      `Betrag: ${moneyLabel}`,
    ];
    if (exp.placeName) detailLines.push(`Ort: ${exp.placeName}`);
    if (exp.note?.trim()) detailLines.push(`Notiz: ${exp.note.trim()}`);
    const detailWrapped = detailLines.flatMap((line) =>
      wrapText(line, font, 9, textW)
    );
    const shareHeader = exp.shares?.length
      ? `Anteile (${exp.shares.length}):`
      : null;
    const shareBody = exp.shares?.length
      ? exp.shares
          .map((s) => {
            const money = formatMoney(s.shareAmountBase, exp.baseCurrency);
            return `${s.displayName}${s.isPayer ? " (gezahlt)" : ""} ${money}`;
          })
          .join(" · ")
      : null;
    const shareWrapped = shareBody
      ? wrapText(shareBody, font, 8, textW)
      : [];
    const textColH =
      titleLinesExp.length * 13 +
      14 +
      12 + // AUSGABE + category row
      detailWrapped.length * 11 +
      (shareHeader ? 10 : 0) +
      shareWrapped.length * 10 +
      6;
    const cardH = Math.max(badgeH, imgH, textColH) + padY * 2;
    ensureSpace(cardH + 12);
    const cardBottom = y - cardH;
    drawRoundedRect(
      page,
      cardX,
      cardBottom,
      cardW,
      cardH,
      8,
      C.diaryExpenseBg,
      C.diaryExpenseBorder,
      1
    );
    // Left accent bar
    page.drawRectangle({
      x: cardX,
      y: cardBottom + 4,
      width: accentW,
      height: cardH - 8,
      color: C.diaryExpenseAccent,
    });
    const innerX = cardX + padX + accentW;
    const innerTop = y - padY;
    drawDateBadge(page, bold, exp.expenseDate, innerX, innerTop, badgeW, badgeH);
    let ty = innerTop - 2;
    for (const line of titleLinesExp) {
      page.drawText(line, {
        x: textX,
        y: ty - 11,
        size: 11,
        font: bold,
        color: C.ink,
      });
      ty -= 13;
    }
    page.drawText("AUSGABE", {
      x: textX,
      y: ty - 9,
      size: 8,
      font: bold,
      color: C.diaryExpenseAccent,
    });
    const ausgabeW = bold.widthOfTextAtSize("AUSGABE", 8);
    page.drawText(
      toPdfSafeText(exp.categoryLabel || "Ausgabe").toUpperCase(),
      {
        x: textX + ausgabeW + 8,
        y: ty - 9,
        size: 8,
        font: bold,
        color: C.badgeFg,
      }
    );
    ty -= 14;
    for (const line of detailWrapped) {
      page.drawText(toPdfSafeText(line), {
        x: textX,
        y: ty - 9,
        size: 9,
        font,
        color: C.ink,
      });
      ty -= 11;
    }
    if (shareHeader) {
      page.drawText(toPdfSafeText(shareHeader), {
        x: textX,
        y: ty - 8,
        size: 8,
        font: bold,
        color: C.diaryExpenseAccent,
      });
      ty -= 10;
      for (const line of shareWrapped) {
        page.drawText(toPdfSafeText(line), {
          x: textX,
          y: ty - 8,
          size: 8,
          font,
          color: C.ink,
        });
        ty -= 10;
      }
    }
    if (img && imgW > 0) {
      page.drawImage(img, {
        x: cardX + cardW - padX - imgW,
        y: innerTop - imgH,
        width: imgW,
        height: imgH,
      });
    }
    y -= cardH + 8;
  }

  for (const event of model.events) {
    const badgeW = 56;
    const badgeH = 64;
    const padX = 10;
    const padY = 10;
    const thumb = await loadScaledJpeg(event.aiImagePath);
    let img: PDFImage | null = null;
    let imgW = 0;
    let imgH = 0;
    if (thumb) {
      img = await pdf.embedJpg(thumb);
      imgW = 64;
      imgH = 64;
    }
    const textX = margin + padX + badgeW + 10;
    const textW = contentW - padX * 2 - badgeW - 10 - (img ? imgW + 8 : 0);
    const titleLinesExp = wrapText(event.title, bold, 13, textW);
    const time =
      event.startTime && event.endTime
        ? `${event.startTime}-${event.endTime}`
        : event.startTime || event.endTime || null;
    const placeParts = [event.location, event.provider]
      .map((p) => p?.trim())
      .filter(Boolean);
    const detailLines: string[] = [];
    if (placeParts.length) detailLines.push(placeParts.join(" · "));
    if (event.notes?.trim()) detailLines.push(`Notiz: ${event.notes.trim()}`);
    const detailWrapped = detailLines.flatMap((line) =>
      wrapText(line, font, 9, textW)
    );
    const textColH =
      titleLinesExp.length * 15 + 16 + detailWrapped.length * 11 + 8;
    const cardH = Math.max(badgeH + (time ? 14 : 0), imgH, textColH) + padY * 2;
    ensureSpace(cardH + 16);
    const cardBottom = y - cardH;
    drawRoundedRect(
      page,
      margin,
      cardBottom,
      contentW,
      cardH,
      10,
      C.card,
      C.border,
      1
    );
    const innerX = margin + padX;
    const innerTop = y - padY;
    drawDateBadge(
      page,
      bold,
      event.startDate,
      innerX,
      innerTop,
      badgeW,
      badgeH,
      time
    );
    let ty = innerTop - 4;
    for (const line of titleLinesExp) {
      page.drawText(line, {
        x: textX,
        y: ty - 13,
        size: 13,
        font: bold,
        color: C.ink,
      });
      ty -= 15;
    }
    page.drawText(toPdfSafeText(event.eventType).toUpperCase(), {
      x: textX,
      y: ty - 10,
      size: 8,
      font: bold,
      color: C.badgeFg,
    });
    ty -= 14;
    for (const line of detailWrapped) {
      page.drawText(toPdfSafeText(line), {
        x: textX,
        y: ty - 9,
        size: 9,
        font,
        color: C.ink,
      });
      ty -= 11;
    }
    if (img && imgW > 0) {
      page.drawImage(img, {
        x: margin + contentW - padX - imgW,
        y: innerTop - imgH,
        width: imgW,
        height: imgH,
      });
    }
    y -= cardH + 8;

    if (event.comments.length) {
      ensureSpace(20);
      page.drawText(
        toPdfSafeText(`Kommentare (${event.comments.length})`),
        {
          x: margin + 4,
          y: y - 11,
          size: 9,
          font: bold,
          color: C.badgeFg,
        }
      );
      y -= 16;
      for (const c of event.comments) {
        const when = formatDateDe(c.createdAt.slice(0, 10)) || "";
        const header = `${c.authorName}${when ? ` · ${when}` : ""}`;
        const isWeather = isWeatherCommentBody(c.body);
        const mapSide = isWeather && Boolean(c.imagePath);
        const thumbEdge = mapSide ? 140 : 180;
        const mapImg = c.imagePath
          ? await embedOptionalScaledJpeg(pdf, c.imagePath, thumbEdge)
          : null;
        const avatarImg = c.avatarPath
          ? await embedOptionalScaledJpeg(pdf, c.avatarPath, 48)
          : null;
        const avatarSize = avatarImg ? 18 : 0;
        const avatarGap = avatarImg ? 6 : 0;
        const pad = 8;
        const gap = 12;
        const imgW = mapImg && mapSide ? 120 : 0;
        const imgH = mapImg && mapSide ? 120 : 0;
        const textMaxW =
          contentW -
          pad * 2 -
          (mapSide && mapImg ? imgW + gap : 0) -
          avatarSize -
          avatarGap;
        const bodyLines = wrapMultilineText(c.body, font, 9, textMaxW);
        const headerH = 14;
        const bodyH = Math.max(1, bodyLines.length) * 11;
        const textColH = headerH + bodyH + 6;

        let belowImgW = 0;
        let belowImgH = 0;
        if (mapImg && !mapSide) {
          const maxBelow = 140;
          const scale = Math.min(
            maxBelow / mapImg.width,
            maxBelow / mapImg.height,
            1
          );
          belowImgW = mapImg.width * scale;
          belowImgH = mapImg.height * scale;
        }

        const blockH =
          (mapSide && mapImg
            ? Math.max(textColH, imgH + pad)
            : textColH + (belowImgH > 0 ? belowImgH + 8 : 0)) + pad;

        ensureSpace(blockH + 8);
        const cardBottom = y - blockH;
        drawRoundedRect(
          page,
          margin,
          cardBottom,
          contentW,
          blockH,
          6,
          C.soft,
          C.border,
          1
        );

        const textStartX = margin + pad + avatarSize + avatarGap;
        if (avatarImg) {
          page.drawImage(avatarImg, {
            x: margin + pad,
            y: y - pad - avatarSize,
            width: avatarSize,
            height: avatarSize,
          });
        }

        page.drawText(toPdfSafeText(header), {
          x: textStartX,
          y: y - 12,
          size: 8,
          font: bold,
          color: C.badgeFg,
        });

        let cy = y - headerH;
        for (const line of bodyLines) {
          if (line) {
            page.drawText(toPdfSafeText(line), {
              x: textStartX,
              y: cy - 10,
              size: 9,
              font,
              color: C.ink,
            });
          }
          cy -= 11;
        }

        if (mapImg && mapSide) {
          page.drawImage(mapImg, {
            x: margin + contentW - pad - imgW,
            y: y - pad - imgH,
            width: imgW,
            height: imgH,
          });
        } else if (mapImg && belowImgW > 0) {
          page.drawImage(mapImg, {
            x: margin + pad,
            y: cardBottom + pad,
            width: belowImgW,
            height: belowImgH,
          });
        }

        y -= blockH + 6;
      }
    }

    if (event.expenses.length) {
      ensureSpace(18);
      page.drawText(
        toPdfSafeText(`Wallet · Ausgaben (${event.expenses.length})`),
        {
          x: margin + 4,
          y: y - 11,
          size: 9,
          font: bold,
          color: C.diaryExpenseAccent,
        }
      );
      y -= 14;
      for (const exp of event.expenses) {
        await drawExpenseMini(exp);
      }
    }

    y -= 6;
  }

  if (model.orphanExpenses.length) {
    ensureSpace(24);
    page.drawText(
      toPdfSafeText(
        `Wallet · Weitere Ausgaben${model.ledgerTitle ? ` · ${model.ledgerTitle}` : ""}`
      ),
      {
        x: margin,
        y: y - 14,
        size: 12,
        font: bold,
        color: C.diaryExpenseAccent,
      }
    );
    y -= 20;
    for (const exp of model.orphanExpenses) {
      await drawExpenseMini(exp);
    }
  }

  if (model.events.length === 0 && model.orphanExpenses.length === 0) {
    page.drawText("Noch keine Eintraege.", {
      x: margin,
      y: y - 16,
      size: 12,
      font,
      color: C.muted,
    });
  }

  return Buffer.from(await pdf.save());
}
