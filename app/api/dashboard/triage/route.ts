import { NextResponse } from "next/server";
import { z } from "zod";
import { isAuthError, requireAdmin } from "@/lib/auth/current-user";
import { ensureInitialized } from "@/lib/db/migrations";
import { resolveDocumentTriage } from "@/lib/documents/triage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  documentLocalId: z.number().int().positive(),
  action: z.enum(["pay", "ignore", "done", "ebill", "twint", "card"]),
  taxRelevant: z.boolean().nullable().optional(),
  taxYear: z.number().int().min(1990).max(2100).nullable().optional(),
});

export async function POST(request: Request) {
  ensureInitialized();
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth;

  const body = await request.json().catch(() => null);
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Ungültige Eingabe" }, { status: 400 });
  }

  const result = await resolveDocumentTriage(parsed.data);
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error || "Triage fehlgeschlagen" },
      { status: 400 }
    );
  }
  return NextResponse.json({ ok: true, action: parsed.data.action });
}
