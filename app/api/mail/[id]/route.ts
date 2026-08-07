import { NextResponse } from "next/server";
import { isAuthError, requireAuth } from "@/lib/auth/current-user";
import { ensureInitialized } from "@/lib/db/migrations";
import {
  isGoogleMailConnected,
  resolveGoogleUserId,
} from "@/lib/google/oauth";
import { getGmailMessage } from "@/lib/mail/gmail";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Ctx) {
  ensureInitialized();
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;
  const userId = resolveGoogleUserId(auth);
  const { id } = await context.params;
  if (!id) {
    return NextResponse.json({ error: "id fehlt" }, { status: 400 });
  }
  if (userId == null || !isGoogleMailConnected(userId)) {
    return NextResponse.json(
      { error: "Google-Konto nicht verbunden." },
      { status: 400 }
    );
  }
  try {
    const message = await getGmailMessage(userId, id, request);
    return NextResponse.json({ message });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 502 }
    );
  }
}
