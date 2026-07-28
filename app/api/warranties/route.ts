import { NextResponse } from "next/server";
import { z } from "zod";
import {
  isAuthError,
  requireAdmin,
} from "@/lib/auth/current-user";
import { updateWarranty } from "@/lib/db/queries";
import { ensureInitialized } from "@/lib/db/migrations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PatchSchema = z.object({
  id: z.number().int().positive(),
  productName: z.string().max(300).nullable().optional(),
  manufacturer: z.string().max(200).nullable().optional(),
  vendor: z.string().max(200).nullable().optional(),
  warrantyUntil: z.string().nullable().optional(),
});

export async function PATCH(request: Request) {
  ensureInitialized();
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth;
  const body = await request.json();
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Ungültige Eingabe" }, { status: 400 });
  }
  try {
    updateWarranty(parsed.data.id, {
      productName: parsed.data.productName,
      manufacturer: parsed.data.manufacturer,
      vendor: parsed.data.vendor,
      warrantyUntil: parsed.data.warrantyUntil,
      manualOverride: true,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = message.includes("nicht gefunden") ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
