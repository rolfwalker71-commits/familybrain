import { nowIso } from "@/lib/utils/dates";
import { hashContent } from "@/lib/utils/hash";
import {
  deleteGuideChunks,
  getKnowledgeGuideById,
  replaceGuideChunks,
  updateKnowledgeGuideIndexing,
} from "@/lib/db/queries";
import { splitTextIntoChunks, hashChunks } from "@/lib/vectors/chunking";
import {
  deleteVectorPointsBySource,
  upsertVectorPoints,
} from "@/lib/vectors/client";
import { embedTexts } from "@/lib/vectors/embeddings";
import { buildVectorPointId } from "@/lib/vectors/point-id";
import type { VectorChunkPayload } from "@/lib/vectors/types";

export async function indexKnowledgeGuide(guideId: number): Promise<{
  chunkCount: number;
}> {
  const guide = getKnowledgeGuideById(guideId);
  if (!guide) {
    throw new Error(`Guide ${guideId} nicht gefunden.`);
  }
  if (!guide.extracted_text?.trim()) {
    throw new Error("Guide enthält keinen extrahierbaren Text.");
  }

  updateKnowledgeGuideIndexing(guideId, {
    embeddingStatus: "indexing",
    embeddingError: null,
  });

  try {
    const rawChunks = splitTextIntoChunks(guide.extracted_text);
    const chunks = rawChunks
      .map((chunk) => ({
        ...chunk,
        text: chunk.text
          .replace(/\u0000/g, "")
          .replace(/[\uD800-\uDFFF]/g, "")
          .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, " ")
          .trim(),
      }))
      .filter((chunk) => chunk.text.length > 0)
      .map((chunk, index) => ({ ...chunk, index }));

    if (chunks.length === 0) {
      throw new Error("Aus dem PDF konnte kein indexierbarer Text erzeugt werden.");
    }

    console.info(
      `[guides] indexing guide=${guideId} chunks=${chunks.length} chars=${guide.extracted_text.length}`
    );

    const contentHash = hashChunks(chunks);
    await deleteVectorPointsBySource("guide", String(guideId));
    deleteGuideChunks(guideId);

    const vectors = await embedTexts(chunks.map((chunk) => chunk.text));
    if (vectors.length !== chunks.length) {
      throw new Error(
        `Embedding-Anzahl stimmt nicht (${vectors.length} Vektoren für ${chunks.length} Chunks).`
      );
    }

    const embeddedAt = nowIso();
    const sourceId = String(guideId);

    const points = chunks.map((chunk, index) => {
      const payload: VectorChunkPayload = {
        source_type: "guide",
        source_id: sourceId,
        chunk_index: chunk.index,
        title: guide.title,
        text: chunk.text,
        content_hash: hashContent(chunk.text),
        page_start: chunk.pageStart ?? null,
        page_end: chunk.pageEnd ?? null,
        url: `/guides#guide-${guideId}`,
        embedded_at: embeddedAt,
      };

      return {
        sourceType: "guide" as const,
        sourceId,
        chunkIndex: chunk.index,
        vector: vectors[index],
        payload,
        qdrantPointId: buildVectorPointId("guide", sourceId, chunk.index),
      };
    });

    await upsertVectorPoints(points);
    replaceGuideChunks(
      guideId,
      points.map((point) => ({
        chunkIndex: point.chunkIndex,
        chunkText: point.payload.text,
        contentHash: point.payload.content_hash,
        qdrantPointId: point.qdrantPointId,
        pageStart: point.payload.page_start ?? null,
        pageEnd: point.payload.page_end ?? null,
      }))
    );

    updateKnowledgeGuideIndexing(guideId, {
      contentHash,
      embeddingStatus: "indexed",
      embeddingError: null,
      lastIndexedAt: embeddedAt,
    });

    return { chunkCount: chunks.length };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[guides] indexing failed guide=${guideId}:`, message);
    updateKnowledgeGuideIndexing(guideId, {
      embeddingStatus: "error",
      embeddingError: message,
    });
    throw error;
  }
}
