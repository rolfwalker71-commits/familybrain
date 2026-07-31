import { NextResponse } from "next/server";
import { z } from "zod";
import { isAuthError, requireAdmin } from "@/lib/auth/current-user";
import { ensureInitialized } from "@/lib/db/migrations";
import { updateDocumentTaxClassification } from "@/lib/documents/tax-classification";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

const BodySchema = z.object({
  category: z.string().min(1).max(80).optional(),
  /** bank = Bankbeleg-Untergruppe; normal = normaler Steuerbeleg; auto = Heuristik */
  taxKind: z.enum(["bank", "normal", "auto"]).optional(),
  bankName: z.string().max(200).nullable().optional(),
  accountNumber: z.string().max(80).nullable().optional(),
  taxYear: z.number().int().min(1990).max(2100).nullable().optional(),
});

export async function PATCH(request: Request, context: Ctx) {
  ensureInitialized();
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth;

  const { id } = await context.params;
  const documentId = Number(id);
  if (!Number.isFinite(documentId) || documentId <= 0) {
    return NextResponse.json({ error: "Ungültige ID" }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Ungültige Eingabe" }, { status: 400 });
  }
  if (
    parsed.data.category === undefined &&
    parsed.data.taxKind === undefined &&
    parsed.data.bankName === undefined &&
    parsed.data.accountNumber === undefined &&
    parsed.data.taxYear === undefined
  ) {
    return NextResponse.json(
      { error: "Keine Änderung angegeben." },
      { status: 400 }
    );
  }

  const result = updateDocumentTaxClassification({
    documentId,
    category: parsed.data.category,
    taxKind: parsed.data.taxKind,
    bankName: parsed.data.bankName,
    accountNumber: parsed.data.accountNumber,
    taxYear: parsed.data.taxYear,
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error || "Aktualisierung fehlgeschlagen" },
      { status: 400 }
    );
  }

  return NextResponse.json({ ok: true });
}
