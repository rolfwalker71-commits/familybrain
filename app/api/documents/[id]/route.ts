import { NextResponse } from "next/server";
import { z } from "zod";
import { isAuthError, requireAdmin } from "@/lib/auth/current-user";
import { ensureInitialized } from "@/lib/db/migrations";
import { getDocumentById } from "@/lib/db/queries";
import { updateDocumentTitle } from "@/lib/documents/update-meta";
import { updateDocumentsCategory } from "@/lib/documents/category-update";
import { ensureBuiltinKnowledgeAreas } from "@/lib/knowledge/areas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const PatchSchema = z
  .object({
    title: z.string().min(1).max(500).optional(),
    category: z.string().min(1).max(80).optional(),
  })
  .refine((v) => v.title !== undefined || v.category !== undefined, {
    message: "title oder category erforderlich",
  });

export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;
  const numericId = Number(id);
  if (!Number.isFinite(numericId)) {
    return NextResponse.json({ error: "Ungültige ID" }, { status: 400 });
  }

  const detail = getDocumentById(numericId);
  if (!detail) {
    return NextResponse.json({ error: "Dokument nicht gefunden" }, { status: 404 });
  }

  return NextResponse.json(detail);
}

export async function PATCH(request: Request, { params }: Params) {
  ensureInitialized();
  ensureBuiltinKnowledgeAreas();
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth;

  const { id } = await params;
  const numericId = Number(id);
  if (!Number.isFinite(numericId)) {
    return NextResponse.json({ error: "Ungültige ID" }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Ungültige Eingabe" }, { status: 400 });
  }

  let title: string | undefined;
  if (parsed.data.title !== undefined) {
    const result = await updateDocumentTitle({
      documentId: numericId,
      title: parsed.data.title,
    });
    if (!result.ok) {
      return NextResponse.json(
        { error: result.error || "Titel speichern fehlgeschlagen" },
        { status: 400 }
      );
    }
    title = result.title;
  }

  let categoryUpdated: number | undefined;
  let writebackErrors: string[] | undefined;
  if (parsed.data.category !== undefined) {
    const result = await updateDocumentsCategory({
      documentIds: [numericId],
      category: parsed.data.category,
    });
    if (!result.ok) {
      return NextResponse.json(
        { error: result.error || "Rubrik speichern fehlgeschlagen" },
        { status: 400 }
      );
    }
    categoryUpdated = result.updated;
    writebackErrors = result.writebackErrors;
  }

  return NextResponse.json({
    ok: true,
    title,
    categoryUpdated,
    writebackErrors,
  });
}
