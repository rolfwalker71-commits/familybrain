import { getDb } from "@/lib/db/client";
import { nowIso } from "@/lib/utils/dates";
import { getDocumentById, getPaperlessSettings } from "@/lib/db/queries";
import {
  createKnowledgeGuide,
  findKnowledgeGuideBySourceDocumentId,
  updateKnowledgeGuideFilePath,
  updateKnowledgeGuideIndexing,
  updateKnowledgeGuideSourceDocument,
} from "@/lib/db/queries";
import { PaperlessClient } from "@/lib/paperless/client";
import { removeKnowledgeGuideFully } from "@/lib/guides/delete-guide";
import { diagnosePdfBuffer, extractTextFromPdf } from "@/lib/guides/extract-pdf";
import {
  ensureGuidesDirectory,
  guideFilePath,
} from "@/lib/guides/storage";
import { indexKnowledgeGuide } from "@/lib/vectors/index-guide";
import {
  MAX_GUIDE_UPLOAD_BYTES,
  sanitizeGuideFilename,
} from "@/lib/guides/import-guide";
import { setDocumentForGuide } from "@/lib/documents/for-guide";
import { createHash } from "crypto";
import fs from "fs";
import path from "path";

export type ImportDocumentAsGuideResult = {
  guideId: number;
  replacedGuideId: number | null;
  pageCount: number;
  chunkCount: number;
  title: string;
};

/** Download Paperless PDF and create/replace a knowledge guide. */
export async function importDocumentAsGuide(input: {
  documentLocalId: number;
  title?: string | null;
  replaceExisting?: boolean;
  /**
   * After import: keep «Für Guide» checked (default).
   * Pass `false` only for rare cases that should leave the flag unchanged.
   */
  markForGuide?: boolean;
  index?: boolean;
}): Promise<ImportDocumentAsGuideResult> {
  const pack = getDocumentById(input.documentLocalId);
  if (!pack?.document) {
    throw Object.assign(new Error("Dokument nicht gefunden."), { status: 404 });
  }
  const doc = pack.document;
  const { baseUrl, apiToken, publicUrl } = getPaperlessSettings();
  if (!baseUrl || !apiToken) {
    throw Object.assign(new Error("Paperless ist nicht konfiguriert."), {
      status: 400,
    });
  }

  const client = new PaperlessClient(baseUrl, apiToken, publicUrl);
  const { buffer, contentType } = await client.downloadDocument(
    doc.paperless_id,
    false
  );
  const buf = Buffer.from(buffer);
  if (buf.byteLength === 0) {
    throw Object.assign(new Error("Leere Datei von Paperless."), { status: 400 });
  }
  if (buf.byteLength > MAX_GUIDE_UPLOAD_BYTES) {
    throw Object.assign(new Error("PDF ist zu gross (max. 500 MB)."), {
      status: 400,
    });
  }
  const type = (contentType || "").toLowerCase();
  if (
    !type.includes("pdf") &&
    buf.subarray(0, 5).toString("utf8") !== "%PDF-"
  ) {
    throw Object.assign(
      new Error("Dokument ist kein PDF — Guides brauchen eine PDF-Datei."),
      { status: 400 }
    );
  }

  const diagnosis = diagnosePdfBuffer(buf, buf.byteLength);
  if (diagnosis) {
    throw Object.assign(new Error(diagnosis), { status: 400 });
  }

  const filename = sanitizeGuideFilename(
    doc.original_file_name ||
      doc.archived_file_name ||
      `paperless-${doc.paperless_id}.pdf`
  );
  const title =
    input.title?.trim() ||
    doc.title?.trim() ||
    filename.replace(/\.pdf$/i, "").replace(/[_-]+/g, " ").trim() ||
    "Guide";

  let replacedGuideId: number | null = null;
  if (input.replaceExisting !== false) {
    const existing = findKnowledgeGuideBySourceDocumentId(doc.id);
    if (existing) {
      await removeKnowledgeGuideFully(existing.id);
      replacedGuideId = existing.id;
    }
  }

  ensureGuidesDirectory();
  const tempPath = path.join(
    ensureGuidesDirectory(),
    `tmp-doc-${doc.id}-${Date.now()}.pdf`
  );
  fs.writeFileSync(tempPath, buf);

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
        "Im PDF wurde kein Text gefunden. Scans ohne OCR werden für Guides nicht unterstützt."
      ),
      { status: 400 }
    );
  }

  const fileHash = createHash("sha256").update(buf).digest("hex");
  const guideId = createKnowledgeGuide({
    title,
    filename,
    filePath: "",
    fileHash,
    pageCount: extracted.pageCount || null,
    extractedText: extracted.text,
    sourceDocumentId: doc.id,
  });

  const finalPath = guideFilePath(guideId, filename);
  fs.writeFileSync(finalPath, buf);
  updateKnowledgeGuideFilePath(guideId, finalPath);
  updateKnowledgeGuideSourceDocument(guideId, doc.id);

  let chunkCount = 0;
  if (input.index !== false) {
    const indexResult = await indexKnowledgeGuide(guideId);
    chunkCount = indexResult.chunkCount;
  } else {
    updateKnowledgeGuideIndexing(guideId, {
      embeddingStatus: "pending",
      embeddingError: null,
    });
  }

  if (input.markForGuide !== false) {
    setDocumentForGuide(doc.id, true);
    try {
      const { writebackStatusFlagsToPaperless } = await import(
        "@/lib/paperless/writeback"
      );
      await writebackStatusFlagsToPaperless({
        localDocumentId: doc.id,
        forGuide: true,
      });
    } catch (err) {
      console.warn(
        "[guides] for_guide writeback:",
        err instanceof Error ? err.message : err
      );
    }
  }

  return {
    guideId,
    replacedGuideId,
    pageCount: extracted.pageCount,
    chunkCount,
    title,
  };
}

export function listPendingGuideDocuments(limit = 40): Array<{
  id: number;
  paperless_id: number;
  title: string | null;
  correspondent_name: string | null;
  created_date: string | null;
  hasGuide: boolean;
}> {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT d.id, d.paperless_id, d.title, d.correspondent_name, d.created_date,
              CASE WHEN g.id IS NOT NULL THEN 1 ELSE 0 END AS has_guide
       FROM paperless_documents d
       LEFT JOIN knowledge_guides g ON g.source_document_id = d.id
       WHERE COALESCE(d.for_guide, 0) = 1
         AND g.id IS NULL
         AND COALESCE(d.sync_status, 'synced') != 'missing'
       ORDER BY d.updated_at DESC
       LIMIT ?`
    )
    .all(limit) as Array<{
    id: number;
    paperless_id: number;
    title: string | null;
    correspondent_name: string | null;
    created_date: string | null;
    has_guide: number;
  }>;
  return rows.map((r) => ({
    id: r.id,
    paperless_id: r.paperless_id,
    title: r.title,
    correspondent_name: r.correspondent_name,
    created_date: r.created_date,
    hasGuide: Boolean(r.has_guide),
  }));
}

export async function importPendingGuideDocuments(options?: {
  limit?: number;
  replaceExisting?: boolean;
}): Promise<{
  processed: number;
  succeeded: number;
  failed: number;
  results: Array<{
    documentId: number;
    ok: boolean;
    guideId?: number;
    error?: string;
  }>;
}> {
  const pending = listPendingGuideDocuments(options?.limit ?? 20);
  const results: Array<{
    documentId: number;
    ok: boolean;
    guideId?: number;
    error?: string;
  }> = [];
  let succeeded = 0;
  let failed = 0;
  for (const row of pending) {
    try {
      const imported = await importDocumentAsGuide({
        documentLocalId: row.id,
        replaceExisting: options?.replaceExisting !== false,
      });
      succeeded += 1;
      results.push({
        documentId: row.id,
        ok: true,
        guideId: imported.guideId,
      });
    } catch (err) {
      failed += 1;
      results.push({
        documentId: row.id,
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return {
    processed: pending.length,
    succeeded,
    failed,
    results,
  };
}
