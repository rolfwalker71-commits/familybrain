import fs from "fs";
import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
} from "pdf-lib";
import { formatMoney } from "@/lib/finance-brain/format";

const MARGIN = 48;
const PAGE_W = 595.28;
const PAGE_H = 841.89;

function toPdfSafeText(raw: string): string {
  return raw
    .replace(/\u2192/g, "->")
    .replace(/\u2190/g, "<-")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\u2026/g, "...")
    .replace(/\u00B7/g, "-")
    .replace(/\p{Extended_Pictographic}\s*/gu, "")
    .replace(/[\uFE0E\uFE0F\u200D]/g, "");
}

function drawLines(
  page: ReturnType<PDFDocument["addPage"]>,
  font: PDFFont,
  lines: string[],
  x: number,
  startY: number,
  size: number,
  gap = 4
): number {
  let y = startY;
  for (const line of lines) {
    page.drawText(toPdfSafeText(line), {
      x,
      y,
      size,
      font,
      color: rgb(0.08, 0.1, 0.15),
    });
    y -= size + gap;
  }
  return y;
}

async function embedOptionalPng(
  pdf: PDFDocument,
  filePath: string | null | undefined
) {
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

export async function buildExpensePdfBuffer(input: {
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
  aiImagePath?: string | null;
  expenseId: number;
}): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([PAGE_W, PAGE_H]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let y = PAGE_H - MARGIN;

  page.drawText("FinanzBrain - Ausgabe", {
    x: MARGIN,
    y,
    size: 18,
    font: bold,
    color: rgb(0.6, 0.25, 0.05),
  });
  y -= 28;
  y = drawLines(page, font, [`Abrechnung: ${input.ledgerTitle}`], MARGIN, y, 11);
  y -= 8;

  const money = formatMoney(input.amount, input.currency);
  const base =
    input.currency !== input.baseCurrency
      ? ` (${formatMoney(input.amountBase, input.baseCurrency)})`
      : "";

  y = drawLines(
    page,
    bold,
    [input.description?.trim() || "Ausgabe"],
    MARGIN,
    y,
    16,
    6
  );
  y = drawLines(
    page,
    font,
    [
      `Kategorie: ${input.categoryLabel || "Ausgabe"}`,
      `Betrag: ${money}${base}`,
      `Bezahlt von: ${input.paidByName}`,
      input.expenseDate ? `Datum: ${input.expenseDate}` : "Datum: -",
      input.placeName ? `Ort: ${input.placeName}` : "Ort: -",
      `Beleg-ID: ${input.expenseId}`,
    ],
    MARGIN,
    y,
    11,
    5
  );

  const img = await embedOptionalPng(pdf, input.aiImagePath);
  if (img) {
    const max = 180;
    const scale = Math.min(max / img.width, max / img.height);
    const w = img.width * scale;
    const h = img.height * scale;
    y -= 12;
    page.drawImage(img, {
      x: MARGIN,
      y: Math.max(MARGIN, y - h),
      width: w,
      height: h,
    });
  }

  page.drawText("FamilyBrain FinanzBrain Beleg", {
    x: MARGIN,
    y: MARGIN - 8,
    size: 9,
    font,
    color: rgb(0.45, 0.5, 0.55),
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
  note: string | null;
  settledAt: string | null;
  settlementId: number;
}): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([PAGE_W, PAGE_H]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let y = PAGE_H - MARGIN;

  page.drawText("FinanzBrain - Rueckzahlung", {
    x: MARGIN,
    y,
    size: 18,
    font: bold,
    color: rgb(0.05, 0.4, 0.38),
  });
  y -= 28;
  y = drawLines(page, font, [`Abrechnung: ${input.ledgerTitle}`], MARGIN, y, 11);
  y -= 8;

  const money = formatMoney(input.amount, input.currency);
  const base =
    input.currency !== input.baseCurrency
      ? ` (${formatMoney(input.amountBase, input.baseCurrency)})`
      : "";

  y = drawLines(
    page,
    bold,
    [`${input.fromName} -> ${input.toName}`],
    MARGIN,
    y,
    16,
    6
  );
  y = drawLines(
    page,
    font,
    [
      `Betrag: ${money}${base}`,
      input.settledAt ? `Datum: ${input.settledAt}` : "Datum: -",
      input.note ? `Notiz: ${input.note}` : "Notiz: -",
      `Beleg-ID: ${input.settlementId}`,
    ],
    MARGIN,
    y,
    11,
    5
  );

  page.drawText("FamilyBrain FinanzBrain Beleg", {
    x: MARGIN,
    y: MARGIN - 8,
    size: 9,
    font,
    color: rgb(0.45, 0.5, 0.55),
  });

  return Buffer.from(await pdf.save());
}
