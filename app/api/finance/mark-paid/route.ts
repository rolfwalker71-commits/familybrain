import { NextResponse } from "next/server";
import { z } from "zod";
import { isAuthError, requireAdmin } from "@/lib/auth/current-user";
import { ensureInitialized } from "@/lib/db/migrations";
import { markDocumentsPaid } from "@/lib/finance/mark-paid";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  documentLocalIds: z.array(z.number().int().positive()).min(1).max(100),
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

  const result = await markDocumentsPaid(parsed.data.documentLocalIds);
  return NextResponse.json(result, {
    status: result.ok ? 200 : 207,
  });
}
