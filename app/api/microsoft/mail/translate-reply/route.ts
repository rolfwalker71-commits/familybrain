import { NextResponse } from "next/server";
import { z } from "zod";
import { isAuthError, requireModule } from "@/lib/auth/current-user";
import { ensureInitialized } from "@/lib/db/migrations";
import { translateMailReply } from "@/lib/microsoft/reply-language";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  subject: z.string().min(1).max(300),
  body: z.string().min(1).max(4000),
  targetLang: z.enum(["de", "en"]),
});

/** Übersetzt einen Antwort-Entwurf DE↔EN für die Tagesanalyse. */
export async function POST(request: Request) {
  ensureInitialized();
  const auth = await requireModule("microsoft");
  if (isAuthError(auth)) return auth;

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

  try {
    const translated = await translateMailReply({
      subject: body.subject,
      body: body.body,
      targetLang: body.targetLang,
    });
    return NextResponse.json({
      ok: true,
      subject: translated.subject,
      body: translated.body,
      language: translated.language,
      usage: translated.usage,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 502 }
    );
  }
}
