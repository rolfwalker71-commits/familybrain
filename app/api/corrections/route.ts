import { NextResponse } from "next/server";
import { z } from "zod";
import {
  createChatCorrection,
  listChatCorrections,
} from "@/lib/db/queries";

export const runtime = "nodejs";

const CreateSchema = z.object({
  content: z.string().trim().min(3).max(4000),
  topic: z.string().trim().max(200).optional().nullable(),
});

export async function GET() {
  return NextResponse.json({
    corrections: listChatCorrections(false),
  });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = CreateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Ungültige Korrektur (mindestens 3 Zeichen)." },
        { status: 400 }
      );
    }

    const id = createChatCorrection({
      content: parsed.data.content,
      topic: parsed.data.topic ?? null,
    });

    return NextResponse.json({
      ok: true,
      id,
      corrections: listChatCorrections(false),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
