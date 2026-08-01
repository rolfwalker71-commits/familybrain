import { NextResponse } from "next/server";
import { isAuthError, requireAdmin } from "@/lib/auth/current-user";
import { ensureInitialized } from "@/lib/db/migrations";
import {
  ensureBuiltinKnowledgeAreas,
  listKnowledgeAreas,
} from "@/lib/knowledge/areas";
import { maybeRemapKnowledgeCategoriesOnce } from "@/lib/documents/category-remap";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  ensureInitialized();
  ensureBuiltinKnowledgeAreas();
  maybeRemapKnowledgeCategoriesOnce();
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth;
  return NextResponse.json({ areas: listKnowledgeAreas() });
}
