import { NextResponse } from "next/server";
import { ensureInitialized } from "@/lib/db/migrations";
import { isAuthError, requireModule } from "@/lib/auth/current-user";
import { ownerKeyFromAuth } from "@/lib/auth/owner-key";
import { deleteMariTimeBookFavorite } from "@/lib/mari/time-book-favorites";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(
  _request: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  ensureInitialized();
  const auth = await requireModule("maringo");
  if (isAuthError(auth)) return auth;
  const id = Number((await ctx.params).id);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "Favorit-ID ungültig." }, { status: 400 });
  }
  const ok = deleteMariTimeBookFavorite(ownerKeyFromAuth(auth), id);
  if (!ok) {
    return NextResponse.json({ error: "Favorit nicht gefunden." }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
