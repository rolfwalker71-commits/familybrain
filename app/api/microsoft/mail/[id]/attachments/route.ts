import { NextResponse } from "next/server";
import { isAuthError, requireAuth } from "@/lib/auth/current-user";
import { ensureInitialized } from "@/lib/db/migrations";
import {
  hasMicrosoftMailScope,
  isMicrosoftConnected,
  resolveMicrosoftUserId,
} from "@/lib/microsoft/oauth";
import {
  findDocumentForMicrosoftAttachment,
} from "@/lib/buddy/source-links";
import { listMicrosoftPdfAttachments } from "@/lib/microsoft/mail-attachments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Ctx) {
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

  try {
    const pdfs = await listMicrosoftPdfAttachments(userId, id);
    return NextResponse.json({
      attachments: pdfs.map((a) => {
        const existing = findDocumentForMicrosoftAttachment(id, a.id);
        return {
          id: a.id,
          name: a.name,
          size: a.size,
          contentType: a.contentType,
          alreadyIngested: Boolean(existing),
          documentId: existing ? Number(existing.entityId) : null,
        };
      }),
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
