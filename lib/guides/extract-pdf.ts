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

export async function extractTextFromPdf(
  filePath: string
): Promise<PdfExtractionResult> {
  ensurePdfWorker();

  const buffer = fs.readFileSync(filePath);
  const parser = new PDFParse({ data: buffer });
  try {
    const textResult = await parser.getText();
    const text = textResult.text?.trim() || "";
    const pageCount = textResult.total ?? textResult.pages?.length ?? 0;
    return { text, pageCount };
  } finally {
    await parser.destroy();
  }
}
