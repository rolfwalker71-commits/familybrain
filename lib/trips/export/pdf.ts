import fs from "fs";
import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFPage,
} from "pdf-lib";
import { PaperlessClient } from "@/lib/paperless/client";
import { getPaperlessSettings } from "@/lib/db/queries";
import { toSwissDate, toTimeInputValue } from "@/lib/utils/dates";
import type {
  TripExportEvent,
  TripExportModel,
} from "@/lib/trips/export/model";
import { claimDocumentNotesForExport } from "@/lib/trips/export/document-notes";

const MARGIN = 48;
const PAGE_W = 595.28; // A4
const PAGE_H = 841.89;

async function embedImageFile(
  pdf: PDFDocument,
  filePath: string | null
): Promise<Awaited<ReturnType<PDFDocument["embedJpg"]>> | null> {
  if (!filePath || !fs.existsSync(filePath)) return null;
  const bytes = fs.readFileSync(filePath);
  const lower = filePath.toLowerCase();
  try {
    if (lower.endsWith(".png")) return await pdf.embedPng(bytes);
    return await pdf.embedJpg(bytes);
  } catch {
    try {
      return await pdf.embedPng(bytes);
    } catch {
      return null;
    }
  }
}

function wrapText(
  text: string,
  font: PDFFont,
  size: number,
  maxWidth: number
): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) <= maxWidth) {
      current = next;
    } else {
      if (current) lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [""];
}

/** Helvetica/WinAnsi can't encode arrows, emoji, etc. — map or drop them. */
function toPdfSafeText(raw: string): string {
  const mapped = raw
    .replace(/\u2192/g, "->") // →
    .replace(/\u2190/g, "<-") // ←
    .replace(/\u2194/g, "<->") // ↔
    .replace(/\u21D2/g, "=>") // ⇒
    .replace(/\u00A0/g, " ")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\u2026/g, "...")
    .replace(/\u2022/g, "-")
    .replace(/\u00B7/g, "-")
    // emoji + variation selectors / ZWJ sequences
    .replace(/\p{Extended_Pictographic}\s*/gu, "")
    .replace(/[\uFE0E\uFE0F\u200D]/g, "")
    .replace(/[\u{1F3FB}-\u{1F3FF}]/gu, ""); // skin tones

  let out = "";
  for (const ch of mapped) {
    const code = ch.codePointAt(0) ?? 0;
    // Drop leftover chars outside Latin-1; keep en/em dash via Latin-1 proxies
    if (code === 0x2013 || code === 0x2014) {
      out += "-";
      continue;
    }
    if (code > 0xff) continue;
    out += ch;
  }
  return out.replace(/[ \t]{2,}/g, " ").trim();
}

type DrawCtx = {
  pdf: PDFDocument;
  page: PDFPage;
  font: PDFFont;
  fontBold: PDFFont;
  y: number;
};

function ensureSpace(ctx: DrawCtx, need: number) {
  if (ctx.y - need < MARGIN) {
    ctx.page = ctx.pdf.addPage([PAGE_W, PAGE_H]);
    ctx.y = PAGE_H - MARGIN;
  }
}

function drawLine(
  ctx: DrawCtx,
  text: string,
  opts?: { bold?: boolean; size?: number; color?: ReturnType<typeof rgb> }
) {
  const size = opts?.size ?? 11;
  const font = opts?.bold ? ctx.fontBold : ctx.font;
  const color = opts?.color ?? rgb(0.12, 0.12, 0.12);
  const maxW = PAGE_W - MARGIN * 2;
  const safe = toPdfSafeText(text);
  if (!safe.trim()) return;
  const lines = wrapText(safe, font, size, maxW);
  for (const line of lines) {
    ensureSpace(ctx, size + 4);
    ctx.page.drawText(line, {
      x: MARGIN,
      y: ctx.y - size,
      size,
      font,
      color,
    });
    ctx.y -= size + 4;
  }
}

function eventWhen(event: TripExportEvent): string {
  const start = event.start_date ? toSwissDate(event.start_date) : "";
  const end =
    event.end_date && event.end_date !== event.start_date
      ? ` – ${toSwissDate(event.end_date)}`
      : "";
  const st = toTimeInputValue(event.start_time);
  const et = toTimeInputValue(event.end_time);
  const times =
    st || et ? ` · ${[st, et].filter(Boolean).join(" – ")}` : "";
  return `${start}${end}${times}`.trim() || "ohne Datum";
}

function detailLines(event: TripExportEvent): string[] {
  const pairs: Array<[string, string | null | undefined]> = [
    ["Ort", event.place_name || event.location],
    [
      "Route",
      event.origin_place || event.destination_place
        ? `${event.origin_place || "—"} → ${event.destination_place || "—"}`
        : event.departure_airport || event.arrival_airport
          ? `${event.departure_airport || "—"} → ${event.arrival_airport || "—"}`
          : null,
    ],
    ["Adresse", event.address],
    ["Anbieter", event.provider],
    ["Buchung", event.booking_reference],
    ["Flugnr.", event.flight_number],
    ["Airline", event.airline],
    [
      "Flugzeug",
      [event.aircraft_type, event.aircraft_reg].filter(Boolean).join(" · ") ||
        null,
    ],
    [
      "Abflug",
      [
        event.departure_terminal ? `Terminal ${event.departure_terminal}` : null,
        event.departure_gate ? `Gate ${event.departure_gate}` : null,
        event.check_in_desk ? `Check-in ${event.check_in_desk}` : null,
      ]
        .filter(Boolean)
        .join(" · ") || null,
    ],
    [
      "Ankunft",
      [
        event.arrival_terminal ? `Terminal ${event.arrival_terminal}` : null,
        event.arrival_gate ? `Gate ${event.arrival_gate}` : null,
        event.baggage_belt ? `Gepäck ${event.baggage_belt}` : null,
      ]
        .filter(Boolean)
        .join(" · ") || null,
    ],
    [
      "Dauer",
      event.duration_minutes != null ? `${event.duration_minutes} Min.` : null,
    ],
    ["Telefon", event.phone],
    ["Web", event.website],
    ["Notizen", event.notes],
  ];
  return pairs
    .filter(([, v]) => Boolean(v && String(v).trim()))
    .map(([k, v]) => `${k}: ${v}`);
}

async function drawEmbeddedImage(
  ctx: DrawCtx,
  filePath: string | null,
  maxH = 160
) {
  const img = await embedImageFile(ctx.pdf, filePath);
  if (!img) return;
  const maxW = PAGE_W - MARGIN * 2;
  const scale = Math.min(maxW / img.width, maxH / img.height, 1);
  const w = img.width * scale;
  const h = img.height * scale;
  ensureSpace(ctx, h + 12);
  ctx.y -= h + 8;
  ctx.page.drawImage(img, {
    x: MARGIN,
    y: ctx.y,
    width: w,
    height: h,
  });
  ctx.y -= 8;
}

export async function buildTripPdfBuffer(
  model: TripExportModel
): Promise<{ bytes: Uint8Array; missingBelege: string[] }> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);

  let page = pdf.addPage([PAGE_W, PAGE_H]);
  const ctx: DrawCtx = {
    pdf,
    page,
    font,
    fontBold,
    y: PAGE_H - MARGIN,
  };

  // Cover / title
  if (model.coverPath) {
    await drawEmbeddedImage(ctx, model.coverPath, 200);
  }
  drawLine(ctx, "TravelBrain", {
    size: 10,
    color: rgb(0.35, 0.35, 0.4),
  });
  ctx.y -= 4;
  drawLine(ctx, model.trip.title, { bold: true, size: 22 });
  if (model.trip.destination) {
    drawLine(ctx, model.trip.destination, { size: 13 });
  }
  drawLine(ctx, `${model.dateRangeLabel} · ${model.statusLabel}`, {
    size: 11,
    color: rgb(0.35, 0.35, 0.35),
  });
  if (model.trip.summary) {
    ctx.y -= 6;
    drawLine(ctx, model.trip.summary, { size: 11 });
  }
  if (model.trip.notes) {
    ctx.y -= 4;
    drawLine(ctx, model.trip.notes, {
      size: 10,
      color: rgb(0.4, 0.4, 0.4),
    });
  }

  ctx.y -= 12;
  ensureSpace(ctx, 20);
  ctx.page.drawLine({
    start: { x: MARGIN, y: ctx.y },
    end: { x: PAGE_W - MARGIN, y: ctx.y },
    thickness: 1,
    color: rgb(0.8, 0.8, 0.8),
  });
  ctx.y -= 16;

  const seenNoteDocIds = new Set<number>();
  const seenNotesMd = new Set<string>();

  for (const event of model.events) {
    ensureSpace(ctx, 80);
    drawLine(ctx, event.event_type.toUpperCase(), {
      size: 9,
      bold: true,
      color: rgb(0.15, 0.4, 0.85),
    });
    drawLine(ctx, event.title, { bold: true, size: 14 });
    drawLine(ctx, eventWhen(event), {
      size: 10,
      color: rgb(0.4, 0.4, 0.4),
    });
    for (const line of detailLines(event)) {
      drawLine(ctx, line, { size: 10 });
    }
    const docs = event.documents || [];
    if (docs.length) {
      drawLine(
        ctx,
        `Belege: ${docs.map((d) => d.title || `#${d.id}`).join(", ")}`,
        { size: 9, color: rgb(0.35, 0.35, 0.35) }
      );
    }
    if (claimDocumentNotesForExport(event, seenNoteDocIds, seenNotesMd)) {
      drawLine(ctx, "Beleg-Details", {
        bold: true,
        size: 10,
        color: rgb(0.25, 0.25, 0.3),
      });
      const plain = (event.document_notes_md || "")
        .replace(/^#+\s*/gm, "")
        .replace(/\*\*/g, "")
        .replace(/\*/g, "")
        .replace(/\|/g, " ")
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean);
      for (const line of plain.slice(0, 40)) {
        drawLine(ctx, line, { size: 9, color: rgb(0.3, 0.3, 0.3) });
      }
      if (plain.length > 40) {
        drawLine(ctx, "…", { size: 9, color: rgb(0.5, 0.5, 0.5) });
      }
    }
    if (event.aircraft_file_exists) {
      await drawEmbeddedImage(ctx, event.aircraft_image_path, 120);
    }
    if (event.ai_file_exists) {
      await drawEmbeddedImage(ctx, event.ai_image_path, 96);
    }
    if (event.map_file_exists) {
      await drawEmbeddedImage(ctx, event.map_image_path, 140);
    }
    ctx.y -= 10;
  }

  const missingBelege: string[] = [];

  if (model.documents.length > 0) {
    ensureSpace(ctx, 40);
    drawLine(ctx, "Belege (Anhang)", { bold: true, size: 14 });
    drawLine(
      ctx,
      `${model.documents.length} Dokument(e) — jedes nur einmal angehängt.`,
      { size: 10, color: rgb(0.4, 0.4, 0.4) }
    );
  }

  // Append unique Paperless PDFs
  const { baseUrl, apiToken } = getPaperlessSettings();
  if (model.documents.length > 0 && baseUrl && apiToken) {
    const client = new PaperlessClient(baseUrl, apiToken);
    for (const doc of model.documents) {
      try {
        const { buffer, contentType } = await client.downloadDocument(
          doc.paperless_id
        );
        if (!contentType.includes("pdf") && !contentType.includes("octet")) {
          missingBelege.push(
            `${doc.title || `#${doc.id}`} (kein PDF: ${contentType})`
          );
          continue;
        }
        const attached = await PDFDocument.load(buffer, {
          ignoreEncryption: true,
        });
        const pages = await pdf.copyPages(
          attached,
          attached.getPageIndices()
        );
        for (const p of pages) pdf.addPage(p);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        missingBelege.push(`${doc.title || `#${doc.id}`} (${msg})`);
      }
    }
  } else if (model.documents.length > 0) {
    for (const doc of model.documents) {
      missingBelege.push(
        `${doc.title || `#${doc.id}`} (Paperless nicht konfiguriert)`
      );
    }
  }

  if (missingBelege.length > 0) {
    ctx.page = pdf.addPage([PAGE_W, PAGE_H]);
    ctx.y = PAGE_H - MARGIN;
    drawLine(ctx, "Hinweise zu Belegen", { bold: true, size: 14 });
    for (const note of missingBelege) {
      drawLine(ctx, `• ${note}`, { size: 10 });
    }
  }

  const bytes = await pdf.save();
  return { bytes, missingBelege };
}
