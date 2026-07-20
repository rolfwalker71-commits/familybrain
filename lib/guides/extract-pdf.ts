import fs from "fs";
import { getPath } from "pdf-parse/worker";
import { PDFParse } from "pdf-parse";

let workerConfigured = false;

function ensurePdfWorker(): void {
  if (workerConfigured) return;
  PDFParse.setWorker(getPath());
  workerConfigured = true;
}

export type PdfExtractionResult = {
  text: string;
  pageCount: number;
};

/** Quick structural checks before invoking pdf.js. */
export function diagnosePdfBuffer(
  buffer: Buffer,
  expectedLength: number | null = null
): string | null {
  if (buffer.length < 8) {
    return "PDF-Datei ist leer oder zu klein.";
  }

  if (buffer.subarray(0, 4).toString("utf8") !== "%PDF") {
    return "Datei sieht nicht wie ein PDF aus (Header fehlt).";
  }

  if (
    expectedLength != null &&
    expectedLength > 0 &&
    buffer.length !== expectedLength
  ) {
    return `Upload unvollständig: ${buffer.length.toLocaleString("de-CH")} von ${expectedLength.toLocaleString("de-CH")} Bytes empfangen (Proxy/Timeout?).`;
  }

  // Many truncated uploads still start with %PDF but never reach the trailer.
  const tail = buffer.subarray(Math.max(0, buffer.length - 2048)).toString("latin1");
  if (!tail.includes("%%EOF")) {
    return `PDF scheint unvollständig (kein %%EOF am Ende, ${(buffer.length / (1024 * 1024)).toFixed(1)} MB empfangen). Oft abgeschnittener Upload hinter dem Proxy.`;
  }

  // Heuristic: encryption dictionary present.
  const head = buffer.subarray(0, Math.min(buffer.length, 512 * 1024)).toString("latin1");
  if (head.includes("/Encrypt")) {
    return "PDF ist verschlüsselt oder passwortgeschützt und kann nicht indexiert werden.";
  }

  return null;
}

export async function extractTextFromPdf(
  filePath: string
): Promise<PdfExtractionResult> {
  ensurePdfWorker();

  const buffer = fs.readFileSync(filePath);
  const diagnosis = diagnosePdfBuffer(buffer);
  if (diagnosis) {
    throw new Error(diagnosis);
  }

  // pdf.js expects a Uint8Array; plain Buffer can fail on some Node builds.
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  try {
    const textResult = await parser.getText();
    const text = textResult.text?.trim() || "";
    const pageCount = textResult.total ?? textResult.pages?.length ?? 0;
    return { text, pageCount };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const lower = message.toLowerCase();
    if (lower.includes("password") || lower.includes("encrypted")) {
      throw new Error(
        "PDF ist verschlüsselt oder passwortgeschützt und kann nicht indexiert werden."
      );
    }
    if (lower.includes("invalid pdf") || lower.includes("invalidpdf")) {
      throw new Error(
        "PDF-Struktur ungültig (Invalid PDF structure). Datei lokal in einem PDF-Reader öffnen und ggf. neu speichern/exportieren. Falls der Upload abgeschnitten wurde: in NPM Timeouts erhöhen (`proxy_read_timeout 300s`) und erneut versuchen."
      );
    }
    throw error instanceof Error ? error : new Error(message);
  } finally {
    await parser.destroy();
  }
}
