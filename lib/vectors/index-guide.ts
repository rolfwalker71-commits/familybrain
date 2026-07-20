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
    const chunks = splitTextIntoChunks(guide.extracted_text);
    if (chunks.length === 0) {
      throw new Error("Aus dem PDF konnte kein indexierbarer Text erzeugt werden.");
    }

    const contentHash = hashChunks(chunks);
    await deleteVectorPointsBySource("guide", String(guideId));
    deleteGuideChunks(guideId);

    const vectors = await embedTexts(chunks.map((chunk) => chunk.text));
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
    updateKnowledgeGuideIndexing(guideId, {
      embeddingStatus: "error",
      embeddingError: message,
    });
    throw error;
  }
}
