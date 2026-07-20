import { getOpenAIClient } from "@/lib/ai/client";
import { getOpenAIEmbeddingModel } from "@/lib/ai/embeddings";
import { EMBEDDING_DIMENSIONS } from "./constants";

const EMBED_BATCH_SIZE = 64;

function formatEmbeddingError(error: unknown): Error {
  if (!(error instanceof Error)) {
    return new Error(String(error));
  }

  const anyErr = error as Error & {
    status?: number;
    code?: string;
    error?: { message?: string };
  };
  const detail =
    anyErr.error?.message ||
    anyErr.message ||
    "Unbekannter Embedding-Fehler";
  const status = anyErr.status ? `HTTP ${anyErr.status}` : null;
  const code = anyErr.code ? `code=${anyErr.code}` : null;
  const suffix = [status, code].filter(Boolean).join(", ");
  return new Error(
    suffix ? `OpenAI Embedding fehlgeschlagen (${suffix}): ${detail}` : detail
  );
}

export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];

  const client = getOpenAIClient();
  const model = getOpenAIEmbeddingModel();
  const vectors: number[][] = [];

  for (let offset = 0; offset < texts.length; offset += EMBED_BATCH_SIZE) {
    const batch = texts.slice(offset, offset + EMBED_BATCH_SIZE);
    try {
      const response = await client.embeddings.create({
        model,
        input: batch,
      });

      const sorted = [...response.data].sort((a, b) => a.index - b.index);
      for (const item of sorted) {
        if (item.embedding.length !== EMBEDDING_DIMENSIONS) {
          throw new Error(
            `Unerwartete Embedding-Dimension (${item.embedding.length}, erwartet ${EMBEDDING_DIMENSIONS}).`
          );
        }
        vectors.push(item.embedding);
      }
    } catch (error) {
      throw formatEmbeddingError(error);
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
