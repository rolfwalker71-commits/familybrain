import { NextResponse } from "next/server";
import { z } from "zod";
import { isAuthError, requireAuth } from "@/lib/auth/current-user";
import { ensureInitialized } from "@/lib/db/migrations";
import {
  hasGmailModifyScope,
  isGoogleMailConnected,
  resolveGoogleUserId,
} from "@/lib/google/oauth";
import { createGmailReplyDraft } from "@/lib/mail/gmail-draft";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

const BodySchema = z.object({
  body: z.string().min(1).max(4000),
  subject: z.string().max(200).nullable().optional(),
});

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
  if (!hasGmailModifyScope(userId)) {
    return NextResponse.json(
      {
        error:
          "Gmail-Schreibrecht fehlt — bitte unter Konto Google neu verbinden.",
      },
      { status: 400 }
    );
  }

  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await request.json());
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Ungültige Anfrage",
      },
      { status: 400 }
    );
  }

  const result = await createGmailReplyDraft(
    userId,
    id,
    { body: body.body, subject: body.subject },
    request
  );
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error || result.skipped || "Entwurf fehlgeschlagen" },
      { status: 502 }
    );
  }
  return NextResponse.json({ ok: true, draftId: result.draftId });
}
