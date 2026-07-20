import { NextResponse } from "next/server";
import { z } from "zod";
import { answerDocumentChat } from "@/lib/ai/chat";

export const runtime = "nodejs";
export const maxDuration = 120;

const BodySchema = z.object({
  message: z.string().min(1).max(4000),
  history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string(),
      })
    )
    .optional(),
  sources: z
    .object({
      paperless: z.boolean().optional(),
      trilium: z.boolean().optional(),
      guides: z.boolean().optional(),
    })
    .optional(),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Ungültige Eingabe" }, { status: 400 });
    }

    const result = await answerDocumentChat(
      parsed.data.message,
      parsed.data.history ?? [],
      parsed.data.sources
    );

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
