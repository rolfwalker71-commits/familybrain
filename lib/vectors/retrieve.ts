import { embedQuery } from "@/lib/vectors/embeddings";
import { searchVectorPoints } from "@/lib/vectors/client";
import { VECTOR_MIN_SCORE, VECTOR_SEARCH_LIMIT } from "@/lib/vectors/constants";
import type { GuideSource, VectorSearchHit } from "@/lib/vectors/types";

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

export async function retrieveVectorForChat(
  question: string,
  options?: { limit?: number; minScore?: number }
): Promise<{
  hits: VectorSearchHit[];
  guideSources: GuideSource[];
}> {
  const limit = options?.limit ?? VECTOR_SEARCH_LIMIT;
  const minScore = options?.minScore ?? VECTOR_MIN_SCORE;

  try {
    const vector = await embedQuery(question);
    const hits = await searchVectorPoints(vector, { limit, minScore });
    const guideSources = hits
      .map(toGuideSource)
      .filter((source): source is GuideSource => Boolean(source));

    return { hits, guideSources };
  } catch {
    return { hits: [], guideSources: [] };
  }
}

export async function retrieveGuidesForChat(
  question: string,
  limit = 6
): Promise<GuideSource[]> {
  const { guideSources } = await retrieveVectorForChat(question, { limit });
  return guideSources;
}
