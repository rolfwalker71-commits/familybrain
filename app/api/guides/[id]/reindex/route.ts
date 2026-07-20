import { NextResponse } from "next/server";
import { getKnowledgeGuideById } from "@/lib/db/queries";
import { indexKnowledgeGuide } from "@/lib/vectors/index-guide";
import { hasOpenAIKey } from "@/lib/ai/client";

export const runtime = "nodejs";
export const maxDuration = 300;

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(_request: Request, context: RouteContext) {
  try {
    if (!hasOpenAIKey()) {
      return NextResponse.json(
        { error: "OpenAI API-Key fehlt. Bitte unter Einstellungen hinterlegen." },
        { status: 400 }
      );
    }

    const { id } = await context.params;
    const guideId = Number(id);
    if (!Number.isInteger(guideId) || guideId <= 0) {
      return NextResponse.json({ error: "Ungültige Guide-ID." }, { status: 400 });
    }

    const guide = getKnowledgeGuideById(guideId);
    if (!guide) {
      return NextResponse.json({ error: "Guide nicht gefunden." }, { status: 404 });
    }

    const result = await indexKnowledgeGuide(guideId);
    return NextResponse.json({ ok: true, chunkCount: result.chunkCount });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
