import { NextResponse } from "next/server";
import { z } from "zod";
import { analyzeDocument } from "@/lib/ai/analyze-document";
import { getActiveJobRun } from "@/lib/jobs/queries";

export const runtime = "nodejs";
export const maxDuration = 120;

const BodySchema = z.object({
  documentId: z.number().int().positive(),
});

export async function POST(request: Request) {
  try {
    if (getActiveJobRun()) {
      return NextResponse.json(
        { error: "Ein automatischer Sync-/Analyse-Lauf ist bereits aktiv." },
        { status: 409 }
      );
    }

    const body = await request.json();
    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Ungültige Eingabe" }, { status: 400 });
    }

    const result = await analyzeDocument(parsed.data.documentId);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
