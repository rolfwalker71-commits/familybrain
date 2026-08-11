import { NextResponse } from "next/server";
import { z } from "zod";
import { isAuthError, requireModule } from "@/lib/auth/current-user";
import { ensureInitialized } from "@/lib/db/migrations";
import {
  isMicrosoftConnected,
  resolveMicrosoftUserId,
} from "@/lib/microsoft/oauth";
import {
  getMicrosoftMailSignature,
  setMicrosoftMailSignature,
} from "@/lib/microsoft/mail-signature";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PutSchema = z.object({
  text: z.string().max(20_000).optional(),
  appendOnSend: z.boolean().optional(),
});

export async function GET() {
  ensureInitialized();
  const auth = await requireModule("microsoft");
  if (isAuthError(auth)) return auth;
  const userId = resolveMicrosoftUserId(auth);
  if (userId == null || !isMicrosoftConnected(userId)) {
    return NextResponse.json(
      { error: "Microsoft 365 nicht verbunden." },
      { status: 400 }
    );
  }
  const signature = getMicrosoftMailSignature(userId);
  return NextResponse.json({
    ok: true,
    signature,
    note:
      "Outlook-Client-Signaturen sind über Microsoft Graph nicht lesbar. Bitte Signatur hier einmal einfügen (aus Outlook kopieren).",
  });
}

export async function PUT(request: Request) {
  ensureInitialized();
  const auth = await requireModule("microsoft");
  if (isAuthError(auth)) return auth;
  const userId = resolveMicrosoftUserId(auth);
  if (userId == null || !isMicrosoftConnected(userId)) {
    return NextResponse.json(
      { error: "Microsoft 365 nicht verbunden." },
      { status: 400 }
    );
  }

  let body: z.infer<typeof PutSchema>;
  try {
    body = PutSchema.parse(await request.json());
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Ungültige Anfrage",
      },
      { status: 400 }
    );
  }

  const signature = setMicrosoftMailSignature(userId, body);
  return NextResponse.json({ ok: true, signature });
}
