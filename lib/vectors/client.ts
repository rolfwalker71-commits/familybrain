import { QdrantClient } from "@qdrant/js-client-rest";
import {
  DEFAULT_QDRANT_COLLECTION,
  DEFAULT_QDRANT_URL,
  EMBEDDING_DIMENSIONS,
} from "./constants";
import { buildVectorPointId } from "./point-id";
import type { VectorChunkPayload, VectorSearchHit } from "./types";

let client: QdrantClient | null = null;
let collectionReady = false;

export function getQdrantUrl(): string {
  return process.env.QDRANT_URL || DEFAULT_QDRANT_URL;
}

export function getQdrantCollection(): string {
  return process.env.QDRANT_COLLECTION || DEFAULT_QDRANT_COLLECTION;
}

export function isQdrantConfigured(): boolean {
  return Boolean(getQdrantUrl());
}

function getQdrantClient(): QdrantClient {
  if (!client) {
    client = new QdrantClient({ url: getQdrantUrl() });
  }
  return client;
}

export async function ensureVectorCollection(): Promise<void> {
  if (collectionReady) return;

  const qdrant = getQdrantClient();
  const collection = getQdrantCollection();
  const collections = await qdrant.getCollections();
  const exists = collections.collections.some((entry) => entry.name === collection);

  if (!exists) {
    await qdrant.createCollection(collection, {
      vectors: {
        size: EMBEDDING_DIMENSIONS,
        distance: "Cosine",
      },
    });
  }

  collectionReady = true;
}

export async function upsertVectorPoints(
  points: Array<{
    sourceType: VectorChunkPayload["source_type"];
    sourceId: string;
    chunkIndex: number;
    vector: number[];
    payload: VectorChunkPayload;
  }>
): Promise<void> {
  if (points.length === 0) return;
  await ensureVectorCollection();

  const qdrant = getQdrantClient();
  await qdrant.upsert(getQdrantCollection(), {
    wait: true,
    points: points.map((point) => ({
      id: buildVectorPointId(point.sourceType, point.sourceId, point.chunkIndex),
      vector: point.vector,
      payload: point.payload,
    })),
  });
}

export async function deleteVectorPointsBySource(
  sourceType: VectorChunkPayload["source_type"],
  sourceId: string
): Promise<void> {
  await ensureVectorCollection();
  const qdrant = getQdrantClient();
  await qdrant.delete(getQdrantCollection(), {
    wait: true,
    filter: {
      must: [
        { key: "source_type", match: { value: sourceType } },
        { key: "source_id", match: { value: sourceId } },
      ],
    },
  });
}

export async function searchVectorPoints(
  vector: number[],
  options?: {
    limit?: number;
    minScore?: number;
    sourceType?: VectorChunkPayload["source_type"];
  }
): Promise<VectorSearchHit[]> {
  await ensureVectorCollection();
  const qdrant = getQdrantClient();
  const limit = options?.limit ?? 8;
  const filter = options?.sourceType
    ? {
        must: [{ key: "source_type", match: { value: options.sourceType } }],
      }
    : undefined;

  const response = await qdrant.search(getQdrantCollection(), {
    vector,
    limit,
    with_payload: true,
    score_threshold: options?.minScore,
    filter,
  });

  return response
    .map((hit) => {
      const payload = hit.payload as VectorChunkPayload | null | undefined;
      if (!payload?.source_type || !payload.source_id) return null;
      return {
        pointId: String(hit.id),
        score: hit.score ?? 0,
        payload,
      };
    })
    .filter((hit): hit is VectorSearchHit => Boolean(hit));
}

export async function countVectorPoints(): Promise<number> {
  await ensureVectorCollection();
  const qdrant = getQdrantClient();
  const info = await qdrant.getCollection(getQdrantCollection());
  return info.points_count ?? 0;
}

export async function checkQdrantConnection(): Promise<{ ok: boolean; points: number }> {
  try {
    const points = await countVectorPoints();
    return { ok: true, points };
  } catch {
    return { ok: false, points: 0 };
  }
}
