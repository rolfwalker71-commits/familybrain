import { NextResponse } from "next/server";
import { isAuthError, requireAuth } from "@/lib/auth/current-user";
import { ensureInitialized } from "@/lib/db/migrations";
import {
  isGoogleMailConnected,
  resolveGoogleUserId,
} from "@/lib/google/oauth";
import { getGmailMessage } from "@/lib/mail/gmail";
import { analyzeMailForActions } from "@/lib/mail/analyze-mail";
import { hasOpenAIKey } from "@/lib/ai/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

function zurichToday(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Zurich",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export async function POST(request: Request, context: Ctx) {
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
  if (!hasOpenAIKey()) {
    return NextResponse.json(
      { error: "OpenAI API-Key fehlt (Einstellungen)." },
      { status: 400 }
    );
  }
  try {
    const message = await getGmailMessage(userId, id, request);
    const analysis = await analyzeMailForActions(message, zurichToday());
    return NextResponse.json({ analysis, messageId: id });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 502 }
    );
  }
}
