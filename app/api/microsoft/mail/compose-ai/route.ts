import { NextResponse } from "next/server";
import { z } from "zod";
import { isAuthError, requireModule } from "@/lib/auth/current-user";
import { ensureInitialized } from "@/lib/db/migrations";
import { formatTokenUsageLine } from "@/lib/ai/usage-cost";
import {
  isMicrosoftConnected,
  resolveMicrosoftUserId,
} from "@/lib/microsoft/oauth";
import {
  rewriteMailComposeDraft,
  suggestMailComposeDraft,
} from "@/lib/microsoft/mail-compose-ai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  action: z.enum(["suggest", "shorter", "formal", "toDe", "toEn"]),
  mode: z.enum(["new", "reply"]).optional().default("new"),
  sourceMailId: z.string().max(200).nullable().optional(),
  to: z.string().max(500).nullable().optional(),
  subject: z.string().max(500).optional().default(""),
  body: z.string().max(20_000).optional().default(""),
  hint: z.string().max(500).nullable().optional(),
});

export async function POST(request: Request) {
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
    const result =
      body.action === "suggest"
        ? await suggestMailComposeDraft({
            userId,
            mode: body.mode,
            sourceMailId: body.sourceMailId,
            to: body.to,
            subject: body.subject,
            body: body.body,
            hint: body.hint,
          })
        : await rewriteMailComposeDraft({
            action: body.action,
            subject: body.subject,
            body: body.body,
          });

    return NextResponse.json({
      ok: true,
      subject: result.subject,
      body: result.body,
      language: result.language,
      usage: result.usage,
      usageLine: formatTokenUsageLine(result.usage),
      provider: "deepseek",
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Mail-AI fehlgeschlagen.",
      },
      { status: 502 }
    );
  }
}
