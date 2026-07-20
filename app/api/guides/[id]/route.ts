import { NextResponse } from "next/server";
import { getKnowledgeGuideById } from "@/lib/db/queries";
import { removeKnowledgeGuideFully } from "@/lib/guides/delete-guide";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const guideId = Number(id);
    if (!Number.isInteger(guideId) || guideId <= 0) {
      return NextResponse.json({ error: "Ungültige Guide-ID." }, { status: 400 });
    }

    const guide = await removeKnowledgeGuideFully(guideId);
    if (!guide) {
      return NextResponse.json({ error: "Guide nicht gefunden." }, { status: 404 });
    }

    return NextResponse.json({
      ok: true,
      deletedGuideId: guideId,
      title: guide.title,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  const guideId = Number(id);
  if (!Number.isInteger(guideId) || guideId <= 0) {
    return NextResponse.json({ error: "Ungültige Guide-ID." }, { status: 400 });
  }

  const guide = getKnowledgeGuideById(guideId);
  if (!guide) {
    return NextResponse.json({ error: "Guide nicht gefunden." }, { status: 404 });
  }

  return NextResponse.json({
    id: guide.id,
    title: guide.title,
    filename: guide.filename,
    pageCount: guide.page_count,
    embeddingStatus: guide.embedding_status,
    embeddingError: guide.embedding_error,
    lastIndexedAt: guide.last_indexed_at,
    createdAt: guide.created_at,
    extractedChars: guide.extracted_text?.length ?? 0,
  });
}
