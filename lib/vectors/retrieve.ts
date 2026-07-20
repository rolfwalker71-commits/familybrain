import { embedQuery } from "@/lib/vectors/embeddings";
import { searchVectorPoints } from "@/lib/vectors/client";
import { VECTOR_MIN_SCORE, VECTOR_SEARCH_LIMIT } from "@/lib/vectors/constants";
import type { GuideSource, TriliumNoteSource, VectorSearchHit } from "@/lib/vectors/types";

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
  };
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

    return { hits, guideSources, triliumSources };
  } catch {
    return { hits: [], guideSources: [], triliumSources: [] };
  }
}

export async function retrieveGuidesForChat(
  question: string,
  limit = 6
): Promise<GuideSource[]> {
  const { guideSources } = await retrieveVectorForChat(question, {
    limit,
    sourceType: "guide",
  });
  // One hit per guide (best chunk)
  const byId = new Map<number, GuideSource>();
  for (const source of guideSources) {
    const existing = byId.get(source.id);
    if (!existing || existing.score < source.score) {
      byId.set(source.id, source);
    }
  }
  return [...byId.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
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
