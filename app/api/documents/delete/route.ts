import { NextResponse } from "next/server";
import { z } from "zod";
import { isAuthError, requireAdmin } from "@/lib/auth/current-user";
import { ensureInitialized } from "@/lib/db/migrations";
import { deleteDocumentFully } from "@/lib/paperless/delete-document";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const BodySchema = z.object({
  documentIds: z.array(z.number().int().positive()).min(1).max(100),
  confirm: z.literal(true),
});

export async function POST(request: Request) {
  ensureInitialized();
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth;

  const body = await request.json().catch(() => null);
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error:
          "Ungültige Eingabe — documentIds und confirm:true erforderlich.",
      },
      { status: 400 }
    );
  }

  const results: Array<{
    id: number;
    ok: boolean;
    error?: string;
    paperlessId?: number;
  }> = [];

  for (const id of parsed.data.documentIds) {
    const result = await deleteDocumentFully(id);
    results.push({
      id,
      ok: result.ok,
      error: result.error,
      paperlessId: result.paperlessId,
    });
  }

  const succeeded = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok);

  return NextResponse.json({
    ok: failed.length === 0,
    succeeded,
    failed: failed.length,
    results,
    error:
      failed.length > 0
        ? `${failed.length} Löschung(en) fehlgeschlagen`
        : undefined,
  });
}
