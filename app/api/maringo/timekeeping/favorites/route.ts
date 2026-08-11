import { NextResponse } from "next/server";
import { ensureInitialized } from "@/lib/db/migrations";
import { isAuthError, requireModule } from "@/lib/auth/current-user";
import { ownerKeyFromAuth } from "@/lib/auth/owner-key";
import {
  createMariTimeBookFavorite,
  listMariTimeBookFavorites,
  MariTimeBookFavoriteCreateSchema,
} from "@/lib/mari/time-book-favorites";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  ensureInitialized();
  const auth = await requireModule("maringo");
  if (isAuthError(auth)) return auth;
  const ownerKey = ownerKeyFromAuth(auth);
  const favorites = listMariTimeBookFavorites(ownerKey);
  return NextResponse.json({ ok: true, favorites });
}

export async function POST(request: Request) {
  ensureInitialized();
  const auth = await requireModule("maringo");
  if (isAuthError(auth)) return auth;
  try {
    const json = await request.json();
    const parsed = MariTimeBookFavoriteCreateSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Ungültige Eingabe." },
        { status: 400 }
      );
    }
    const favorite = createMariTimeBookFavorite(
      ownerKeyFromAuth(auth),
      parsed.data
    );
    return NextResponse.json({ ok: true, favorite });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
