import { embedQuery } from "@/lib/vectors/embeddings";
import { searchVectorPoints } from "@/lib/vectors/client";
import { VECTOR_MIN_SCORE, VECTOR_SEARCH_LIMIT } from "@/lib/vectors/constants";
import { retrieveGuidesByKeyword } from "@/lib/vectors/guide-keyword";
import type {
  GuideSource,
  PaperlessVectorSource,
  TriliumNoteSource,
  VectorSearchHit,
} from "@/lib/vectors/types";

function toGuideSource(hit: VectorSearchHit): GuideSource | null {
  if (hit.payload.source_type !== "guide") return null;
  const guideId = Number(hit.payload.source_id);
  if (!Number.isInteger(guideId) || guideId <= 0) return null;

  return {
    kind: "guide",
    id: guideId,
    title: hit.payload.title || "Guide",
    excerpt: hit.payload.text,
    score: hit.score,
    pageStart: hit.payload.page_start ?? null,
    pageEnd: hit.payload.page_end ?? null,
    chunkIndex: hit.payload.chunk_index ?? null,
  };
}

function guideChunkKey(source: GuideSource): string {
  if (source.chunkIndex != null) {
    return `${source.id}:${source.chunkIndex}`;
  }
  const page = source.pageStart ?? "x";
  return `${source.id}:${page}:${source.excerpt.slice(0, 48)}`;
}

/**
 * Merge semantic + keyword guide hits. Keep several chunks per guide so
 * handbook answers can cite neighbouring passages, not just one embedding.
 */
function mergeGuideSources(
  semantic: GuideSource[],
  keyword: GuideSource[],
  limit: number,
  maxPerGuide = 3
): GuideSource[] {
  const byChunk = new Map<string, GuideSource>();

  for (const source of semantic) {
    // Cosine ~0–1 → keyword-ish range so both ranks are comparable.
    const scaled: GuideSource = {
      ...source,
      score: source.score * 12 + 2,
    };
    byChunk.set(guideChunkKey(scaled), scaled);
  }

  for (const source of keyword) {
    const key = guideChunkKey(source);
    const existing = byChunk.get(key);
    if (!existing) {
      byChunk.set(key, source);
      continue;
    }
    byChunk.set(key, {
      ...existing,
      score: existing.score + source.score * 0.85,
      // Prefer longer keyword excerpt if same chunk collided oddly.
      excerpt:
        source.excerpt.length > existing.excerpt.length
          ? source.excerpt
          : existing.excerpt,
    });
  }

  const ranked = [...byChunk.values()].sort((a, b) => b.score - a.score);
  const perGuide = new Map<number, number>();
  const selected: GuideSource[] = [];
  for (const source of ranked) {
    const used = perGuide.get(source.id) ?? 0;
    if (used >= maxPerGuide) continue;
    perGuide.set(source.id, used + 1);
    selected.push(source);
    if (selected.length >= limit) break;
  }
  return selected;
}

function toTriliumSource(hit: VectorSearchHit): TriliumNoteSource | null {
  if (hit.payload.source_type !== "trilium") return null;
  const noteId = hit.payload.source_id;
  if (!noteId) return null;

  return {
    kind: "trilium",
    noteId,
    title: hit.payload.title || "Ohne Titel",
    scopeLabel: hit.payload.scope_label || "Trilium",
    excerpt: hit.payload.text,
    url: hit.payload.url || "",
    score: hit.score,
  };
}

function toPaperlessSource(hit: VectorSearchHit): PaperlessVectorSource | null {
  if (hit.payload.source_type !== "paperless") return null;
  const id = Number(hit.payload.source_id);
  if (!Number.isInteger(id) || id <= 0) return null;
  return {
    kind: "paperless",
    id,
    title: hit.payload.title || "Ohne Titel",
    excerpt: hit.payload.text,
    category: hit.payload.category ?? null,
    score: hit.score,
    url: hit.payload.url || `/documents/${id}`,
  };
}

export async function retrieveVectorForChat(
  question: string,
  options?: {
    limit?: number;
    minScore?: number;
    sourceType?: "guide" | "trilium" | "paperless";
  }
): Promise<{
  hits: VectorSearchHit[];
  guideSources: GuideSource[];
  triliumSources: TriliumNoteSource[];
  paperlessSources: PaperlessVectorSource[];
}> {
  const limit = options?.limit ?? VECTOR_SEARCH_LIMIT;
  const minScore = options?.minScore ?? VECTOR_MIN_SCORE;

  try {
    const vector = await embedQuery(question);
    const hits = await searchVectorPoints(vector, {
      limit,
      minScore,
      sourceType: options?.sourceType,
    });
    const guideSources = hits
      .map(toGuideSource)
      .filter((source): source is GuideSource => Boolean(source));
    const triliumSources = hits
      .map(toTriliumSource)
      .filter((source): source is TriliumNoteSource => Boolean(source));
    const paperlessSources = hits
      .map(toPaperlessSource)
      .filter((source): source is PaperlessVectorSource => Boolean(source));

    return { hits, guideSources, triliumSources, paperlessSources };
  } catch {
    return {
      hits: [],
      guideSources: [],
      triliumSources: [],
      paperlessSources: [],
    };
  }
}

export async function retrieveGuidesForChat(
  question: string,
  limit = 10
): Promise<GuideSource[]> {
  const fetchLimit = Math.max(limit * 3, 18);
  const [{ guideSources: semantic }, keyword] = await Promise.all([
    retrieveVectorForChat(question, {
      limit: fetchLimit,
      sourceType: "guide",
      minScore: Math.min(VECTOR_MIN_SCORE, 0.32),
    }),
    Promise.resolve(retrieveGuidesByKeyword(question, fetchLimit)),
  ]);
  return mergeGuideSources(semantic, keyword, limit, 3);
}

export async function retrieveTriliumNotesForChat(
  question: string,
  limit = 5
): Promise<TriliumNoteSource[]> {
  const { triliumSources } = await retrieveVectorForChat(question, {
    limit: Math.max(limit * 2, 8),
    sourceType: "trilium",
  });
  const byId = new Map<string, TriliumNoteSource>();
  for (const source of triliumSources) {
    const existing = byId.get(source.noteId);
    if (!existing || existing.score < source.score) {
      byId.set(source.noteId, source);
    }
  }
  return [...byId.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

export async function retrievePaperlessVectorsForChat(
  question: string,
  limit = 8
): Promise<PaperlessVectorSource[]> {
  const { paperlessSources } = await retrieveVectorForChat(question, {
    limit: Math.max(limit * 2, 12),
    sourceType: "paperless",
    minScore: Math.min(VECTOR_MIN_SCORE, 0.35),
  });
  const byId = new Map<number, PaperlessVectorSource>();
  for (const source of paperlessSources) {
    const existing = byId.get(source.id);
    if (!existing || existing.score < source.score) {
      byId.set(source.id, source);
    }
  }
  return [...byId.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
