import { NextResponse } from "next/server";
import { z } from "zod";
import {
  isAuthError,
  requireAdmin,
} from "@/lib/auth/current-user";
import { setUserAccess } from "@/lib/users/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

const AccessSchema = z.object({
  tripIds: z.array(z.number().int().positive()),
  ledgerIds: z.array(z.number().int().positive()),
});

export async function PUT(request: Request, context: Ctx) {
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth;
  try {
    const { id: idRaw } = await context.params;
    const id = Number(idRaw);
    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json({ error: "Ungültige ID" }, { status: 400 });
    }
    const parsed = AccessSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Ungültige Eingabe" }, { status: 400 });
    }
    const user = setUserAccess(id, parsed.data);
    return NextResponse.json({ ok: true, user });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = message.includes("nicht gefunden") ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
