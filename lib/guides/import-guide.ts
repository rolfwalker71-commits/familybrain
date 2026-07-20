import fs from "fs";
import path from "path";
import { createHash, randomUUID } from "crypto";
import {
  createKnowledgeGuide,
  findKnowledgeGuideByFilename,
  findKnowledgeGuideByTitle,
  updateKnowledgeGuideFilePath,
} from "@/lib/db/queries";
import { removeKnowledgeGuideFully } from "@/lib/guides/delete-guide";
import { diagnosePdfBuffer, extractTextFromPdf } from "@/lib/guides/extract-pdf";
import {
  ensureGuidesDirectory,
  getGuidesDirectory,
  guideFilePath,
} from "@/lib/guides/storage";
import { indexKnowledgeGuide } from "@/lib/vectors/index-guide";

export const MAX_GUIDE_UPLOAD_BYTES = 50 * 1024 * 1024;
/** Stay under common ~10 MB reverse-proxy cuts. */
export const GUIDE_UPLOAD_CHUNK_BYTES = 8 * 1024 * 1024;

export function sanitizeGuideFilename(name: string): string {
  return path.basename(name).replace(/[^a-zA-Z0-9._-]+/g, "_");
}

export function getGuideUploadsDirectory(): string {
  const dir = path.join(getGuidesDirectory(), "_uploads");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function createGuideUploadId(): string {
  return randomUUID().replace(/-/g, "");
}

export function isValidGuideUploadId(id: string): boolean {
  return /^[a-f0-9]{32}$/i.test(id);
}

export function guideUploadPartPath(uploadId: string, chunkIndex: number): string {
  return path.join(getGuideUploadsDirectory(), `${uploadId}.${chunkIndex}.part`);
}

export function guideUploadAssembledPath(uploadId: string): string {
  return path.join(getGuideUploadsDirectory(), `${uploadId}.pdf`);
}

export function cleanupGuideUpload(uploadId: string, chunkCount?: number): void {
  const dir = getGuideUploadsDirectory();
  try {
    fs.unlinkSync(guideUploadAssembledPath(uploadId));
  } catch {
    /* ignore */
  }
  const max = chunkCount ?? 64;
  for (let i = 0; i < max; i++) {
    try {
      fs.unlinkSync(guideUploadPartPath(uploadId, i));
    } catch {
      /* ignore */
    }
  }
  // Also remove any leftover meta file
  try {
    fs.unlinkSync(path.join(dir, `${uploadId}.meta.json`));
  } catch {
    /* ignore */
  }
}

export type ImportGuideInput = {
  buffer: Buffer;
  filename: string;
  titleInput: string;
  replaceExisting: boolean;
  /** When set, diagnose against this expected full size. */
  expectedLength?: number | null;
};

export type ImportGuideResult = {
  guideId: number;
  replacedGuideId: number | null;
  chunkCount: number;
  pageCount: number;
};

export async function importGuideFromPdfBuffer(
  input: ImportGuideInput
): Promise<ImportGuideResult> {
  const filename = sanitizeGuideFilename(input.filename || "guide.pdf");
  const buffer = input.buffer;

  if (buffer.length === 0) {
    throw Object.assign(new Error("PDF-Datei fehlt."), { status: 400 });
  }
  if (buffer.length > MAX_GUIDE_UPLOAD_BYTES) {
    throw Object.assign(new Error("PDF ist zu gross (max. 50 MB)."), {
      status: 400,
    });
  }

  const diagnosis = diagnosePdfBuffer(
    buffer,
    input.expectedLength != null && input.expectedLength > 0
      ? input.expectedLength
      : null
  );
  if (diagnosis) {
    throw Object.assign(new Error(diagnosis), { status: 400 });
  }

  const title =
    input.titleInput.trim() ||
    filename.replace(/\.pdf$/i, "").replace(/[_-]+/g, " ").trim() ||
    "Guide";

  let replacedGuideId: number | null = null;
  if (input.replaceExisting) {
    const existing =
      findKnowledgeGuideByFilename(filename) ??
      (input.titleInput.trim() ? findKnowledgeGuideByTitle(title) : null);
    if (existing) {
      await removeKnowledgeGuideFully(existing.id);
      replacedGuideId = existing.id;
    }
  }

  const fileHash = createHash("sha256").update(buffer).digest("hex");

  ensureGuidesDirectory();
  const tempPath = path.join(
    ensureGuidesDirectory(),
    `tmp-${Date.now()}-${filename}`
  );
  fs.writeFileSync(tempPath, buffer);

  let extracted;
  try {
    extracted = await extractTextFromPdf(tempPath);
  } finally {
    try {
      fs.unlinkSync(tempPath);
    } catch {
      /* ignore */
    }
  }

  if (!extracted.text.trim()) {
    throw Object.assign(
      new Error(
        "Im PDF wurde kein Text gefunden. Scans oder bildlastige PDFs werden aktuell nicht unterstützt."
      ),
      { status: 400 }
    );
  }

  const guideId = createKnowledgeGuide({
    title,
    filename,
    filePath: "",
    fileHash,
    pageCount: extracted.pageCount || null,
    extractedText: extracted.text,
  });

  const finalPath = guideFilePath(guideId, filename);
  fs.writeFileSync(finalPath, buffer);
  updateKnowledgeGuideFilePath(guideId, finalPath);

  const indexResult = await indexKnowledgeGuide(guideId);

  return {
    guideId,
    replacedGuideId,
    chunkCount: indexResult.chunkCount,
    pageCount: extracted.pageCount,
  };
}

export function assembleGuideUploadParts(
  uploadId: string,
  chunkCount: number,
  expectedTotalBytes: number
): Buffer {
  const parts: Buffer[] = [];
  let total = 0;
  for (let i = 0; i < chunkCount; i++) {
    const partPath = guideUploadPartPath(uploadId, i);
    if (!fs.existsSync(partPath)) {
      throw Object.assign(
        new Error(`Upload-Chunk ${i + 1}/${chunkCount} fehlt.`),
        { status: 400 }
      );
    }
    const part = fs.readFileSync(partPath);
    parts.push(part);
    total += part.length;
  }

  if (expectedTotalBytes > 0 && total !== expectedTotalBytes) {
    throw Object.assign(
      new Error(
        `Upload unvollständig nach Zusammensetzen: ${total.toLocaleString("de-CH")} von ${expectedTotalBytes.toLocaleString("de-CH")} Bytes.`
      ),
      { status: 400 }
    );
  }

  return Buffer.concat(parts, total);
}
