import { NextResponse } from "next/server";
import { isAuthError, requireAdmin } from "@/lib/auth/current-user";
import { hasOpenAIKey } from "@/lib/ai/client";
import {
  checkQdrantConnection,
  getQdrantCollection,
  getQdrantUrl,
} from "@/lib/vectors/client";
import { getLocalEmbeddingStats } from "@/lib/vectors/embedding-stats";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth;

  const [qdrant, local] = await Promise.all([
    checkQdrantConnection(),
    Promise.resolve(getLocalEmbeddingStats()),
  ]);

  return NextResponse.json({
    qdrant: {
      ok: qdrant.ok,
      url: getQdrantUrl(),
      collection: getQdrantCollection(),
      points: qdrant.points,
      bySource: qdrant.bySource ?? {
        paperless: 0,
        trilium: 0,
        guide: 0,
      },
    },
    local,
    hasOpenAIKey: hasOpenAIKey(),
  });
}
