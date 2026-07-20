import { getOpenAIClient } from "@/lib/ai/client";
import { getOpenAIEmbeddingModel } from "@/lib/ai/embeddings";
import { EMBEDDING_DIMENSIONS } from "./constants";

/** Keep batches small — large PDF extracts can contain awkward tokens. */
const EMBED_BATCH_SIZE = 32;
/** Hard cap below model context; chunking should already be ~1000 chars. */
const MAX_EMBED_CHARS = 6000;

function sanitizeEmbeddingText(text: string): string {
  return text
    .replace(/\u0000/g, "")
    .replace(/[\uD800-\uDFFF]/g, "") // lone surrogates
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_EMBED_CHARS);
}

function formatEmbeddingError(error: unknown, batchOffset: number): Error {
  const anyErr = error as {
    message?: string;
    status?: number;
    code?: string | null;
    type?: string;
    param?: string;
    error?: unknown;
  };

  const nested =
    anyErr?.error && typeof anyErr.error === "object"
      ? (anyErr.error as { message?: string; code?: string; type?: string })
      : null;

  const detail =
    (typeof nested?.message === "string" && nested.message) ||
    (typeof anyErr?.message === "string" && anyErr.message) ||
    (error instanceof Error ? error.message : String(error));

  const parts = [
    `OpenAI Embedding fehlgeschlagen (Batch ab Chunk ${batchOffset})`,
    anyErr?.status ? `HTTP ${anyErr.status}` : null,
    nested?.type || anyErr?.type || null,
    nested?.code || anyErr?.code || null,
    detail,
  ].filter(Boolean);

  return new Error(parts.join(" — "));
}

export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];

  const client = getOpenAIClient();
  const model = getOpenAIEmbeddingModel();
  const vectors: number[][] = [];

  const cleaned = texts.map((text, index) => {
    const value = sanitizeEmbeddingText(text);
    // OpenAI rejects empty strings in the input array.
    return value || `[chunk ${index + 1}]`;
  });

  for (let offset = 0; offset < cleaned.length; offset += EMBED_BATCH_SIZE) {
    const batch = cleaned.slice(offset, offset + EMBED_BATCH_SIZE);
    try {
      const response = await client.embeddings.create({
        model,
        input: batch,
      });

      const sorted = [...response.data].sort((a, b) => a.index - b.index);
      if (sorted.length !== batch.length) {
        throw new Error(
          `Embedding-Antwort unvollständig (${sorted.length}/${batch.length}).`
        );
      }
      for (const item of sorted) {
        if (item.embedding.length !== EMBEDDING_DIMENSIONS) {
          throw new Error(
            `Unerwartete Embedding-Dimension (${item.embedding.length}, erwartet ${EMBEDDING_DIMENSIONS}).`
          );
        }
        vectors.push(item.embedding);
      }
    } catch (error) {
      throw formatEmbeddingError(error, offset);
    }
  }

  return vectors;
}

export async function embedQuery(text: string): Promise<number[]> {
  const [vector] = await embedTexts([text]);
  if (!vector) {
    throw new Error("Embedding für die Suchanfrage fehlgeschlagen.");
  }
  return vector;
}
