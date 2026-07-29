import { NextResponse } from "next/server";
import { z } from "zod";
import { isAuthError, requireAdmin } from "@/lib/auth/current-user";
import { getDocumentById } from "@/lib/db/queries";
import {
  clearDocumentAiIcon,
  documentAiIconPublicUrl,
  generateDocumentAiIcon,
} from "@/lib/paperless/document-icon";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

type Ctx = { params: Promise<{ id: string }> };

const PostSchema = z.object({
  force: z.boolean().optional(),
});

export async function POST(request: Request, context: Ctx) {
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth;
  const { id: idRaw } = await context.params;
  const id = Number(idRaw);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "Ungültige ID" }, { status: 400 });
  }
  const body = await request.json().catch(() => ({}));
  const parsed = PostSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Ungültige Eingabe" }, { status: 400 });
  }
  try {
    const doc = await generateDocumentAiIcon(id, {
      force: parsed.data.force === true,
    });
    return NextResponse.json({
      ok: true,
      documentId: doc.id,
      aiIconUrl: documentAiIconPublicUrl(doc.ai_icon_path),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(_request: Request, context: Ctx) {
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth;
  const { id: idRaw } = await context.params;
  const id = Number(idRaw);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "Ungültige ID" }, { status: 400 });
  }
  if (!getDocumentById(id)) {
    return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });
  }
  clearDocumentAiIcon(id);
  return NextResponse.json({ ok: true });
}
