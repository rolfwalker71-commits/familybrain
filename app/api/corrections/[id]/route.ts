import { NextResponse } from "next/server";
import { z } from "zod";
import {
  deleteChatCorrection,
  getChatCorrectionById,
  listChatCorrections,
  updateChatCorrection,
} from "@/lib/db/queries";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

const PatchSchema = z.object({
  content: z.string().trim().min(3).max(4000).optional(),
  topic: z.string().trim().max(200).optional().nullable(),
  active: z.boolean().optional(),
});

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const correctionId = Number(id);
    if (!Number.isInteger(correctionId) || correctionId <= 0) {
      return NextResponse.json({ error: "Ungültige ID." }, { status: 400 });
    }

    const body = await request.json();
    const parsed = PatchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Ungültige Eingabe." }, { status: 400 });
    }

    const updated = updateChatCorrection(correctionId, parsed.data);
    if (!updated) {
      return NextResponse.json({ error: "Korrektur nicht gefunden." }, { status: 404 });
    }

    return NextResponse.json({
      ok: true,
      correction: updated,
      corrections: listChatCorrections(false),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const correctionId = Number(id);
    if (!Number.isInteger(correctionId) || correctionId <= 0) {
      return NextResponse.json({ error: "Ungültige ID." }, { status: 400 });
    }

    if (!getChatCorrectionById(correctionId)) {
      return NextResponse.json({ error: "Korrektur nicht gefunden." }, { status: 404 });
    }

    deleteChatCorrection(correctionId);
    return NextResponse.json({
      ok: true,
      corrections: listChatCorrections(false),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
