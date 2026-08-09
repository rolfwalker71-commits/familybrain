import { NextResponse } from "next/server";
import { z } from "zod";
import { isAuthError, requireAdmin } from "@/lib/auth/current-user";
import { ensureInitialized } from "@/lib/db/migrations";
import { markDocumentsForGuideBatch } from "@/lib/documents/for-guide";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const BodySchema = z.object({
  documentIds: z.array(z.number().int().positive()).min(1).max(250),
});

/** Batch-Markierung «Für Guide» — Docs mit bestehendem Guide werden übersprungen. */
export async function POST(request: Request) {
  ensureInitialized();
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth;

  const body = await request.json().catch(() => null);
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Ungültige Eingabe" }, { status: 400 });
  }

  const result = await markDocumentsForGuideBatch(parsed.data.documentIds);
  const skipped =
    result.skippedAlreadyInGuide +
    result.skippedAlreadyFlagged +
    result.missing;

  return NextResponse.json({
    ok: true,
    ...result,
    skipped,
    message: [
      result.marked > 0 ? `${result.marked} für Guide markiert` : null,
      result.skippedAlreadyInGuide > 0
        ? `${result.skippedAlreadyInGuide} schon in Guides (verworfen)`
        : null,
      result.skippedAlreadyFlagged > 0
        ? `${result.skippedAlreadyFlagged} bereits markiert`
        : null,
      result.missing > 0 ? `${result.missing} nicht gefunden` : null,
      result.failed.length > 0
        ? `${result.failed.length} mit Writeback-Warnung`
        : null,
    ]
      .filter(Boolean)
      .join(" · "),
  });
}
