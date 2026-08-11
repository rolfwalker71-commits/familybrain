import { NextResponse } from "next/server";
import { z } from "zod";
import { isAuthError, requireModule } from "@/lib/auth/current-user";
import { ensureInitialized } from "@/lib/db/migrations";
import {
  hasMicrosoftMailScope,
  hasMicrosoftMailSendScope,
  isMicrosoftConnected,
  resolveMicrosoftUserId,
} from "@/lib/microsoft/oauth";
import {
  createOutlookMailDraftWithSignature,
  sendOutlookMail,
} from "@/lib/microsoft/mail-message-actions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  to: z.string().min(3).max(500),
  subject: z.string().max(500),
  body: z.string().min(1).max(20_000),
  sourceMailId: z.string().max(200).nullable().optional(),
  cc: z.string().max(500).nullable().optional(),
  includeSignature: z.boolean().optional(),
  /** true = send immediately; false = Outlook draft only */
  send: z.boolean().optional().default(true),
});

export async function POST(request: Request) {
  ensureInitialized();
  const auth = await requireModule("microsoft");
  if (isAuthError(auth)) return auth;
  const userId = resolveMicrosoftUserId(auth);
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
    body = BodySchema.parse(await request.json());
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Ungültige Anfrage",
      },
      { status: 400 }
    );
  }

  const wantSend = body.send !== false;
  if (wantSend && !hasMicrosoftMailSendScope(userId)) {
    return NextResponse.json(
      {
        error:
          "Mail.Send fehlt. Bitte Microsoft 365 unter Konto neu verbinden.",
      },
      { status: 403 }
    );
  }

  try {
    if (wantSend) {
      const sent = await sendOutlookMail(userId, {
        to: body.to,
        subject: body.subject,
        body: body.body,
        sourceMailId: body.sourceMailId,
        cc: body.cc,
        includeSignature: body.includeSignature,
      });
      return NextResponse.json({ ok: true, mode: "sent", ...sent });
    }
    const draft = await createOutlookMailDraftWithSignature(userId, {
      to: body.to,
      subject: body.subject,
      body: body.body,
      sourceMailId: body.sourceMailId,
      cc: body.cc,
      includeSignature: body.includeSignature,
    });
    return NextResponse.json({ ok: true, mode: "draft", ...draft });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Mail konnte nicht gesendet werden.",
      },
      { status: 500 }
    );
  }
}
