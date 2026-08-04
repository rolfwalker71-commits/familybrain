import { NextResponse } from "next/server";
import { z } from "zod";
import { isAuthError, requireAdmin } from "@/lib/auth/current-user";
import { ensureInitialized } from "@/lib/db/migrations";
import { updateDocumentsCategory } from "@/lib/documents/category-update";
import { ensureBuiltinKnowledgeAreas } from "@/lib/knowledge/areas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  documentIds: z.array(z.number().int().positive()).min(1).max(200),
  category: z.string().min(1).max(80),
});

export async function PATCH(request: Request) {
  ensureInitialized();
  ensureBuiltinKnowledgeAreas();
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth;

  const body = await request.json().catch(() => null);
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Ungültige Eingabe" }, { status: 400 });
  }

  const result = await updateDocumentsCategory(parsed.data);
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error || "Umklassifizierung fehlgeschlagen" },
      { status: 400 }
    );
  }
  return NextResponse.json({
    ok: true,
    updated: result.updated,
    writebackErrors: result.writebackErrors,
  });
}
