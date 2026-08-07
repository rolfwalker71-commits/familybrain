import { NextResponse } from "next/server";
import { isAuthError, requireAuth } from "@/lib/auth/current-user";
import { ensureInitialized } from "@/lib/db/migrations";
import { invalidateOverviewCache } from "@/lib/dashboard/overview-cache";
import { resolveGoogleUserId } from "@/lib/google/oauth";
import { deleteReferenceNote } from "@/lib/mail/reference-notes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function DELETE(_request: Request, context: Ctx) {
  ensureInitialized();
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;
  const userId = resolveGoogleUserId(auth);
  if (userId == null) {
    return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });
  }

  const { id: raw } = await context.params;
  const id = Number(raw);
  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json({ error: "Ungültige id" }, { status: 400 });
  }

  const ok = await deleteReferenceNote(userId, id);
  if (!ok) {
    return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });
  }
  invalidateOverviewCache(userId);
  return NextResponse.json({ ok: true });
}
