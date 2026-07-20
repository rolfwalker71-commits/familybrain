import { getOpenAIClient } from "@/lib/ai/client";
import { getOpenAIEmbeddingModel } from "@/lib/ai/embeddings";
import { EMBEDDING_DIMENSIONS } from "./constants";

const EMBED_BATCH_SIZE = 64;

export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];

  const client = getOpenAIClient();
  const model = getOpenAIEmbeddingModel();
  const vectors: number[][] = [];

  for (let offset = 0; offset < texts.length; offset += EMBED_BATCH_SIZE) {
    const batch = texts.slice(offset, offset + EMBED_BATCH_SIZE);
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
