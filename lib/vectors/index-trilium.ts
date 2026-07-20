import { nowIso } from "@/lib/utils/dates";
import { hashContent } from "@/lib/utils/hash";
import {
  getTriliumNoteById,
  getTriliumScopeLabel,
  listTriliumNotesNeedingEmbedding,
  updateTriliumNoteEmbedding,
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

export async function indexTriliumNote(noteId: string): Promise<{
  chunkCount: number;
  skipped: boolean;
}> {
  const note = getTriliumNoteById(noteId);
  if (!note || note.sync_status !== "synced") {
    throw new Error(`Trilium-Notiz ${noteId} nicht gefunden.`);
  }

  const text = (note.content_text || "").trim();
  if (!text || note.is_protected) {
    await deleteVectorPointsBySource("trilium", noteId);
    updateTriliumNoteEmbedding(noteId, {
      embeddingStatus: "skipped",
      embeddingError: null,
      lastIndexedAt: nowIso(),
    });
    return { chunkCount: 0, skipped: true };
  }

  updateTriliumNoteEmbedding(noteId, {
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
      await deleteVectorPointsBySource("trilium", noteId);
      updateTriliumNoteEmbedding(noteId, {
        embeddingStatus: "skipped",
        embeddingError: null,
        lastIndexedAt: nowIso(),
      });
      return { chunkCount: 0, skipped: true };
    }

    await deleteVectorPointsBySource("trilium", noteId);
    const vectors = await embedTexts(chunks.map((chunk) => chunk.text));
    if (vectors.length !== chunks.length) {
      throw new Error(
        `Embedding-Anzahl stimmt nicht (${vectors.length}/${chunks.length}).`
      );
    }

    const embeddedAt = nowIso();
    const scopeLabel = getTriliumScopeLabel(note.scope);
    const title = note.title || "Ohne Titel";

    const points = chunks.map((chunk, index) => {
      const payload: VectorChunkPayload = {
        source_type: "trilium",
        source_id: noteId,
        chunk_index: chunk.index,
        title,
        text: chunk.text,
        content_hash: hashContent(chunk.text),
        scope_label: scopeLabel,
        url: note.trilium_url,
        embedded_at: embeddedAt,
      };
      return {
        sourceType: "trilium" as const,
        sourceId: noteId,
        chunkIndex: chunk.index,
        vector: vectors[index],
        payload,
        qdrantPointId: buildVectorPointId("trilium", noteId, chunk.index),
      };
    });

    await upsertVectorPoints(points);

    updateTriliumNoteEmbedding(noteId, {
      embeddingStatus: "indexed",
      embeddingError: null,
      lastIndexedAt: embeddedAt,
    });

    return { chunkCount: chunks.length, skipped: false };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    updateTriliumNoteEmbedding(noteId, {
      embeddingStatus: "error",
      embeddingError: message,
    });
    throw error;
  }
}

export type TriliumIndexBatchResult = {
  processed: number;
  indexed: number;
  skipped: number;
  errors: number;
  errorMessages: string[];
};

export async function indexPendingTriliumNotes(options?: {
  limit?: number;
  onProgress?: (processed: number, total: number) => void;
}): Promise<TriliumIndexBatchResult> {
  if (!hasOpenAIKey()) {
    return {
      processed: 0,
      indexed: 0,
      skipped: 0,
      errors: 0,
      errorMessages: ["OpenAI API-Key fehlt."],
    };
  }

  const limit = options?.limit ?? 80;
  const pending = listTriliumNotesNeedingEmbedding(limit);
  const result: TriliumIndexBatchResult = {
    processed: 0,
    indexed: 0,
    skipped: 0,
    errors: 0,
    errorMessages: [],
  };

  for (const note of pending) {
    try {
      const outcome = await indexTriliumNote(note.note_id);
      if (outcome.skipped) result.skipped += 1;
      else result.indexed += 1;
    } catch (error) {
      result.errors += 1;
      const message = error instanceof Error ? error.message : String(error);
      result.errorMessages.push(`${note.note_id}: ${message}`);
    }
    result.processed += 1;
    options?.onProgress?.(result.processed, pending.length);
  }

  return result;
}

export async function removeTriliumNoteVectors(noteId: string): Promise<void> {
  await deleteVectorPointsBySource("trilium", noteId);
  updateTriliumNoteEmbedding(noteId, {
    embeddingStatus: "skipped",
    embeddingError: null,
    lastIndexedAt: nowIso(),
  });
}
