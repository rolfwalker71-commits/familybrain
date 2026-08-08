import { NextResponse } from "next/server";
import { z } from "zod";
import { isAuthError, requireAuth } from "@/lib/auth/current-user";
import { ensureInitialized } from "@/lib/db/migrations";
import {
  hasMicrosoftMailScope,
  isMicrosoftConnected,
  resolveMicrosoftUserId,
} from "@/lib/microsoft/oauth";
import { ingestMicrosoftMessagePdfs } from "@/lib/microsoft/mail-to-paperless";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

type Ctx = { params: Promise<{ id: string }> };

const BodySchema = z.object({
  attachmentIds: z.array(z.string()).optional(),
  force: z.boolean().optional().default(false),
});

export async function POST(request: Request, context: Ctx) {
  ensureInitialized();
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;
  const userId = resolveMicrosoftUserId(auth);
  const { id } = await context.params;
  if (!id) {
    return NextResponse.json({ error: "id fehlt" }, { status: 400 });
  }
  if (
    userId == null ||
    !isMicrosoftConnected(userId) ||
    !hasMicrosoftMailScope(userId)
  ) {
    return NextResponse.json(
      { error: "Microsoft 365 nicht verbunden." },
      { status: 400 }
    );
  }

  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await request.json().catch(() => ({})));
  } catch (err) {
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Ungültige Anfrage",
      },
      { status: 400 }
    );
  }

  try {
    const { subject, results } = await ingestMicrosoftMessagePdfs({
      userId,
      messageId: id,
      attachmentIds: body.attachmentIds,
      force: body.force,
    });
    const okCount = results.filter((r) => r.ok).length;
    return NextResponse.json({
      ok: okCount > 0 || results.length === 0,
      subject,
      results,
      okCount,
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : String(err),
      },
      { status: 502 }
    );
  }
}
