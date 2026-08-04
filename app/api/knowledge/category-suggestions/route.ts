import { NextResponse } from "next/server";
import { z } from "zod";
import { isAuthError, requireAdmin } from "@/lib/auth/current-user";
import { ensureInitialized } from "@/lib/db/migrations";
import { ensureBuiltinKnowledgeAreas } from "@/lib/knowledge/areas";
import {
  analyzeSonstigesForCategorySuggestions,
  listCategorySuggestions,
  resolveCategorySuggestion,
} from "@/lib/documents/category-suggestions";
import { maybeRemapKnowledgeCategoriesOnce } from "@/lib/documents/category-remap";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ResolveSchema = z.object({
  id: z.string().min(1),
  action: z.enum(["accept", "reject"]),
});

export async function GET() {
  ensureInitialized();
  ensureBuiltinKnowledgeAreas();
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth;
  return NextResponse.json({
    pending: listCategorySuggestions({ status: "pending" }),
    recent: listCategorySuggestions().filter((s) => s.status !== "pending").slice(-20),
  });
}

/** Run Sonstiges cluster analysis (no OpenAI). */
export async function POST() {
  ensureInitialized();
  ensureBuiltinKnowledgeAreas();
  maybeRemapKnowledgeCategoriesOnce();
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth;

  const result = analyzeSonstigesForCategorySuggestions();
  return NextResponse.json({
    ok: true,
    ...result,
    pending: listCategorySuggestions({ status: "pending" }),
  });
}

/** Accept (create/remap) or reject a suggestion. */
export async function PATCH(request: Request) {
  ensureInitialized();
  ensureBuiltinKnowledgeAreas();
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth;

  const body = await request.json().catch(() => null);
  const parsed = ResolveSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Ungültige Eingabe" }, { status: 400 });
  }

  const result = await resolveCategorySuggestion(parsed.data);
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error || "Aktion fehlgeschlagen" },
      { status: 400 }
    );
  }
  return NextResponse.json({
    ...result,
    pending: listCategorySuggestions({ status: "pending" }),
  });
}
