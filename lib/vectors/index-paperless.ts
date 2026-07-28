import { nowIso } from "@/lib/utils/dates";
import { hashContent } from "@/lib/utils/hash";
import { getDb } from "@/lib/db/client";
import {
  listDocumentsNeedingEmbedding,
  updateDocumentEmbeddingStatus,
} from "@/lib/db/queries";
import { hasOpenAIKey } from "@/lib/ai/client";
import { splitTextIntoChunks } from "@/lib/vectors/chunking";
import {
  deleteVectorPointsBySource,
  upsertVectorPoints,
} from "@/lib/vectors/client";
import { embedTexts } from "@/lib/vectors/embeddings";
import { buildVectorPointId } from "@/lib/vectors/point-id";
import type { VectorChunkPayload } from "@/lib/vectors/types";

function sanitizeChunkText(text: string): string {
  return text
    .replace(/\u0000/g, "")
    .replace(/[\uD800-\uDFFF]/g, "")
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, " ")
    .trim();
}

function buildPaperlessIndexText(doc: {
  title: string | null;
  content: string | null;
  correspondent_name: string | null;
  short_summary: string | null;
  detailed_summary: string | null;
  important_points: string | null;
  category: string | null;
}): string {
  const points = (() => {
    try {
      const parsed = JSON.parse(doc.important_points || "[]") as unknown;
      return Array.isArray(parsed)
        ? parsed.map((p) => String(p)).filter(Boolean).join("\n- ")
        : "";
    } catch {
      return "";
    }
  })();

  const parts = [
    doc.title ? `Titel: ${doc.title}` : null,
    doc.correspondent_name ? `Korrespondent: ${doc.correspondent_name}` : null,
    doc.category ? `Kategorie: ${doc.category}` : null,
    doc.short_summary ? `Kurz: ${doc.short_summary}` : null,
    doc.detailed_summary ? `Detail: ${doc.detailed_summary}` : null,
    points ? `Punkte:\n- ${points}` : null,
    // OCR truncated — summaries carry the semantic signal; keep some raw context
    doc.content
      ? `OCR:\n${doc.content.slice(0, 12000)}`
      : null,
  ].filter(Boolean);

  return parts.join("\n\n");
}

export async function indexPaperlessDocument(documentId: number): Promise<{
  chunkCount: number;
  skipped: boolean;
}> {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT d.id, d.title, d.content, d.correspondent_name, d.paperless_id,
              s.short_summary, s.detailed_summary, s.important_points, s.category,
              s.analysis_status
       FROM paperless_documents d
       LEFT JOIN document_summaries s ON s.document_id = d.id
       WHERE d.id = ?`
    )
    .get(documentId) as
    | {
        id: number;
        title: string | null;
        content: string | null;
        correspondent_name: string | null;
        paperless_id: number;
        short_summary: string | null;
        detailed_summary: string | null;
        important_points: string | null;
        category: string | null;
        analysis_status: string | null;
      }
    | undefined;

  if (!row) throw new Error(`Dokument ${documentId} nicht gefunden.`);

  const text = buildPaperlessIndexText(row).trim();
  if (!text || row.analysis_status !== "completed") {
    await deleteVectorPointsBySource("paperless", String(documentId));
    updateDocumentEmbeddingStatus(documentId, {
      embeddingStatus: "skipped",
      embeddingError: null,
      lastIndexedAt: nowIso(),
    });
    return { chunkCount: 0, skipped: true };
  }

  updateDocumentEmbeddingStatus(documentId, {
    embeddingStatus: "indexing",
    embeddingError: null,
  });

  try {
    const rawChunks = splitTextIntoChunks(text);
    const chunks = rawChunks
      .map((chunk) => ({ ...chunk, text: sanitizeChunkText(chunk.text) }))
      .filter((chunk) => chunk.text.length > 0)
      .map((chunk, index) => ({ ...chunk, index }));

    if (chunks.length === 0) {
      await deleteVectorPointsBySource("paperless", String(documentId));
      updateDocumentEmbeddingStatus(documentId, {
        embeddingStatus: "skipped",
        embeddingError: null,
        lastIndexedAt: nowIso(),
      });
      return { chunkCount: 0, skipped: true };
    }

    await deleteVectorPointsBySource("paperless", String(documentId));
    const vectors = await embedTexts(chunks.map((chunk) => chunk.text));
    if (vectors.length !== chunks.length) {
      throw new Error(
        `Embedding-Anzahl stimmt nicht (${vectors.length}/${chunks.length}).`
      );
    }

    const embeddedAt = nowIso();
    const sourceId = String(documentId);
    const title = row.title || "Ohne Titel";

    const points = chunks.map((chunk, index) => {
      const payload: VectorChunkPayload = {
        source_type: "paperless",
        source_id: sourceId,
        chunk_index: chunk.index,
        title,
        text: chunk.text,
        content_hash: hashContent(chunk.text),
        category: row.category,
        url: `/documents/${documentId}`,
        embedded_at: embeddedAt,
      };
      return {
        sourceType: "paperless" as const,
        sourceId,
        chunkIndex: chunk.index,
        vector: vectors[index],
        payload,
        qdrantPointId: buildVectorPointId("paperless", sourceId, chunk.index),
      };
    });

    await upsertVectorPoints(points);
    updateDocumentEmbeddingStatus(documentId, {
      embeddingStatus: "indexed",
      embeddingError: null,
      lastIndexedAt: embeddedAt,
    });
    return { chunkCount: chunks.length, skipped: false };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    updateDocumentEmbeddingStatus(documentId, {
      embeddingStatus: "error",
      embeddingError: message,
    });
    throw error;
  }
}

export async function indexPendingPaperlessDocuments(options?: {
  limit?: number;
  onProgress?: (processed: number) => void;
}): Promise<{
  processed: number;
  indexed: number;
  skipped: number;
  errors: number;
  errorMessages: string[];
}> {
  if (!hasOpenAIKey()) {
    return {
      processed: 0,
      indexed: 0,
      skipped: 0,
      errors: 0,
      errorMessages: ["OpenAI API-Key fehlt."],
    };
  }

  const ids = listDocumentsNeedingEmbedding(options?.limit ?? 40);
  let indexed = 0;
  let skipped = 0;
  let errors = 0;
  const errorMessages: string[] = [];

  for (let i = 0; i < ids.length; i++) {
    try {
      const result = await indexPaperlessDocument(ids[i]);
      if (result.skipped) skipped += 1;
      else indexed += 1;
    } catch (error) {
      errors += 1;
      errorMessages.push(
        `#${ids[i]}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
    options?.onProgress?.(i + 1);
  }

  return {
    processed: ids.length,
    indexed,
    skipped,
    errors,
    errorMessages,
  };
}

/** Mark embedding stale so the next job reindexes after re-analysis. */
export function markPaperlessEmbeddingPending(documentId: number): void {
  updateDocumentEmbeddingStatus(documentId, {
    embeddingStatus: "pending",
    embeddingError: null,
  });
}
